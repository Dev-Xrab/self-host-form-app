import { useMemo } from "react";
import AnswerQuestion from "./AnswerQuestion";
import "./question-pager.css";

// The shared "answer one page of questions, then Back/Next" unit. Used both by the real
// respondent flow (RespondForm.jsx, wired to the server) and by the form builder's live
// preview (PreviewPager.jsx, wired to nothing but local state) — same component, same
// visual fidelity, different data source. Keeping this component free of API/session
// concerns is what makes that reuse possible.
export default function QuestionPager({
  pages,
  currentPageIndex,
  answers,
  onAnswerChange,
  fieldErrors = {},
  onBack,
  onNext,
  isLastPage,
  onSubmit,
  submitting = false,
  submitLabel = "Submit",
  formTitle,
  formDescription,
  bannerImage = null,
  headerExtra = null,
  footerNotice = null,
}) {
  const page = pages[currentPageIndex];

  const questionNumbers = useMemo(() => {
    const map = new Map();
    let n = 0;
    for (const p of pages) {
      for (const q of p.questions) {
        map.set(q.id, n);
        n += 1;
      }
    }
    return map;
  }, [pages]);

  if (!page) return null;

  const showPageChrome = pages.length > 1;
  const progressPct = ((currentPageIndex + 1) / pages.length) * 100;

  return (
    <div className="qp-root">
      {showPageChrome && (
        <div className="qp-progress" role="progressbar" aria-valuenow={currentPageIndex + 1} aria-valuemin={1} aria-valuemax={pages.length}>
          <div className="qp-progress-track">
            <div className="qp-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="qp-progress-label">
            Page {currentPageIndex + 1} of {pages.length}
          </span>
        </div>
      )}

      {currentPageIndex === 0 && bannerImage && (
        <div className="qp-banner">
          <img src={bannerImage} alt="" />
        </div>
      )}

      {currentPageIndex === 0 && (
        <div className="qp-form-header">
          <h1>{formTitle || "Untitled form"}</h1>
          {formDescription && <p>{formDescription}</p>}
        </div>
      )}

      {headerExtra}

      {(page.title || page.description) && (
        <div className="qp-page-header">
          {page.title && <h2>{page.title}</h2>}
          {page.description && <p>{page.description}</p>}
        </div>
      )}

      <div className="qp-questions">
        {page.questions.map((q) => (
          <div id={`answer-${q.id}`} key={q.id}>
            <AnswerQuestion
              question={q}
              index={questionNumbers.get(q.id) ?? 0}
              value={answers[q.id]}
              onChange={(value) => onAnswerChange(q.id, value)}
              error={fieldErrors[q.id]}
            />
          </div>
        ))}

        {page.questions.length === 0 && (
          <p className="qp-empty-page">This section has no questions.</p>
        )}
      </div>

      {footerNotice}

      <div className="qp-nav">
        <button
          type="button"
          className="qp-nav-back"
          onClick={onBack}
          disabled={currentPageIndex === 0}
        >
          Back
        </button>

        {isLastPage ? (
          <button type="button" className="qp-nav-submit" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : submitLabel}
          </button>
        ) : (
          <button type="button" className="qp-nav-next" onClick={onNext}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
