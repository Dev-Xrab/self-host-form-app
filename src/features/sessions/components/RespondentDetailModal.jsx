import { useState } from "react";
import Dialog from "../../../components/Dialog/Dialog";
import { Icons } from "../../../pages/dashboard-page/icons";
import logo from "../../../images/logo.png";
import "./respondent-detail.css";
import { mimeOfDataUri, safeBaseName, safeExtensionForDataUri } from "../../../lib/fileTypes";

function formatAnswer(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.join(", ") || null;
  return String(value);
}

// The stored value is a raw data: URI (see server/responses/grading.js) — derive a
// sensible download filename from its mime type since the original filename isn't kept.
// The extension comes from a fixed allowlist (src/lib/fileTypes.js), never from the MIME type
// the respondent's data: URI declares — otherwise "data:x/exe;..." would download as .exe.
function fileNameFromDataUri(dataUri, questionTitle) {
  return `${safeBaseName(questionTitle)}.${safeExtensionForDataUri(dataUri)}`;
}

// What kind of inline preview (if any) a data: URI supports — drives both the thumbnail
// shown under a question and what the full-view lightbox renders when it's opened.
function getFileKind(dataUri) {
  // Anything that isn't an inline data: URI (e.g. a URL stored before server-side validation)
  // is never previewed or fetched — it'd make this machine request an arbitrary address.
  if (!String(dataUri || "").startsWith("data:")) return "other";
  const mime = mimeOfDataUri(dataUri);
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

function isImage(dataUri) {
  return getFileKind(dataUri) === "image";
}

export default function RespondentDetailModal({ respondent, onClose, onPrev, onNext, position }) {
  const [editCodeVisible, setEditCodeVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  if (!respondent) return null;

  const pct =
    respondent.maxScore != null && respondent.score != null
      ? Math.round((respondent.score / respondent.maxScore) * 1000) / 10
      : null;

  // The lightbox is nested inside this same Dialog rather than a separate one, so its own
  // Escape/close needs to take priority over the outer modal's — closing the lightbox first,
  // and only closing the whole respondent view on a second Escape/close once it's gone.
  const handleClose = () => (previewFile ? setPreviewFile(null) : onClose());

  const headerActions = (
    <>
      {(onPrev || onNext) && (
        <div className="respondent-nav">
          <button
            type="button"
            className="respondent-nav-btn"
            disabled={!onPrev}
            onClick={onPrev || undefined}
            aria-label="Previous respondent"
          >
            <Icons.chevronLeft />
          </button>
          {position && (
            <span className="respondent-nav-position">
              {position.index + 1} / {position.total}
            </span>
          )}
          <button
            type="button"
            className="respondent-nav-btn"
            disabled={!onNext}
            onClick={onNext || undefined}
            aria-label="Next respondent"
          >
            <Icons.chevronRight />
          </button>
        </div>
      )}
      <button
        type="button"
        className="respondent-nav-btn"
        onClick={() => window.print()}
        aria-label="Print this response"
        title="Print / Save as PDF"
      >
        <Icons.printer />
      </button>
    </>
  );

  return (
    <Dialog
      title={respondent.respondentName || "Respondent"}
      onClose={handleClose}
      headerActions={headerActions}
      className="respondent-dialog"
    >
      <div className="respondent-detail">
        <div className="respondent-detail-print-header">
          <img src={logo} alt="" className="respondent-detail-print-logo" />
          <div>
            <p className="respondent-detail-print-app">Self Host Form</p>
            <h2>{respondent.respondentName || "Anonymous"}</h2>
            <p>
              Score: {respondent.score ?? "—"} / {respondent.maxScore ?? "—"}
              {respondent.submittedAt ? ` · Submitted ${new Date(respondent.submittedAt).toLocaleString()}` : ""}
            </p>
          </div>
        </div>

        <div className="respondent-detail-summary">
          {respondent.maxScore != null ? (
            <div className="respondent-score">
              <strong>
                {respondent.score ?? "—"}
                <span>/{respondent.maxScore}</span>
              </strong>
              {pct != null && <span className="respondent-score-pct">{pct}%</span>}
            </div>
          ) : (
            <div className="respondent-score respondent-score-empty">
              <strong>—</strong>
              <span className="respondent-score-label">Not graded</span>
            </div>
          )}

          <div className="respondent-summary-meta">
            {respondent.submittedAt && (
              <span>Submitted {new Date(respondent.submittedAt).toLocaleString()}</span>
            )}
            {respondent.editCode && (
              <span className="respondent-edit-code">
                Edit code
                <strong>{editCodeVisible ? respondent.editCode : "•".repeat(respondent.editCode.length)}</strong>
                <button
                  type="button"
                  className="respondent-edit-code-toggle"
                  onClick={() => setEditCodeVisible((v) => !v)}
                  aria-label={editCodeVisible ? "Hide edit code" : "Show edit code"}
                  title={editCodeVisible ? "Hide edit code" : "Show edit code"}
                >
                  {editCodeVisible ? <Icons.eyeOff /> : <Icons.eye />}
                </button>
              </span>
            )}
          </div>
        </div>

        <ol className="respondent-detail-questions">
          {respondent.breakdown.map((b, i) => {
            const answer = formatAnswer(b.submittedAnswer);
            const correctAnswer = formatAnswer(b.correctAnswer);
            return (
              <li className="respondent-question" key={b.questionId}>
                <div className="respondent-question-head">
                  <span className="respondent-question-num">{i + 1}</span>
                  <span className="respondent-question-title">{b.title || "Untitled question"}</span>
                  {b.gradable && (
                    <span className={`respondent-result ${b.correct ? "is-correct" : "is-wrong"}`}>
                      {b.correct ? "Correct" : "Incorrect"} · {b.pointsEarned}/{b.points}
                    </span>
                  )}
                </div>

                {b.fileUrl ? (
                  <div className="respondent-file">
                    {isImage(b.fileUrl) && (
                      <button
                        type="button"
                        className="respondent-file-thumb"
                        onClick={() => setPreviewFile({ url: b.fileUrl, title: b.title, kind: "image" })}
                        aria-label="View full size image"
                      >
                        <img src={b.fileUrl} alt={b.title || "Uploaded file"} />
                      </button>
                    )}
                    <div className="respondent-file-actions">
                      {getFileKind(b.fileUrl) !== "other" && (
                        <button
                          type="button"
                          className="respondent-file-link"
                          onClick={() => setPreviewFile({ url: b.fileUrl, title: b.title, kind: getFileKind(b.fileUrl) })}
                        >
                          <Icons.eye />
                          Preview
                        </button>
                      )}
                      <a
                        className="respondent-file-link"
                        href={b.fileUrl}
                        download={fileNameFromDataUri(b.fileUrl, b.title)}
                      >
                        <Icons.download />
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className={`respondent-answer ${answer ? "" : "is-empty"}`}>{answer || "No answer"}</div>
                )}

                {b.gradable && !b.correct && correctAnswer && (
                  <div className="respondent-correct">
                    <span>Correct answer</span>
                    <strong>{correctAnswer}</strong>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {previewFile && (
        <div className="respondent-lightbox-overlay" onClick={() => setPreviewFile(null)}>
          <div className="respondent-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="respondent-lightbox-toolbar">
              <span className="respondent-lightbox-title">{previewFile.title || "Attachment"}</span>
              <div className="respondent-lightbox-actions">
                <a
                  className="respondent-lightbox-download"
                  href={previewFile.url}
                  download={fileNameFromDataUri(previewFile.url, previewFile.title)}
                  aria-label="Download file"
                  title="Download"
                >
                  <Icons.download />
                </a>
                <button
                  type="button"
                  className="respondent-lightbox-close"
                  onClick={() => setPreviewFile(null)}
                  aria-label="Close preview"
                >
                  <Icons.close />
                </button>
              </div>
            </div>

            <div className="respondent-lightbox-body">
              {previewFile.kind === "image" && (
                <img src={previewFile.url} alt={previewFile.title || "Uploaded file"} className="respondent-lightbox-image" />
              )}
              {previewFile.kind === "pdf" && (
                <iframe src={previewFile.url} title={previewFile.title || "PDF preview"} className="respondent-lightbox-pdf" />
              )}
              {previewFile.kind === "video" && (
                <video src={previewFile.url} controls autoPlay className="respondent-lightbox-video" />
              )}
              {previewFile.kind === "audio" && (
                <audio src={previewFile.url} controls autoPlay className="respondent-lightbox-audio" />
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
