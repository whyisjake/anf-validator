/**
 * URL checker for ANF article.json files.
 *
 * Walks the parsed article object, finds every "URL" property whose value is
 * an http(s) string, and issues a HEAD request (falling back to a byte-range
 * GET if the server returns 405) to verify the resource exists.
 *
 * Results are cached in memory for the lifetime of the extension process so
 * that rapidly regenerated article.json files don't re-hit the network for
 * every URL on every change.
 */

export interface UrlEntry {
  /** The URL string found in the document. */
  url: string;
  /**
   * RFC 6901 JSON Pointer to the property that holds this URL.
   * Example: "/components/3/URL"
   */
  pointer: string;
}

export interface UrlCheckResult {
  url: string;
  pointer: string;
  /** true = 2xx or 3xx response, false = 4xx/5xx/network error */
  ok: boolean;
  /** HTTP status code, or 0 for network-level errors */
  statusCode: number;
  /** Human-readable error string for network failures */
  error?: string;
  /** true when the result came from the in-session cache */
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// In-session URL cache — cleared only when the extension deactivates.
// ---------------------------------------------------------------------------
const urlCache = new Map<string, { ok: boolean; statusCode: number }>();

/** Clear the URL cache (used in tests and on deactivate). */
export function clearUrlCache(): void {
  urlCache.clear();
}

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/**
 * Walk the parsed article object and collect every "URL" property whose value
 * is an http or https string. Skips bundle://, relative paths, and other
 * non-HTTP schemes.
 */
export function extractUrls(data: unknown): UrlEntry[] {
  const results: UrlEntry[] = [];
  walkValue(data, '', results);
  return results;
}

function walkValue(value: unknown, pointer: string, results: UrlEntry[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkValue(item, `${pointer}/${i}`, results));
  } else if (value !== null && typeof value === 'object') {
    walkObject(value as Record<string, unknown>, pointer, results);
  }
  // primitives (string/number/boolean/null) other than URL values — skip
}

function walkObject(
  obj: Record<string, unknown>,
  pointer: string,
  results: UrlEntry[],
): void {
  for (const [key, val] of Object.entries(obj)) {
    const childPointer = `${pointer}/${key}`;
    if (key === 'URL' && typeof val === 'string' && isHttpUrl(val)) {
      results.push({ url: val, pointer: childPointer });
      // Don't recurse into a string value, but continue to other keys.
    } else {
      walkValue(val, childPointer, results);
    }
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// ---------------------------------------------------------------------------
// HTTP reachability check
// ---------------------------------------------------------------------------

/**
 * Check whether a URL is reachable.
 *
 * Strategy:
 *   1. Try HEAD (fast, no body download).
 *   2. If server returns 405 Method Not Allowed, retry with GET + Range: bytes=0-0.
 *   3. 2xx or 3xx → ok. 4xx/5xx → not ok.
 *
 * Results are cached for the session so repeated file changes don't re-hit
 * the network for the same URL.
 */
export async function checkUrl(
  url: string,
  signal?: AbortSignal,
): Promise<UrlCheckResult> {
  // Return cached result if available.
  const cached = urlCache.get(url);
  if (cached) {
    return { url, pointer: '', ...cached, fromCache: true };
  }

  try {
    let statusCode = await fetchStatus(url, 'HEAD', signal);

    // Some servers (e.g. certain CDNs) refuse HEAD — fall back to minimal GET.
    if (statusCode === 405) {
      statusCode = await fetchStatus(url, 'GET', signal, { Range: 'bytes=0-0' });
    }

    const ok = statusCode >= 200 && statusCode < 400;
    urlCache.set(url, { ok, statusCode });
    return { url, pointer: '', ok, statusCode, fromCache: false };
  } catch (err) {
    if (isAbortError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { url, pointer: '', ok: false, statusCode: 0, error: message, fromCache: false };
  }
}

async function fetchStatus(
  url: string,
  method: 'HEAD' | 'GET',
  signal: AbortSignal | undefined,
  extraHeaders: Record<string, string> = {},
): Promise<number> {
  const response = await fetch(url, {
    method,
    signal,
    headers: {
      'User-Agent': 'ANF-Validator/0.1 (VS Code extension)',
      ...extraHeaders,
    },
    // Prevent Node from reading a response body we don't need.
    ...(method === 'GET' ? {} : {}),
  });
  // Consume/discard body to avoid resource leaks.
  if (method === 'GET') {
    await response.body?.cancel();
  }
  return response.status;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
