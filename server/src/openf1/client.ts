import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BASE_URL = 'https://api.openf1.org/v1';

/**
 * Minimal OpenF1 REST client.
 *
 * - Spaces requests to stay under the free tier limits (3 req/s, 30 req/min).
 * - Caches every response on disk, so a race is downloaded once and replays offline after that.
 */
export class OpenF1Client {
  private nextSlot = 0;

  constructor(
    private readonly cacheDir: string,
    /** Minimum gap between requests. 2100 ms keeps us under 30 req/min. */
    private readonly minGapMs = 2100,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get<T = unknown>(endpoint: string, params: Record<string, string | number>, opts: { cache?: boolean } = {}): Promise<T> {
    const useCache = opts.cache ?? true;
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const cachePath = join(this.cacheDir, endpoint, `${safeName(query) || 'all'}.json`);

    if (useCache) {
      const cached = await readJson<T>(cachePath);
      if (cached !== undefined) return cached;
    }

    const body = await this.fetchWithRetry<T>(`${BASE_URL}/${endpoint}?${query}`);
    if (useCache) {
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify(body));
    }
    return body;
  }

  private async fetchWithRetry<T>(url: string, attempt = 0): Promise<T> {
    await this.waitForSlot();
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
      throw new Error(`Could not reach OpenF1 (${url})${cause}`);
    }
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get('retry-after')) || 10;
      await sleep(retryAfter * 1000);
      return this.fetchWithRetry<T>(url, attempt + 1);
    }
    // OpenF1 answers 404 with {"detail": "No results found."} when a filter matches nothing.
    if (res.status === 404) return [] as T;
    if (!res.ok) throw new Error(`OpenF1 ${res.status} for ${url}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minGapMs;
    if (slot > now) await sleep(slot - now);
  }
}

function safeName(query: string): string {
  return query.replace(/[^a-zA-Z0-9=_-]+/g, '_');
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
