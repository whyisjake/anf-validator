import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateCrossRefs } from '../src/crossRef';
import { formatCrossRefError } from '../src/messages';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe('validateCrossRefs — valid article', () => {
  it('returns no errors when all refs are defined', () => {
    const data = fixture('valid-article.json');
    const errors = validateCrossRefs(data);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dangling references
// ---------------------------------------------------------------------------
describe('validateCrossRefs — dangling-refs fixture', () => {
  const data = fixture('dangling-refs.json');
  const errors = validateCrossRefs(data);

  it('returns errors for dangling references', () => {
    expect(errors.length).toBeGreaterThan(0);
  });

  it('flags the dangling textStyle reference', () => {
    const err = errors.find(
      e => e.refType === 'textStyle' && e.refValue === 'nonexistent-title-style',
    );
    expect(err).toBeDefined();
    expect(err?.pointer).toBe('/components/0/textStyle');
  });

  it('flags the dangling layout reference', () => {
    const err = errors.find(
      e => e.refType === 'layout' && e.refValue === 'nonexistent-layout',
    );
    expect(err).toBeDefined();
    expect(err?.pointer).toBe('/components/1/layout');
  });

  it('flags the dangling style reference', () => {
    const err = errors.find(
      e => e.refType === 'style' && e.refValue === 'nonexistent-style',
    );
    expect(err).toBeDefined();
    expect(err?.pointer).toBe('/components/1/style');
  });

  it('does NOT flag components that use inline style objects (not string refs)', () => {
    const dataWithInline = {
      version: '1.26',
      identifier: 'inline-test',
      title: 'Inline style test',
      language: 'en',
      layout: { columns: 7, width: 1024 },
      components: [
        {
          role: 'body',
          text: 'test',
          textStyle: { fontSize: 18 }, // inline object — not a ref
          layout: { columnStart: 0, columnSpan: 5 }, // inline object
          style: { backgroundColor: '#fff' }, // inline object
        },
      ],
      componentTextStyles: {},
    };
    const inlineErrors = validateCrossRefs(dataWithInline);
    expect(inlineErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('validateCrossRefs — edge cases', () => {
  it('returns empty array for null input', () => {
    expect(validateCrossRefs(null)).toHaveLength(0);
  });

  it('returns empty array for empty object', () => {
    expect(validateCrossRefs({})).toHaveLength(0);
  });

  it('returns empty array when components property is absent', () => {
    expect(validateCrossRefs({ version: '1.26' })).toHaveLength(0);
  });

  it('handles nested components recursively', () => {
    const data = {
      version: '1.26',
      identifier: 'nested',
      title: 'Nested Test',
      language: 'en',
      layout: { columns: 7, width: 1024 },
      components: [
        {
          role: 'section',
          components: [
            {
              role: 'body',
              text: 'nested body',
              textStyle: 'missing-nested-style',
            },
          ],
        },
      ],
      componentTextStyles: {},
    };
    const errors = validateCrossRefs(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].refValue).toBe('missing-nested-style');
    expect(errors[0].pointer).toBe('/components/0/components/0/textStyle');
  });

  it('does not error when dictionaries are absent but no string refs exist', () => {
    const data = {
      version: '1.26',
      identifier: 'no-dicts',
      title: 'No Dicts',
      language: 'en',
      layout: { columns: 7, width: 1024 },
      components: [{ role: 'body', text: 'plain text' }],
      componentTextStyles: {},
    };
    const errors = validateCrossRefs(data);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatCrossRefError — human-readable messages
// ---------------------------------------------------------------------------
describe('formatCrossRefError', () => {
  it('mentions the missing style name in the message', () => {
    const msg = formatCrossRefError('textStyle', 'my-missing-style', '/components/0/textStyle');
    expect(msg).toContain('my-missing-style');
    expect(msg).toContain('componentTextStyles');
  });

  it('mentions componentLayouts for layout refs', () => {
    const msg = formatCrossRefError('layout', 'my-missing-layout', '/components/1/layout');
    expect(msg).toContain('componentLayouts');
    expect(msg).toContain('my-missing-layout');
  });

  it('mentions componentStyles for style refs', () => {
    const msg = formatCrossRefError('style', 'my-missing-style', '/components/2/style');
    expect(msg).toContain('componentStyles');
  });

  it('includes actionable instruction to add or correct the ref', () => {
    const msg = formatCrossRefError('textStyle', 'bold-style', '/components/0/textStyle');
    expect(msg.toLowerCase()).toMatch(/add|correct|define/);
  });
});
