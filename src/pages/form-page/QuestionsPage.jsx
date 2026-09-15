import FormInfo from "../../components/FormComponents/FormInfo/FormInfo";
import Question from "../../components/FormComponents/Question/Question";
import Section from "../../components/FormComponents/Section/Section";
import WindowContainer from "../../components/Window Container/WindowContainer";
import PreviewPager from "./PreviewPager";
import useFormStore from "../../../store/useFormStore";

export default function QuestionsPage() {
  const questions = useFormStore((s) => s.questions);
  const mode = useFormStore((s) => s.mode);

  if (mode === "view") {
    return (
      <div className="page-form-column">
        <PreviewPager />
      </div>
    );
  }

  return (
    <div className="page-form-column">
      <WindowContainer component={<FormInfo />} navigationpath="Form Info" center={false} />

      {(() => {
        let questionNumber = 0;
        return questions.map((question, index) => {
          const isFirst = index === 0;
          const isLast = index === questions.length - 1;

          if (question.type === "section") {
            return (
              <Section key={question.id} section={question} isFirst={isFirst} isLast={isLast} />
            );
          }

          questionNumber += 1;
          return (
            <Question
              key={question.id}
              question={question}
              index={questionNumber - 1}
              isFirst={isFirst}
              isLast={isLast}
            />
          );
        });
      })()}

      {questions.length === 0 && (
        <p className="page-form-empty-hint">Use the sidebar to add your first question.</p>
      )}
    </div>
  );
}
