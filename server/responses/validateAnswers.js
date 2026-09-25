import { validateUploadedFile } from "../security/uploads.js";

// Shape and size limits for a respondent's submitted answers. The respondent page is not the
// only possible client — anyone on the LAN can POST to /api/public/responses/:id/submit directly —
// so every value is checked here against what the real question components can produce
// (see src/features/responses/components/*Field.jsx), and anything else is rejected outright.

const MAX_TEXT_LENGTH = 20_000;
const MAX_LIST_ITEMS = 200;
const MAX_MATRIX_ROWS = 500;

function isScalar(value) {
  if (value === null) return true;
  if (typeof value === "string") return value.length <= MAX_TEXT_LENGTH;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

function isScalarList(value) {
  return Array.isArray(value) && value.length <= MAX_LIST_ITEMS && value.every(isScalar);
}

function validateAnswer(question, value) {
  if (value === undefined || value === null) return null;

  switch (question.type) {
    case "file_upload":
      if (value === "") return null;
      return validateUploadedFile(value);
    case "checkboxes":
      return isScalarList(value) ? null : "must be a list of choices";
    case "matrix":
    case "matrix_checkbox": {
      if (typeof value !== "object" || Array.isArray(value)) return "must be an object of row answers";
      const entries = Object.entries(value);
      if (entries.length > MAX_MATRIX_ROWS) return "has too many rows";
      const ok = entries.every(([rowId, a]) => rowId.length <= 200 && (isScalar(a) || isScalarList(a)));
      return ok ? null : "has an invalid row answer";
    }
    default:
      return isScalar(value) ? null : "is not a valid answer";
  }
}

// Returns null when every answer is acceptable, otherwise a message naming the first bad one.
// Answers to ids that aren't questions on this form are dropped by the caller, not validated here.
export function validateAnswers(questions, answers) {
  for (const question of questions) {
    const error = validateAnswer(question, answers[question.id]);
    if (error) return `Answer to "${question.title || "Untitled question"}" ${error}.`;
  }
  return null;
}
