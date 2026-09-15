import useFormStore, { useFormActions } from "../../../../store/useFormStore";
import { MATRIX_SCALE_PRESETS } from "../../../lib/matrixQuestions";
import { Icons } from "../icons";
import Checkbox from "../../ui/Checkbox";

// One question, many rows, one shared column/scale list — editing a column here updates it
// for every row at once, since every row reads from this same `question.options` array.
export default function MatrixGrid({ question }) {
  const mode = useFormStore((s) => s.mode);
  const isEdit = mode === "edit";
  const {
    addMatrixRow,
    updateMatrixRow,
    removeMatrixRow,
    moveMatrixRow,
    addMatrixColumn,
    updateMatrixColumn,
    removeMatrixColumn,
    moveMatrixColumn,
    applyMatrixColumnPreset,
    updateMatrixSettings,
  } = useFormActions();

  const variant = question.type === "matrix_checkbox" ? "checkbox" : "radio";
  const requireAllRows = question.scale?.requireAllRows !== false;

  return (
    <div className="field-matrix">
      <div className="field-matrix-section">
        <span className="field-matrix-section-label">Rows</span>

        {question.rows.map((row, i) => (
          <div className="field-option-row" key={row.id}>
            <span className="option-marker option-marker-numbered">{i + 1}.</span>
            <input
              className="option-input"
              type="text"
              value={row.label}
              placeholder={`Row ${i + 1}`}
              onChange={(e) => updateMatrixRow(question.id, row.id, e.target.value)}
              disabled={mode === "view"}
              readOnly={mode === "view"}
            />
            {isEdit && (
              <div className="field-matrix-reorder-btns">
                <button
                  type="button"
                  className="icon-btn"
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => moveMatrixRow(question.id, row.id, -1)}
                >
                  <Icons.chevronUp />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Move down"
                  disabled={i === question.rows.length - 1}
                  onClick={() => moveMatrixRow(question.id, row.id, 1)}
                >
                  <Icons.chevronDown />
                </button>
              </div>
            )}
            {isEdit && question.rows.length > 1 && (
              <button
                type="button"
                className="icon-btn option-remove"
                onClick={() => removeMatrixRow(question.id, row.id)}
              >
                <Icons.close />
              </button>
            )}
          </div>
        ))}

        {isEdit && (
          <button type="button" className="add-option-btn" onClick={() => addMatrixRow(question.id)}>
            <Icons.plus className="option-marker" />
            Add row
          </button>
        )}
      </div>

      <div className="field-matrix-section field-matrix-columns">
        <div className="field-matrix-section-header">
          <span className="field-matrix-section-label">Columns · shared scale</span>
          {isEdit && (
            <select
              className="field-matrix-preset-select"
              value=""
              onChange={(e) => {
                if (e.target.value) applyMatrixColumnPreset(question.id, e.target.value);
              }}
            >
              <option value="">Use a preset…</option>
              {MATRIX_SCALE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="option-hint">These columns apply to every row above</p>

        {question.options.map((col, i) => (
          <div className="field-option-row" key={col.id}>
            <span className={`option-marker option-marker-${variant}`} />
            <input
              className="option-input"
              type="text"
              value={col.label}
              placeholder={`Column ${i + 1}`}
              onChange={(e) => updateMatrixColumn(question.id, col.id, { label: e.target.value })}
              disabled={mode === "view"}
              readOnly={mode === "view"}
            />
            <input
              className="field-matrix-value-input"
              type="number"
              value={col.value}
              title="Numeric value (used for row averages)"
              onChange={(e) => updateMatrixColumn(question.id, col.id, { value: Number(e.target.value) })}
              disabled={mode === "view"}
              readOnly={mode === "view"}
            />
            {isEdit && (
              <div className="field-matrix-reorder-btns">
                <button
                  type="button"
                  className="icon-btn"
                  title="Move left"
                  disabled={i === 0}
                  onClick={() => moveMatrixColumn(question.id, col.id, -1)}
                >
                  <Icons.chevronUp />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Move right"
                  disabled={i === question.options.length - 1}
                  onClick={() => moveMatrixColumn(question.id, col.id, 1)}
                >
                  <Icons.chevronDown />
                </button>
              </div>
            )}
            {isEdit && question.options.length > 1 && (
              <button
                type="button"
                className="icon-btn option-remove"
                onClick={() => removeMatrixColumn(question.id, col.id)}
              >
                <Icons.close />
              </button>
            )}
          </div>
        ))}

        {isEdit && (
          <button type="button" className="add-option-btn" onClick={() => addMatrixColumn(question.id)}>
            <span className={`option-marker option-marker-${variant}`} />
            Add column
          </button>
        )}
      </div>

      <Checkbox
        className="field-matrix-require-toggle"
        label="Require a response for every row"
        checked={requireAllRows}
        disabled={mode === "view"}
        onChange={(checked) => updateMatrixSettings(question.id, { requireAllRows: checked })}
      />
    </div>
  );
}
