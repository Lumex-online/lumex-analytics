export const ANALYTICS_EMBED_READY_EVENT = "lumex-analytics:ready";
export const ANALYTICS_EMBED_RESIZE_EVENT = "lumex-analytics:resize";

export function resolveRequestedUserId(search: string) {
  const searchParams = new URLSearchParams(search);
  const userId = searchParams.get("userId") ?? searchParams.get("sourceUserId");

  return userId && userId.trim().length > 0 ? userId.trim() : null;
}

export function resolveParentOrigin(search: string) {
  const searchParams = new URLSearchParams(search);
  const explicitOrigin = searchParams.get("parentOrigin");

  if (explicitOrigin && explicitOrigin.trim().length > 0) {
    return explicitOrigin.trim();
  }

  if (typeof document === "undefined" || !document.referrer) {
    return "*";
  }

  try {
    return new URL(document.referrer).origin;
  } catch {
    return "*";
  }
}
