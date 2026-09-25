import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForms } from "../../features/forms/hooks/useForms";
import { useSubjects } from "../../features/subjects/hooks/useSubjects";
import { useSessions } from "../../features/sessions/hooks/useSessions";
import { Icons } from "./icons";
import QrCodeThumb from "./QrCodeThumb";
import { useServerOrigin } from "./useServerOrigin";
import { useTunnel } from "../../features/tunnel/hooks/useTunnel";
import "./dashboard-home.css";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function DashboardHome() {
  const { forms } = useForms();
  const { subjects } = useSubjects();
  const { sessions, refresh } = useSessions();

  const serverAddress = useServerOrigin();
  const [copied, setCopied] = useState(false);
  const tunnel = useTunnel();
  const [tunnelCopied, setTunnelCopied] = useState(false);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(serverAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyTunnel = () => {
    navigator.clipboard?.writeText(tunnel.url).catch(() => {});
    setTunnelCopied(true);
    setTimeout(() => setTunnelCopied(false), 1500);
  };

  const activeSessions = sessions.filter((s) => s.status === "active");
  const endedSessions = sessions.filter((s) => s.status === "ended");
  const studentsInProgress = activeSessions.reduce((sum, s) => sum + s.inProgressCount, 0);

  const STATS = [
    { label: "Forms", value: forms.length, icon: "fileText", to: "/dashboard/forms" },
    { label: "Ended Sessions", value: endedSessions.length, icon: "clipboard", to: "/dashboard/sessions" },
    { label: "Folders", value: subjects.length, icon: "folder", to: "/dashboard/subjects" },
  ];

  return (
    <>
      <header className="dash-header">
        <span className="dash-eyebrow">Admin</span>
        <h1 className="dash-title">Dashboard</h1>
        <p className="dash-subtitle">Manage sessions, folders, and forms from one place.</p>
      </header>

      <div className="dash-content dh">
        <div className="dh-top-row">
          {/* ---------- Local server ---------- */}
          <div className="dh-card dh-server">
            <div className="dh-server-head">
              <span className="dh-server-icon">
                <Icons.pulse />
              </span>
              <span className="dh-status dh-status-online">
                <span className="dh-status-dot" aria-hidden="true" />
                Online
              </span>
            </div>

            <span className="dh-label">Local server</span>
            <div className="dh-address-row">
              <code title={serverAddress}>{serverAddress}</code>
              <button type="button" className="dh-icon-btn" onClick={handleCopy} title="Copy address">
                {copied ? <Icons.check /> : <Icons.copy />}
              </button>
            </div>
            {tunnel.status === "connected" && tunnel.url && (
              <div className="dh-address-row" title="Public link — reachable from outside this network">
                <code title={tunnel.url}>{tunnel.url}</code>
                <button type="button" className="dh-icon-btn" onClick={handleCopyTunnel} title="Copy public link">
                  {tunnelCopied ? <Icons.check /> : <Icons.copy />}
                </button>
              </div>
            )}
            <div className="dh-server-qr">
              <QrCodeThumb value={serverAddress} size={64} modalTitle="Scan to join server" />
              <span>Scan on a phone to join from this LAN</span>
            </div>

            <div className="dh-server-stats">
              <div>
                <strong>{activeSessions.length}</strong>
                <span>{plural(activeSessions.length, "session")} running</span>
              </div>
              <div>
                <strong>{studentsInProgress}</strong>
                <span>students connected</span>
              </div>
            </div>
          </div>

          {/* ---------- Live sessions ---------- */}
          <div className="dh-card dh-live">
            <div className="dh-card-head">
              <div>
                <h2>Live Sessions</h2>
                <p>
                  {activeSessions.length === 0
                    ? "Nothing running right now"
                    : `${plural(activeSessions.length, "session")} currently running`}
                </p>
              </div>
              <Link to="/dashboard/sessions" className="dh-view-all">
                View all
                <Icons.arrowRight />
              </Link>
            </div>

            {activeSessions.length === 0 ? (
              <div className="dh-empty">
                <span className="dh-empty-icon">
                  <Icons.clipboard />
                </span>
                <p>Start a session from a form to see it here while it's running.</p>
              </div>
            ) : (
              <div className="dh-table-wrap">
                <table className="dh-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Respondents</th>
                      <th>Time limit</th>
                      <th aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeSessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <span className="dh-person">
                            <span className="dh-avatar">
                              {(session.name || session.formTitle || "?").trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="dh-person-text">
                              <span className="dh-person-name">{session.name || "Untitled session"}</span>
                              <span className="dh-person-sub">{session.code}</span>
                            </span>
                          </span>
                        </td>
                        <td className="dh-muted">{session.submittedCount + session.inProgressCount} joined</td>
                        <td className="dh-muted">
                          {session.durationMinutes ? `${session.durationMinutes} min` : "No limit"}
                        </td>
                        <td className="dh-row-open">
                          <Link to={`/dashboard/sessions/${session.id}`} className="dh-open-link">
                            Open
                            <Icons.arrowRight />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ---------- KPI strip ---------- */}
        <div className="dh-stats">
          {STATS.map((stat) => {
            const Icon = Icons[stat.icon];
            return (
              <Link className="dh-stat" to={stat.to} key={stat.label}>
                <span className="dh-stat-icon">
                  <Icon />
                </span>
                <span className="dh-stat-text">
                  <span className="dh-stat-label">{stat.label}</span>
                  <span className="dh-stat-value">{stat.value}</span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* ---------- Folders ---------- */}
        <section className="dh-card dh-section">
          <div className="dh-card-head">
            <div>
              <h2>Folders</h2>
            </div>
            <Link to="/dashboard/subjects" className="dh-view-all">
              View all
              <Icons.arrowRight />
            </Link>
          </div>

          {subjects.length === 0 ? (
            <div className="dh-empty">
              <span className="dh-empty-icon">
                <Icons.folder />
              </span>
              <p>No folders yet — create one to start organizing your forms.</p>
            </div>
          ) : (
            <div className="dh-list">
              {subjects.slice(0, 5).map((subject) => (
                <Link className="dh-row" key={subject.id} to={`/dashboard/subjects/${subject.id}`}>
                  <span className="dh-row-icon">
                    <Icons.folder />
                  </span>
                  <span className="dh-row-text">
                    <span className="dh-row-title">{subject.name}</span>
                    {subject.code && <span className="dh-row-sub">{subject.code}</span>}
                  </span>
                  <span className="dh-row-meta">{plural(subject.formCount, "form")}</span>
                  <Icons.arrowRight className="dh-row-arrow" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Recent forms ---------- */}
        <section className="dh-card dh-section">
          <div className="dh-card-head">
            <div>
              <h2>Recent Forms</h2>
            </div>
            <Link to="/dashboard/forms" className="dh-view-all">
              View all
              <Icons.arrowRight />
            </Link>
          </div>

          {forms.length === 0 ? (
            <div className="dh-empty">
              <span className="dh-empty-icon">
                <Icons.fileText />
              </span>
              <p>No forms yet — start one from a template or a blank form.</p>
            </div>
          ) : (
            <div className="dh-list">
              {forms.slice(0, 6).map((form) => (
                <Link className="dh-row" key={form.id} to={`/forms/${form.id}`}>
                  <span className="dh-row-icon">
                    <Icons.fileText />
                  </span>
                  <span className="dh-row-text">
                    <span className="dh-row-title">{form.title || "Untitled form"}</span>
                  </span>
                  <span className="dh-row-meta">{plural(form.questionCount, "question")}</span>
                  <Icons.arrowRight className="dh-row-arrow" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
