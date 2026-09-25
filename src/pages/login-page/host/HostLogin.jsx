import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import useAuthStore, { useAuthActions } from "../../../../store/useAuthStore";
import Button from "../../../components/ui/Button";
import HostSetup from "./HostSetup";
import "../auth-page.css";
import logo from "../../../../src/images/logo.png";

export default function HostLogin() {
  const navigate = useNavigate();
  const { login } = useAuthActions();
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const serverError = useAuthStore((s) => s.error);
  const isChecking = useAuthStore((s) => s.isChecking);
  const needsSetup = useAuthStore((s) => s.needsSetup);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState(null);

  // Wait for the initial /api/auth/me check (App.jsx's checkSession) before deciding which
  // form to show — otherwise this would flash the login form for a moment on every fresh
  // install, before flipping over to the setup screen once needsSetup comes back true.
  if (isChecking) return <div className="auth-content" />;
  if (needsSetup) return <HostSetup />;

  async function handleSubmit(e) {
    e.preventDefault();

    if (!password) {
      setFieldError("Password is required");
      return;
    }
    setFieldError(null);

    const ok = await login(password);
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
      <h1>Log in as a Hoster</h1>
      <p className="auth-subtitle">
        Manage your forms, sessions, and results.
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="host-password">Server password</label>
          <div className="auth-password-wrap">
            <input
              id="host-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
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
          {fieldError && <span className="auth-error">{fieldError}</span>}
          {!fieldError && serverError && <span className="auth-error">{serverError}</span>}
        </div>

        <div className="auth-row">
          <Link to="/host/recover" className="auth-link">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="auth-footer">
        Filling out a form instead?{" "}
        <Link to="/respondent/login">Continue as a Responder</Link>
      </p>
    </div>
  );
}
