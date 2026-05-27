/**
 * Converts validation errors from validateSchema() and validateCrossRefs()
 * into VS Code Diagnostic objects, using json-source-map to map JSON Pointers
 * to line/column positions.
 *
 * parse() is called once here; the { data, pointers } result is shared with
 * both validators to avoid double-parsing the document.
 */

import * as vscode from 'vscode';
import * as jsonSourceMap from 'json-source-map';
import type { ErrorObject } from 'ajv';
import { validateSchema } from './validator';
import { validateCrossRefs, type CrossRefError } from './crossRef';
import { formatAjvError, formatCrossRefError } from './messages';

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
