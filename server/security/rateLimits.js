import { rateLimit } from "express-rate-limit";
import { clientKey, isLocalConsole } from "./network.js";

const MINUTE = 60 * 1000;

// Sized for a classroom, not a public website: every respondent device polls /ping every 2.5s
// and the session info every 4s, and through Remote Access a whole class can share one public IP
// (the school's NAT). These limits are meant to stop scripted abuse, not to shape normal use.
function limiter({ windowMs, limit, message, ...rest }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: clientKey,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // cloudflared adds X-Forwarded-For; clientKey handles tunnelled clients itself, so the
    // library's "you probably want trust proxy" warning doesn't apply here.
    validate: { xForwardedForHeader: false },
    handler: (req, res) => res.status(429).json({ error: message }),
    ...rest,
  });
}

// Catch-all flood guard for the whole API.
export const apiLimiter = limiter({
  windowMs: MINUTE,
  limit: 2000,
  message: "Too many requests — slow down and try again in a minute.",
  skip: (req) => req.path === "/public/ping",
});

// Password guessing, per client. Only failures count, so a host who logs in and out repeatedly
// is never locked out.
export const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many failed sign-in attempts. Wait 15 minutes and try again.",
});

// Password guessing across the whole LAN — stops a class of 40 devices from each spending their
// own per-client budget on the same password. The host's own machine is exempt, so an attacker
// tripping this can never lock the host out of their own computer.
export const globalLoginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  skipSuccessfulRequests: true,
  keyGenerator: () => "global",
  skip: isLocalConsole,
  message: "Sign-in from other devices is temporarily locked after too many failed attempts. Sign in on the host computer, or wait 15 minutes.",
});

export const recoveryLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  skipSuccessfulRequests: true,
  message: "Too many recovery attempts. Wait 15 minutes and try again.",
});

export const sensitiveAccountLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many attempts. Wait 15 minutes and try again.",
});

export const joinLimiter = limiter({
  windowMs: MINUTE,
  limit: 60,
  message: "Too many join attempts from this device. Wait a minute and try again.",
});

// Edit codes are the only thing proving ownership of someone else's submission, so guessing them
// is the most valuable thing a respondent can brute-force. Only failed lookups count.
export const editCodeLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many incorrect edit codes. Wait 15 minutes and try again.",
});

export const submitLimiter = limiter({
  windowMs: MINUTE,
  limit: 60,
  message: "Too many submissions from this device. Wait a minute and try again.",
});

export const refocusLimiter = limiter({
  windowMs: MINUTE,
  limit: 120,
  message: "Too many requests. Wait a minute and try again.",
});

export const importLimiter = limiter({
  windowMs: MINUTE,
  limit: 20,
  message: "Too many imports. Wait a minute and try again.",
});

// Per-session cap on failed edit-code guesses, on top of the per-client limiter above — a LAN
// attacker can hop IP addresses, but can't multiply the number of sessions being attacked.
const SESSION_EDIT_FAILURE_LIMIT = 50;
const SESSION_EDIT_WINDOW_MS = 15 * MINUTE;
const editFailuresBySession = new Map(); // sessionId -> timestamps[]

function recentFailures(sessionId) {
  const cutoff = Date.now() - SESSION_EDIT_WINDOW_MS;
  const list = (editFailuresBySession.get(sessionId) || []).filter((t) => t > cutoff);
  if (list.length) editFailuresBySession.set(sessionId, list);
  else editFailuresBySession.delete(sessionId);
  return list;
}

export function isEditCodeLockedForSession(sessionId) {
  return recentFailures(sessionId).length >= SESSION_EDIT_FAILURE_LIMIT;
}

export function recordEditCodeFailure(sessionId) {
  const list = recentFailures(sessionId);
  list.push(Date.now());
  editFailuresBySession.set(sessionId, list);
}
