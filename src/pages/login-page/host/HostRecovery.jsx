import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../../../features/auth/services/authApi";
import Button from "../../../components/ui/Button";
import "../auth-page.css";

export default function HostRecovery() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | ready | unavailable
  const [question, setQuestion] = useState(null);

  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    authApi
      .getRecoveryQuestion()
      .then(({ question }) => {
        setQuestion(question);
        setStatus(question ? "ready" : "unavailable");
      })
      // 403: recovery is only offered on the computer running the server, never over the network.
      .catch((err) => setStatus(err.status === 403 ? "local-only" : "unavailable"));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);

    if (!answer.trim() || !newPassword) {
      setFieldError("Answer and new password are both required.");
      return;
    }
    if (newPassword.length < 8) {
      setFieldError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("New password and confirmation don't match.");
      return;
    }
    setFieldError(null);

    setSubmitting(true);
    try {
      await authApi.recoverPassword(answer.trim(), newPassword);
      setDone(true);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <div className="auth-content" />;
  }

  if (status === "local-only") {
    return (
      <div className="auth-content">
        <h1>Password recovery</h1>
        <p className="auth-subtitle">
          For security, password recovery only works on the computer running Self Host Form.
          Open the app there to reset your password.
        </p>
        <p className="auth-footer">
          <Link to="/host/login">← Back to login</Link>
        </p>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="auth-content">
        <h1>Password recovery</h1>
        <p className="auth-subtitle">
          No recovery question has been set up on this server, so it can't verify who you are.
          Ask whoever administers this server to reset it directly, or set one up under
          Settings → Security once logged back in.
        </p>
        <p className="auth-footer">
          <Link to="/host/login">← Back to login</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-content">
        <h1>Password reset</h1>
        <p className="auth-subtitle">
          Your password has been changed. Log in with your new password.
        </p>
        <Button type="button" fullWidth onClick={() => navigate("/host/login")}>
          Go to login
        </Button>
      </div>
    );
  }

  return (
    <div className="auth-content">
      <h1>Password recovery</h1>
      <p className="auth-subtitle">Answer your recovery question to set a new password.</p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="recovery-question">{question}</label>
          <input
            id="recovery-question"
            type="text"
            autoComplete="off"
            placeholder="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label htmlFor="recovery-new-password">New password</label>
          <input
            id="recovery-new-password"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="recovery-confirm-password">Confirm new password</label>
          <input
            id="recovery-confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {fieldError && <span className="auth-error">{fieldError}</span>}
        {!fieldError && serverError && <span className="auth-error">{serverError}</span>}

        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? "Resetting…" : "Reset password"}
        </Button>
      </form>

      <p className="auth-footer">
        <Link to="/host/login">← Back to login</Link>
      </p>
    </div>
  );
}
