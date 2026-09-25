import { useMemo, useState } from "react";
import useFormStore from "../../../store/useFormStore";
import QuestionPager from "../../features/responses/components/QuestionPager";
import { groupIntoPages } from "../../features/responses/utils/groupIntoPages";
import "../../features/responses/components/question-pager.css";
import "./preview-pager.css";

// True respondent-facing preview for the builder's View mode: the exact same QuestionPager
// a real respondent sees, fed from the live in-memory draft instead of a saved form — so
// authors see real fidelity (paging, section headers, question layout) instead of the
// editor's own read-only card styling. Answers here are local-only React state; nothing is
// persisted and there's no submit call, matching "preview, don't record a response".
export default function PreviewPager() {
  const formTitle = useFormStore((s) => s.formTitle);
  const formDescription = useFormStore((s) => s.formDescription);
  const bannerImage = useFormStore((s) => s.bannerImage);
  const questions = useFormStore((s) => s.questions);

  const pages = useMemo(() => groupIntoPages(questions), [questions]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [answers, setAnswers] = useState({});

  const safePageIndex = Math.min(currentPageIndex, Math.max(pages.length - 1, 0));

  if (pages.length === 0 || pages.every((p) => p.questions.length === 0)) {
    return <p className="page-form-empty-hint">Add a question to preview how respondents will see this form.</p>;
  }

  return (
    <div className="preview-pager">
      <span className="preview-pager-badge">Preview — responses here aren't saved</span>
      <QuestionPager
        pages={pages}
        currentPageIndex={safePageIndex}
        answers={answers}
        onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
        fieldErrors={{}}
        onBack={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentPageIndex((i) => Math.min(pages.length - 1, i + 1))}
        isLastPage={safePageIndex === pages.length - 1}
        onSubmit={() => {}}
        formTitle={formTitle}
        formDescription={formDescription}
        bannerImage={bannerImage}
      />
    </div>
  );
}
