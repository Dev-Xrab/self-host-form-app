import * as cloudRepo from "./repository.js";

function cloudServerUrl() {
  const url = process.env.CLOUD_SERVER_URL;
  if (!url) throw new Error("CLOUD_SERVER_URL is not configured on this install.");
  return url.replace(/\/+$/, "");
}

export function isCloudConfigured() {
  return !!process.env.CLOUD_SERVER_URL;
}

// The cloud server rotates refresh tokens on every use (single-use), so two concurrent callers
// both presenting the same (still-valid-looking) refresh token would race: whichever request
// loses gets a 401 "already rotated" and is force-signed-out even though the account is
// perfectly fine — see server/cloud/repository.js and cloud-server/auth/repository.js
// consumeRefreshToken. Node is single-threaded, so a simple in-flight promise cache is enough to
// make every concurrent caller share one actual refresh instead of racing.
let refreshInFlight = null;

async function doRefreshTokens() {
  const account = cloudRepo.getCloudAccount();
  if (!account) throw new Error("Not signed in.");

  const res = await fetch(`${cloudServerUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: account.refreshToken }),
  });

  if (!res.ok) {
    // The refresh token was rejected (expired, revoked, or already rotated by another
    // request) — there is no way to silently recover, so the account is signed out and the
    // caller surfaces a "please sign in again" state rather than looping on 401s forever.
    cloudRepo.clearCloudAccount();
    throw new Error("Your cloud session expired. Please sign in again.");
  }

  const data = await res.json();
  cloudRepo.updateCloudTokens({
    accessToken: data.accessToken,
    accessTokenExpiresAt: data.accessTokenExpiresAt,
    refreshToken: data.refreshToken,
  });
  return data.accessToken;
}

async function refreshTokens() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefreshTokens();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function getValidAccessToken() {
  const account = cloudRepo.getCloudAccount();
  if (!account) throw new Error("Not signed in.");

  const expiresInMs = new Date(account.accessTokenExpiresAt).getTime() - Date.now();
  if (expiresInMs > 60_000) return account.accessToken;
  return refreshTokens();
}

// Every call this local server makes to the cloud server for account-scoped data goes through
// here so token refresh is handled in exactly one place. A single retry-after-refresh covers
// the ordinary "access token expired mid-session" case without masking real failures.
export async function cloudFetch(path, options = {}) {
  const accessToken = await getValidAccessToken();
  const doFetch = (token) =>
    fetch(`${cloudServerUrl()}/${path.replace(/^\/+/, "")}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

  let res = await doFetch(accessToken);
  if (res.status === 401) {
    const refreshed = await refreshTokens();
    res = await doFetch(refreshed);
  }
  return res;
}
