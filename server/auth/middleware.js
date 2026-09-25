import { isValidAuthSession } from "./repository.js";
import { readSessionToken } from "./cookies.js";
import { isTunnelRequest } from "../security/network.js";

// Server-side gate for every host-only route. Host controls are reachable from any device on
// the LAN (phones/tablets), but never through the public Remote Access link.
export function requireAuth(req, res, next) {
  if (isTunnelRequest(req)) {
    return res.status(403).json({ error: "Host controls aren't available over the Remote Access link." });
  }
  const token = readSessionToken(req);
  if (!isValidAuthSession(token)) {
    return res.status(401).json({ error: "Not signed in." });
  }
  next();
}
