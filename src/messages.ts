/**
 * Human-readable diagnostic messages for ANF validation errors.
 * Each function receives the raw AJV error and returns a user-facing string.
 */

import type { ErrorObject } from 'ajv';

/** Produce a human-readable message for a single AJV ErrorObject. */
export function formatAjvError(err: ErrorObject): string {
  const field = err.instancePath
    ? `"${err.instancePath.replace(/^\//, '').replace(/\//g, ' → ')}"`
    : 'Article';

  switch (err.keyword) {
    case 'required': {
      const missing = (err.params as { missingProperty: string }).missingProperty;
      return `${field} is missing required field "${missing}". Add it to fix this error.`;
    }

    case 'type': {
      const expected = (err.params as { type: string | string[] }).type;
      const types = Array.isArray(expected) ? expected.join(' or ') : expected;
      return `${field} must be of type ${types}, but received ${typeof getActualValue(err)}.`;
    }

    case 'enum': {
      const allowed = (err.params as { allowedValues: unknown[] }).allowedValues;
      const allowedStr = allowed.slice(0, 5).map(v => `"${v}"`).join(', ');
      const more = allowed.length > 5 ? ` (and ${allowed.length - 5} more)` : '';
      return `${field} has an invalid value. Allowed values include: ${allowedStr}${more}.`;
    }

    case 'minimum':
    case 'exclusiveMinimum': {
      const limit = (err.params as { limit: number }).limit;
      const op = err.keyword === 'exclusiveMinimum' ? '>' : '≥';
      return `${field} must be ${op} ${limit}.`;
    }

    case 'maximum':
    case 'exclusiveMaximum': {
      const limit = (err.params as { limit: number }).limit;
      const op = err.keyword === 'exclusiveMaximum' ? '<' : '≤';
      return `${field} must be ${op} ${limit}.`;
    }

    case 'minLength': {
      const min = (err.params as { limit: number }).limit;
      return `${field} must not be empty (minimum length: ${min}).`;
    }

    case 'maxLength': {
      const max = (err.params as { limit: number }).limit;
      return `${field} must be no longer than ${max} characters.`;
    }

    case 'minItems': {
      const min = (err.params as { limit: number }).limit;
      return `${field} must contain at least ${min} item${min === 1 ? '' : 's'}.`;
    }

    case 'maxItems': {
      const max = (err.params as { limit: number }).limit;
      return `${field} must contain no more than ${max} item${max === 1 ? '' : 's'}.`;
    }

    case 'pattern': {
      const pattern = (err.params as { pattern: string }).pattern;
      return patternMessage(err.instancePath, pattern);
    }

    case 'additionalProperties': {
      const extra = (err.params as { additionalProperty: string }).additionalProperty;
      return `${field} contains an unexpected property "${extra}". Remove it or check the ANF specification.`;
    }

    case 'format': {
      const format = (err.params as { format: string }).format;
      return `${field} must be a valid ${format}.`;
    }

    case 'oneOf':
    case 'anyOf':
      return `${field} does not match any of the allowed schemas for this property. Check the ANF specification for valid values.`;

    case 'const': {
      const allowed = (err.params as { allowedValue: unknown }).allowedValue;
      return `${field} must be exactly "${allowed}".`;
    }

    default:
      return `${field}: ${err.message ?? err.keyword}`;
  }
}

/** Produce a human-readable message for a cross-reference error. */
export function formatCrossRefError(
  refType: 'textStyle' | 'layout' | 'style',
  refValue: string,
  componentPath: string,
): string {
  const dictName = crossRefDictName(refType);
  const fieldPath = componentPath
    ? `"${componentPath.replace(/^\//, '').replace(/\//g, ' → ')}"`
    : 'A component';
  return (
    `${fieldPath} references ${refType} "${refValue}", ` +
    `but "${refValue}" is not defined in "${dictName}". ` +
    `Add "${refValue}" to the "${dictName}" dictionary or correct the reference.`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function crossRefDictName(refType: 'textStyle' | 'layout' | 'style'): string {
  switch (refType) {
    case 'textStyle': return 'componentTextStyles';
    case 'layout':    return 'componentLayouts';
    case 'style':     return 'componentStyles';
  }
}

/** Attempt to get a friendlier "actual value" from an error (best-effort). */
function getActualValue(err: ErrorObject): unknown {
  return err.data;
}

/** Return a context-aware message for `pattern` violations. */
function patternMessage(instancePath: string, pattern: string): string {
  if (instancePath === '/version') {
    return 'The "version" field must be in the format "major.minor" (e.g. "1.26").';
  }
  if (instancePath === '/identifier') {
    return (
      'The "identifier" must be 1–64 characters and contain only ' +
      'letters, digits, hyphens (-), or underscores (_).'
    );
  }
  if (instancePath === '/language') {
    return (
      'The "language" field must be a valid BCP 47 language code (e.g. "en", "en-US").'
    );
  }
  const field = instancePath
    ? `"${instancePath.replace(/^\//, '').replace(/\//g, ' → ')}"`
    : 'This field';
  return `${field} does not match the required pattern: ${pattern}.`;
}
