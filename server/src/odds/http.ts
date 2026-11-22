/**
 * Small JSON fetcher for the odds sites: spaces requests per host and backs off on 429,
 * because Kalshi rate-limits public market data by a cost budget.
 */
export class JsonFetcher {
  private nextSlot = new Map<string, number>();

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly minGapMs = 250,
  ) {}

  /** GET a URL as JSON. Returns null on 404. */
  async get<T>(url: string, attempt = 0): Promise<T | null> {
    await this.waitForSlot(new URL(url).host);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
    } catch (err) {
      if (attempt < 2) return this.get<T>(url, attempt + 1);
      throw new Error(`Could not reach ${new URL(url).host}: ${(err as Error).message}`);
    }
    if (res.status === 404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(this.minGapMs * 4 * 2 ** attempt);
      return this.get<T>(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return (await res.json()) as T;
  }

  private async waitForSlot(host: string): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + this.minGapMs);
    if (slot > now) await sleep(slot - now);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
