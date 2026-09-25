// A form's full definition as one portable JSON file. Question images are already stored
// inline as base64 data: URIs (see ImageBlock.jsx), so they travel with the file automatically
// — no separate asset export/upload step needed. Server-specific fields (id, subjectId,
// createdAt/updatedAt) are dropped since importing always creates a fresh form on whatever
// server it lands on.
//
// `responses` (optional) are the form's submitted responses, keyed by the exported question ids so
// the importing side can remap them onto its fresh copy (see server/forms/routes.js POST /import).
// In-progress attempts and per-device fields (device id, edit code, sync state) are left out.
export function downloadFormAsJson(form, { responses } = {}) {
  const exportable = {
    title: form.title || "",
    description: form.description || "",
    settings: form.settings || {},
    bannerImage: form.bannerImage || null,
    questions: (form.questions || []).map((q) => ({
      id: q.id,
      type: q.type,
      title: q.title || "",
      description: q.description || "",
      showDescription: !!q.showDescription,
      showImage: !!q.showImage,
      required: !!q.required,
      options: q.options || [],
      scale: q.scale || {},
      rows: q.rows || [],
      imageUrl: q.imageUrl || null,
      correctAnswerIndex: q.correctAnswerIndex || [],
      correctAnswers: q.correctAnswers || [],
      points: q.points ?? 1,
    })),
  };

  if (responses) {
    exportable.responses = responses.map((r) => ({
      respondentName: r.respondentName || "",
      sessionName: r.sessionName || "",
      startedAt: r.startedAt || null,
      submittedAt: r.submittedAt || null,
      score: r.score ?? null,
      maxScore: r.maxScore ?? null,
      answers: r.answers || {},
    }));
  }

  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(form.title || "form").trim().replace(/\s+/g, "-").toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
