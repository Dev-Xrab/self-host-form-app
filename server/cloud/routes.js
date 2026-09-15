import { Router } from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import * as cloudRepo from "./repository.js";
import { cloudFetch, isCloudConfigured } from "./client.js";
import * as formsRepo from "../forms/repository.js";
import { diffQuestions, mergeQuestions } from "../forms/questionDiff.js";
import * as responsesRepo from "../responses/repository.js";
import { requireAuth } from "../auth/middleware.js";
import { runSync, pingCloudServer } from "./sync.js";

export const cloudRouter = Router();

// In-memory only, by design: the PKCE verifier must never be written to disk or handed to the
// renderer — it exists only long enough to bridge /auth/start -> /auth/callback in this same
// process. A pending attempt that's abandoned (browser closed, etc.) is swept out after 10 min.
const pendingAttempts = new Map(); // state -> { codeVerifier, createdAt }
const PENDING_TTL_MS = 10 * 60 * 1000;

// /auth/start and /auth/callback are opened in the OS's default browser, which does not carry
// this app's host-password session cookie — so they can't be gated by requireAuth like every
// other route here. Left fully open, though, anyone on the classroom LAN (this server binds
// 0.0.0.0) could hit /auth/start directly and trick the host's install into signing in as the
// attacker's own Google account — after which "Import"/"Publish" would read from and write to
// that attacker's account instead of the host's. A launch token closes this: it can only be
// minted by an authenticated request (see POST /auth/launch below), is single-use, and expires
// in 60 seconds, so /auth/start itself can safely stay unauthenticated.
const pendingLaunches = new Map(); // token -> createdAt
const LAUNCH_TTL_MS = 60 * 1000;

function sweepExpired(map, ttlMs, getCreatedAt) {
  const cutoff = Date.now() - ttlMs;
  for (const [key, value] of map) {
    if (getCreatedAt(value) < cutoff) map.delete(key);
  }
}

function base64url(buffer) {
  return buffer.toString("base64url");
}

function requireCloudConfigured(req, res, next) {
  if (!isCloudConfigured()) {
    return res.status(503).json({ error: "This install has no CLOUD_SERVER_URL configured." });
  }
  next();
}

cloudRouter.use(requireCloudConfigured);

// Called by the renderer (cookie-authenticated, same-origin fetch) to mint the one-time launch
// token, then opens the returned URL with window.open(...) so Electron's window-open handler
// routes it to the OS browser instead of an in-app webview (Google rejects OAuth from embedded
// webviews).
cloudRouter.post("/auth/launch", requireAuth, (req, res) => {
  sweepExpired(pendingLaunches, LAUNCH_TTL_MS, (createdAt) => createdAt);
  const token = randomUUID();
  pendingLaunches.set(token, Date.now());
  const url = new URL(`${req.protocol}://${req.get("host")}/api/cloud/auth/start`);
  url.searchParams.set("launchToken", token);
  res.json({ url: url.toString() });
});

cloudRouter.get("/auth/start", (req, res) => {
  sweepExpired(pendingAttempts, PENDING_TTL_MS, (attempt) => attempt.createdAt);

  const launchToken = req.query.launchToken;
  const launchedAt = launchToken && pendingLaunches.get(String(launchToken));
  if (!launchedAt || Date.now() - launchedAt > LAUNCH_TTL_MS) {
    return res.status(403).send("<p>This sign-in link is invalid or has expired. Start again from the app.</p>");
  }
  pendingLaunches.delete(String(launchToken));

  const state = randomUUID();
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  pendingAttempts.set(state, { codeVerifier, createdAt: Date.now() });

  const redirectUri = `${req.protocol}://${req.get("host")}/api/cloud/auth/callback`;
  const startUrl = new URL(`${process.env.CLOUD_SERVER_URL.replace(/\/+$/, "")}/auth/google/start`);
  startUrl.searchParams.set("state", state);
  startUrl.searchParams.set("code_challenge", codeChallenge);
  startUrl.searchParams.set("redirect_uri", redirectUri);

  res.redirect(startUrl.toString());
});

// Hit by the OS browser after the cloud server finishes the Google leg. Exchanges the one-time
// handoff code for real tokens server-to-server (see server/cloud/client.js) — those tokens
// never pass through this HTTP response or the browser at all.
cloudRouter.get("/auth/callback", async (req, res) => {
  const { handoff, state } = req.query;
  const attempt = state && pendingAttempts.get(String(state));

  if (!handoff || !attempt) {
    return res
      .status(400)
      .send("<p>This sign-in attempt is no longer valid. Close this tab and try again from the app.</p>");
  }
  pendingAttempts.delete(String(state));

  try {
    const exchangeRes = await fetch(`${process.env.CLOUD_SERVER_URL.replace(/\/+$/, "")}/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handoff,
        codeVerifier: attempt.codeVerifier,
        deviceId: cloudRepo.getDeviceId(),
        deviceName: process.env.COMPUTERNAME || process.env.HOSTNAME || "Self Host Form device",
      }),
    });

    if (!exchangeRes.ok) {
      const body = await exchangeRes.json().catch(() => ({}));
      return res.status(502).send(`<p>Sign-in failed: ${body.error || "unexpected error"}.</p>`);
    }

    const data = await exchangeRes.json();
    cloudRepo.saveCloudAccount({
      userId: data.user.id,
      email: data.user.email,
      name: data.user.name,
      avatarUrl: data.user.avatarUrl,
      accessToken: data.accessToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      refreshToken: data.refreshToken,
    });

    res.send("<p>Signed in. You can close this tab and return to Self Host Form.</p>");
  } catch (err) {
    console.error("Cloud sign-in exchange failed:", err);
    res.status(502).send("<p>Sign-in failed while completing the connection. Please try again.</p>");
  }
});

cloudRouter.get("/auth/status", requireAuth, (req, res) => {
  const account = cloudRepo.getCloudAccount();
  // Only ever the derived, non-sensitive fields — accessToken/refreshToken are never sent to
  // the renderer.
  res.json({
    connected: !!account,
    email: account?.email || null,
    name: account?.name || null,
    avatarUrl: account?.avatarUrl || null,
  });
});

cloudRouter.post("/auth/logout", requireAuth, async (req, res) => {
  const account = cloudRepo.getCloudAccount();
  if (account) {
    try {
      await fetch(`${process.env.CLOUD_SERVER_URL.replace(/\/+$/, "")}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: account.refreshToken }),
      });
    } catch {
      // Best-effort revoke — the local account is cleared either way below.
    }
  }
  cloudRepo.clearCloudAccount();
  res.status(204).end();
});

function requireCloudAccount(req, res, next) {
  if (!cloudRepo.getCloudAccount()) {
    return res.status(401).json({ error: "Not signed in to a cloud account." });
  }
  next();
}

cloudRouter.get("/forms", requireAuth, requireCloudAccount, async (req, res) => {
  try {
    const upstream = await cloudFetch("/api/forms");
    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: body.error || "Failed to list cloud forms." });
    }
    res.json(await upstream.json());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// These two are keyed by the CLOUD form's own id directly (not a local form id) — "Import from
// Cloud" browses forms that may not be imported onto this device at all yet, so there's no local
// row to resolve remoteFormId from the way /forms/:id/publish above does.
cloudRouter.get("/forms/cloud/:remoteId/versions", requireAuth, requireCloudAccount, async (req, res) => {
  try {
    const upstream = await cloudFetch(`/api/forms/${encodeURIComponent(req.params.remoteId)}/versions`);
    const body = await upstream.json().catch(() => ([]));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: body.error || "Failed to list versions." });
    }
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Deletes the form from the cloud account entirely (every version, every response, every
// device's access to it — see cloud-server/forms/repository.js deleteForm). Irreversible.
cloudRouter.delete("/forms/cloud/:remoteId", requireAuth, requireCloudAccount, async (req, res) => {
  try {
    const upstream = await cloudFetch(`/api/forms/${encodeURIComponent(req.params.remoteId)}`, {
      method: "DELETE",
    });
    if (!upstream.ok && upstream.status !== 204) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: body.error || "Failed to delete the form." });
    }
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Shared by both "import a form already on the cloud server" (below) and "import a real Google
// Form" (see the /google-forms/:id/import route) — the latter creates the cloud-side form first
// (see cloud-server/google-forms/routes.js) and then funnels through this exact same path, so a
// Google-sourced form is indistinguishable from any other cloud form from this point on: same
// dedup-on-re-import guard, same preserved question ids, same publish/sync behavior.
// `version` (optional) picks a specific historical snapshot instead of the latest — see
// cloud-server/forms/repository.js getFormForOwner. Only meaningful for a FRESH import: if this
// device already has a local copy, that copy is returned as-is regardless of `version` (see the
// dedup guard below) — picking an old version doesn't retroactively downgrade an existing import.
async function importCentralFormLocally(remoteFormId, version) {
  // Importing the same cloud form twice on one device — including the common "publish it here,
  // then also click Import for it" case — must not create a second local copy: question ids
  // are preserved from the cloud form (see importForm's preserveQuestionIds) so synced-down
  // responses' answers stay keyed correctly, and remote_form_id is a real unique index (see
  // server/db/index.js), so re-inserting the same ids under a second local form row is a hard
  // conflict, not just redundant. Finding the existing copy first avoids that entirely.
  const existingLocalId = formsRepo.getFormIdByRemoteId(remoteFormId);

  if (existingLocalId) {
    const existing = formsRepo.getForm(existingLocalId);
    // No version explicitly requested, or it's the one already here — nothing to do, and
    // "don't silently overwrite a form already in offline use" holds: the existing local copy
    // is left exactly as it is.
    if (!Number.isInteger(version) || version === existing.remoteVersion) {
      return { ...existing, alreadyImported: true };
    }

    // A DIFFERENT published version was explicitly picked (see the version dropdown on "Import
    // from Cloud") — pull it down and update this same local form in place rather than minting a
    // second one, which the unique index above would reject anyway. This is an explicit,
    // host-initiated action (never automatic), same trust level as editing the form by hand.
    const remoteForm = await fetchRemoteForm(remoteFormId, version);
    const account = cloudRepo.getCloudAccount();
    formsRepo.updateForm(existingLocalId, {
      title: remoteForm.title,
      description: remoteForm.description,
      settings: remoteForm.settings,
      questions: remoteForm.questions,
    });
    const updated = formsRepo.setRemoteInfo(existingLocalId, {
      remoteFormId: remoteForm.id,
      remoteVersion: remoteForm.version,
      ownerUserId: account.userId,
    });
    return { ...updated, updated: true };
  }

  const remoteForm = await fetchRemoteForm(remoteFormId, version);
  const account = cloudRepo.getCloudAccount();

  return formsRepo.importForm({
    title: remoteForm.title,
    description: remoteForm.description,
    settings: remoteForm.settings,
    questions: remoteForm.questions,
    preserveQuestionIds: true,
    remoteFormId: remoteForm.id,
    remoteVersion: remoteForm.version,
    ownerUserId: account.userId,
  });
}

async function fetchRemoteForm(remoteFormId, version) {
  const versionQuery = Number.isInteger(version) ? `?version=${version}` : "";
  const upstream = await cloudFetch(`/api/forms/${encodeURIComponent(remoteFormId)}${versionQuery}`);
  if (!upstream.ok) {
    const body = await upstream.json().catch(() => ({}));
    const err = new Error(body.error || "Failed to fetch the form.");
    err.status = upstream.status;
    throw err;
  }
  return upstream.json();
}

cloudRouter.post("/forms/:id/import", requireAuth, requireCloudAccount, async (req, res) => {
  const version = Number.isInteger(req.body?.version) ? req.body.version : undefined;
  try {
    const imported = await importCentralFormLocally(req.params.id, version);
    res.status(imported.alreadyImported || imported.updated ? 200 : 201).json(imported);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// Pushes a locally-authored (or previously-imported) form to the cloud server, so it can be
// imported on another device signed in to the same account. First publish creates it; every
// later publish bumps the version instead of overwriting the previous one (see
// cloud-server/forms/repository.js publishNewVersion).
cloudRouter.post("/forms/:id/publish", requireAuth, requireCloudAccount, async (req, res) => {
  const form = formsRepo.getForm(req.params.id);
  if (!form) return res.status(404).json({ error: "Form not found." });

  const payload = {
    title: form.title,
    description: form.description,
    settings: form.settings,
    questions: form.questions,
  };

  try {
    const upstream = await cloudFetch(
      form.remoteFormId ? `/api/forms/${encodeURIComponent(form.remoteFormId)}` : "/api/forms",
      { method: form.remoteFormId ? "PUT" : "POST", body: JSON.stringify(payload) }
    );
    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: body.error || "Failed to publish the form." });
    }
    const published = await upstream.json();
    const account = cloudRepo.getCloudAccount();
    const updated = formsRepo.setRemoteInfo(form.id, {
      remoteFormId: published.id,
      remoteVersion: published.version,
      ownerUserId: account.userId,
    });

    res.json(updated);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Backs the sync status indicator (Online/Offline/last-synced-time) — cheap enough to poll
// regularly since it does one lightweight probe against the cloud server rather than anything
// that touches sync state itself.
cloudRouter.get("/sync/status", requireAuth, async (req, res) => {
  const account = cloudRepo.getCloudAccount();
  const reachable = await pingCloudServer();
  res.json({
    connected: !!account,
    reachable,
    pendingCount: responsesRepo.listPendingSyncResponses().length,
    // Distinct from pendingCount: these have already been tried and rejected/errored at least
    // once, so a plain "press Sync again" won't fix them without the user actually looking —
    // see GET /sync/issues below.
    failedCount: responsesRepo.listSyncIssues().length,
    lastSyncedAt: cloudRepo.getLastSyncedAt(),
  });
});

// Individually-inspectable failed/conflicting responses — the detail behind /sync/status's
// aggregate failedCount, since "3 failed" on its own gives the user nothing to act on.
cloudRouter.get("/sync/issues", requireAuth, (req, res) => {
  res.json(responsesRepo.listSyncIssues());
});

// Resets one response back to 'pending' and immediately re-attempts sync, so the user gets a
// result right away instead of a silent state flip they'd have to press the main Sync button to
// discover.
cloudRouter.post("/sync/issues/:id/retry", requireAuth, requireCloudAccount, async (req, res) => {
  responsesRepo.retrySyncResponse(req.params.id);
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Gives up on one response permanently (e.g. a conflict the user has decided isn't worth
// resolving) — moves it out of 'failed' so it stops being retried and stops counting toward
// failedCount, without deleting the locally-recorded response itself.
cloudRouter.post("/sync/issues/:id/discard", requireAuth, (req, res) => {
  responsesRepo.abandonSyncResponse(req.params.id);
  res.status(204).end();
});

// Runs one full sync (upload pending responses, download remote changes, repeat until both
// sides are caught up — see server/cloud/sync.js). Never marks anything synced until the cloud
// server has positively acknowledged it, and is safe to call again immediately after a failure
// or an interruption: nothing here is a multi-step operation that could be left half-applied —
// each response is its own atomic upsert, so "resume" is just "run it again."
cloudRouter.post("/sync", requireAuth, requireCloudAccount, async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Real Google Forms (forms.google.com) — distinct from the "/forms" routes above, which only
// ever deal with forms created in this app and published to the cloud server. Listing here
// hits the user's actual Google Drive; nothing is imported until they pick one.
cloudRouter.get("/google-forms", requireAuth, requireCloudAccount, async (req, res) => {
  try {
    const upstream = await cloudFetch("/api/google-forms");
    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: body.error || "Failed to list Google Forms." });
    }
    res.json(await upstream.json());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Two hops: the cloud server first converts the real Google Form into a form THIS app owns
// (see cloud-server/google-forms/routes.js — it becomes an ordinary cloud-server form from that
// point on), then it's pulled down here through the exact same path as any other cloud import.
cloudRouter.post("/google-forms/:id/import", requireAuth, requireCloudAccount, async (req, res) => {
  try {
    const upstream = await cloudFetch(`/api/google-forms/${encodeURIComponent(req.params.id)}/import`, {
      method: "POST",
    });
    const created = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: created.error || "Failed to import the Google Form.", skipped: created.skipped });
    }

    const imported = await importCentralFormLocally(created.id);
    formsRepo.setGoogleFormId(imported.id, req.params.id);
    // Pulls the responses just imported cloud-side down onto this device right away, instead of
    // leaving them to wait for the user's next manual sync click.
    try {
      await runSync();
    } catch {
      // Best-effort — the form itself imported fine; the responses will still arrive on the next
      // sync (manual or automatic) even if this immediate attempt fails (e.g. offline).
    }
    res.status(created.alreadyImported ? 200 : 201).json({
      ...formsRepo.getForm(imported.id),
      skipped: created.skipped || [],
      importedResponseCount: created.importedResponseCount || 0,
      alreadyImported: !!created.alreadyImported,
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// Read-only structural check against the live Google Form — see server/forms/questionDiff.js
// diffQuestions. Never writes anything; the frontend only shows the sync decision dialog when
// hasChanges is true, and otherwise proceeds straight to a response-only sync.
// `:id` here is THIS DEVICE'S local form id, matching every other per-form Google route below.
cloudRouter.get("/google-forms/:id/changes", requireAuth, requireCloudAccount, async (req, res) => {
  const form = formsRepo.getForm(req.params.id);
  if (!form) return res.status(404).json({ error: "Form not found." });
  if (!form.remoteFormId || !form.googleFormId) {
    return res.status(400).json({ error: "This form isn't linked to a Google Form." });
  }

  try {
    const upstream = await cloudFetch(`/api/google-forms/${encodeURIComponent(form.remoteFormId)}/live`);
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: body.error || "Failed to check the Google Form for changes." });
    }
    res.json({ ...diffQuestions(form.questions, body.questions || []), skippedUnsupported: body.skipped || [] });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// Applies the host's decision from the sync decision dialog ("Keep Local Version" vs "Sync From
// Online" — see server/forms/questionDiff.js mergeQuestions for how a removed question is kept,
// never deleted, so its historical answers stay labeled), then always pulls in new responses
// regardless of that decision — response import is independent of question structure (dedup is
// by Google's own response id, see cloud-server/google-forms/repository.js).
cloudRouter.post("/google-forms/:id/apply-changes", requireAuth, requireCloudAccount, async (req, res) => {
  const form = formsRepo.getForm(req.params.id);
  if (!form) return res.status(404).json({ error: "Form not found." });
  if (!form.remoteFormId || !form.googleFormId) {
    return res.status(400).json({ error: "This form isn't linked to a Google Form." });
  }
  const decision = req.body?.decision;
  if (decision !== "keep-local" && decision !== "sync-from-online") {
    return res.status(400).json({ error: 'decision must be "keep-local" or "sync-from-online".' });
  }

  try {
    if (decision === "sync-from-online") {
      const liveUpstream = await cloudFetch(`/api/google-forms/${encodeURIComponent(form.remoteFormId)}/live`);
      const liveBody = await liveUpstream.json().catch(() => ({}));
      if (!liveUpstream.ok) {
        return res.status(liveUpstream.status).json({ error: liveBody.error || "Failed to fetch the Google Form." });
      }
      formsRepo.updateForm(form.id, { questions: mergeQuestions(form.questions, liveBody.questions || []) });
    }

    // Reused purely for its response-import side effect — the append-only structural update it
    // also does on the cloud server's own copy is redundant with the merge above (when applicable)
    // but harmless, and keeps that copy caught up for any other device on the account too.
    const refreshUpstream = await cloudFetch(`/api/google-forms/${encodeURIComponent(form.remoteFormId)}/refresh`, {
      method: "POST",
    });
    const refreshResult = await refreshUpstream.json().catch(() => ({}));
    if (!refreshUpstream.ok) {
      return res.status(refreshUpstream.status).json({ error: refreshResult.error || "Failed to sync responses from Google." });
    }

    const account = cloudRepo.getCloudAccount();
    formsRepo.setRemoteInfo(form.id, {
      remoteFormId: form.remoteFormId,
      remoteVersion: refreshResult.version,
      ownerUserId: account.userId,
    });

    try {
      await runSync();
    } catch {
      // Best-effort — the structural/response changes are already applied even if this immediate
      // download pass fails; a later manual or automatic sync still picks them up.
    }

    res.json({
      decision,
      checkedResponseCount: (refreshResult.newResponseCount || 0) + (refreshResult.skippedExistingResponseCount || 0),
      newResponseCount: refreshResult.newResponseCount || 0,
      unchangedResponseCount: refreshResult.skippedExistingResponseCount || 0,
      responseImportError: refreshResult.responseImportError || null,
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});
