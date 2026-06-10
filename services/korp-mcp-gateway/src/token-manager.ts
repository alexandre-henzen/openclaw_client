import type { KorpGatewayConfig } from "./config.js";
import { fetchClientCredentialsToken, type FetchedToken } from "./oauth-client.js";

export type TokenSnapshot = {
  ready: boolean;
  expiresAtMs: number | null;
  lastRefreshAtMs: number | null;
  lastError: string | null;
  refreshCount: number;
};

export class KorpTokenManager {
  private accessToken: string | null = null;
  private expiresAtMs = 0;
  private lastRefreshAtMs: number | null = null;
  private lastError: string | null = null;
  private refreshCount = 0;
  private refreshInFlight: Promise<string> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly cfg: KorpGatewayConfig,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  getSnapshot(): TokenSnapshot {
    return {
      ready: this.accessToken !== null && Date.now() < this.expiresAtMs,
      expiresAtMs: this.accessToken ? this.expiresAtMs : null,
      lastRefreshAtMs: this.lastRefreshAtMs,
      lastError: this.lastError,
      refreshCount: this.refreshCount,
    };
  }

  async start(): Promise<void> {
    await this.refresh("startup");
    this.timer = setInterval(() => {
      void this.maybeProactiveRefresh();
    }, this.cfg.refreshIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Token válido para injeção no proxy; bloqueia até obter ou relança erro. */
  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAtMs - this.cfg.refreshSkewMs) {
      return this.accessToken;
    }
    return this.refresh("on-demand");
  }

  private async maybeProactiveRefresh(): Promise<void> {
    if (!this.accessToken) {
      await this.refresh("proactive-empty");
      return;
    }
    const remaining = this.expiresAtMs - Date.now();
    if (remaining <= this.cfg.refreshSkewMs) {
      await this.refresh("proactive-expiring");
    }
  }

  private async refresh(reason: string): Promise<string> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = this.doRefresh(reason)
      .then((token) => token)
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  private async doRefresh(reason: string): Promise<string> {
    try {
      const fetched: FetchedToken = await fetchClientCredentialsToken({
        tokenUrl: this.cfg.oauth.tokenUrl,
        clientId: this.cfg.oauth.clientId,
        clientSecret: this.cfg.oauth.clientSecret,
        scope: this.cfg.oauth.scope,
        fetchImpl: this.fetchImpl,
      });

      // Troca atômica: proxy sempre lê token atual após await getAccessToken().
      this.accessToken = fetched.accessToken;
      this.expiresAtMs = fetched.expiresAtMs;
      this.lastRefreshAtMs = Date.now();
      this.lastError = null;
      this.refreshCount += 1;

      console.info(
        `[korp-mcp-gateway] token refreshed (${reason}) exp=${new Date(this.expiresAtMs).toISOString()}`,
      );

      return this.accessToken;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      console.error(`[korp-mcp-gateway] token refresh failed (${reason}): ${msg}`);
      if (this.accessToken && Date.now() < this.expiresAtMs) {
        console.warn("[korp-mcp-gateway] using previous token until expiry");
        return this.accessToken;
      }
      throw err;
    }
  }
}
