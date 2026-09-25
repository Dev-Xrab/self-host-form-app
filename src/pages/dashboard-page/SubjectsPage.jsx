import { useState } from "react";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { subjectsApi } from "../../features/subjects/services/subjectsApi";
import { Icons } from "./icons";
import FolderCard from "./FolderCard";
import PageHeader from "./PageHeader";
import Dialog from "../../components/Dialog/Dialog";
import EmptyState from "../../components/ui/EmptyState";
import DeleteSubjectModal from "./DeleteSubjectModal";

const emptyForm = { name: "", code: "" };

export default function SubjectsPage() {
  const { subjects, loading, error, refresh } = useSubjects();

  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // The same form drives both "New Folder" (renameTarget null) and "Rename" (renameTarget set) —
  // one dialog, one set of fields, so renaming doesn't need its own separate implementation.
  const [renameTarget, setRenameTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = subjects.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  const handleField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      await subjectsApi.create({ name: form.name.trim(), code: form.code.trim() });
      setForm(emptyForm);
      setShowModal(false);
      refresh();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openRename = (folder) => {
    setForm({ name: folder.name, code: folder.code || "" });
    setSaveError(null);
    setRenameTarget(folder);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await subjectsApi.update(renameTarget.id, { name: form.name.trim(), code: form.code.trim() });
      setRenameTarget(null);
      refresh();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async (formsAction) => {
    await subjectsApi.remove(deleteTarget.id, formsAction);
    setDeleteTarget(null);
    refresh();
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Folders"
        subtitle="Organize your forms into folders, the same way you'd sort files."
        action={
          <button type="button" className="dash-primary-btn" onClick={() => setShowModal(true)}>
            <Icons.plus />
            New Folder
          </button>
        }
      />

      <div className="dash-content">
        <div className="dash-search dash-page-search">
          <Icons.search className="dash-search-icon" />
          <input
            type="text"
            placeholder="Search folders..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <EmptyState description="Loading folders…" />
        ) : error ? (
          <EmptyState description={`Couldn't load folders — ${error}`} />
        ) : filtered.length === 0 ? (
          <EmptyState description={`No folders match "${query}".`} />
        ) : (
          <div className="folder-grid">
            {filtered.map((subject) => (
              <FolderCard key={subject.id} folder={subject} onRename={openRename} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Dialog title="New Folder" onClose={() => setShowModal(false)}>
          <form className="dash-form" onSubmit={handleSubmit}>
            <label className="dash-form-field">
              <span className="dash-form-label">Folder name</span>
              <input
                type="text"
                className="dash-form-input"
                placeholder="e.g. Data Structures"
                value={form.name}
                onChange={handleField("name")}
                autoFocus
              />
            </label>

            <label className="dash-form-field">
              <span className="dash-form-label">Folder code (optional)</span>
              <input
                type="text"
                className="dash-form-input"
                placeholder="e.g. CC104"
                value={form.code}
                onChange={handleField("code")}
              />
            </label>

            {createError && <p className="dash-form-error">{createError}</p>}

            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className="dash-primary-btn" disabled={creating}>
                {creating ? "Creating…" : "Create Folder"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {renameTarget && (
        <Dialog title="Rename Folder" onClose={() => setRenameTarget(null)}>
          <form className="dash-form" onSubmit={handleRenameSubmit}>
            <label className="dash-form-field">
              <span className="dash-form-label">Folder name</span>
              <input
                type="text"
                className="dash-form-input"
                value={form.name}
                onChange={handleField("name")}
                autoFocus
              />
            </label>

            <label className="dash-form-field">
              <span className="dash-form-label">Folder code (optional)</span>
              <input type="text" className="dash-form-input" value={form.code} onChange={handleField("code")} />
            </label>

            {saveError && <p className="dash-form-error">{saveError}</p>}

            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={() => setRenameTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="dash-primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {deleteTarget && (
        <DeleteSubjectModal
          subject={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </>
  );
}
