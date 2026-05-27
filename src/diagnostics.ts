/**
 * Converts validation errors from validateSchema(), validateCrossRefs(), and
 * URL reachability checks into VS Code Diagnostic objects.
 *
 * getDiagnostics()    — synchronous; schema + cross-ref errors only
 * getUrlDiagnostics() — async; URL reachability warnings
 *
 * parse() is called once in each function; both use json-source-map to map
 * RFC 6901 JSON Pointers to line/column positions.
 */

import * as vscode from 'vscode';
import * as jsonSourceMap from 'json-source-map';
import type { ErrorObject } from 'ajv';
import { validateSchema } from './validator';
import { validateCrossRefs, type CrossRefError } from './crossRef';
import { formatAjvError, formatCrossRefError } from './messages';
import { extractUrls, checkUrl } from './urlChecker';

/**
 * Parse and validate an article.json document, returning VS Code Diagnostics.
 *
 * @param document  The VS Code TextDocument for article.json.
 * @returns         Array of Diagnostic objects (empty = document is valid).
 */
export function getDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  const text = document.getText();

  // Attempt to parse — surface a parse error as a single diagnostic if invalid JSON.
  let parsed: ReturnType<typeof jsonSourceMap.parse>;
  try {
    parsed = jsonSourceMap.parse(text);
  } catch (e) {
    const msg =
      e instanceof SyntaxError
        ? `article.json is not valid JSON: ${e.message}`
        : 'article.json could not be parsed.';
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 0),
      msg,
      vscode.DiagnosticSeverity.Error,
    );
    diag.source = 'ANF Validator';
    return [diag];
  }

  const { data, pointers } = parsed;
  const diagnostics: vscode.Diagnostic[] = [];

  // --- JSON Schema validation ---
  const schemaErrors: ErrorObject[] = validateSchema(data);
  for (const err of schemaErrors) {
    const range = pointerToRange(document, pointers, err);
    const message = formatAjvError(err);
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diag.source = 'ANF Validator';
    diag.code = err.keyword;
    diagnostics.push(diag);
  }

  // --- Cross-reference validation ---
  const crossRefErrors: CrossRefError[] = validateCrossRefs(data);
  for (const err of crossRefErrors) {
    const range = refPointerToRange(document, pointers, err.pointer);
    const message = formatCrossRefError(err.refType, err.refValue, err.pointer);
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diag.source = 'ANF Validator';
    diag.code = `dangling-${err.refType}`;
    diagnostics.push(diag);
  }

  return diagnostics;
}

/**
 * Asynchronously check all HTTP(S) URL values in the article for reachability.
 * Returns Warning-severity Diagnostics for any URL that returns a non-2xx/3xx
 * response or fails to connect.
 *
 * Designed to run after getDiagnostics() — results are merged by the caller.
 *
 * @param document  The VS Code TextDocument for article.json.
 * @param signal    Optional AbortSignal to cancel in-flight requests when the
 *                  document changes again before checks complete.
 */
export async function getUrlDiagnostics(
  document: vscode.TextDocument,
  signal?: AbortSignal,
): Promise<vscode.Diagnostic[]> {
  const text = document.getText();

  let parsed: ReturnType<typeof jsonSourceMap.parse>;
  try {
    parsed = jsonSourceMap.parse(text);
  } catch {
    // If the document is invalid JSON, getDiagnostics() already reported it.
    return [];
  }

  const { data, pointers } = parsed;
  const urls = extractUrls(data);
  if (urls.length === 0) return [];

  // Check all URLs concurrently.
  const results = await Promise.all(
    urls.map(async entry => {
      try {
        const result = await checkUrl(entry.url, signal);
        return { entry, result };
      } catch (err) {
        // AbortError — the check was cancelled; skip this URL.
        return null;
      }
    }),
  );

  const diagnostics: vscode.Diagnostic[] = [];

  for (const item of results) {
    if (!item) continue; // cancelled
    const { entry, result } = item;
    if (result.ok) continue;

    const range = valueRange(document, pointers, entry.pointer);
    const message = formatUrlError(entry.url, result.statusCode, result.error);
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    diag.source = 'ANF Validator';
    diag.code = result.statusCode > 0 ? `url-${result.statusCode}` : 'url-unreachable';
    diagnostics.push(diag);
  }

  return diagnostics;
}

/** Format a human-readable message for a failed URL check. */
function formatUrlError(url: string, statusCode: number, error?: string): string {
  if (error && statusCode === 0) {
    return `Image URL is unreachable: ${url}\nNetwork error: ${error}`;
  }
  if (statusCode === 404) {
    return `Image URL returned 404 Not Found: ${url}\nThe resource does not exist at this address. Check the URL or re-upload the asset.`;
  }
  if (statusCode === 403) {
    return `Image URL returned 403 Forbidden: ${url}\nAccess was denied. The asset may require authentication or the URL may be incorrect.`;
  }
  if (statusCode >= 500) {
    return `Image URL returned a server error (${statusCode}): ${url}\nThe server is having trouble. This may be temporary.`;
  }
  return `Image URL returned an unexpected status (${statusCode}): ${url}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type PointerMap = Record<string, {
  value: { line: number; column: number; pos: number };
  valueEnd: { line: number; column: number; pos: number };
  key?: { line: number; column: number; pos: number };
  keyEnd?: { line: number; column: number; pos: number };
}>;

/**
 * Map an AJV ErrorObject to a VS Code Range.
 *
 * For `required` errors the pointer points to the parent object; we use the
 * parent's value start position (opening brace) and advance by one char so
 * the diagnostic is visible on the right object rather than the whole file root.
 */
function pointerToRange(
  document: vscode.TextDocument,
  pointers: PointerMap,
  err: ErrorObject,
): vscode.Range {
  if (err.keyword === 'required') {
    // instancePath is the parent; highlight the parent's opening brace/bracket.
    return valueRange(document, pointers, err.instancePath);
  }
  return valueRange(document, pointers, err.instancePath);
}

/**
 * Map a cross-reference pointer to a VS Code Range.
 * The pointer already points directly to the property value (e.g. textStyle).
 */
function refPointerToRange(
  document: vscode.TextDocument,
  pointers: PointerMap,
  pointer: string,
): vscode.Range {
  return valueRange(document, pointers, pointer);
}

/**
 * Resolve a JSON Pointer string to a VS Code Range using the pointer map.
 * Falls back to (0,0)–(0,0) if the pointer is not found.
 */
function valueRange(
  document: vscode.TextDocument,
  pointers: PointerMap,
  pointer: string,
): vscode.Range {
  const entry = pointers[pointer] ?? pointers[''];
  if (!entry) {
    return new vscode.Range(0, 0, 0, 0);
  }

  const start = new vscode.Position(entry.value.line, entry.value.column);
  const end   = new vscode.Position(entry.valueEnd.line, entry.valueEnd.column);

  // Clamp to document bounds.
  const lineCount = document.lineCount;
  const safeStart = start.line < lineCount ? start : new vscode.Position(0, 0);
  const safeEnd   = end.line   < lineCount ? end   : safeStart;

  return new vscode.Range(safeStart, safeEnd);
}
