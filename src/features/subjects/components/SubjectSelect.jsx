// Shared subject <select>. Every form always has a real subject — the server defaults a missing
// one to "General" (see server/forms/repository.js resolveSubjectId) — so this never offers a
// blank/"No subject" option, and falls back to the default subject's id whenever `value` is
// empty so the control is never shown with nothing selected.
export default function SubjectSelect({ subjects, value, onChange, className = "", ...rest }) {
  const defaultSubjectId = subjects.find((s) => s.isDefault)?.id || "";

  return (
    <select className={className} value={value || defaultSubjectId} onChange={onChange} {...rest}>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
