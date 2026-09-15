import { useMemo } from "react";
import { getMatrixMissingRows, isMatrixMultiSelect } from "../../../lib/matrixQuestions";

// Renders as one grid, never as separate per-row questions: rows share the exact same
// column/scale list, so the columns are laid out once (as the header) and every row just
// picks from it. On narrow screens the same markup restacks into a per-row option list via
// CSS (see .answer-matrix in respond-form.css) — the DOM doesn't change, only the layout.
export default function MatrixGridField({ question, value, onChange, disabled, error }) {
  const rows = question.rows || [];
  const columns = question.options || [];
  const isMultiple = isMatrixMultiSelect(question.type);
  const answers = value && typeof value === "object" ? value : {};

  const missingRowIds = useMemo(() => {
    if (!error) return null;
    return new Set(getMatrixMissingRows(question, value).map((r) => r.id));
  }, [error, question, value]);

  const setRowValue = (rowId, colId) => {
    if (isMultiple) {
      const current = Array.isArray(answers[rowId]) ? answers[rowId] : [];
      const next = current.includes(colId) ? current.filter((c) => c !== colId) : [...current, colId];
      onChange({ ...answers, [rowId]: next });
    } else {
      onChange({ ...answers, [rowId]: colId });
    }
  };

  // Many columns (e.g. a 1-10 rating) stack terribly on a phone — scroll the table
  // horizontally instead of turning it into ten radio rows per question row.
  const mobileMode = columns.length > 4 ? "scroll" : "stack";

  return (
    <div className="answer-matrix" data-mobile-mode={mobileMode} style={{ "--matrix-columns": columns.length }}>
      <div className="answer-matrix-scroll">
        <div className="matrix-grid" role="table">
          <div className="matrix-row matrix-row-header" role="row">
            <div className="matrix-cell matrix-cell-row-label" role="columnheader" />
            {columns.map((col) => (
              <div className="matrix-cell matrix-cell-col-header" role="columnheader" key={col.id}>
                {col.label}
              </div>
            ))}
          </div>

          {rows.map((row) => {
            const isRowMissing = missingRowIds?.has(row.id);
            return (
              <div className={`matrix-row ${isRowMissing ? "matrix-row-missing" : ""}`} role="row" key={row.id}>
                <div className="matrix-cell matrix-cell-row-label" role="rowheader">
                  {row.label}
                  {isRowMissing && <span className="matrix-row-missing-mark">Required</span>}
                </div>
                {columns.map((col) => {
                  const checked = isMultiple
                    ? Array.isArray(answers[row.id]) && answers[row.id].includes(col.id)
                    : answers[row.id] === col.id;
                  return (
                    <label
                      className={`matrix-cell matrix-cell-input ${checked ? "matrix-cell-input-checked" : ""}`}
                      key={col.id}
                    >
                      <input
                        type={isMultiple ? "checkbox" : "radio"}
                        name={`${question.id}-${row.id}`}
                        checked={checked}
                        onChange={() => setRowValue(row.id, col.id)}
                        disabled={disabled}
                      />
                      <span className="matrix-cell-label">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
