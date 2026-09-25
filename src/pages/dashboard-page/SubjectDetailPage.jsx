import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForms } from "../../features/forms/hooks/useForms";
import { formsApi } from "../../features/forms/services/formsApi";
import { downloadFormAsJson } from "../../features/forms/utils/exportForm";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { subjectsApi } from "../../features/subjects/services/subjectsApi";
import { Icons } from "./icons";
import FormCard from "./FormCard";
import Dialog from "../../components/Dialog/Dialog";
import EmptyState from "../../components/ui/EmptyState";
import DeleteSubjectModal from "./DeleteSubjectModal";
import ConfirmDialog from "../../components/Dialog/ConfirmDialog";

const emptyForm = { name: "", description: "" };

export default function SubjectDetailPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const { subjects, refresh: refreshSubjects } = useSubjects();
  const { forms, loading, error, refresh: refreshForms } = useForms();

  const [query, setQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", code: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [showDeleteSubject, setShowDeleteSubject] = useState(false);
  const [deleteFormTarget, setDeleteFormTarget] = useState(null);

  // Same "form only" vs "include responses" choice as the Forms page export button — kept in
  // step so a form looks and behaves identically whichever grid it's opened from.
  const [exportChoiceTarget, setExportChoiceTarget] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [exportError, setExportError] = useState(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const subjectForms = forms
    .filter((f) => f.subjectId === subjectId)
    .filter((f) => f.title.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (subject) setEditForm({ name: subject.name || "", code: subject.code || "" });
  }, [subject]);

  const handleField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const handleEditField = (field) => (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await subjectsApi.update(subjectId, { name: editForm.name.trim(), code: editForm.code.trim() });
      setShowEditModal(false);
      refreshSubjects();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubjectConfirm = async (formsAction) => {
    await subjectsApi.remove(subjectId, formsAction);
    navigate("/dashboard/subjects");
  };

  const handleDeleteFormConfirm = async () => {
    await formsApi.remove(deleteFormTarget.id);
    setDeleteFormTarget(null);
    refreshForms();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const created = await formsApi.create({
        title: form.name.trim(),
        description: form.description.trim(),
        subjectId,
      });
      setForm(emptyForm);
      setShowModal(false);
      navigate(`/forms/${created.id}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const runExport = async (includeResponses) => {
    const target = exportChoiceTarget;
    setExportChoiceTarget(null);
    setExportingId(target.id);
    setExportError(null);
    try {
      const [full, responses] = await Promise.all([
        formsApi.get(target.id),
        includeResponses ? formsApi.responses(target.id) : Promise.resolve(undefined),
      ]);
      downloadFormAsJson(full, { responses });
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExportingId(null);
    }
  };

  if (!loading && !subject) {
    return (
      <>
        <header className="dash-header">
          <Link to="/dashboard/subjects" className="dash-back-link">
            <Icons.arrowLeft />
            Back to Folders
          </Link>
        </header>
        <div className="dash-content">
          <EmptyState description="This folder couldn't be found." />
        </div>
      </>
    );
  }

  return (
    <>
      <header className="dash-header">
        <Link to="/dashboard/subjects" className="dash-back-link">
          <Icons.arrowLeft />
          Back to Folders
        </Link>

        <div className="dash-header-row">
          <div>
            <span className="dash-eyebrow">
              <Icons.folder className="dash-icon" style={{ width: 13, height: 13, marginRight: 4, verticalAlign: -2 }} />
              {subject?.code || "Folder"}
            </span>
            <h1 className="dash-title">{subject?.name}</h1>
            <p className="dash-subtitle">
              {subjectForms.length} form{subjectForms.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="dash-header-actions">
            <button type="button" className="dash-ghost-btn" onClick={() => setShowEditModal(true)}>
              <Icons.pencil />
              Rename
            </button>
            {!subject?.isDefault && (
              <button
                type="button"
                className="dash-ghost-btn dash-danger-btn"
                onClick={() => setShowDeleteSubject(true)}
              >
                <Icons.trash />
                Delete Folder
              </button>
            )}
            <button type="button" className="dash-primary-btn" onClick={() => setShowModal(true)}>
              <Icons.plus />
              Add Form
            </button>
          </div>
        </div>
      </header>

      <div className="dash-content">
        {subjectForms.length > 0 && (
          <div className="dash-search dash-page-search">
            <Icons.search className="dash-search-icon" />
            <input
              type="text"
              placeholder="Search forms in this folder..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {exportError && <p className="dash-form-error">{exportError}</p>}

        {loading ? (
          <EmptyState description="Loading forms…" />
        ) : error ? (
          <EmptyState description={`Couldn't load forms — ${error}`} />
        ) : subjectForms.length === 0 ? (
          <EmptyState description={query ? `No forms match "${query}".` : "No forms in this folder yet."} />
        ) : (
          <div className="form-grid">
            {subjectForms.map((f) => (
              <FormCard
                key={f.id}
                form={f}
                // Publishing/Google-sync live on the Forms page — this view keeps the same card
                // look (title, status, stats, footer) without duplicating that machinery here.
                cloudConnected={false}
                exporting={exportingId === f.id}
                onExport={setExportChoiceTarget}
                onDelete={setDeleteFormTarget}
              />
            ))}
          </div>
        )}
      </div>

      {exportChoiceTarget && (
        <Dialog title="Export form" onClose={() => setExportChoiceTarget(null)}>
          <div className="dash-form">
            <p className="dash-form-label">
              Include the responses collected for "{exportChoiceTarget.title || "Untitled form"}" in the file?
              Importing it later will bring them back along with the form.
            </p>
            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => runExport(false)}>
                Form only
              </button>
              <button type="button" className="dash-primary-btn" onClick={() => runExport(true)}>
                Include responses
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {showModal && (
        <Dialog title="Add Form" onClose={() => setShowModal(false)}>
          <form className="dash-form" onSubmit={handleSubmit}>
            <label className="dash-form-field">
              <span className="dash-form-label">Form name</span>
              <input
                type="text"
                className="dash-form-input"
                placeholder="e.g. Midterm Feedback"
                value={form.name}
                onChange={handleField("name")}
                autoFocus
              />
            </label>

            <label className="dash-form-field">
              <span className="dash-form-label">Description</span>
              <textarea
                className="dash-form-input dash-form-textarea"
                placeholder="What is this form for?"
                rows={3}
                value={form.description}
                onChange={handleField("description")}
              />
            </label>

            {createError && <p className="dash-form-error">{createError}</p>}

            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="dash-primary-btn" disabled={creating}>
                {creating ? "Creating…" : "Create Form"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {showEditModal && (
        <Dialog title="Rename Folder" onClose={() => setShowEditModal(false)}>
          <form className="dash-form" onSubmit={handleEditSubmit}>
            <label className="dash-form-field">
              <span className="dash-form-label">Folder name</span>
              <input
                type="text"
                className="dash-form-input"
                placeholder="e.g. Data Structures"
                value={editForm.name}
                onChange={handleEditField("name")}
                autoFocus
              />
            </label>

            <label className="dash-form-field">
              <span className="dash-form-label">Folder code (optional)</span>
              <input
                type="text"
                className="dash-form-input"
                placeholder="e.g. CC104"
                value={editForm.code}
                onChange={handleEditField("code")}
              />
            </label>

            {saveError && <p className="dash-form-error">{saveError}</p>}

            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button type="submit" className="dash-primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {showDeleteSubject && subject && (
        <DeleteSubjectModal
          subject={{ ...subject, formCount: subjectForms.length }}
          onCancel={() => setShowDeleteSubject(false)}
          onConfirm={handleDeleteSubjectConfirm}
        />
      )}

      {deleteFormTarget && (
        <ConfirmDialog
          title="Delete Form"
          message={`Delete "${deleteFormTarget.title || "Untitled form"}"? This permanently deletes it along with every session and response under it.`}
          confirmLabel="Delete Form"
          onCancel={() => setDeleteFormTarget(null)}
          onConfirm={handleDeleteFormConfirm}
        />
      )}
    </>
  );
}
