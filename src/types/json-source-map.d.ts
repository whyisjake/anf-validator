/**
 * Type declarations for json-source-map (no @types package available).
 * Maps RFC 6901 JSON Pointers to line/column source positions.
 */
declare module 'json-source-map' {
  export interface SourceLocation {
    line: number;
    column: number;
    pos: number;
  }

  export interface PointerEntry {
    value: SourceLocation;
    valueEnd: SourceLocation;
    key?: SourceLocation;
    keyEnd?: SourceLocation;
  }

  export interface ParseResult<T = unknown> {
    data: T;
    pointers: Record<string, PointerEntry>;
  }

  export function parse<T = unknown>(json: string): ParseResult<T>;
  export function stringify(value: unknown, replacer?: unknown, space?: number | string): { json: string; pointers: Record<string, PointerEntry> };
}
