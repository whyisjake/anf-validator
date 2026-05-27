/**
 * ANF Validator VS Code Extension entry point.
 *
 * Activation: workspaceContains - only activates in workspaces with an article.json file.
 *
 * On activate:
 *   1. Register a DiagnosticCollection named "anf-validator".
 *   2. Validate any article.json files that are already open.
 *   3. Subscribe to onDidOpenTextDocument / onDidSaveTextDocument to
 *      validate on open and on save.
 *   4. Subscribe to onDidCloseTextDocument to clear diagnostics when the
 *      file is closed.
 *
 * Note: onLanguage:json is intentionally NOT in activationEvents — it would
 * fire for every .json file. We only validate files named "article.json".
 */

import * as vscode from 'vscode';
import { getDiagnostics } from './diagnostics';

const ARTICLE_FILE_NAME = 'article.json';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('anf-validator');
  context.subscriptions.push(diagnosticCollection);

  // Validate files that are already open when the extension activates.
  // This handles the "standalone file" scenario (file open before workspace
  // containment was detected, or opened directly without a folder).
  for (const doc of vscode.workspace.textDocuments) {
    if (isArticleJson(doc)) {
      validateDocument(doc);
    }
  }

  // Validate when a new document is opened.
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isArticleJson(doc)) {
        validateDocument(doc);
      }
    }),
  );

  // Re-validate on every save.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isArticleJson(doc)) {
        validateDocument(doc);
      }
    }),
  );

  // Clear diagnostics when the file is closed.
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (isArticleJson(doc)) {
        diagnosticCollection.delete(doc.uri);
      }
    }),
  );
}

export function deactivate(): void {
  diagnosticCollection?.dispose();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true only for files named exactly "article.json". */
function isArticleJson(document: vscode.TextDocument): boolean {
  return document.fileName.endsWith(ARTICLE_FILE_NAME) &&
    (document.fileName === ARTICLE_FILE_NAME ||
     document.fileName.endsWith(`/${ARTICLE_FILE_NAME}`) ||
     document.fileName.endsWith(`\\${ARTICLE_FILE_NAME}`));
}

/** Run validation and push results to the DiagnosticCollection. */
function validateDocument(document: vscode.TextDocument): void {
  try {
    const diagnostics = getDiagnostics(document);
    diagnosticCollection.set(document.uri, diagnostics);
  } catch (err) {
    // Should not happen — getDiagnostics handles JSON parse errors internally.
    // Log but do not crash the extension.
    console.error('[ANF Validator] Unexpected error during validation:', err);
    diagnosticCollection.set(document.uri, []);
  }
}
