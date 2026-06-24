import {
  ANALYTICS_EMBED_TOKEN_REFRESH_REQUEST_EVENT,
  ANALYTICS_EMBED_TOKEN_REFRESH_RESPONSE_EVENT,
  resolveParentOrigin
} from "./embed";

type AnalyticsEnv = "local" | "dev" | "prod";

interface TokenRefreshResponseMessage {
  type: typeof ANALYTICS_EMBED_TOKEN_REFRESH_RESPONSE_EVENT;
  token?: string;
  error?: string;
}

function getAnalyticsEnv(): AnalyticsEnv {
  const raw = String(import.meta.env.VITE_ANALYTICS_ENV ?? "").trim().toLowerCase();
  if (raw === "dev" || raw === "prod" || raw === "local") {
    return raw;
  }
  return import.meta.env.DEV ? "local" : "prod";
}

function readTokenFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const hashToken = hashParams.get("token");
  if (hashToken && hashToken.trim().length > 0) {
    return hashToken.trim();
  }

  const searchParams = new URLSearchParams(window.location.search);
  const queryToken = searchParams.get("token");
  return queryToken && queryToken.trim().length > 0 ? queryToken.trim() : null;
}

let embedToken: string | null = readTokenFromLocation();
let pendingRefresh: Promise<string | null> | null = null;

export function isLocalAnalyticsEnv(): boolean {
  return getAnalyticsEnv() === "local";
}

export function getEmbedToken(): string | null {
  return embedToken;
}

export function hasEmbedToken(): boolean {
  return Boolean(embedToken);
}

export function setEmbedToken(token: string | null): void {
  embedToken = token && token.trim().length > 0 ? token.trim() : null;
}

export async function requestEmbedTokenRefresh(): Promise<string | null> {
  if (isLocalAnalyticsEnv() || typeof window === "undefined" || window.parent === window) {
    return null;
  }

  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = new Promise((resolve) => {
    const parentOrigin = resolveParentOrigin(window.location.search);

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeoutId);
      pendingRefresh = null;
    };

    const handleMessage = (event: MessageEvent<TokenRefreshResponseMessage>) => {
      if (parentOrigin !== "*" && event.origin !== parentOrigin) {
        return;
      }
      if (event.data?.type !== ANALYTICS_EMBED_TOKEN_REFRESH_RESPONSE_EVENT) {
        return;
      }

      cleanup();
      if (event.data.token) {
        setEmbedToken(event.data.token);
        resolve(event.data.token);
        return;
      }
      resolve(null);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    window.addEventListener("message", handleMessage);
    window.parent.postMessage(
      { type: ANALYTICS_EMBED_TOKEN_REFRESH_REQUEST_EVENT },
      parentOrigin === "*" ? "*" : parentOrigin
    );
  });

  return pendingRefresh;
}
