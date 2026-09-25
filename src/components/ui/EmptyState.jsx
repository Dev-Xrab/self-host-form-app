import "./EmptyState.css";

// Shared empty/loading/error placeholder — replaces the several near-identical
// "<p className='dash-empty'>...</p>" / "<p className='import-empty'>...</p>" one-offs
// scattered across pages with one consistent look. `icon` is optional; `title` is the
// short heading ("No forms yet"), `description` the supporting line or the loading/error text.
export default function EmptyState({ icon, title, description, action, className = "" }) {
  return (
    <div className={`ui-empty ${className}`}>
      {icon && <div className="ui-empty-icon">{icon}</div>}
      {title && <p className="ui-empty-title">{title}</p>}
      {description && <p className="ui-empty-description">{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
