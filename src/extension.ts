/**
 * ANF Validator VS Code Extension entry point.
 *
 * Activation: workspaceContains - only activates in workspaces with an article.json file.
 *
 * Validation triggers:
 *   - onDidOpenTextDocument  : file opened in VS Code
 *   - FileSystemWatcher      : file changed on disk by ANY process (external
 *                              terminal tool, git checkout, manual save, etc.)
 *   - onDidCloseTextDocument : clear diagnostics when file is closed
 *
 * Validation is two-phase:
 *   1. Synchronous (schema + cross-ref) — diagnostics appear immediately
 *   2. Async (URL reachability)         — warnings merged in when checks finish
 *
 * URL checking respects the "anfValidator.checkUrls" workspace setting.
 */

import * as vscode from 'vscode';
import { getDiagnostics, getUrlDiagnostics } from './diagnostics';
import { clearUrlCache } from './urlChecker';

const ARTICLE_FILE_NAME = 'article.json';

let diagnosticCollection: vscode.DiagnosticCollection;

/**
 * Tracks the latest validation generation per document URI.
 * When a document changes again while URL checks are in-flight, we bump the
 * generation so the stale check's results are discarded on arrival.
 */
const validationGeneration = new Map<string, number>();

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('anf-validator');
  context.subscriptions.push(diagnosticCollection);

  // --- Validate files already open at activation time ---
  for (const doc of vscode.workspace.textDocuments) {
    if (isArticleJson(doc)) {
      void runValidation(doc);
    }
  }

  // --- Validate when a document is opened inside VS Code ---
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (isArticleJson(doc)) {
        void runValidation(doc);
      }
    }),
  );

  // --- File system watcher: catches external writes (terminal tools, git, etc.) ---
  // This replaces onDidSaveTextDocument so that externally generated article.json
  // files are validated as soon as VS Code sees the disk change — no manual save needed.
  const watcher = vscode.workspace.createFileSystemWatcher('**/article.json');
  context.subscriptions.push(watcher);

  watcher.onDidChange(async uri => {
    const doc = await openDocument(uri);
    if (doc) void runValidation(doc);
  });

  watcher.onDidCreate(async uri => {
    const doc = await openDocument(uri);
    if (doc) void runValidation(doc);
  });

  watcher.onDidDelete(uri => {
    diagnosticCollection.delete(uri);
    validationGeneration.delete(uri.toString());
  });

  // --- Clear diagnostics when a file is closed ---
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (isArticleJson(doc)) {
        diagnosticCollection.delete(doc.uri);
        validationGeneration.delete(doc.uri.toString());
      }
    }),
  );
}

export function deactivate(): void {
  clearUrlCache();
  diagnosticCollection?.dispose();
}

// ---------------------------------------------------------------------------
// Validation orchestration
// ---------------------------------------------------------------------------

/**
 * Two-phase validation for an article.json document.
 *
 * Phase 1 (sync): schema + cross-ref errors → written to DiagnosticCollection immediately.
 * Phase 2 (async): URL reachability warnings → merged in when all checks complete.
 *
 * A per-document generation counter ensures that if the document changes again
 * while phase 2 is running, the stale results are silently dropped.
 */
async function runValidation(document: vscode.TextDocument): Promise<void> {
  const uriKey = document.uri.toString();
  const gen = (validationGeneration.get(uriKey) ?? 0) + 1;
  validationGeneration.set(uriKey, gen);

  // Phase 1: synchronous validation — instant feedback
  let syncDiagnostics: vscode.Diagnostic[];
  try {
    syncDiagnostics = getDiagnostics(document);
  } catch (err) {
    console.error('[ANF Validator] Unexpected error during sync validation:', err);
    syncDiagnostics = [];
  }
  diagnosticCollection.set(document.uri, syncDiagnostics);

  // Phase 2: async URL checks (only if setting is enabled)
  const config = vscode.workspace.getConfiguration('anfValidator');
  if (!config.get<boolean>('checkUrls', true)) return;

  const abortController = new AbortController();
  let urlDiagnostics: vscode.Diagnostic[] = [];

  try {
    urlDiagnostics = await getUrlDiagnostics(document, abortController.signal);
  } catch (err) {
    // AbortError or unexpected — skip URL results for this run
    console.error('[ANF Validator] URL check error:', err);
    return;
  }

  // Discard if a newer validation has already started for this document
  if (validationGeneration.get(uriKey) !== gen) return;

  diagnosticCollection.set(document.uri, [...syncDiagnostics, ...urlDiagnostics]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true only for files named exactly "article.json". */
function isArticleJson(document: vscode.TextDocument): boolean {
  const name = document.fileName;
  return (
    name === ARTICLE_FILE_NAME ||
    name.endsWith(`/${ARTICLE_FILE_NAME}`) ||
    name.endsWith(`\\${ARTICLE_FILE_NAME}`)
  );
}

/**
 * Open (or return already-open) TextDocument for a URI.
 * Returns undefined if the document can't be opened (e.g. binary file).
 */
async function openDocument(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch {
    return undefined;
  }
}
