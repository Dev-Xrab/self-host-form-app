import { Link } from "react-router-dom";
import { formatRelative } from "../../features/sessions/utils/time";
import { Icons } from "./icons";
import "./folder-card.css";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A subject, presented as a folder — the visual counterpart to FormCard, so the Folders grid and
// the Forms grid read as one consistent system rather than two different card languages.
export default function FolderCard({ folder, onRename, onDelete }) {
  return (
    <article className="folder-card">
      <Link className="folder-card-main" to={`/dashboard/subjects/${folder.id}`}>
        <div className="folder-card-top">
          <span className="folder-card-icon" aria-hidden="true">
            <Icons.folder />
          </span>
          {folder.isDefault && <span className="folder-card-badge">Default</span>}
        </div>

        <h3 className="folder-card-title">{folder.name}</h3>
        <p className={`folder-card-code ${folder.code ? "" : "is-empty"}`}>{folder.code || "No code"}</p>
      </Link>

      <footer className="folder-card-footer">
        <span className="folder-card-count">{plural(folder.formCount, "form")}</span>
        <div className="folder-card-actions">
          <span className="folder-card-updated" title={new Date(folder.updatedAt).toLocaleString()}>
            {formatRelative(folder.updatedAt, { short: true })}
          </span>
          <button
            type="button"
            className="folder-card-action"
            title="Rename folder"
            aria-label="Rename folder"
            onClick={() => onRename(folder)}
          >
            <Icons.pencil />
          </button>
          {!folder.isDefault && (
            <button
              type="button"
              className="folder-card-action folder-card-action-danger"
              title="Delete folder"
              aria-label="Delete folder"
              onClick={() => onDelete(folder)}
            >
              <Icons.trash />
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
