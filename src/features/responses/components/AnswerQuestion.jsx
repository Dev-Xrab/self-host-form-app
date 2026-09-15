import { getQuestionType } from "../../../lib/questionRegistry";

export default function AnswerQuestion({ question, index, value, onChange, error }) {
  const Field = getQuestionType(question.type)?.respondentComponent;
  const errorId = `answer-error-${question.id}`;

  return (
    <div className={`answer-question ${error ? "answer-question-error-state" : ""}`}>
      <div className="answer-question-header">
        <span className="answer-question-index">{index + 1}</span>
        <h3 className="answer-question-title">
          {question.title || "Untitled question"}
          {question.required && (
            <span className="answer-required-mark" aria-label="required">
              *
            </span>
          )}
        </h3>
      </div>

      {question.description && <p className="answer-question-description">{question.description}</p>}

      {question.imageUrl && (
        <div className="answer-question-image">
          <img src={question.imageUrl} alt="" />
        </div>
      )}

      {Field && (
        <div aria-describedby={error ? errorId : undefined} aria-required={question.required || undefined}>
          <Field question={question} value={value} onChange={onChange} error={error} />
        </div>
      )}

      {error && (
        <p className="answer-question-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
