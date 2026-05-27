import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateSchema } from '../src/validator';
import { formatAjvError } from '../src/messages';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));

// ---------------------------------------------------------------------------
// validateSchema — happy path
// ---------------------------------------------------------------------------
describe('validateSchema — valid article', () => {
  it('returns no errors for a fully valid article', () => {
    const data = fixture('valid-article.json');
    const errors = validateSchema(data);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateSchema — missing required fields
// ---------------------------------------------------------------------------
describe('validateSchema — missing required fields', () => {
  const data = fixture('missing-required.json');
  const errors = validateSchema(data);

  it('returns errors when required fields are missing', () => {
    expect(errors.length).toBeGreaterThan(0);
  });

  it('flags missing "identifier" field', () => {
    const identifierErr = errors.find(
      e => e.keyword === 'required' &&
           (e.params as { missingProperty: string }).missingProperty === 'identifier',
    );
    expect(identifierErr).toBeDefined();
  });

  it('flags missing "language" field', () => {
    const langErr = errors.find(
      e => e.keyword === 'required' &&
           (e.params as { missingProperty: string }).missingProperty === 'language',
    );
    expect(langErr).toBeDefined();
  });

  it('flags missing "componentTextStyles" field', () => {
    const ctsErr = errors.find(
      e => e.keyword === 'required' &&
           (e.params as { missingProperty: string }).missingProperty === 'componentTextStyles',
    );
    expect(ctsErr).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateSchema — invalid layout types
// ---------------------------------------------------------------------------
describe('validateSchema — invalid layout types', () => {
  const data = fixture('invalid-layout.json');
  const errors = validateSchema(data);

  it('returns errors for invalid layout', () => {
    expect(errors.length).toBeGreaterThan(0);
  });

  it('flags layout.columns as wrong type (string instead of integer)', () => {
    const typeErr = errors.find(
      e => e.instancePath === '/layout/columns' && e.keyword === 'type',
    );
    expect(typeErr).toBeDefined();
  });

  it('flags layout.width violating exclusiveMinimum', () => {
    const minErr = errors.find(
      e => e.instancePath === '/layout/width' &&
           (e.keyword === 'exclusiveMinimum' || e.keyword === 'minimum'),
    );
    expect(minErr).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateSchema — empty components array
// ---------------------------------------------------------------------------
describe('validateSchema — empty components array', () => {
  const data = fixture('empty-components.json');
  const errors = validateSchema(data);

  it('flags components array with minItems violation', () => {
    const minErr = errors.find(
      e => e.instancePath === '/components' && e.keyword === 'minItems',
    );
    expect(minErr).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateSchema — edge cases
// ---------------------------------------------------------------------------
describe('validateSchema — edge cases', () => {
  it('returns errors for null input', () => {
    const errors = validateSchema(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns errors for empty object', () => {
    const errors = validateSchema({});
    // Must flag all 7 required fields
    expect(errors.length).toBeGreaterThanOrEqual(7);
  });

  it('returns errors for non-object input (string)', () => {
    const errors = validateSchema('not an object');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts embedwebvideo and embedvideo roles', () => {
    const data = fixture('valid-article.json') as Record<string, unknown>;
    for (const role of ['embedwebvideo', 'embedvideo']) {
      const modified = {
        ...data,
        components: [{
          role,
          URL: 'https://www.youtube.com/embed/0qwALOOvUik',
          aspectRatio: 1.777,
        }],
      };
      const errors = validateSchema(modified);
      const roleErrors = errors.filter(e => e.instancePath === '/components/0/role');
      expect(roleErrors, `role "${role}" should be valid`).toHaveLength(0);
    }
  });

  it('flags a genuinely unknown role', () => {
    const data = fixture('valid-article.json') as Record<string, unknown>;
    const modified = {
      ...data,
      components: [{ role: 'future-unknown-role-xyz', text: 'test' }],
    };
    const errors = validateSchema(modified);
    expect(() => validateSchema(modified)).not.toThrow();
    const roleErrors = errors.filter(e => e.instancePath === '/components/0/role');
    expect(roleErrors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// formatAjvError — human-readable messages
// ---------------------------------------------------------------------------
describe('formatAjvError', () => {
  it('formats a "required" error with the missing field name', () => {
    const err = {
      instancePath: '',
      keyword: 'required',
      message: "must have required property 'identifier'",
      params: { missingProperty: 'identifier' },
      schemaPath: '#/required',
    };
    const msg = formatAjvError(err);
    expect(msg).toContain('identifier');
    expect(msg.toLowerCase()).toMatch(/missing|required/);
  });

  it('formats a "type" error with the expected type', () => {
    const err = {
      instancePath: '/layout/columns',
      keyword: 'type',
      message: 'must be integer',
      params: { type: 'integer' },
      schemaPath: '#/definitions/Layout/properties/columns/type',
    };
    const msg = formatAjvError(err);
    expect(msg).toContain('integer');
    expect(msg).toContain('layout → columns');
  });

  it('formats a "minItems" error with the minimum count', () => {
    const err = {
      instancePath: '/components',
      keyword: 'minItems',
      message: 'must NOT have fewer than 1 items',
      params: { limit: 1 },
      schemaPath: '#/properties/components/minItems',
    };
    const msg = formatAjvError(err);
    expect(msg).toContain('1');
    expect(msg).toContain('components');
  });

  it('formats a "pattern" error for version with friendly guidance', () => {
    const err = {
      instancePath: '/version',
      keyword: 'pattern',
      message: 'must match pattern "^[0-9]+\\.[0-9]+"',
      params: { pattern: '^[0-9]+\\.[0-9]+' },
      schemaPath: '#/properties/version/pattern',
    };
    const msg = formatAjvError(err);
    expect(msg.toLowerCase()).toMatch(/version|format/);
    expect(msg).toContain('1.26');
  });

  it('formats a "pattern" error for identifier with friendly guidance', () => {
    const err = {
      instancePath: '/identifier',
      keyword: 'pattern',
      message: 'must match pattern',
      params: { pattern: '^[a-zA-Z0-9_-]{1,64}$' },
      schemaPath: '#/properties/identifier/pattern',
    };
    const msg = formatAjvError(err);
    expect(msg.toLowerCase()).toMatch(/identifier|character/);
  });

  it('falls back gracefully for unknown keyword', () => {
    const err = {
      instancePath: '/foo',
      keyword: 'unknownFutureKeyword',
      message: 'some message',
      params: {},
      schemaPath: '#/foo',
    };
    const msg = formatAjvError(err);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});
