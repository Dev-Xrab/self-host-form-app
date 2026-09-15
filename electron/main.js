import { app, BrowserWindow, shell } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProcess;
let mainWindow;
let splashWindow;

const PORT = 5174;
const APP_ICON = path.join(__dirname, "..", "build", "icon.ico");

// The cloud server's URL is not a secret (unlike its Google OAuth client secret, which never
// leaves that service) — it's fine to bake a default in here for a built release. CLOUD_SERVER_URL
// in the environment still overrides it, which is how local development points at a dev instance.
const DEFAULT_CLOUD_SERVER_URL = "https://local-host-form-final.onrender.com";

function startServer() {
  const serverPath = path.join(
  __dirname,
  "..",
  "server",
  "index.js"
);

  serverProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      DATA_DIR: path.join(app.getPath("userData"), "data"),
      CLOUD_SERVER_URL: process.env.CLOUD_SERVER_URL || DEFAULT_CLOUD_SERVER_URL,
    },
    stdio: "pipe",
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server] ${data}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error] ${data}`);
  });

  serverProcess.on("error", (error) => {
    console.error("Failed to start server:", error);
  });
}

async function waitForServer(url, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return true;
      }
    } catch {
      // Server isn't ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    backgroundColor: "#000000",
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => splashWindow.show());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  // Google's OAuth consent screen refuses to load inside an embedded/webview browser like this
  // window ("disallowed_useragent"), so any navigation leaving our own local server — the
  // cloud sign-in flow, in practice — is handed off to the user's real OS browser instead of
  // opening (or navigating) inside the app.
  //
  // data:/blob: URLs are never "external" in that sense — they're always this app's own
  // generated content (a downloaded file, an inline image) rather than a real address, and
  // shell.openExternal() can't open them anyway (Windows' ShellExecute rejects a giant data:
  // URI with "the system cannot find the file specified"). Let Electron's own download
  // handling deal with those instead of routing them to the OS.
  const isOwnOrigin = (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "data:" || parsed.protocol === "blob:") return true;
      return parsed.origin === `http://localhost:${PORT}`;
    } catch {
      return false;
    }
  };

  const openExternal = (url) => {
    shell.openExternal(url).catch((err) => {
      console.error("Failed to open external URL:", url, err);
    });
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwnOrigin(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isOwnOrigin(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(async () => {
  createSplashWindow();
  startServer();

  const ready = await waitForServer(
    `http://localhost:${PORT}/api/health`
  );

  if (!ready) {
    console.error("LocalForm server failed to start.");
    app.quit();
    return;
  }

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});