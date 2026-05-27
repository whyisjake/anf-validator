/**
 * ANF JSON Schema validator.
 *
 * validateSchema() accepts a pre-parsed article object (to avoid double-parse)
 * and returns AJV ErrorObject[] (empty = valid).
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './schema/article.schema.json';

// AJV v8 supports JSON Schema Draft 7 natively.
// allErrors: true — collect all errors, not just the first.
// strict: false — allow unknown keywords (e.g. $id, $schema in the schema itself).
const ajv = new Ajv({ allErrors: true, strict: false });

// ajv-formats adds support for "uri", "date-time", etc. referenced in the schema.
// The import may not be available as a default export on all module systems,
// so we handle both forms.
const addFormatsAny = addFormats as unknown as (ajv: Ajv) => void;
addFormatsAny(ajv);

const validate = ajv.compile(schema);

/**
 * Validate a parsed article object against the ANF JSON Schema.
 *
 * @param data  The parsed article.json content.
 * @returns     Array of AJV ErrorObjects. Empty array means the document is valid.
 */
export function validateSchema(data: unknown): ErrorObject[] {
  const valid = validate(data);
  if (valid) return [];
  return validate.errors ?? [];
}
