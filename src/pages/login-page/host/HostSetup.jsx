import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore, { useAuthActions } from "../../../../store/useAuthStore";
import Button from "../../../components/ui/Button";
import "../auth-page.css";
import logo from "../../../../src/images/logo.png";

// Shown instead of HostLogin when GET /api/auth/me reports needsSetup — this server has no
// owner yet, so there's no password to log in with. Replaces the old seeded-default-password
// bootstrap: the first person to reach this screen picks the real password on the spot.
export default function HostSetup() {
  const navigate = useNavigate();
  const { setup } = useAuthActions();
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const serverError = useAuthStore((s) => s.error);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!password || password.length < 8) {
      setFieldError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("Password and confirmation don't match.");
      return;
    }
    setFieldError(null);

    const ok = await setup(password);
    if (ok) navigate("/dashboard");
  }

  return (
    <div className="auth-content">
      <img
        src={logo}
        alt="Host login illustration"
        className="host-login-illustration"
        style={{ width: "50px", height: "50px", paddingBottom: "10px" }}
      />
      <h1>Create your account</h1>
      <p className="auth-subtitle">
        Nobody has set up this server yet. Choose a password to become its host — you'll use it
        to sign in from now on.
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="setup-password">Password</label>
          <div className="auth-password-wrap">
            <input
              id="setup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Choose a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldError}
              className={fieldError ? "input-error" : ""}
              autoFocus
            />
            <button
              type="button"
              className="auth-toggle"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="setup-confirm-password">Confirm password</label>
          <input
            id="setup-confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!fieldError}
            className={fieldError ? "input-error" : ""}
          />
          {fieldError && <span className="auth-error">{fieldError}</span>}
          {!fieldError && serverError && <span className="auth-error">{serverError}</span>}
        </div>

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="auth-footer">
        This password signs you in as the host of this server. You can add a recovery question
        for it later, in Settings.
      </p>
    </div>
  );
}
