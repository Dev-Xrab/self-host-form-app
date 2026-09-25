// Thin cross-browser wrapper around the Fullscreen API. Entering fullscreen must happen
// synchronously inside a user-gesture handler (a click) — browsers reject the request
// otherwise — so callers should invoke enterFullscreen() as the first thing in an onClick/
// onSubmit handler, not after an awaited API call. Both directions are best-effort: some
// browsers/contexts (iOS Safari on iPhone, an embedded webview) don't support the API at
// all, and that must never block the respondent from answering the form.
const requestFn = (el) =>
  el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;

const exitFn = () =>
  document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;

// Exported so a component can reflect the real state (e.g. to label a "Fullscreen" button
// correctly, or notice it was lost) instead of assuming it's still on just because it asked once.
export const isFullscreenActive = () =>
  !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);

export function enterFullscreen(el = document.documentElement) {
  try {
    if (isFullscreenActive()) return;
    const request = requestFn(el);
    request?.call(el)?.catch?.(() => {});
  } catch {
    // best-effort only — never block the respondent flow on this
  }
}

export function exitFullscreen() {
  try {
    if (!isFullscreenActive()) return;
    const exit = exitFn();
    exit?.call(document)?.catch?.(() => {});
  } catch {
    // best-effort only
  }
}
