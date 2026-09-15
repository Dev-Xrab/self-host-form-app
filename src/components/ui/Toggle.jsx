import "./Toggle.css";

// Shared toggle/switch control — the single "pill track + sliding knob" implementation for the
// whole app (previously duplicated with slightly different markup/colors in several places).
export default function Toggle({ checked, onChange, disabled = false, label, id, className = "" }) {
  return (
    <label className={`ui-toggle ${disabled ? "ui-toggle-disabled" : ""} ${className}`}>
      {label && <span className="ui-toggle-label">{label}</span>}
      <span className="ui-toggle-switch">
        <input
          type="checkbox"
          role="switch"
          className="ui-toggle-input"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked, e)}
          id={id}
        />
        <span className="ui-toggle-track" aria-hidden="true" />
      </span>
    </label>
  );
}
