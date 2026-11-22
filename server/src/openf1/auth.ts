/**
 * Exchanges the OpenF1 sponsor username/password for an access token and keeps it fresh.
 * Tokens last 1 hour; we renew 5 minutes early. This must only ever run server-side.
 */
export class TokenManager {
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly opts: { url?: string; fetchImpl?: typeof fetch; now?: () => number } = {},
  ) {}

  get configured(): boolean {
    return Boolean(this.username && this.password);
  }

  /** A valid access token, fetching a new one if needed. */
  async get(): Promise<string> {
    const now = (this.opts.now ?? Date.now)();
    if (this.token && now < this.token.expiresAt - 5 * 60_000) return this.token.value;
    this.pending ??= this.fetchToken().finally(() => (this.pending = null));
    return this.pending;
  }

  /** Milliseconds until the current token should be renewed (0 if none). */
  msUntilRefresh(): number {
    if (!this.token) return 0;
    return Math.max(0, this.token.expiresAt - 5 * 60_000 - (this.opts.now ?? Date.now)());
  }

  invalidate(): void {
    this.token = null;
  }

  private async fetchToken(): Promise<string> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(this.opts.url ?? 'https://api.openf1.org/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: this.username, password: this.password }).toString(),
    });
    if (!res.ok) {
      throw new Error(res.status === 401 || res.status === 403 ? 'OpenF1 rejected the username or password' : `OpenF1 token request failed (${res.status})`);
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: string | number };
    if (!body.access_token) throw new Error('OpenF1 token response had no access_token');
    const ttlSec = Number(body.expires_in) || 3600;
    this.token = { value: body.access_token, expiresAt: (this.opts.now ?? Date.now)() + ttlSec * 1000 };
    return this.token.value;
  }
}
