import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForms } from "../../features/forms/hooks/useForms";
import { formsApi } from "../../features/forms/services/formsApi";
import { downloadFormAsJson } from "../../features/forms/utils/exportForm";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { groupBySubjects } from "../../features/subjects/utils/groupBySubjects";
import SubjectSelect from "../../features/subjects/components/SubjectSelect";
import { useCloudAccount } from "../../features/cloud/hooks/useCloudAccount";
import { cloudApi } from "../../features/cloud/services/cloudApi";
import { Icons } from "./icons";
import PageHeader from "./PageHeader";
import Dialog from "../../components/Dialog/Dialog";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/Dialog/ConfirmDialog";
import GoogleSyncDialog from "../../features/cloud/components/GoogleSyncDialog";
import GoogleAuthRequiredDialog from "../../features/cloud/components/GoogleAuthRequiredDialog";
import FormCard from "./FormCard";
import TemplateGallery from "./TemplateGallery";
import SaveResponsesPrompt from "../../features/cloud/components/SaveResponsesPrompt";
import { describeCloudError } from "../../features/cloud/utils/describeCloudError";

const emptyForm = { name: "", description: "", subjectId: "" };

export default function FormsPage() {
  const navigate = useNavigate();
  const { forms, loading, error, refresh: refreshForms } = useForms();
  const { subjects } = useSubjects();
  const defaultSubjectId = subjects.find((s) => s.isDefault)?.id || "";

  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [deleteFormTarget, setDeleteFormTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [exportChoiceTarget, setExportChoiceTarget] = useState(null); // form | null
  const [exportError, setExportError] = useState(null);
  const fileInputRef = useRef(null);

  const { connected: cloudConnected, login: cloudLogin } = useCloudAccount();
  // Which import action was requested while signed out ('cloud' | 'google' | null) — the actual
  // Google sign-in happens in a separate OS-browser tab (see useCloudAccount), so this is picked
  // back up once `cloudConnected` flips true rather than right after cloudLogin() itself resolves
  // (which only means "the browser tab opened", not "signed in").
  const [pendingCloudAction, setPendingCloudAction] = useState(null);
  const [cloudLoginError, setCloudLoginError] = useState(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [cloudQuery, setCloudQuery] = useState("");
  const [cloudForms, setCloudForms] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [cloudImportingId, setCloudImportingId] = useState(null);
  const [deleteCloudTarget, setDeleteCloudTarget] = useState(null);
  // The cloud form whose latest version would overwrite local edits that were never saved to the
  // cloud — pending the host's confirmation.
  const [updateCloudTarget, setUpdateCloudTarget] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [publishError, setPublishError] = useState(null);

  const [showGoogleFormsModal, setShowGoogleFormsModal] = useState(false);
  const [googleQuery, setGoogleQuery] = useState("");
  const [googleForms, setGoogleForms] = useState([]);
  const [googleFormsLoading, setGoogleFormsLoading] = useState(false);
  const [googleFormsError, setGoogleFormsError] = useState(null);
  const [googleImportingId, setGoogleImportingId] = useState(null);
  // Set once an import succeeds but skipped some questions, or brought in responses — kept on
  // screen (rather than navigating straight to the new form) so the user actually sees what
  // came through/didn't instead of it silently vanishing.
  const [googleImportResult, setGoogleImportResult] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [refreshResult, setRefreshResult] = useState(null);
  const [changeDiffTarget, setChangeDiffTarget] = useState(null); // { form, diff } | null
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [showAuthRequiredDialog, setShowAuthRequiredDialog] = useState(false);

  useEffect(() => {
    if (!cloudConnected || !pendingCloudAction) return;
    const action = pendingCloudAction;
    setPendingCloudAction(null);
    if (action === "cloud") openCloudModal();
    else openGoogleFormsModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudConnected]);

  // Both import buttons stay visible even when signed out — clicking one now starts the Google
  // sign-in flow (same one Settings uses) instead of doing nothing, and the requested modal opens
  // itself automatically once sign-in completes (see the effect above).
  const requireCloudThen = (action) => {
    if (cloudConnected) {
      if (action === "cloud") openCloudModal();
      else openGoogleFormsModal();
      return;
    }
    setCloudLoginError(null);
    setPendingCloudAction(action);
    setShowAuthRequiredDialog(true);
  };

  const handleConfirmSignIn = async () => {
    setShowAuthRequiredDialog(false);
    try {
      await cloudLogin();
    } catch (err) {
      setCloudLoginError(describeCloudError(err));
      setPendingCloudAction(null);
    }
  };

  const handleCancelSignIn = () => {
    setShowAuthRequiredDialog(false);
    setPendingCloudAction(null);
  };

  const openGoogleFormsModal = async () => {
    setShowGoogleFormsModal(true);
    setGoogleQuery("");
    setGoogleImportResult(null);
    setGoogleFormsLoading(true);
    setGoogleFormsError(null);
    try {
      setGoogleForms(await cloudApi.listGoogleForms());
    } catch (err) {
      setGoogleFormsError(describeCloudError(err));
    } finally {
      setGoogleFormsLoading(false);
    }
  };

  const handleGoogleFormImport = async (gform) => {
    setGoogleImportingId(gform.id);
    setGoogleFormsError(null);
    try {
      const created = await cloudApi.importGoogleForm(gform.id);
      if (created.skipped?.length || created.importedResponseCount || created.unsavedCount || created.responseImportError) {
        setGoogleImportResult(created);
      } else {
        setShowGoogleFormsModal(false);
        navigate(`/forms/${created.id}`);
      }
    } catch (err) {
      setGoogleFormsError(err.body?.skipped ? `${describeCloudError(err)} (${err.body.skipped.length} unsupported question${err.body.skipped.length === 1 ? "" : "s"})` : describeCloudError(err));
    } finally {
      setGoogleImportingId(null);
    }
  };

  // Checks for structural changes first (read-only) — only shows the sync decision dialog when
  // something actually changed; otherwise goes straight to a response-only sync, same as before.
  const handleGoogleRefresh = async (target) => {
    setRefreshingId(target.id);
    setRefreshError(null);
    try {
      const diff = await cloudApi.checkGoogleFormChanges(target.id);
      if (diff.hasChanges) {
        setChangeDiffTarget({ form: target, diff });
      } else {
        const result = await cloudApi.applyGoogleFormChanges(target.id, "keep-local");
        setRefreshResult({ formTitle: target.title, formId: target.id, ...result });
        refreshForms();
      }
    } catch (err) {
      setRefreshError(describeCloudError(err));
    } finally {
      setRefreshingId(null);
    }
  };

  const applyGoogleChanges = async (decision) => {
    setApplyingChanges(true);
    setRefreshError(null);
    try {
      const result = await cloudApi.applyGoogleFormChanges(changeDiffTarget.form.id, decision);
      setRefreshResult({ formTitle: changeDiffTarget.form.title, formId: changeDiffTarget.form.id, ...result });
      setChangeDiffTarget(null);
      refreshForms();
    } catch (err) {
      setRefreshError(describeCloudError(err));
    } finally {
      setApplyingChanges(false);
    }
  };

  const openCloudModal = async () => {
    setShowCloudModal(true);
    setCloudQuery("");
    setCloudLoading(true);
    setCloudError(null);
    try {
      setCloudForms(await cloudApi.listForms());
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudLoading(false);
    }
  };

  const handleCloudImport = async (remoteForm) => {
    setCloudImportingId(remoteForm.id);
    setCloudError(null);
    try {
      const created = await cloudApi.importForm(remoteForm.id);
      setShowCloudModal(false);
      navigate(`/forms/${created.id}`);
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudImportingId(null);
    }
  };

  // Deliberately doesn't catch its own errors — ConfirmDialog already surfaces a thrown onConfirm
  // error inline and keeps itself open, the same pattern handleDeleteCloudForm below relies on.
  // Stays on the Forms page afterward (unlike a fresh import) since this is updating a form the
  // host was already managing, not introducing a new one worth jumping to.
  const handleCloudUpdate = async () => {
    await cloudApi.importForm(updateCloudTarget.id, { overwrite: true });
    setUpdateCloudTarget(null);
    setShowCloudModal(false);
    refreshForms();
  };

  // Brings this device's copy up to the cloud's latest. With unsaved local edits it asks first
  // (see handleCloudUpdate); otherwise it just updates and stays on the Forms page.
  const handleCloudPull = async (remoteForm, linkedForm) => {
    if (linkedForm.hasUnsavedCloudChanges) {
      setUpdateCloudTarget(remoteForm);
      return;
    }
    setCloudImportingId(remoteForm.id);
    setCloudError(null);
    try {
      await cloudApi.importForm(remoteForm.id);
      setShowCloudModal(false);
      refreshForms();
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudImportingId(null);
    }
  };

  // Saves local edits to a form already on the cloud, then refreshes so the cloud list and the
  // card badges reflect it.
  const handleCloudSave = async (remoteForm, linkedForm) => {
    setCloudImportingId(remoteForm.id);
    setCloudError(null);
    try {
      await cloudApi.publishForm(linkedForm.id);
      const [list] = await Promise.all([cloudApi.listForms(), refreshForms()]);
      setCloudForms(list);
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudImportingId(null);
    }
  };

  // Deliberately doesn't catch its own errors — ConfirmDialog already surfaces a thrown onConfirm
  // error inline and keeps itself open, the same pattern SessionDetailPage's
  // handleConfirmSessionAction relies on.
  const handleDeleteCloudForm = async () => {
    await cloudApi.deleteCloudForm(deleteCloudTarget.id);
    setCloudForms((prev) => prev.filter((f) => f.id !== deleteCloudTarget.id));
    setDeleteCloudTarget(null);
  };

  const handlePublish = async (target) => {
    setPublishingId(target.id);
    setPublishError(null);
    try {
      await cloudApi.publishForm(target.id);
      refreshForms();
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setPublishingId(null);
    }
  };

  // The host's answer to "save the fetched Google responses to the cloud too?". Throws on failure
  // so SaveResponsesPrompt can show it; on success the prompt disappears (count -> 0).
  const handleSaveResponsesToCloud = async (formId) => {
    await cloudApi.saveGoogleResponsesToCloud(formId);
    setRefreshResult((prev) => (prev?.formId === formId ? { ...prev, unsavedCount: 0 } : prev));
    setGoogleImportResult((prev) => (prev?.id === formId ? { ...prev, unsavedCount: 0 } : prev));
    refreshForms();
  };

  const filtered = forms.filter((f) => f.title.toLowerCase().includes(query.toLowerCase()));
  const groups = groupBySubjects(filtered, subjects, (f) => f.subjectId);

  const handleField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleDeleteFormConfirm = async () => {
    await formsApi.remove(deleteFormTarget.id);
    setDeleteFormTarget(null);
    refreshForms();
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      const created = await formsApi.import(data);
      navigate(`/forms/${created.id}`);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  // Reuses the exact same server path a JSON-file import already goes through (POST
  // /api/forms/import) — a template is just a canned {title, description, questions} payload, so
  // there's no separate "create from template" endpoint to keep in sync with that one.
  const handleCreateFromTemplate = async (template) => {
    const created = await formsApi.import({
      title: template.title,
      description: template.description || "",
      settings: {},
      questions: template.questions,
      subjectId: defaultSubjectId || null,
    });
    navigate(`/forms/${created.id}`);
  };

  // The card's export button only opens the choice (setExportChoiceTarget) — whether the file
  // carries the form's responses is asked every time, since a shareable template and a full backup
  // are both normal uses of this export.
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const created = await formsApi.create({
        title: form.name.trim(),
        description: form.description.trim(),
        subjectId: form.subjectId || defaultSubjectId || null,
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

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Forms"
        subtitle="Every form built on this server, grouped by subject."
        action={
          <div className="dash-header-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="dash-visually-hidden"
              onChange={handleImportFile}
            />
            <button type="button" className="dash-ghost-btn" disabled={importing} onClick={handleImportClick}>
              <Icons.upload />
              {importing ? "Importing…" : "Import Form"}
            </button>
            <button
              type="button"
              className="dash-ghost-btn"
              disabled={pendingCloudAction === "cloud"}
              onClick={() => requireCloudThen("cloud")}
            >
              <Icons.cloud />
              {pendingCloudAction === "cloud" ? "Waiting for Google sign-in…" : "Import from Cloud"}
            </button>
            <button
              type="button"
              className="dash-ghost-btn"
              disabled={pendingCloudAction === "google"}
              onClick={() => requireCloudThen("google")}
            >
              <Icons.fileText />
              {pendingCloudAction === "google" ? "Waiting for Google sign-in…" : "Import Google Form"}
            </button>
            <button type="button" className="dash-primary-btn" onClick={() => setShowModal(true)}>
              <Icons.plus />
              Add Form
            </button>
          </div>
        }
      />

      <div className="dash-content">
        <TemplateGallery onBlank={() => setShowModal(true)} onPick={handleCreateFromTemplate} />

        {importError && <p className="dash-form-error">{importError}</p>}
        {cloudLoginError && <p className="dash-form-error">{cloudLoginError}</p>}
        {publishError && <p className="dash-form-error">{publishError}</p>}
        {exportError && <p className="dash-form-error">{exportError}</p>}
        {refreshError && <p className="dash-form-error">{refreshError}</p>}
        {refreshResult && (
          <p className={`dash-settings-note ${refreshResult.responseImportError ? "dash-settings-note-warn" : "dash-settings-note-success"}`}>
            Synced "{refreshResult.formTitle}" from Google — {refreshResult.checkedResponseCount} response
            {refreshResult.checkedResponseCount === 1 ? "" : "s"} checked,{" "}
            {refreshResult.newResponseCount === 0 ? (
              "no new responses found"
            ) : (
              <>
                {refreshResult.newResponseCount} new response{refreshResult.newResponseCount === 1 ? "" : "s"} imported
              </>
            )}
            .
            {refreshResult.responseImportError && (
              <> Responses couldn't be pulled in: {refreshResult.responseImportError}</>
            )}
            <button type="button" className="dash-ghost-btn" onClick={() => setRefreshResult(null)} style={{ marginLeft: 8 }}>
              Dismiss
            </button>
          </p>
        )}
        {refreshResult?.unsavedCount > 0 && (
          <SaveResponsesPrompt
            count={refreshResult.unsavedCount}
            onSave={() => handleSaveResponsesToCloud(refreshResult.formId)}
            onDismiss={() => setRefreshResult((prev) => ({ ...prev, unsavedCount: 0 }))}
          />
        )}

        <div className="dash-search dash-page-search">
          <Icons.search className="dash-search-icon" />
          <input
            type="text"
            placeholder="Search forms..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <EmptyState description="Loading forms…" />
        ) : error ? (
          <EmptyState description={`Couldn't load forms — ${error}`} />
        ) : filtered.length === 0 ? (
          <EmptyState description="No forms found." />
        ) : (
          groups.map((group) => (
            <section className="dash-section" key={group.subject?.id || "unsorted"}>
              <div className="dash-section-header">
                <h2>{group.subject?.name || "General"}</h2>
                <span className="dash-item-meta">
                  {group.items.length} form{group.items.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="form-grid">
                {group.items.map((f) => (
                  <FormCard
                    key={f.id}
                    form={f}
                    cloudConnected={cloudConnected}
                    exporting={exportingId === f.id}
                    publishing={publishingId === f.id}
                    refreshing={refreshingId === f.id}
                    onExport={setExportChoiceTarget}
                    onPublish={handlePublish}
                    onRefreshGoogle={handleGoogleRefresh}
                    onDelete={(form) => setDeleteFormTarget(form)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {exportChoiceTarget && (
        <Dialog title="Export form" onClose={() => setExportChoiceTarget(null)}>
          <div className="dash-form">
            <p className="dash-form-label">
              Include the responses collected for "{exportChoiceTarget.title || "Untitled form"}" in the file? Importing
              it later will bring them back along with the form.
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

            <label className="dash-form-field">
              <span className="dash-form-label">Folder</span>
              <SubjectSelect
                className="dash-form-input"
                subjects={subjects}
                value={form.subjectId}
                onChange={handleField("subjectId")}
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

      {deleteFormTarget && (
        <ConfirmDialog
          title="Delete Form"
          message={`Delete "${deleteFormTarget.title || "Untitled form"}"? This permanently deletes it along with every session and response under it.`}
          confirmLabel="Delete Form"
          onCancel={() => setDeleteFormTarget(null)}
          onConfirm={handleDeleteFormConfirm}
        />
      )}

      {showCloudModal && (
        <Dialog title="Import from Cloud" className="import-dialog" onClose={() => setShowCloudModal(false)}>
          <div className="import-picker">
            {cloudError && <p className="dash-form-error">{cloudError}</p>}

            {!cloudLoading && cloudForms.length > 0 && (
              <div className="import-search">
                <Icons.search />
                <input
                  type="text"
                  placeholder="Search your cloud forms..."
                  value={cloudQuery}
                  onChange={(e) => setCloudQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {cloudLoading ? (
              <EmptyState description="Loading your forms…" />
            ) : cloudForms.length === 0 ? (
              <EmptyState description="No forms published to your account yet. Publish a form from this device first (the cloud icon on a form card), or publish one from another device signed in to the same account." />
            ) : (
              <div className="import-list">
                {cloudForms
                  .filter((rf) => (rf.title || "Untitled form").toLowerCase().includes(cloudQuery.toLowerCase()))
                  .map((rf) => {
                    // Already on this device — see importCentralFormLocally's remote_form_id dedup
                    // guard (server/cloud/routes.js). There is no version choice: the cloud copy is
                    // always its latest, and the action here is whichever brings the two in step.
                    const linkedForm = forms.find((f) => f.remoteFormId === rf.id);
                    const behind = linkedForm && rf.version > linkedForm.remoteVersion;
                    const dirty = linkedForm?.hasUnsavedCloudChanges;
                    const busy = cloudImportingId === rf.id;
                    const status = behind ? "Cloud has a newer version" : dirty ? "Unsaved changes" : linkedForm ? "Up to date" : null;
                    return (
                      <div className="import-row" key={rf.id}>
                        <span className="import-row-icon">
                          <Icons.fileText />
                        </span>
                        <span className="import-row-text">
                          <span className="import-row-title">{rf.title || "Untitled form"}</span>
                          <span className="import-row-meta">
                            {rf.questionCount} question{rf.questionCount === 1 ? "" : "s"}
                            {status && (
                              <span className={`import-row-status ${dirty || behind ? "is-attention" : "is-ok"}`}>
                                {status}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="import-row-actions">
                          {!linkedForm ? (
                            <button
                              type="button"
                              className="dash-primary-btn"
                              disabled={busy}
                              onClick={() => handleCloudImport(rf)}
                            >
                              {busy ? "Importing…" : "Import"}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="dash-ghost-btn"
                                onClick={() => {
                                  setShowCloudModal(false);
                                  navigate(`/forms/${linkedForm.id}`);
                                }}
                              >
                                Open
                              </button>
                              {behind ? (
                                <button
                                  type="button"
                                  className="dash-primary-btn"
                                  disabled={busy}
                                  onClick={() => handleCloudPull(rf, linkedForm)}
                                >
                                  {busy ? "Updating…" : "Update"}
                                </button>
                              ) : dirty ? (
                                <button
                                  type="button"
                                  className="dash-primary-btn"
                                  disabled={busy}
                                  onClick={() => handleCloudSave(rf, linkedForm)}
                                >
                                  {busy ? "Saving…" : "Save"}
                                </button>
                              ) : null}
                            </>
                          )}
                          <button
                            type="button"
                            className="import-row-delete"
                            title="Delete from cloud account"
                            aria-label="Delete from cloud account"
                            onClick={() => setDeleteCloudTarget(rf)}
                          >
                            <Icons.trash />
                          </button>
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {deleteCloudTarget && (
        <ConfirmDialog
          title="Delete from cloud account"
          message={`Delete "${deleteCloudTarget.title || "Untitled form"}" from your cloud account? This removes it and every response under it, for every device signed in to this account. This can't be undone.`}
          busyLabel="Deleting…"
          onCancel={() => setDeleteCloudTarget(null)}
          onConfirm={handleDeleteCloudForm}
        />
      )}

      {updateCloudTarget && (
        <ConfirmDialog
          title="Update form from cloud"
          message={`"${updateCloudTarget.title || "Untitled form"}" has changes on this device that aren't saved to the cloud. Updating replaces this device's copy with the cloud's latest and discards those changes. Responses already collected are kept, but one answered under a question the cloud copy no longer has won't be shown.`}
          confirmLabel="Update"
          busyLabel="Updating…"
          onCancel={() => setUpdateCloudTarget(null)}
          onConfirm={handleCloudUpdate}
        />
      )}

      {showGoogleFormsModal && (
        <Dialog title="Import Google Form" className="import-dialog" onClose={() => setShowGoogleFormsModal(false)}>
          <div className="import-picker">
            {googleFormsError && <p className="dash-form-error">{googleFormsError}</p>}

            {googleImportResult ? (
              <>
                <p className={`dash-settings-note ${googleImportResult.responseImportError ? "dash-settings-note-warn" : "dash-settings-note-success"}`}>
                  Imported "{googleImportResult.title}" — {googleImportResult.importedResponseCount || 0} response
                  {googleImportResult.importedResponseCount === 1 ? "" : "s"} brought over.
                  {googleImportResult.skipped.length
                    ? ` ${googleImportResult.skipped.length} question${googleImportResult.skipped.length === 1 ? "" : "s"} couldn't be brought over:`
                    : ""}
                  {googleImportResult.responseImportError && (
                    <> Responses couldn't be pulled in: {googleImportResult.responseImportError}</>
                  )}
                </p>
                {googleImportResult.skipped.length > 0 && (
                  <ul className="dash-form-label" style={{ margin: "0 0 16px", paddingLeft: 18 }}>
                    {googleImportResult.skipped.map((s, i) => (
                      <li key={i}>
                        {s.title} — {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {googleImportResult.unsavedCount > 0 && (
                  <SaveResponsesPrompt
                    count={googleImportResult.unsavedCount}
                    onSave={() => handleSaveResponsesToCloud(googleImportResult.id)}
                  />
                )}
                <div className="dash-modal-footer">
                  <button
                    type="button"
                    className="dash-primary-btn"
                    onClick={() => {
                      setShowGoogleFormsModal(false);
                      navigate(`/forms/${googleImportResult.id}`);
                    }}
                  >
                    Go to form
                  </button>
                </div>
              </>
            ) : googleFormsLoading ? (
              <EmptyState description="Loading your Google Forms…" />
            ) : googleForms.length === 0 ? (
              <EmptyState description="No forms found in your Google account." />
            ) : (
              <>
                <div className="import-search">
                  <Icons.search />
                  <input
                    type="text"
                    placeholder="Search your Google Forms..."
                    value={googleQuery}
                    onChange={(e) => setGoogleQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="import-list">
                  {googleForms
                    .filter((gf) => (gf.name || "Untitled form").toLowerCase().includes(googleQuery.toLowerCase()))
                    .map((gf) => {
                      // Already linked to a form on THIS device — importing again would just be a
                      // round trip to confirm what we already know locally (the cloud server itself
                      // now also dedups by google_form_id, but there's no reason to make the request
                      // at all when the answer is sitting right here in `forms`).
                      const linkedForm = forms.find((f) => f.googleFormId === gf.id);
                      return (
                        <div className="import-row" key={gf.id}>
                          <span className="import-row-icon">
                            <Icons.fileText />
                          </span>
                          <span className="import-row-text">
                            <span className="import-row-title">{gf.name || "Untitled form"}</span>
                            <span className="import-row-meta">
                              Edited {new Date(gf.modifiedTime).toLocaleDateString()}
                              {linkedForm && <span className="import-row-status is-ok">Already imported</span>}
                            </span>
                          </span>
                          <span className="import-row-actions">
                            {linkedForm ? (
                              <button
                                type="button"
                                className="dash-ghost-btn"
                                onClick={() => {
                                  setShowGoogleFormsModal(false);
                                  navigate(`/forms/${linkedForm.id}`);
                                }}
                              >
                                Open
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="dash-primary-btn"
                                disabled={googleImportingId === gf.id}
                                onClick={() => handleGoogleFormImport(gf)}
                              >
                                {googleImportingId === gf.id ? "Importing…" : "Import"}
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}

      {changeDiffTarget && (
        <GoogleSyncDialog
          diff={changeDiffTarget.diff}
          busy={applyingChanges}
          onCancel={() => setChangeDiffTarget(null)}
          onKeepLocal={() => applyGoogleChanges("keep-local")}
          onSyncFromOnline={() => applyGoogleChanges("sync-from-online")}
        />
      )}

      {showAuthRequiredDialog && (
        <GoogleAuthRequiredDialog onConfirm={handleConfirmSignIn} onCancel={handleCancelSignIn} />
      )}
    </>
  );
}
