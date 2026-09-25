import { Link } from "react-router-dom";
import { formatRelative } from "../../features/sessions/utils/time";
import { Icons } from "./icons";
import "./form-card.css";

// Where this form lives, as one small status pill — what the host most needs to know at a glance
// is whether the cloud copy is in step with what's on this device.
function cloudStatus(form) {
  if (form.googleFormId) {
    return form.hasUnsavedCloudChanges
      ? { tone: "attention", label: "Google Forms · unsaved changes", title: "Changed since it was last saved to the cloud" }
      : { tone: "solid", label: "Google Forms", title: "Imported from Google Forms" };
  }
  if (form.remoteFormId) {
    return form.hasUnsavedCloudChanges
      ? { tone: "attention", label: "Cloud · unsaved changes", title: "Changed since it was last saved to the cloud" }
      : { tone: "solid", label: "Cloud · up to date", title: "In step with your cloud account" };
  }
  return { tone: "muted", label: "Local only", title: "Only on this device" };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function FormCard({
  form,
  cloudConnected,
  exporting,
  publishing,
  refreshing,
  onExport,
  onPublish,
  onRefreshGoogle,
  onDelete,
}) {
  const status = cloudStatus(form);
  const publishLabel = form.hasUnsavedCloudChanges
    ? "Save changes to your cloud account"
    : form.remoteFormId
      ? "Save to your cloud account"
      : "Publish to your cloud account";

  return (
    <article className="form-card">
      <Link className="form-card-main" to={`/forms/${form.id}`}>
        <div className="form-card-top">
          <span className="form-card-icon" aria-hidden="true">
            <Icons.fileText />
          </span>
          <span className={`form-card-status form-card-status-${status.tone}`} title={status.title}>
            <span className="form-card-status-dot" aria-hidden="true" />
            {status.label}
          </span>
        </div>

        <h3 className="form-card-title">{form.title || "Untitled form"}</h3>
        <p className={`form-card-desc ${form.description ? "" : "is-empty"}`}>
          {form.description || "No description"}
        </p>
      </Link>

      {form.unsavedResponseCount > 0 && (
        <p className="form-card-alert" title="Fetched from Google and saved on this device only">
          <Icons.cloud />
          {plural(form.unsavedResponseCount, "response")} not saved to cloud yet
        </p>
      )}

      <dl className="form-card-stats">
        <div>
          <dt>Questions</dt>
          <dd>{form.questionCount}</dd>
        </div>
        <div>
          <dt>Responses</dt>
          <dd>{form.responseCount}</dd>
        </div>
        <div>
          <dt>Latest</dt>
          <dd>{form.lastResponseAt ? formatRelative(form.lastResponseAt, { short: true }) : "—"}</dd>
        </div>
      </dl>

      <footer className="form-card-footer">
        <span className="form-card-updated" title={new Date(form.updatedAt).toLocaleString()}>
          Edited {formatRelative(form.updatedAt)}
        </span>
        <div className="form-card-actions">
          <button
            type="button"
            className="form-card-action"
            title="Export as JSON"
            aria-label="Export as JSON"
            disabled={exporting}
            onClick={() => onExport(form)}
          >
            <Icons.download />
          </button>
          {cloudConnected && (
            <button
              type="button"
              className={`form-card-action ${form.hasUnsavedCloudChanges ? "is-attention" : ""}`}
              title={publishLabel}
              aria-label={publishLabel}
              disabled={publishing}
              onClick={() => onPublish(form)}
            >
              <Icons.cloud />
            </button>
          )}
          {cloudConnected && form.googleFormId && (
            <button
              type="button"
              className="form-card-action"
              title="Pull in new questions and responses from Google Forms"
              aria-label="Sync from Google Forms"
              disabled={refreshing}
              onClick={() => onRefreshGoogle(form)}
            >
              <Icons.refresh />
            </button>
          )}
          <button
            type="button"
            className="form-card-action form-card-action-danger"
            title="Delete form"
            aria-label="Delete form"
            onClick={() => onDelete(form)}
          >
            <Icons.trash />
          </button>
        </div>
      </footer>
    </article>
  );
}
