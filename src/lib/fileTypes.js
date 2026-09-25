// Client-side mirror of server/security/uploads.js's allowlist. The server is the real gate —
// these exist so a respondent gets an immediate, friendly error instead of a failed submit, and so
// a downloaded attachment is always saved with an extension from this fixed list, never one
// derived from whatever MIME type a (possibly hostile) respondent put in the data: URI.

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "video/ogg": "ogv",
  "audio/webm": "weba",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "text/csv": "csv",
  "text/markdown": "md",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// For <input type="file" accept>: a hint to the OS picker only, not a security control.
export const UPLOAD_ACCEPT = [...Object.keys(EXTENSIONS), "text/*"].join(",");

export function isAllowedUploadType(mime) {
  return !!EXTENSIONS[mime] || (typeof mime === "string" && mime.startsWith("text/"));
}

export function mimeOfDataUri(dataUri) {
  return (/^data:([^;,]+)/.exec(dataUri || "")?.[1] || "").toLowerCase();
}

// Unknown/unsupported types (only possible for data stored before server-side validation
// existed) are saved as .bin, which no OS will execute on double-click.
export function safeExtensionForDataUri(dataUri) {
  const mime = mimeOfDataUri(dataUri);
  if (EXTENSIONS[mime]) return EXTENSIONS[mime];
  if (mime.startsWith("text/")) return "txt";
  return "bin";
}

export function safeBaseName(name, fallback = "attachment") {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  return base || fallback;
}
