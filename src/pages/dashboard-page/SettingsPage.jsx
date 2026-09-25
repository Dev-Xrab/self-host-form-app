import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore, { useAuthActions } from "../../../store/useAuthStore";
import { authApi } from "../../features/auth/services/authApi";
import { settingsApi } from "../../features/settings/services/settingsApi";
import { useCloudAccount } from "../../features/cloud/hooks/useCloudAccount";
import { useTunnel } from "../../features/tunnel/hooks/useTunnel";
import Toggle from "../../components/ui/Toggle";
import { Icons } from "./icons";
import { useServerOrigin } from "./useServerOrigin";
import Dialog from "../../components/Dialog/Dialog";
import PageHeader from "./PageHeader";

const CLEAR_DATA_CONFIRM_TEXT = "DELETE";

const TOGGLES = [
  { id: "autoSave", label: "Auto-save drafts", description: "Save form and quiz edits automatically as you type.", icon: "fileText", defaultChecked: true },
];

const emptyPasswordForm = { oldPassword: "", newPassword: "", confirmPassword: "" };
const emptyRecoveryForm = { currentPassword: "", question: "", answer: "" };

export default function SettingsPage() {
  const navigate = useNavigate();
  // The address students should open — the machine's LAN address, not this window's own origin
  // (the desktop app always loads http://localhost, which nobody else can reach). Same hook the
  // Dashboard's server card and session pages use, so all three always show the same link.
  const serverAddress = useServerOrigin();
  const [copied, setCopied] = useState(false);
  const [toggles, setToggles] = useState(
    Object.fromEntries(TOGGLES.map((t) => [t.id, t.defaultChecked]))
  );

  const hasRecoveryQuestion = useAuthStore((s) => s.hasRecoveryQuestion);
  const { recoveryQuestionSet } = useAuthActions();
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [editingRecovery, setEditingRecovery] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState(emptyRecoveryForm);
  const [recoverySaving, setRecoverySaving] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);

  const { account: cloudAccount, connected: cloudConnected, loading: cloudLoading, login: cloudLogin, logout: cloudLogout } = useCloudAccount();
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState(null);

  const tunnel = useTunnel();
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelCopied, setTunnelCopied] = useState(false);

  const handleCloudLogin = async () => {
    setCloudBusy(true);
    setCloudError(null);
    try {
      await cloudLogin();
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudLogout = async () => {
    setCloudBusy(true);
    setCloudError(null);
    try {
      await cloudLogout();
    } catch (err) {
      setCloudError(err.message);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    try {
      await tunnel.start();
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    setTunnelBusy(true);
    try {
      await tunnel.stop();
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleCopyTunnel = () => {
    navigator.clipboard?.writeText(tunnel.url).catch(() => {});
    setTunnelCopied(true);
    setTimeout(() => setTunnelCopied(false), 1500);
  };

  const closeClearConfirm = () => {
    setShowClearConfirm(false);
    setClearConfirmText("");
    setClearError(null);
  };

  const handleClearData = async () => {
    if (clearConfirmText !== CLEAR_DATA_CONFIRM_TEXT || clearing) return;
    setClearing(true);
    setClearError(null);
    try {
      await settingsApi.clearData();
      navigate("/dashboard");
    } catch (err) {
      setClearError(err.message);
      setClearing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(serverAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleToggle = (id) => setToggles((prev) => ({ ...prev, [id]: !prev[id] }));

  const handlePasswordField = (field) => (e) => {
    setPasswordForm((f) => ({ ...f, [field]: e.target.value }));
    setPasswordSuccess(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!passwordForm.oldPassword || !passwordForm.newPassword) {
      setPasswordError("Current and new password are both required.");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }

    setPasswordSaving(true);
    try {
      await authApi.changePassword(passwordForm.oldPassword, passwordForm.newPassword);
      setPasswordForm(emptyPasswordForm);
      setPasswordSuccess(true);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleRecoveryField = (field) => (e) => {
    setRecoveryForm((f) => ({ ...f, [field]: e.target.value }));
    setRecoverySuccess(false);
  };

  const startEditingRecovery = () => {
    setRecoveryForm(emptyRecoveryForm);
    setRecoveryError(null);
    setEditingRecovery(true);
  };

  const cancelEditingRecovery = () => {
    setEditingRecovery(false);
    setRecoveryForm(emptyRecoveryForm);
    setRecoveryError(null);
  };

  const handleSetRecoveryQuestion = async (e) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoverySuccess(false);

    if (!recoveryForm.currentPassword || !recoveryForm.question.trim() || !recoveryForm.answer.trim()) {
      setRecoveryError("Your current password, a question, and an answer are all required.");
      return;
    }

    setRecoverySaving(true);
    try {
      await authApi.setRecoveryQuestion(
        recoveryForm.currentPassword,
        recoveryForm.question.trim(),
        recoveryForm.answer.trim()
      );
      recoveryQuestionSet();
      setRecoveryForm(emptyRecoveryForm);
      setRecoverySuccess(true);
      setEditingRecovery(false);
    } catch (err) {
      setRecoveryError(err.message);
    } finally {
      setRecoverySaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Admin" title="Settings" subtitle="Configure how this server and your account behave." />

      <div className="dash-content">
        <section className="dash-section">
          <h2 className="dash-settings-heading">Server</h2>

          <div className="dash-card dash-settings-card">
            <div className="dash-settings-row">
              <div>
                <span className="dash-settings-row-label">Local server address</span>
                <span className="dash-settings-row-desc">Share this with students on the same network.</span>
              </div>

              <div className="server-address-row dash-settings-address">
                <span className="server-address">{serverAddress}</span>
                <button type="button" className="server-copy-btn" onClick={handleCopy} title="Copy address">
                  {copied ? <Icons.check /> : <Icons.copy />}
                </button>
              </div>
            </div>
          </div>

          <div className="dash-card dash-settings-card">
            <div className="dash-settings-row">
              <div>
                <span className="dash-settings-row-label">Remote access (Internet)</span>
                <span className="dash-settings-row-desc">
                  Create a temporary public link so students can join from outside this network —
                  no router setup, no account required. Powered by a Cloudflare Quick Tunnel: the
                  link changes every time you start it, and stops working as soon as you stop it
                  or close the app.
                </span>
              </div>

              {tunnel.status === "connected" ? (
                <button
                  type="button"
                  className="dash-ghost-btn dash-danger-btn"
                  disabled={tunnelBusy}
                  onClick={handleStopTunnel}
                >
                  {tunnelBusy ? "Stopping…" : "Stop"}
                </button>
              ) : (
                <button
                  type="button"
                  className="dash-primary-btn"
                  disabled={tunnelBusy || tunnel.status === "installing" || tunnel.status === "starting"}
                  onClick={handleStartTunnel}
                >
                  <Icons.globe />
                  {tunnel.status === "installing"
                    ? "Setting up…"
                    : tunnel.status === "starting"
                      ? "Connecting…"
                      : "Start remote access"}
                </button>
              )}
            </div>

            {tunnel.status === "connected" && tunnel.url && (
              <div className="server-address-row dash-settings-address">
                <span className="server-address">{tunnel.url}</span>
                <button type="button" className="server-copy-btn" onClick={handleCopyTunnel} title="Copy link">
                  {tunnelCopied ? <Icons.check /> : <Icons.copy />}
                </button>
              </div>
            )}

            {tunnel.status === "error" && tunnel.error && <p className="dash-form-error">{tunnel.error}</p>}
          </div>
        </section>

        <section className="dash-section">
          <h2 className="dash-settings-heading">Cloud account</h2>

          <div className="dash-card dash-settings-card">
            {cloudLoading ? (
              <p className="dash-settings-note">Checking cloud connection…</p>
            ) : cloudConnected ? (
              <div className="dash-settings-row">
                <div>
                  <span className="dash-settings-row-label">{cloudAccount.name || cloudAccount.email}</span>
                  <span className="dash-settings-row-desc">
                    Signed in as {cloudAccount.email}. Forms can be imported from and published to this account.
                  </span>
                </div>
                <button type="button" className="dash-ghost-btn" disabled={cloudBusy} onClick={handleCloudLogout}>
                  <Icons.logout />
                  {cloudBusy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : (
              <div className="dash-settings-row">
                <div>
                  <span className="dash-settings-row-label">Not connected</span>
                  <span className="dash-settings-row-desc">
                    Sign in with Google to import forms from your account and publish forms from this device.
                  </span>
                </div>
                <button type="button" className="dash-primary-btn" disabled={cloudBusy} onClick={handleCloudLogin}>
                  <Icons.cloud />
                  {cloudBusy ? "Opening browser…" : "Sign in with Google"}
                </button>
              </div>
            )}

            {cloudError && <p className="dash-form-error">{cloudError}</p>}
          </div>
        </section>

        <section className="dash-section">
          <h2 className="dash-settings-heading">Preferences</h2>

          <div className="dash-card dash-settings-card">
            {TOGGLES.map((t, i) => {
              const Icon = Icons[t.icon];
              return (
                <div className={`dash-settings-row ${i > 0 ? "dash-settings-row-bordered" : ""}`} key={t.id}>
                  <div className="dash-settings-row-main">
                    <span className="dash-settings-row-icon">
                      <Icon />
                    </span>
                    <div>
                      <span className="dash-settings-row-label">{t.label}</span>
                      <span className="dash-settings-row-desc">{t.description}</span>
                    </div>
                  </div>

                  <Toggle checked={toggles[t.id]} onChange={() => handleToggle(t.id)} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="dash-section">
          <h2 className="dash-settings-heading">Security</h2>

          <div className="dash-card dash-settings-card">
            <form className="dash-form dash-password-form" onSubmit={handleChangePassword}>
              <label className="dash-form-field">
                <span className="dash-form-label">Current password</span>
                <input
                  type="password"
                  className="dash-form-input"
                  autoComplete="current-password"
                  value={passwordForm.oldPassword}
                  onChange={handlePasswordField("oldPassword")}
                />
              </label>

              <label className="dash-form-field">
                <span className="dash-form-label">New password</span>
                <input
                  type="password"
                  className="dash-form-input"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordField("newPassword")}
                />
              </label>

              <label className="dash-form-field">
                <span className="dash-form-label">Confirm new password</span>
                <input
                  type="password"
                  className="dash-form-input"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordField("confirmPassword")}
                />
              </label>

              {passwordError && <p className="dash-form-error">{passwordError}</p>}
              {passwordSuccess && <p className="dash-settings-note dash-settings-note-success">Password updated.</p>}

              <button type="submit" className="dash-primary-btn dash-password-submit" disabled={passwordSaving}>
                {passwordSaving ? "Saving…" : "Change Password"}
              </button>
            </form>
          </div>

          <div className="dash-card dash-settings-card">
            {!hasRecoveryQuestion && (
              <p className="dash-settings-note dash-settings-note-warn">
                No recovery question is set. If you forget your password, you won't be able to
                get back in without editing the database directly — set one below.
              </p>
            )}

            {hasRecoveryQuestion && !editingRecovery && (
              <div className="dash-settings-row">
                <div>
                  <span className="dash-settings-row-label">Recovery question</span>
                  <span className="dash-settings-row-desc">
                    Used on the login screen to reset your password if you forget it.
                  </span>
                </div>
                <button type="button" className="dash-ghost-btn" onClick={startEditingRecovery}>
                  Change
                </button>
              </div>
            )}

            {(!hasRecoveryQuestion || editingRecovery) && (
              <form className="dash-form dash-password-form" onSubmit={handleSetRecoveryQuestion}>
                <label className="dash-form-field">
                  <span className="dash-form-label">Recovery question</span>
                  <input
                    type="text"
                    className="dash-form-input"
                    placeholder="e.g. What was your first pet's name?"
                    value={recoveryForm.question}
                    onChange={handleRecoveryField("question")}
                  />
                </label>

                <label className="dash-form-field">
                  <span className="dash-form-label">Answer</span>
                  <input
                    type="text"
                    className="dash-form-input"
                    autoComplete="off"
                    value={recoveryForm.answer}
                    onChange={handleRecoveryField("answer")}
                  />
                </label>

                <label className="dash-form-field">
                  <span className="dash-form-label">Current password</span>
                  <input
                    type="password"
                    className="dash-form-input"
                    autoComplete="current-password"
                    value={recoveryForm.currentPassword}
                    onChange={handleRecoveryField("currentPassword")}
                  />
                </label>

                {recoveryError && <p className="dash-form-error">{recoveryError}</p>}

                <div className="dash-settings-row">
                  {editingRecovery && (
                    <button type="button" className="dash-ghost-btn" onClick={cancelEditingRecovery}>
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="dash-primary-btn dash-password-submit" disabled={recoverySaving}>
                    {recoverySaving ? "Saving…" : hasRecoveryQuestion ? "Update recovery question" : "Set recovery question"}
                  </button>
                </div>
              </form>
            )}

            {recoverySuccess && (
              <p className="dash-settings-note dash-settings-note-success" style={{ margin: "0 20px 20px" }}>
                Recovery question saved.
              </p>
            )}
          </div>
        </section>

        <section className="dash-section">
          <h2 className="dash-settings-heading">Danger zone</h2>

          <div className="dash-card dash-settings-card">
            <div className="dash-settings-row">
              <div>
                <span className="dash-settings-row-label">Clear all local data</span>
                <span className="dash-settings-row-desc">Removes quizzes, subjects, and forms from this server.</span>
              </div>

              <button
                type="button"
                className="dash-ghost-btn dash-danger-btn"
                onClick={() => setShowClearConfirm(true)}
              >
                <Icons.trash />
                Clear data
              </button>
            </div>
          </div>
        </section>
      </div>

      {showClearConfirm && (
        <Dialog title="Clear all local data" onClose={closeClearConfirm}>
          <div className="dash-form">
            <p className="dash-form-label">
              This permanently deletes every quiz, form, question, session, and response on
              this server, along with every subject except "General". This can't be undone.
            </p>

            <label className="dash-form-field">
              <span className="dash-form-label">
                Type <strong>{CLEAR_DATA_CONFIRM_TEXT}</strong> to confirm
              </span>
              <input
                type="text"
                className="dash-form-input"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </label>

            {clearError && <p className="dash-form-error">{clearError}</p>}

            <div className="dash-modal-footer">
              <button type="button" className="dash-ghost-btn" onClick={closeClearConfirm}>
                Cancel
              </button>
              <button
                type="button"
                className="dash-ghost-btn dash-danger-btn"
                onClick={handleClearData}
                disabled={clearConfirmText !== CLEAR_DATA_CONFIRM_TEXT || clearing}
              >
                {clearing ? "Clearing…" : "Clear all data"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
