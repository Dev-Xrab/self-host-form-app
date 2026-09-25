import { useEffect, useId, useRef } from "react";
import { Icons } from "../../pages/dashboard-page/icons";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import "./Dialog.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared dialog shell — every modal/confirm/popup in the app renders through this (directly, or
// via ConfirmDialog) so overlay behavior, header/body structure, escape-to-close, and focus
// trapping only need to be right in one place.
export default function Dialog({ title, onClose, children, headerActions, className = "" }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  // The overlay already blocks clicks to the page behind it; this stops the page from still
  // scrolling underneath a wheel/trackpad gesture while the dialog is open.
  useBodyScrollLock(true);

  // Callers often pass a fresh onClose function every render (e.g. one that branches on other
  // state, like closing a nested lightbox first). Reading it through a ref keeps the mount effect
  // below from re-running — and re-stealing focus — every time that identity changes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const node = dialogRef.current;
    // Respect a field's own autoFocus (React applies it synchronously before this effect runs) —
    // only fall back to focusing the first focusable element when nothing inside claimed focus.
    if (node && !node.contains(document.activeElement)) {
      const focusable = node.querySelectorAll(FOCUSABLE_SELECTOR);
      (focusable[0] || node).focus();
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // Intentionally empty — this should only run once per mount (see onCloseRef above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dash-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`dash-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dash-modal-header">
          <h3 id={titleId}>{title}</h3>
          <div className="dash-modal-header-actions">
            {headerActions}
            <button type="button" className="dash-modal-close" onClick={onClose} aria-label="Close dialog">
              <Icons.close />
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
