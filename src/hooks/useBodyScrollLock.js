import { useEffect } from "react";

// Reference-counted so a modal opened from within another modal (e.g. a ConfirmDialog raised by
// a Dialog's own onConfirm) doesn't restore scrolling the moment the inner one closes while the
// outer one is still open — only the last one out actually unlocks the page.
let lockCount = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";

// A modal's overlay blocks clicks to whatever is behind it (it's the topmost element there), but
// a wheel/trackpad scroll over that same dimmed backdrop has nothing scrollable to act on, so
// browsers hand it up to the document's actual scrolling element — which, in standards mode with
// no explicit height/overflow on <html>/<body> (the case throughout this app), is <html>, not
// <body>. Setting overflow:hidden on body alone does nothing here; both must be locked.
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    if (lockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousHtmlOverflow;
      }
    };
  }, [active]);
}
