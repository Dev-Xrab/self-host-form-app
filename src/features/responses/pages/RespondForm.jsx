import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QuestionPager from "../components/QuestionPager";
import { responsesApi } from "../services/responsesApi";
import { useServerConnection } from "../hooks/useServerConnection";
import { useCopyProtection } from "../hooks/useCopyProtection";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import ConnectionOverlay from "../components/ConnectionOverlay";
import RefocusLockOverlay from "../components/RefocusLockOverlay";
import FullscreenGateOverlay from "../components/FullscreenGateOverlay";
import { getDeviceId } from "../utils/deviceId";
import { downloadAnswersAsPdf } from "../utils/downloadAnswers";
import { groupIntoPages } from "../utils/groupIntoPages";
import { enterFullscreen, exitFullscreen, isFullscreenActive } from "../utils/fullscreen";
import { formatClock, secondsRemaining } from "../../sessions/utils/time";
import { isMatrixQuestion, getMatrixMissingRows, matrixRequiredMessage } from "../../../lib/matrixQuestions";
import "./respond-form.css";

const NAME_STORAGE_KEY = "stonearch_respondent_name";
const ANSWERS_STORAGE_PREFIX = "stonearch_respondent_answers_";

const isImageDataUri = (dataUri) => /^data:image\//.test(dataUri || "");

const isEmpty = (question, value) => {
  if (value === undefined || value === null) return true;
  if (question.type === "checkboxes") return !Array.isArray(value) || value.length === 0;
  if (isMatrixQuestion(question.type)) return getMatrixMissingRows(question, value).length > 0;
  return String(value).trim() === "";
};

const requiredMessage = (question) =>
  isMatrixQuestion(question.type) ? matrixRequiredMessage(question) : "This question is required.";

// In-progress answers (and which page the respondent was on) are mirrored to localStorage
// under the response's own id (stable across reloads for the same device+session, see the
// resume-by-deviceId join above) so a refresh mid-quiz restores exactly where the
// respondent left off instead of starting blank. Older stored entries (from before paging
// existed) are just the flat answers object — duck-typed below so those still resume.
const loadStoredAnswers = (responseId) => {
  try {
    const raw = localStorage.getItem(ANSWERS_STORAGE_PREFIX + responseId);
    if (!raw) return { answers: {}, pageIndex: 0 };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "answers" in parsed) {
      return { answers: parsed.answers || {}, pageIndex: parsed.pageIndex || 0 };
    }
    return { answers: parsed || {}, pageIndex: 0 };
  } catch {
    return { answers: {}, pageIndex: 0 };
  }
};

const saveStoredAnswers = (responseId, answers, pageIndex) => {
  try {
    localStorage.setItem(ANSWERS_STORAGE_PREFIX + responseId, JSON.stringify({ answers, pageIndex }));
  } catch {
    // best-effort convenience only
  }
};

const clearStoredAnswers = (responseId) => {
  try {
    localStorage.removeItem(ANSWERS_STORAGE_PREFIX + responseId);
  } catch {
    // best-effort convenience only
  }
};

export default function RespondForm() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [pageStatus, setPageStatus] = useState("loading"); // loading | not-found | join | answering | done
  const [sessionInfo, setSessionInfo] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);

  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [joinError, setJoinError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [showEditCodeForm, setShowEditCodeForm] = useState(false);
  const [editCode, setEditCode] = useState("");
  const [editCodeError, setEditCodeError] = useState(null);
  const [submittingEditCode, setSubmittingEditCode] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState(null);

  const [responseId, setResponseId] = useState(null);
  const [form, setForm] = useState(null);
  const [deadlineAt, setDeadlineAt] = useState(null);

  const [answers, setAnswers] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [scrollToId, setScrollToId] = useState(null);
  const [submitStatus, setSubmitStatus] = useState("idle"); // idle | submitting | error
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState(null);
  const submitStatusRef = useRef("idle");
  submitStatusRef.current = submitStatus;

  const loadSessionInfo = () => {
    responsesApi
      .getSessionByCode(code)
      .then((info) => {
        setSessionInfo(info);
        setPageStatus((prev) => (prev === "loading" ? "join" : prev));
      })
      .catch(() => setPageStatus("not-found"));
  };

  // Before asking for a name, try a silent resume: this device may already have a
  // response for this session — joined moments ago via the combined Identifier +
  // Session Code page, or from a previous visit to this same link — in which case we
  // skip straight to it instead of prompting again.
  useEffect(() => {
    let cancelled = false;
    responsesApi
      .join(code, { deviceId: getDeviceId() })
      .then((payload) => {
        if (!cancelled) applyJoinPayload(payload);
      })
      .catch(() => {
        if (!cancelled) loadSessionInfo();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // While waiting on a session that hasn't started yet, poll so the join screen unlocks
  // the moment the host starts it, without the respondent needing to refresh.
  useEffect(() => {
    if (pageStatus !== "join" || sessionInfo?.status !== "draft") return;
    const interval = setInterval(loadSessionInfo, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus, sessionInfo?.status]);

  const answerableQuestions = useMemo(
    () => (form ? form.questions.filter((q) => q.type !== "section") : []),
    [form]
  );
  const questionsById = useMemo(
    () => Object.fromEntries(answerableQuestions.map((q) => [q.id, q])),
    [answerableQuestions]
  );
  const pages = useMemo(() => groupIntoPages(form ? form.questions : []), [form]);

  const applyJoinPayload = (payload) => {
    setResponseId(payload.responseId);
    // Carries session-level settings (refocusLockSeconds, fullscreenEnabled) that stay relevant
    // once "answering" is reached — unlike sessionInfo (from the pre-join GET), this is populated
    // on every path into "answering", including a silent same-device resume that never touches
    // sessionInfo at all.
    setSessionMeta(payload.session);
    // Anchored to the server-held timestamp from the moment this device's tab last went hidden
    // (see server/db/index.js's comment on refocus_locked_until) rather than starting fresh here —
    // otherwise a reload while the countdown is running (or right after returning) would silently
    // skip the rest of it.
    setRefocusLockedUntil(payload.refocusLockedUntil ? new Date(payload.refocusLockedUntil).getTime() : null);
    if (payload.status === "submitted") {
      clearStoredAnswers(payload.responseId);
      setResult(payload);
      setPageStatus("done");
    } else {
      setForm(payload.form);
      setDeadlineAt(payload.deadlineAt);
      // A local draft (this device, still mid-attempt) wins if there is one; otherwise fall
      // back to whatever the server has for this response — the case when editing a
      // previously-submitted answer, possibly from a different device than the one that
      // originally submitted it.
      const stored = loadStoredAnswers(payload.responseId);
      const hasStoredAnswers = Object.keys(stored.answers).length > 0;
      setAnswers(hasStoredAnswers ? stored.answers : payload.answers || {});
      setCurrentPageIndex(hasStoredAnswers ? stored.pageIndex : 0);
      setPageStatus("answering");
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    // Must be called synchronously inside this click handler — after the `await` below,
    // the browser no longer considers this a user gesture and silently ignores the request.
    // Session setting, off by default: the respondent can still enter fullscreen manually
    // from the toolbar either way.
    if (sessionInfo?.fullscreenEnabled) enterFullscreen();
    setJoining(true);
    setJoinError(null);
    try {
      const payload = await responsesApi.join(code, { name: name.trim(), deviceId: getDeviceId() });
      try {
        localStorage.setItem(NAME_STORAGE_KEY, name.trim());
      } catch {
        // best-effort convenience only
      }
      applyJoinPayload(payload);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleEditCodeSubmit = async (e) => {
    e.preventDefault();
    if (sessionInfo?.fullscreenEnabled) enterFullscreen();
    setSubmittingEditCode(true);
    setEditCodeError(null);
    try {
      const payload = await responsesApi.join(code, { editCode: editCode.trim(), deviceId: getDeviceId() });
      applyJoinPayload(payload);
    } catch (err) {
      setEditCodeError(err.message);
    } finally {
      setSubmittingEditCode(false);
    }
  };

  const handleEditFromDone = async () => {
    if (result?.session?.fullscreenEnabled) enterFullscreen();
    setReopening(true);
    setReopenError(null);
    try {
      const payload = await responsesApi.editResponse(responseId, getDeviceId());
      applyJoinPayload(payload);
    } catch (err) {
      setReopenError(err.message);
    } finally {
      setReopening(false);
    }
  };

  // Mirror answers to localStorage as the respondent types/selects, so a reload (or the
  // browser crashing, or accidentally closing the tab) restores this response's progress
  // via applyJoinPayload's silent resume instead of losing it.
  useEffect(() => {
    if (pageStatus !== "answering" || !responseId) return;
    saveStoredAnswers(responseId, answers, currentPageIndex);
  }, [pageStatus, responseId, answers, currentPageIndex]);

  // After a validation failure jumps the pager to an earlier page (see handleSubmitClick),
  // scroll to the offending field once that page has actually rendered.
  useEffect(() => {
    if (!scrollToId) return;
    const id = scrollToId;
    setScrollToId(null);
    requestAnimationFrame(() => {
      document.getElementById(`answer-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [scrollToId, currentPageIndex]);

  const submitAnswers = async ({ timedOut = false } = {}) => {
    setSubmitStatus("submitting");
    setSubmitError(null);
    try {
      const res = await responsesApi.submit(responseId, { answers, timedOut, deviceId: getDeviceId() });
      clearStoredAnswers(responseId);
      setResult(res);
      setAutoSubmitted(timedOut);
      setPageStatus("done");
      exitFullscreen();
    } catch (err) {
      setSubmitStatus("error");
      if (err.status === 400 && err.body?.missingQuestionIds) {
        setFieldErrors(
          Object.fromEntries(
            err.body.missingQuestionIds.map((id) => [id, requiredMessage(questionsById[id] || {})])
          )
        );
        setSubmitError("Some required questions are missing an answer.");
      } else {
        setSubmitError(err.message);
      }
    }
  };

  // The timer is always derived from THIS respondent's own server-provided deadline
  // (set once, at join time) — never a locally-stored duration — so it stays correct
  // across refresh and can't be tampered with client-side.
  useEffect(() => {
    if (pageStatus !== "answering" || !deadlineAt) return;

    const tick = () => {
      const remaining = secondsRemaining(deadlineAt);
      setSecondsLeft(remaining);
      if (remaining <= 0 && (submitStatusRef.current === "idle" || submitStatusRef.current === "error")) {
        submitAnswers({ timedOut: true });
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus, deadlineAt]);

  // Safety net for untimed responses: detect the host manually ending the session while
  // this respondent is still answering (a timed response is governed by its own deadline
  // above and isn't cut off just because the session stopped accepting new joiners).
  useEffect(() => {
    if (pageStatus !== "answering" || !responseId || deadlineAt) return;
    const interval = setInterval(() => {
      responsesApi.getResponse(responseId, getDeviceId()).then((payload) => {
        if (payload.session.status === "ended" && submitStatusRef.current === "idle") {
          submitAnswers({ timedOut: true });
        }
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus, responseId, deadlineAt]);

  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setFieldErrors((prev) => (prev[questionId] ? { ...prev, [questionId]: undefined } : prev));
  };

  // "Next" only checks the page the respondent is currently looking at — same batching
  // Google Forms uses (validate the visible page, don't reach ahead into later ones).
  const handleNext = () => {
    const currentQuestions = pages[currentPageIndex]?.questions || [];
    const missing = currentQuestions.filter((q) => q.required && isEmpty(q, answers[q.id]));
    if (missing.length > 0) {
      setFieldErrors((prev) => ({
        ...prev,
        ...Object.fromEntries(missing.map((q) => [q.id, requiredMessage(q)])),
      }));
      setScrollToId(missing[0].id);
      return;
    }
    setCurrentPageIndex((i) => Math.min(pages.length - 1, i + 1));
  };

  const handleBack = () => {
    setCurrentPageIndex((i) => Math.max(0, i - 1));
  };

  // The authoritative last-line check before submitting: covers a respondent who went back
  // and cleared an answer on an earlier page after Next had already validated it once. If
  // anything is still missing, jump to the page that question lives on and point at it.
  const handleSubmitClick = () => {
    const missing = answerableQuestions.filter((q) => q.required && isEmpty(q, answers[q.id]));
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missing.map((q) => [q.id, requiredMessage(q)])));
      const targetPageIndex = pages.findIndex((p) => p.questions.some((q) => q.id === missing[0].id));
      if (targetPageIndex !== -1) setCurrentPageIndex(targetPageIndex);
      setScrollToId(missing[0].id);
      return;
    }
    submitAnswers();
  };

  const handleExit = () => {
    if (pageStatus === "answering") {
      setShowExitConfirm(true);
    } else {
      exitFullscreen();
      navigate("/");
    }
  };

  const handleConfirmLeave = () => {
    exitFullscreen();
    navigate("/");
  };

  // Covers every other way this component can stop showing the answering screen: closing
  // the tab, the browser back button, or the timer/host-ended-session effects above calling
  // submitAnswers — leaving fullscreen behind would otherwise strand the respondent in it.
  useEffect(() => {
    return () => exitFullscreen();
  }, []);

  // Fullscreen can be lost for reasons outside our own exitFullscreen() calls — the respondent
  // presses Esc/F11, a native file-picker opens (browsers force it closed for that), the window
  // loses focus, or a silent resume (this device already had an in-progress response, so
  // "answering" is reached on page load with no click at all to request it from) never entered
  // it in the first place. Reflecting the real state, tracked here, is what lets the toolbar
  // button below always offer a real way back in rather than assuming a request made earlier is
  // still in effect.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setIsFullscreen(isFullscreenActive());
    update();
    const events = ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"];
    events.forEach((evt) => document.addEventListener(evt, update));
    return () => events.forEach((evt) => document.removeEventListener(evt, update));
  }, []);

  const handleToggleFullscreen = () => {
    // Synchronous, direct from this click — the one thing the Fullscreen API actually requires.
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  };

  // Per-form setting: blur and lock the screen while this device can't reach the server. Only
  // relevant where the server is actually needed — the join screen and while answering.
  const guardEnabled =
    !!(form?.settings?.blurOnDisconnect ?? sessionInfo?.blurOnDisconnect) &&
    (pageStatus === "join" || pageStatus === "answering");
  const online = useServerConnection(guardEnabled);
  const blocked = guardEnabled && !online;

  // Session setting: hold the respondent on a countdown when they switch back to this tab after
  // having switched away from it — a deterrent against looking something up elsewhere mid-quiz.
  // Purely a viewing delay: it doesn't pause or extend the quiz deadline above. The countdown's
  // target time (refocusLockedUntil, epoch ms) is seeded from the server on every join/resume —
  // see applyJoinPayload — and refreshed via startRefocusLock the instant the tab goes hidden, so
  // it's the server's clock a reload has to catch up to, not a piece of state a reload can erase.
  const refocusLockSeconds = sessionMeta?.refocusLockSeconds || 0;
  const [refocusLockedUntil, setRefocusLockedUntil] = useState(null);
  const [refocusCountdown, setRefocusCountdown] = useState(0);

  useEffect(() => {
    if (pageStatus !== "answering" || !refocusLockSeconds || !responseId) return undefined;
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      setRefocusLockedUntil(Date.now() + refocusLockSeconds * 1000);
      responsesApi.startRefocusLock(responseId, getDeviceId()).catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pageStatus, refocusLockSeconds, responseId]);

  useEffect(() => {
    if (!refocusLockedUntil) {
      setRefocusCountdown(0);
      return undefined;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((refocusLockedUntil - Date.now()) / 1000));
      setRefocusCountdown(remaining);
      if (remaining <= 0) setRefocusLockedUntil(null);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [refocusLockedUntil]);

  // Session setting: the answering screen must stay in fullscreen the whole time. Reactive to
  // real browser fullscreen state (via the fullscreenchange listener above) rather than checked
  // once, so reloading, pressing Esc, or the browser dropping fullscreen for any other reason all
  // land back on this gate instead of silently leaving fullscreen off — the Fullscreen API only
  // grants it from inside an actual click, so re-entering always needs the button below, never
  // happens silently.
  const needsFullscreenGate =
    pageStatus === "answering" && !!sessionMeta?.fullscreenEnabled && !isFullscreen && !blocked && refocusCountdown <= 0;

  // The "Leave quiz?" confirmation isn't built on the shared Dialog (it uses this page's own
  // rf-* visual language), so it needs its own scroll lock the same way.
  useBodyScrollLock(showExitConfirm);

  // Per-form setting: discourage copying the questions (see useCopyProtection).
  useCopyProtection(
    !!(form?.settings?.restrictCopying ?? sessionInfo?.restrictCopying) &&
      (pageStatus === "join" || pageStatus === "answering" || pageStatus === "done")
  );

  if (pageStatus === "loading") {
    return <div className="respond-page-message">Loading…</div>;
  }

  if (pageStatus === "not-found") {
    return <div className="respond-page-message respond-page-message-error">That code isn't valid.</div>;
  }

  if (pageStatus === "join") {
    const isDraft = sessionInfo.status === "draft";
    const isEnded = sessionInfo.status === "ended";
    return (
      <div className="respond-page">
        <div className="respond-code-card" inert={blocked || undefined}>
          <button type="button" className="respond-exit-link" onClick={() => navigate("/")}>
            ← Leave
          </button>
          <h1>{sessionInfo.formTitle || "Untitled form"}</h1>
          <p>{sessionInfo.name}</p>

          {isDraft && <p className="respond-code-error">This session hasn't started yet — waiting for the host…</p>}
          {isEnded && <p className="respond-code-error">This session has ended.</p>}

          <form onSubmit={handleJoin} className="respond-code-form respond-join-form">
            <input
              type="text"
              className="respond-code-input respond-name-input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isDraft}
            />
            <button type="submit" className="respond-code-submit" disabled={joining || isDraft || !name.trim()}>
              {joining ? "Joining…" : "Continue"}
            </button>
          </form>
          {joinError && <p className="respond-code-error">{joinError}</p>}

          {sessionInfo.responsesEditable && sessionInfo.status === "active" && (
            <div className="respond-edit-code-section">
              {showEditCodeForm ? (
                <form onSubmit={handleEditCodeSubmit} className="respond-code-form">
                  <input
                    type="text"
                    className="respond-code-input"
                    placeholder="Your edit code"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="respond-code-submit" disabled={submittingEditCode || !editCode.trim()}>
                    {submittingEditCode ? "Looking up…" : "Edit my response"}
                  </button>
                </form>
              ) : (
                <button type="button" className="respond-edit-code-link" onClick={() => setShowEditCodeForm(true)}>
                  Already submitted? Edit your response
                </button>
              )}
              {editCodeError && <p className="respond-code-error">{editCodeError}</p>}
            </div>
          )}
        </div>
        {blocked && <ConnectionOverlay />}
      </div>
    );
  }

  if (pageStatus === "done") {
    return (
      <div className="respond-page">
        <div className="respond-done-card respond-done-card-wide">
          <h1>Response recorded</h1>
          <p>
            {autoSubmitted
              ? "Time was up, so your response was submitted automatically."
              : "Thanks — your response has been submitted."}
          </p>
          {result?.score !== null && result?.score !== undefined && (
            <p className="respond-score">
              Score: {result.score} / {result.maxScore}
            </p>
          )}

          {Array.isArray(result?.review) && result.review.length > 0 && (
            <div className="respond-review-list">
              {result.review.map((r) => (
                <div
                  className={`respond-review-item ${
                    r.gradable ? (r.correct ? "respond-review-item-correct" : "respond-review-item-wrong") : ""
                  }`}
                  key={r.questionId}
                >
                  {r.gradable && <span className="respond-review-mark">{r.correct ? "✓" : "✗"}</span>}
                  <div className="respond-review-text">
                    <span className="respond-review-question">
                      {r.title || questionsById[r.questionId]?.title || "Question"}
                    </span>
                    {r.questionImageUrl && (
                      <img className="respond-review-image" src={r.questionImageUrl} alt="" />
                    )}
                    <span className="respond-review-answer">Your answer: {r.submittedAnswer || "No answer"}</span>
                    {r.fileUrl && isImageDataUri(r.fileUrl) && (
                      <img className="respond-review-image" src={r.fileUrl} alt="" />
                    )}
                    {r.gradable && !r.correct && (
                      <span className="respond-review-answer">Correct answer: {r.correctAnswer}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {Array.isArray(result?.answers) && result.answers.length > 0 && (
            <button
              type="button"
              className="respond-download-btn"
              disabled={downloadingPdf}
              onClick={async () => {
                setDownloadingPdf(true);
                try {
                  await downloadAnswersAsPdf({
                    formTitle: result.formTitle,
                    respondentName: name.trim(),
                    sessionName: result.session?.name,
                    submittedAt: new Date(),
                    score: result.score,
                    maxScore: result.maxScore,
                    answers: result.answers,
                  });
                } finally {
                  setDownloadingPdf(false);
                }
              }}
            >
              <span>↓</span> {downloadingPdf ? "Preparing PDF…" : "Download my answers (PDF)"}
            </button>
          )}

          {result?.editCode && (
            <div className="respond-edit-section">
              {result?.session?.responsesEditable && result?.session?.status === "active" && (
                <button
                  type="button"
                  className="respond-download-btn"
                  onClick={handleEditFromDone}
                  disabled={reopening}
                >
                  <span>✎</span> {reopening ? "Opening…" : "Edit my response"}
                </button>
              )}
              <p className="respond-edit-code-note">
                Your edit code: <strong>{result.editCode}</strong> — save this in case you want to edit your
                response later from a different device (you'll also need this session's code).
              </p>
              {reopenError && <p className="respond-code-error">{reopenError}</p>}
            </div>
          )}

          <button type="button" className="respond-code-submit respond-done-exit" onClick={() => navigate("/")}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="respond-page">
      <div className="respond-form-column" inert={blocked || refocusCountdown > 0 || needsFullscreenGate || undefined}>
        <div className="respond-toolbar">
          <button type="button" className="respond-exit-link" onClick={handleExit}>
            ← Leave
          </button>
          <div className="respond-toolbar-right">
            <button type="button" className="respond-fullscreen-btn" onClick={handleToggleFullscreen}>
              <span aria-hidden="true">⛶</span>
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
            {secondsLeft !== null && (
              <span className={`respond-timer ${secondsLeft <= 60 ? "respond-timer-urgent" : ""}`}>
                {formatClock(secondsLeft)}
              </span>
            )}
          </div>
        </div>

        {answerableQuestions.length === 0 ? (
          <p className="respond-page-message">This form doesn't have any questions yet.</p>
        ) : (
          <QuestionPager
            pages={pages}
            currentPageIndex={currentPageIndex}
            answers={answers}
            onAnswerChange={setAnswer}
            fieldErrors={fieldErrors}
            onBack={handleBack}
            onNext={handleNext}
            isLastPage={currentPageIndex === pages.length - 1}
            onSubmit={handleSubmitClick}
            submitting={submitStatus === "submitting"}
            formTitle={form.title}
            formDescription={form.description}
            bannerImage={form.bannerImage}
            footerNotice={submitError ? <p className="respond-submit-error">{submitError}</p> : null}
          />
        )}
      </div>

      {showExitConfirm && (
        <div className="respond-exit-overlay">
          <div className="respond-exit-dialog">
            <h2>Leave quiz?</h2>
            <p>Your progress may be lost if you leave before submitting.</p>
            <div className="respond-exit-actions">
              <button type="button" className="dash-ghost-btn" onClick={() => setShowExitConfirm(false)}>
                Stay
              </button>
              <button type="button" className="respond-exit-confirm" onClick={handleConfirmLeave}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {blocked && <ConnectionOverlay />}
      {!blocked && refocusCountdown > 0 && <RefocusLockOverlay secondsLeft={refocusCountdown} />}
      {needsFullscreenGate && <FullscreenGateOverlay onEnter={handleToggleFullscreen} />}
    </div>
  );
}
