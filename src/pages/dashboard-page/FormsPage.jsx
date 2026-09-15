import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForms } from "../../features/forms/hooks/useForms";
import { formsApi } from "../../features/forms/services/formsApi";
import { downloadFormAsJson } from "../../features/forms/utils/exportForm";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { groupBySubjects } from "../../features/subjects/utils/groupBySubjects";
import SubjectSelect from "../../features/subjects/components/SubjectSelect";
import { useCloudAccount } from "../../features/cloud/hooks/useCloudAccount";
import { cloudApi } from "../../features/cloud/services/cloudApi";
import { Icons } from "./icons";
import { Monogram } from "./Monogram";
import PageHeader from "./PageHeader";
import Dialog from "../../components/Dialog/Dialog";
import ConfirmDialog from "../../components/Dialog/ConfirmDialog";
import GoogleSyncDialog from "../../features/cloud/components/GoogleSyncDialog";
import GoogleAuthRequiredDialog from "../../features/cloud/components/GoogleAuthRequiredDialog";
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
  const fileInputRef = useRef(null);

  const { connected: cloudConnected, login: cloudLogin } = useCloudAccount();
  // Which import action was requested while signed out ('cloud' | 'google' | null) — the actual
  // Google sign-in happens in a separate OS-browser tab (see useCloudAccount), so this is picked
  // back up once `cloudConnected` flips true rather than right after cloudLogin() itself resolves
  // (which only means "the browser tab opened", not "signed in").
  const [pendingCloudAction, setPendingCloudAction] = useState(null);
  const [cloudLoginError, setCloudLoginError] = useState(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [cloudForms, setCloudForms] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [cloudImportingId, setCloudImportingId] = useState(null);
  const [cloudVersionsById, setCloudVersionsById] = useState({});
  const [selectedVersionById, setSelectedVersionById] = useState({});
  const [deleteCloudTarget, setDeleteCloudTarget] = useState(null);
  // { remoteForm, version } | null — a picked version that differs from what's already imported
  // on this device, pending the host's confirmation before it overwrites the local copy.
  const [updateCloudTarget, setUpdateCloudTarget] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [publishError, setPublishError] = useState(null);

  const [showGoogleFormsModal, setShowGoogleFormsModal] = useState(false);
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
      if (created.skipped?.length || created.importedResponseCount || created.responseImportError) {
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
  const handleGoogleRefresh = async (e, target) => {
    e.preventDefault();
    e.stopPropagation();
    setRefreshingId(target.id);
    setRefreshError(null);
    try {
      const diff = await cloudApi.checkGoogleFormChanges(target.id);
      if (diff.hasChanges) {
        setChangeDiffTarget({ form: target, diff });
      } else {
        const result = await cloudApi.applyGoogleFormChanges(target.id, "keep-local");
        setRefreshResult({ formTitle: target.title, ...result });
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
      setRefreshResult({ formTitle: changeDiffTarget.form.title, ...result });
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
    setCloudLoading(true);
    setCloudError(null);
    try {
      const list = await cloudApi.listForms();
      setCloudForms(list);
      // Fetched upfront for every listed form rather than lazily per-dropdown-open — the typical
      // account has few enough cloud forms that this is one small batch of extra calls, not a
      // real N+1 concern, and it means the version dropdown is never itself a loading state.
      const versionEntries = await Promise.all(
        list.map(async (rf) => [rf.id, await cloudApi.listCloudFormVersions(rf.id).catch(() => [])])
      );
      setCloudVersionsById(Object.fromEntries(versionEntries));
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudLoading(false);
    }
  };

  const handleCloudImport = async (remoteForm, version) => {
    setCloudImportingId(remoteForm.id);
    setCloudError(null);
    try {
      const created = await cloudApi.importForm(remoteForm.id, version);
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
    const { remoteForm, version } = updateCloudTarget;
    await cloudApi.importForm(remoteForm.id, version);
    setUpdateCloudTarget(null);
    setShowCloudModal(false);
    refreshForms();
  };

  // Deliberately doesn't catch its own errors — ConfirmDialog already surfaces a thrown onConfirm
  // error inline and keeps itself open, the same pattern SessionDetailPage's
  // handleConfirmSessionAction relies on.
  const handleDeleteCloudForm = async () => {
    await cloudApi.deleteCloudForm(deleteCloudTarget.id);
    setCloudForms((prev) => prev.filter((f) => f.id !== deleteCloudTarget.id));
    setDeleteCloudTarget(null);
  };

  const handlePublish = async (e, target) => {
    e.preventDefault();
    e.stopPropagation();
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

  const handleExport = async (e, target) => {
    e.preventDefault();
    e.stopPropagation();
    setExportingId(target.id);
    try {
      const full = await formsApi.get(target.id);
      downloadFormAsJson(full);
    } catch {
      // best-effort — the card stays interactive either way
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
        {importError && <p className="dash-form-error">{importError}</p>}
        {cloudLoginError && <p className="dash-form-error">{cloudLoginError}</p>}
        {publishError && <p className="dash-form-error">{publishError}</p>}
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
          <p className="dash-empty">Loading forms…</p>
        ) : error ? (
          <p className="dash-empty">Couldn't load forms — {error}</p>
        ) : filtered.length === 0 ? (
          <p className="dash-empty">No forms found.</p>
        ) : (
          groups.map((group) => (
            <section className="dash-section" key={group.subject?.id || "unsorted"}>
              <div className="dash-section-header">
                <h2>{group.subject?.name || "General"}</h2>
                <span className="dash-item-meta">
                  {group.items.length} form{group.items.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="dash-card-grid">
                {group.items.map((f) => (
                  <Link
                    className="dash-item-card dash-item-card-link dash-item-card-removable"
                    key={f.id}
                    to={`/forms/${f.id}`}
                  >
                    <div className="dash-item-card-head">
                      <Monogram label={<Icons.fileText />} />
                      <div className="dash-item-card-actions">
                        <button
                          type="button"
                          className="dash-item-card-action"
                          title="Export form"
                          disabled={exportingId === f.id}
                          onClick={(e) => handleExport(e, f)}
                        >
                          <Icons.download />
                        </button>
                        {cloudConnected && (
                          <button
                            type="button"
                            className="dash-item-card-action"
                            title={f.remoteFormId ? "Publish new version to your cloud account" : "Publish to your cloud account"}
                            disabled={publishingId === f.id}
                            onClick={(e) => handlePublish(e, f)}
                          >
                            <Icons.cloud />
                          </button>
                        )}
                        {cloudConnected && f.googleFormId && (
                          <button
                            type="button"
                            className="dash-item-card-action"
                            title="Pull in new questions/responses from Google Forms"
                            disabled={refreshingId === f.id}
                            onClick={(e) => handleGoogleRefresh(e, f)}
                          >
                            <Icons.refresh />
                          </button>
                        )}
                        <button
                          type="button"
                          className="dash-item-card-action dash-item-card-action-danger"
                          title="Delete form"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteFormTarget(f);
                          }}
                        >
                          <Icons.close />
                        </button>
                      </div>
                    </div>
                    <span className="dash-item-title">{f.title || "Untitled form"}</span>
                    {f.googleFormId ? (
                      <span className="dash-item-badge" title="Imported from Google Forms">
                        Google Forms
                      </span>
                    ) : (
                      f.remoteFormId && (
                        <span className="dash-item-badge" title={`Synced with Google (v${f.remoteVersion})`}>
                          Cloud
                        </span>
                      )
                    )}
                    <span className="dash-item-divider" />
                    <span className="dash-item-meta">
                      {f.questionCount} question{f.questionCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

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
              <span className="dash-form-label">Subject</span>
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
        <Dialog title="Import from Cloud" onClose={() => setShowCloudModal(false)}>
          <div className="dash-form">
            {cloudError && <p className="dash-form-error">{cloudError}</p>}

            {cloudLoading ? (
              <p className="dash-empty">Loading your forms…</p>
            ) : cloudForms.length === 0 ? (
              <p className="dash-empty">
                No forms published to your account yet. Publish a form from this device first (the cloud icon on
                a form card), or publish one from another device signed in to the same account.
              </p>
            ) : (
              <div className="dash-card-grid">
                {cloudForms.map((rf) => {
                  const versions = cloudVersionsById[rf.id] || [];
                  // Already on this device — see importCentralFormLocally's remote_form_id dedup
                  // guard (server/cloud/routes.js). Defaults the picker to the version already
                  // imported (not "latest") so the default action reads as "Open", not "Update" —
                  // picking a different version is what turns it into one.
                  const linkedForm = forms.find((f) => f.remoteFormId === rf.id);
                  const selectedVersion =
                    selectedVersionById[rf.id] ?? linkedForm?.remoteVersion ?? rf.version;
                  const isCurrent = linkedForm && linkedForm.remoteVersion === selectedVersion;
                  return (
                    <div className="dash-item-card dash-item-card-removable" key={rf.id}>
                      <button
                        type="button"
                        className="dash-item-card-remove"
                        title="Delete from cloud account"
                        onClick={() => setDeleteCloudTarget(rf)}
                      >
                        <Icons.close />
                      </button>
                      <Monogram label={<Icons.fileText />} />
                      <span className="dash-item-title">{rf.title || "Untitled form"}</span>
                      {linkedForm && (
                        <span className="dash-item-badge" title={`This device has v${linkedForm.remoteVersion}`}>
                          {isCurrent ? "Already imported" : `You have v${linkedForm.remoteVersion}`}
                        </span>
                      )}
                      <span className="dash-item-divider" />
                      <span className="dash-item-meta">
                        {rf.questionCount} question{rf.questionCount === 1 ? "" : "s"}
                      </span>
                      {versions.length > 1 ? (
                        <label className="dash-form-field" style={{ marginTop: 8 }}>
                          <span className="dash-form-label">Version</span>
                          <select
                            className="dash-form-input"
                            value={selectedVersion}
                            onChange={(e) =>
                              setSelectedVersionById((prev) => ({ ...prev, [rf.id]: Number(e.target.value) }))
                            }
                          >
                            {versions.map((v) => (
                              <option key={v.version} value={v.version}>
                                v{v.version}
                                {v.version === rf.version ? " (latest)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="dash-item-meta">v{rf.version}</span>
                      )}
                      <div className="dash-modal-footer">
                        {isCurrent ? (
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
                        ) : linkedForm ? (
                          <button
                            type="button"
                            className="dash-primary-btn"
                            onClick={() => setUpdateCloudTarget({ remoteForm: rf, version: selectedVersion })}
                          >
                            {selectedVersion > linkedForm.remoteVersion
                              ? `Update to v${selectedVersion}`
                              : `Revert to v${selectedVersion}`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="dash-primary-btn"
                            disabled={cloudImportingId === rf.id}
                            onClick={() => handleCloudImport(rf, selectedVersionById[rf.id])}
                          >
                            {cloudImportingId === rf.id ? "Importing…" : "Import"}
                          </button>
                        )}
                      </div>
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
          message={`Replace this device's copy of "${updateCloudTarget.remoteForm.title || "Untitled form"}" with cloud v${updateCloudTarget.version}? Any local changes made since it was last imported or published will be overwritten. Responses already collected are kept either way, but one answered under a question this version doesn't have anymore won't be shown.`}
          confirmLabel="Update"
          busyLabel="Updating…"
          onCancel={() => setUpdateCloudTarget(null)}
          onConfirm={handleCloudUpdate}
        />
      )}

      {showGoogleFormsModal && (
        <Dialog title="Import Google Form" onClose={() => setShowGoogleFormsModal(false)}>
          <div className="dash-form">
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
              <p className="dash-empty">Loading your Google Forms…</p>
            ) : googleForms.length === 0 ? (
              <p className="dash-empty">No forms found in your Google account.</p>
            ) : (
              <div className="dash-card-grid">
                {googleForms.map((gf) => {
                  // Already linked to a form on THIS device — importing again would just be a
                  // round trip to confirm what we already know locally (the cloud server itself
                  // now also dedups by google_form_id, but there's no reason to make the request
                  // at all when the answer is sitting right here in `forms`).
                  const linkedForm = forms.find((f) => f.googleFormId === gf.id);
                  return (
                    <div className="dash-item-card" key={gf.id}>
                      <Monogram label={<Icons.fileText />} />
                      <span className="dash-item-title">{gf.name || "Untitled form"}</span>
                      {linkedForm && (
                        <span className="dash-item-badge" title="Already imported on this device">
                          Already imported
                        </span>
                      )}
                      <span className="dash-item-divider" />
                      <span className="dash-item-meta">
                        Edited {new Date(gf.modifiedTime).toLocaleDateString()}
                      </span>
                      <div className="dash-modal-footer">
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
                      </div>
                    </div>
                  );
                })}
              </div>
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
