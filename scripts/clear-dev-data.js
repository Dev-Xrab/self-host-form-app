// Runs automatically before `npm run dist` (see package.json's "predist") — wipes this
// machine's own Electron userData directory so every packaged build starts from a clean
// database, the same way a brand-new install would. Never runs on an end user's machine:
// electron-builder doesn't execute npm scripts on install, only at package time on the
// developer's own machine, and only for whoever runs `npm run dist` here.
import { rmSync, existsSync } from "node:fs";
import path from "node:path";

// Matches Electron's own app.getPath("userData") default on Windows (%APPDATA%/<name>),
// where <name> is package.json's "name" field — verified against the real folder Electron
// creates when running this app (electron/main.js sets DATA_DIR to userData/data). This repo
// only ships a Windows build locally, so there's nothing to compute/wipe on other platforms
// (e.g. the macOS CI runner, which starts from a clean checkout with no prior userData anyway).
if (process.platform !== "win32") {
  console.log("[clear-dev-data] Not on Windows — nothing to wipe here.");
  process.exit(0);
}

const appDataDir = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
const dataDir = path.join(appDataDir, "self-host-form", "data");

if (existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log(`[clear-dev-data] Wiped ${dataDir}`);
} else {
  console.log(`[clear-dev-data] Nothing to wipe at ${dataDir}`);
}
