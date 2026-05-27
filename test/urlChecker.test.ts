import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractUrls, checkUrl, clearUrlCache } from '../src/urlChecker';

// ---------------------------------------------------------------------------
// extractUrls — pure extraction tests (no network)
// ---------------------------------------------------------------------------

describe('extractUrls — happy path', () => {
  it('finds a URL on a photo component', () => {
    const data = {
      components: [
        { role: 'photo', URL: 'https://example.com/image.jpg' },
      ],
    };
    const urls = extractUrls(data);
    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe('https://example.com/image.jpg');
    expect(urls[0].pointer).toBe('/components/0/URL');
  });

  it('finds URLs on multiple components', () => {
    const data = {
      components: [
        { role: 'photo', URL: 'https://example.com/a.jpg' },
        { role: 'figure', URL: 'https://example.com/b.png' },
      ],
    };
    const urls = extractUrls(data);
    expect(urls).toHaveLength(2);
    expect(urls.map(u => u.url)).toContain('https://example.com/a.jpg');
    expect(urls.map(u => u.url)).toContain('https://example.com/b.png');
  });

  it('finds URLs in nested components', () => {
    const data = {
      components: [
        {
          role: 'section',
          components: [
            { role: 'photo', URL: 'https://example.com/nested.jpg' },
          ],
        },
      ],
    };
    const urls = extractUrls(data);
    expect(urls).toHaveLength(1);
    expect(urls[0].pointer).toBe('/components/0/components/0/URL');
  });

  it('finds embedwebvideo URL', () => {
    const data = {
      components: [
        {
          role: 'embedwebvideo',
          URL: 'https://www.youtube.com/embed/0qwALOOvUik',
        },
      ],
    };
    const urls = extractUrls(data);
    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe('https://www.youtube.com/embed/0qwALOOvUik');
  });
});

describe('extractUrls — filtering', () => {
  it('skips bundle:// URLs', () => {
    const data = {
      components: [
        { role: 'photo', URL: 'bundle://image.jpg' },
      ],
    };
    expect(extractUrls(data)).toHaveLength(0);
  });

  it('skips relative URLs', () => {
    const data = {
      components: [
        { role: 'photo', URL: './images/photo.jpg' },
      ],
    };
    expect(extractUrls(data)).toHaveLength(0);
  });

  it('skips non-URL string properties named URL', () => {
    const data = {
      components: [
        { role: 'body', URL: 'not-a-url' },
      ],
    };
    expect(extractUrls(data)).toHaveLength(0);
  });

  it('returns empty array for article with no URL properties', () => {
    const data = {
      version: '1.26',
      components: [
        { role: 'title', text: 'Hello' },
        { role: 'body', text: 'World' },
      ],
      componentTextStyles: {},
    };
    expect(extractUrls(data)).toHaveLength(0);
  });

  it('returns empty array for null input', () => {
    expect(extractUrls(null)).toHaveLength(0);
  });

  it('returns empty array for empty object', () => {
    expect(extractUrls({})).toHaveLength(0);
  });

  it('accepts https URLs', () => {
    const data = { components: [{ role: 'photo', URL: 'https://secure.example.com/img.jpg' }] };
    expect(extractUrls(data)).toHaveLength(1);
  });

  it('accepts http URLs', () => {
    const data = { components: [{ role: 'photo', URL: 'http://example.com/img.jpg' }] };
    expect(extractUrls(data)).toHaveLength(1);
  });
});

describe('extractUrls — pointer accuracy', () => {
  it('produces correct pointer for second component', () => {
    const data = {
      components: [
        { role: 'title', text: 'Hello' },
        { role: 'photo', URL: 'https://example.com/img.jpg' },
      ],
    };
    const urls = extractUrls(data);
    expect(urls[0].pointer).toBe('/components/1/URL');
  });

  it('produces correct pointer for deeply nested URL', () => {
    const data = {
      components: [
        {
          role: 'section',
          components: [
            {
              role: 'section',
              components: [
                { role: 'photo', URL: 'https://example.com/deep.jpg' },
              ],
            },
          ],
        },
      ],
    };
    const urls = extractUrls(data);
    expect(urls[0].pointer).toBe('/components/0/components/0/components/0/URL');
  });
});

// ---------------------------------------------------------------------------
// checkUrl — HTTP checks with mocked fetch
// ---------------------------------------------------------------------------

describe('checkUrl — HTTP checks', () => {
  beforeEach(() => {
    clearUrlCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearUrlCache();
  });

  function mockFetch(status: number, bodyCancel = true): void {
    vi.mocked(fetch).mockResolvedValue({
      status,
      body: bodyCancel ? { cancel: vi.fn().mockResolvedValue(undefined) } : null,
    } as unknown as Response);
  }

  it('returns ok=true for a 200 response', async () => {
    mockFetch(200);
    const result = await checkUrl('https://example.com/img.jpg');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.fromCache).toBe(false);
    // HEAD was tried first
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://example.com/img.jpg',
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('returns ok=true for a 301 redirect', async () => {
    mockFetch(301);
    const result = await checkUrl('https://example.com/img.jpg');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(301);
  });

  it('returns ok=false for a 404', async () => {
    mockFetch(404);
    const result = await checkUrl('https://example.com/missing.jpg');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('falls back to GET with Range header when HEAD returns 405', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ status: 405, body: null } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Response);

    const result = await checkUrl('https://cdn.example.com/img.jpg');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    // Second call should be GET with Range header
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/img.jpg',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Range: 'bytes=0-0' }),
      }),
    );
  });

  it('returns cached result on second call (no extra fetch)', async () => {
    mockFetch(200);
    await checkUrl('https://example.com/cached.jpg');
    const second = await checkUrl('https://example.com/cached.jpg');
    expect(second.fromCache).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('returns ok=false with error message on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await checkUrl('https://example.com/img.jpg');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(0);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('re-throws AbortError (cancellation)', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.mocked(fetch).mockRejectedValue(abortErr);
    await expect(checkUrl('https://example.com/img.jpg')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
