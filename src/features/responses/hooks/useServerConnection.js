import { useEffect, useState } from "react";

const POLL_MS = 2500;
const TIMEOUT_MS = 4000;
// A single dropped or slow ping shouldn't flash the screen blurred — it takes this many in a row.
const FAILURES_BEFORE_OFFLINE = 2;

async function pingServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/public/ping?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Whether this device can currently reach the server. Only polls while `enabled` (the form's
// "blur on disconnect" setting), so a form that doesn't use it costs nothing. Goes offline right
// away when the browser itself reports no network, and comes back on the first successful ping.
export function useServerConnection(enabled) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let failures = 0;
    let timer;

    const check = async () => {
      const ok = navigator.onLine !== false && (await pingServer());
      if (cancelled) return;
      failures = ok ? 0 : failures + 1;
      if (ok) setOnline(true);
      else if (failures >= FAILURES_BEFORE_OFFLINE || navigator.onLine === false) setOnline(false);
      timer = setTimeout(check, POLL_MS);
    };

    const handleOffline = () => setOnline(false);
    const handleOnline = () => {
      clearTimeout(timer);
      failures = 0;
      check();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      setOnline(true);
    };
  }, [enabled]);

  return online;
}
