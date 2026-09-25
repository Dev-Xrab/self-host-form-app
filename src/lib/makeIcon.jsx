// Shared inline-SVG icon factory. Both FormComponents/icons.jsx (builder UI) and
// dashboard-page/icons.jsx (dashboard UI) built their own copy of this exact function
// with a different default className — this is the one implementation both import now.
export default function makeIcon(paths, baseClassName = "icon") {
  return function IconComponent({ className = "", ...rest }) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${baseClassName} ${className}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}
