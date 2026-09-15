import { useEffect, useRef } from "react";
import "./Checkbox.css";

// Shared checkbox control used everywhere a plain <input type="checkbox"> would otherwise be
// hand-styled per call site. The real <input> stays in the DOM (visually hidden, not
// display:none) so it keeps native focus/keyboard/label-click behavior; a sibling span draws the
// box so every checkbox in the app looks and behaves the same.
export default function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  label,
  id,
  className = "",
  ...rest
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <label className={`ui-checkbox ${disabled ? "ui-checkbox-disabled" : ""} ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="ui-checkbox-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked, e)}
        id={id}
        {...rest}
      />
      <span className="ui-checkbox-box" aria-hidden="true" />
      {label && <span className="ui-checkbox-label">{label}</span>}
    </label>
  );
}
