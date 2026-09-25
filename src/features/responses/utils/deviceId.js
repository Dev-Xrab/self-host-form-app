const STORAGE_KEY = "stonearch_device_id";

// This id is what proves a response belongs to this device (see server/public/routes.js
// ownsResponse), so it must be unguessable. crypto.randomUUID only exists in secure contexts
// (HTTPS or localhost) and this app is usually opened over a plain-HTTP LAN address, but
// crypto.getRandomValues is available everywhere — never fall back to Math.random/timestamps.
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `device-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// Held for the life of the page so a device without working localStorage (private browsing,
// blocked storage) still presents the same id on join and on submit.
let memoryId = null;

export function getDeviceId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = memoryId || generateId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    memoryId = id;
    return id;
  } catch {
    // localStorage unavailable — a per-page id is an acceptable fallback.
    if (!memoryId) memoryId = generateId();
    return memoryId;
  }
}
