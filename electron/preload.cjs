const { contextBridge, ipcRenderer } = require("electron");

// The renderer runs with contextIsolation on and nodeIntegration off (no direct access to
// BrowserWindow), so a frameless window's own custom titlebar (src/components/TitleBar)
// needs this bridge to ask the main process to minimize/maximize/close it.
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onWindowMaximizedChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  },
});
