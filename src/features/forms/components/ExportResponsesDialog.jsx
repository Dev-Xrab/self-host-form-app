import { useState } from "react";
import Dialog from "../../../components/Dialog/Dialog";
import { exportFormResponsesToWorkbook } from "../utils/exportResponses";
import { exportFormResponsesToPdf } from "../utils/exportPdf";

// Offers the two export formats for this form's full response set (every session, not just one) —
// Excel (Responses + Question Statistics sheets) or PDF (summary + analytics + detailed table).
// Both read from the exact same aggregateQuestion analytics the on-screen view uses.
export default function ExportResponsesDialog({ form, responses, subjectName, onClose }) {
  const [busy, setBusy] = useState(null); // "excel" | "pdf" | null
  const [error, setError] = useState(null);

  const handleExport = async (format) => {
    setBusy(format);
    setError(null);
    try {
      if (format === "excel") {
        await exportFormResponsesToWorkbook(form, responses, subjectName);
      } else {
        exportFormResponsesToPdf(form, responses, subjectName);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog title="Export responses" onClose={onClose}>
      <div className="dash-form">
        <p className="dash-form-label">
          Export every response to this form — {responses.length} response{responses.length === 1 ? "" : "s"} across
          every session.
        </p>
        {error && <p className="dash-form-error">{error}</p>}
        <div className="dash-modal-footer">
          <button type="button" className="dash-ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="dash-ghost-btn" disabled={!!busy} onClick={() => handleExport("pdf")}>
            {busy === "pdf" ? "Exporting…" : "Export as PDF"}
          </button>
          <button type="button" className="dash-primary-btn" disabled={!!busy} onClick={() => handleExport("excel")}>
            {busy === "excel" ? "Exporting…" : "Export as Excel"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
