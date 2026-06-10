export type OAuthTokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export type FetchedToken = {
  accessToken: string;
  expiresAtMs: number;
};

function decodeJwtExp(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    ) as { exp?: number };
    if (typeof payload.exp === "number" && payload.exp > 0) {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchClientCredentialsToken(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  fetchImpl?: typeof fetch;
}): Promise<FetchedToken> {
  const fetchFn = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    scope: params.scope,
  });

  const res = await fetchFn(params.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  let json: OAuthTokenResponse;
  try {
    json = JSON.parse(text) as OAuthTokenResponse;
  } catch {
    throw new Error("OAuth token response is not JSON");
  }

  if (json.access_token === undefined || json.access_token === "") {
    const err = (json as { error?: string }).error;
    throw new Error(`OAuth error: ${err ?? "no access_token"}`);
  }

  const jwtExp = decodeJwtExp(json.access_token);
  const expiresInMs =
    typeof json.expires_in === "number" && json.expires_in > 0
      ? json.expires_in * 1000
      : jwtExp
        ? jwtExp - Date.now()
        : 15 * 60 * 1000;

  return {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + Math.max(expiresInMs, 60_000),
  };
}
