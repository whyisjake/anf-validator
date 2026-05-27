/**
 * Cross-reference validator for Apple News Format articles.
 *
 * JSON Schema cannot check that a string property on a component (e.g.
 * textStyle: "my-style") actually refers to a key that exists in the
 * corresponding root dictionary. This module performs that second pass.
 *
 * validateCrossRefs() accepts a pre-parsed article object and returns an
 * array of CrossRefError descriptors (empty = no dangling refs).
 */

/** Identifies a single dangling reference found in the document. */
export interface CrossRefError {
  /** The type of reference that is dangling. */
  refType: 'textStyle' | 'layout' | 'style';
  /** The name of the missing definition. */
  refValue: string;
  /**
   * RFC 6901 JSON Pointer to the property that holds the bad reference.
   * Example: "/components/1/textStyle"
   */
  pointer: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate cross-references between component properties and root dictionaries.
 *
 * @param data  The parsed article.json content.
 * @returns     Array of CrossRefError. Empty = no dangling references.
 */
export function validateCrossRefs(data: unknown): CrossRefError[] {
  if (!isObject(data)) return [];

  const article = data as Record<string, unknown>;
  const errors: CrossRefError[] = [];

  // Build sets of defined names from root dictionaries.
  const definedTextStyles = keySet(article['componentTextStyles']);
  const definedLayouts    = keySet(article['componentLayouts']);
  const definedStyles     = keySet(article['componentStyles']);

  // Walk the components tree.
  const components = article['components'];
  if (Array.isArray(components)) {
    walkComponents(
      components,
      '/components',
      definedTextStyles,
      definedLayouts,
      definedStyles,
      errors,
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Recursively walk a components array, collecting cross-ref errors. */
function walkComponents(
  components: unknown[],
  basePath: string,
  definedTextStyles: Set<string>,
  definedLayouts: Set<string>,
  definedStyles: Set<string>,
  errors: CrossRefError[],
): void {
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    if (!isObject(comp)) continue;
    const component = comp as Record<string, unknown>;
    const compPath = `${basePath}/${i}`;

    // textStyle — string ref only (inline objects are not cross-ref errors)
    checkRef(component, 'textStyle', compPath, definedTextStyles, 'textStyle', errors);
    // layout
    checkRef(component, 'layout', compPath, definedLayouts, 'layout', errors);
    // style
    checkRef(component, 'style', compPath, definedStyles, 'style', errors);

    // Recurse into nested components
    const nested = component['components'];
    if (Array.isArray(nested)) {
      walkComponents(
        nested,
        `${compPath}/components`,
        definedTextStyles,
        definedLayouts,
        definedStyles,
        errors,
      );
    }
  }
}

/** Check a single ref property on a component object. */
function checkRef(
  component: Record<string, unknown>,
  prop: string,
  compPath: string,
  definedNames: Set<string>,
  refType: CrossRefError['refType'],
  errors: CrossRefError[],
): void {
  const value = component[prop];
  if (typeof value !== 'string') return; // inline object or absent — skip
  if (!definedNames.has(value)) {
    errors.push({
      refType,
      refValue: value,
      pointer: `${compPath}/${prop}`,
    });
  }
}

/** Return the set of keys in a dictionary property, or empty set if absent/invalid. */
function keySet(value: unknown): Set<string> {
  if (!isObject(value)) return new Set();
  return new Set(Object.keys(value as Record<string, unknown>));
}

/** Type guard: is `v` a non-null, non-array object? */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
