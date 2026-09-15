// Single source of truth for every question type: what it's called, its icon, the
// components that render it in the builder and to a respondent, and the traits other
// modules (useFormStore, Question.jsx, AnswerQuestion.jsx) need instead of redeclaring
// their own per-type sets. Adding a question type means editing this file only.
//
// server/responses/grading.js runs in a separate (Node, no bundler) runtime and can't
// import from src/, so it keeps its own small CHOICE_TYPES/gradable predicate — kept in
// sync with isGradable/isSingleSelect below by convention, not by shared code.
import ShortAnswer from "../components/FormComponents/QuestionTypes/ShortAnswer";
import Paragraph from "../components/FormComponents/QuestionTypes/Paragraph";
import MultipleChoice from "../components/FormComponents/QuestionTypes/MultipleChoice";
import Checkboxes from "../components/FormComponents/QuestionTypes/Checkboxes";
import Dropdown from "../components/FormComponents/QuestionTypes/Dropdown";
import LinearScale from "../components/FormComponents/QuestionTypes/LinearScale";
import DateFieldEditor from "../components/FormComponents/QuestionTypes/DateField";
import TimeFieldEditor from "../components/FormComponents/QuestionTypes/TimeField";
import FileUploadEditor from "../components/FormComponents/QuestionTypes/FileUpload";
import MatrixGrid from "../components/FormComponents/QuestionTypes/MatrixGrid";

import ShortAnswerField from "../features/responses/components/ShortAnswerField";
import ParagraphField from "../features/responses/components/ParagraphField";
import MultipleChoiceField from "../features/responses/components/MultipleChoiceField";
import CheckboxesField from "../features/responses/components/CheckboxesField";
import DropdownField from "../features/responses/components/DropdownField";
import LinearScaleField from "../features/responses/components/LinearScaleField";
import DateFieldAnswer from "../features/responses/components/DateField";
import TimeFieldAnswer from "../features/responses/components/TimeField";
import FileUploadField from "../features/responses/components/FileUploadField";
import MatrixGridField from "../features/responses/components/MatrixGridField";
import { defaultMatrixRows, defaultMatrixColumns, DEFAULT_MATRIX_SETTINGS } from "./matrixQuestions";

const DEFAULT_SCALE = { min: 1, max: 5, minLabel: "", maxLabel: "" };

// isOptionBased: has an `options` array a respondent picks from.
// isSingleSelect: only one option can ever be correct (vs. checkboxes, which allows many).
// isGradable: can carry an answer key at all (linear_scale/date/time/file_upload can't).
// usesTextAnswerKey: correct answers are free-text variations (`correctAnswers`) rather
//   than option indices (`correctAnswerIndex`).
// isGridBased: a matrix/grid question — has both a `rows` array and a shared `options`
//   array (the columns/scale, reused across every row) instead of a single option list.
export const QUESTION_TYPE_REGISTRY = {
  short_answer: {
    id: "short_answer",
    label: "Short answer",
    icon: "shortAnswer",
    editorComponent: ShortAnswer,
    respondentComponent: ShortAnswerField,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: true,
    usesTextAnswerKey: true,
  },
  paragraph: {
    id: "paragraph",
    label: "Paragraph",
    icon: "paragraph",
    editorComponent: Paragraph,
    respondentComponent: ParagraphField,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: true,
    usesTextAnswerKey: true,
  },
  multiple_choice: {
    id: "multiple_choice",
    label: "Multiple choice",
    icon: "multipleChoice",
    editorComponent: MultipleChoice,
    respondentComponent: MultipleChoiceField,
    isOptionBased: true,
    isSingleSelect: true,
    isGradable: true,
    usesTextAnswerKey: false,
  },
  checkboxes: {
    id: "checkboxes",
    label: "Checkboxes",
    icon: "checkboxes",
    editorComponent: Checkboxes,
    respondentComponent: CheckboxesField,
    isOptionBased: true,
    isSingleSelect: false,
    isGradable: true,
    usesTextAnswerKey: false,
  },
  dropdown: {
    id: "dropdown",
    label: "Dropdown",
    icon: "dropdown",
    editorComponent: Dropdown,
    respondentComponent: DropdownField,
    isOptionBased: true,
    isSingleSelect: true,
    isGradable: true,
    usesTextAnswerKey: false,
  },
  linear_scale: {
    id: "linear_scale",
    label: "Linear scale",
    icon: "linearScale",
    editorComponent: LinearScale,
    respondentComponent: LinearScaleField,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: false,
    usesTextAnswerKey: false,
  },
  date: {
    id: "date",
    label: "Date",
    icon: "date",
    editorComponent: DateFieldEditor,
    respondentComponent: DateFieldAnswer,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: false,
    usesTextAnswerKey: false,
  },
  time: {
    id: "time",
    label: "Time",
    icon: "time",
    editorComponent: TimeFieldEditor,
    respondentComponent: TimeFieldAnswer,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: false,
    usesTextAnswerKey: false,
  },
  file_upload: {
    id: "file_upload",
    label: "File upload",
    icon: "fileUpload",
    editorComponent: FileUploadEditor,
    respondentComponent: FileUploadField,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: false,
    usesTextAnswerKey: false,
  },
  matrix: {
    id: "matrix",
    label: "Multiple choice grid",
    icon: "grid",
    editorComponent: MatrixGrid,
    respondentComponent: MatrixGridField,
    isOptionBased: false,
    isSingleSelect: true,
    isGradable: false,
    usesTextAnswerKey: false,
    isGridBased: true,
  },
  matrix_checkbox: {
    id: "matrix_checkbox",
    label: "Checkbox grid",
    icon: "grid",
    editorComponent: MatrixGrid,
    respondentComponent: MatrixGridField,
    isOptionBased: false,
    isSingleSelect: false,
    isGradable: false,
    usesTextAnswerKey: false,
    isGridBased: true,
  },
};

export const QUESTION_TYPES = Object.values(QUESTION_TYPE_REGISTRY);

export function getQuestionType(type) {
  return QUESTION_TYPE_REGISTRY[type];
}

export function createQuestionDefaults(type) {
  const def = getQuestionType(type);
  if (def?.isGridBased) {
    return {
      options: defaultMatrixColumns(),
      rows: defaultMatrixRows(),
      scale: { ...DEFAULT_MATRIX_SETTINGS },
    };
  }
  return {
    options: def?.isOptionBased ? ["Option 1"] : [],
    rows: [],
    scale: { ...DEFAULT_SCALE },
  };
}
