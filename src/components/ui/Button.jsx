import "./Button.css";

// Shared button — consolidates what used to be several near-identical per-page button
// classes (host-login-submit, respondent-login-submit, dash-primary-btn, dash-ghost-btn,
// dash-danger-btn) into one component so every button in the app shares hover/active/
// disabled/focus behavior. `as` lets it render as a Link/anchor while keeping the same look.
export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  as: Component = "button",
  className = "",
  ...rest
}) {
  const classes = [
    "ui-btn",
    `ui-btn-${variant}`,
    `ui-btn-${size}`,
    fullWidth ? "ui-btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component className={classes} {...rest} />;
}
