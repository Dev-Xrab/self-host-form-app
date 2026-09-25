import { useEffect, useState } from "react";
import "./title-bar.css";
import logo from "../../images/logo.png";

// Renders nothing (and leaves --titlebar-height at its 0px default, see tokens.css) unless
// window.electronAPI is present — i.e. unless this is actually running inside the frameless
// Electron window (electron/main.js sets frame:false + electron/preload.cjs). A plain browser
// tab (dev preview, or a respondent/LAN user hitting the server directly) keeps its own real
// browser chrome and never sees this at all.
export default function TitleBar() {
  const isElectron = typeof window !== "undefined" && window.electronAPI?.isElectron;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;

    document.documentElement.style.setProperty("--titlebar-height", "32px");
    window.electronAPI.isWindowMaximized().then(setIsMaximized);
    const unsubscribe = window.electronAPI.onWindowMaximizedChange(setIsMaximized);

    return () => {
      unsubscribe?.();
      document.documentElement.style.removeProperty("--titlebar-height");
    };
  }, [isElectron]);

  if (!isElectron) return null;

  return (
    <div className="title-bar">
      <div
        className="title-bar-drag-region"
        onDoubleClick={() => window.electronAPI.toggleMaximizeWindow()}
      >
        <img src={logo} alt="" className="title-bar-logo" />
        <span className="title-bar-title">Self Host Form</span>
      </div>

      <div className="title-bar-controls">
        <button
          type="button"
          className="title-bar-btn"
          aria-label="Minimize window"
          onClick={() => window.electronAPI.minimizeWindow()}
        >
          <svg viewBox="0 0 12 12" width="12" height="12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

        <button
          type="button"
          className="title-bar-btn"
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          onClick={() => window.electronAPI.toggleMaximizeWindow()}
        >
          {isMaximized ? (
            <svg viewBox="0 0 12 12" width="12" height="12">
              <rect x="3.5" y="2" width="6.5" height="6.5" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M2 3.5V10H8.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12">
              <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="title-bar-btn title-bar-btn-close"
          aria-label="Close window"
          onClick={() => window.electronAPI.closeWindow()}
        >
          <svg viewBox="0 0 12 12" width="12" height="12">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
