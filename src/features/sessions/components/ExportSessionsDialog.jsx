import { useState } from "react";
import Dialog from "../../../components/Dialog/Dialog";
import Checkbox from "../../../components/ui/Checkbox";
import { Icons } from "../../../pages/dashboard-page/icons";
import "./export-dialog.css";

const FORMATS = [
  {
    id: "excel",
    name: "Excel workbook",
    ext: ".xlsx",
    icon: "table",
    desc: "Editable spreadsheet: a results summary plus one answers sheet per session. Best for grading and analysis.",
  },
  {
    id: "pdf",
    name: "PDF report",
    ext: ".pdf",
    icon: "fileText",
    desc: "Print-ready report: overview, results tables and each respondent's answers. Best for sharing and records.",
  },
];

// Asks Excel or PDF, then hands the choice to `onExport(format, { includeAnswers })`. The caller
// does the actual fetching/exporting; a thrown error is shown here and keeps the dialog open.
export default function ExportSessionsDialog({ title = "Export results", summary, onClose, onExport }) {
  const [format, setFormat] = useState("excel");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await onExport(format, { includeAnswers });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <div className="dash-form export-dialog">
        {summary && <p className="export-dialog-summary">{summary}</p>}

        <div className="export-dialog-options" role="radiogroup" aria-label="Export format">
          {FORMATS.map((f) => {
            const Icon = Icons[f.icon];
            const active = format === f.id;
            return (
              <button
                type="button"
                key={f.id}
                role="radio"
                aria-checked={active}
                className={`export-dialog-option ${active ? "is-active" : ""}`}
                onClick={() => setFormat(f.id)}
              >
                <span className="export-dialog-option-icon">
                  <Icon />
                </span>
                <span className="export-dialog-option-text">
                  <span className="export-dialog-option-name">
                    {f.name} <em>{f.ext}</em>
                  </span>
                  <span className="export-dialog-option-desc">{f.desc}</span>
                </span>
                <span className="export-dialog-radio" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        {format === "pdf" && (
          <Checkbox
            checked={includeAnswers}
            onChange={(checked) => setIncludeAnswers(checked)}
            label="Include every respondent's answers (longer report)"
          />
        )}

        {error && <p className="dash-form-error">{error}</p>}

        <div className="dash-modal-footer">
          <button type="button" className="dash-ghost-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="dash-primary-btn" onClick={handleExport} disabled={busy}>
            <Icons.download />
            {busy ? "Exporting…" : `Export ${format === "pdf" ? "PDF" : "Excel"}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
