import { useEffect } from "react";

// Keys that, with Ctrl/Cmd held, copy, cut, select everything, print or save the page.
const BLOCKED_SHORTCUTS = new Set(["c", "x", "a", "p", "s"]);

// A respondent still has to be able to type — and copy/select within — their OWN answer, so
// text inputs are exempt from everything except the page-content protections.
const isEditable = (el) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

// Discourages copying the questions off the respondent page: no right-click menu, no text
// selection/drag, no Ctrl/Cmd + C / X / A / P / S outside answer fields, and the clipboard is wiped
// when Print Screen is pressed. This is a deterrent, not real security — a browser can't prevent
// screenshots, photos of the screen, dev tools or a determined user — so it's an opt-in per-form
// setting (restrictCopying). While `enabled`, <body> also carries the `copy-protected` class that
// the stylesheet uses for user-select and print blocking.
export function useCopyProtection(enabled) {
  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add("copy-protected");

    const block = (e) => e.preventDefault();

    const onContextMenu = (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    const onCopyCut = (e) => {
      if (isEditable(document.activeElement)) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", "");
    };
    const onSelectStart = (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    const onKeyDown = (e) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && BLOCKED_SHORTCUTS.has(e.key.toLowerCase())) {
        // Print and save are blocked everywhere; copy/cut/select-all only outside answer fields.
        const alwaysBlocked = e.key.toLowerCase() === "p" || e.key.toLowerCase() === "s";
        if (alwaysBlocked || !isEditable(document.activeElement)) e.preventDefault();
      }
    };
    // Print Screen fires no keydown on some platforms, and the OS copies the image regardless of
    // preventDefault — so the one thing left to do is overwrite the clipboard right after.
    const onKeyUp = (e) => {
      if (e.key === "PrintScreen") navigator.clipboard?.writeText("").catch(() => {});
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyCut);
    document.addEventListener("cut", onCopyCut);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    return () => {
      document.body.classList.remove("copy-protected");
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyCut);
      document.removeEventListener("cut", onCopyCut);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled]);
}
