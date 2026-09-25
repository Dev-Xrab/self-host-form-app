import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import useAuthStore, { useAuthActions } from "../../../store/useAuthStore";
import { Icons } from "./icons";
import SyncStatus from "./SyncStatus";
import "./dashboard-page.css";
import logo from "../../images/logo.png";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "grid", end: true },
  { to: "/dashboard/sessions", label: "Sessions", icon: "clipboard" },
  { to: "/dashboard/subjects", label: "Folders", icon: "folder" },
  { to: "/dashboard/forms", label: "Forms", icon: "fileText" },
  { to: "/dashboard/export", label: "Bulk Export", icon: "download" },
  { to: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthActions();
  const hasRecoveryQuestion = useAuthStore((s) => s.hasRecoveryQuestion);
  const onSettingsPage = location.pathname === "/dashboard/settings";
  const [navOpen, setNavOpen] = useState(false);

  // Below the breakpoint where the sidebar becomes a top bar, the nav links move into a
  // collapsible dropdown (see dash-nav-toggle/dash-nav-collapsible in dashboard-page.css) —
  // always close it after a navigation so it doesn't stay open over the next page.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/host/login");
  };

  return (
    <div className="dash">
      <aside className={`dash-nav ${navOpen ? "dash-nav-open" : ""}`}>
        <div className="dash-nav-brand">
          <img

                  src={logo}
                  alt="Host login illustration"
                  id="dash-nav-logo"
                  style={{ width: "25px", height: "25px"}}
                />
          <p>Self Host Form</p>
          <button
            type="button"
            className="dash-nav-toggle"
            aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? <Icons.close /> : <Icons.menu />}
          </button>
        </div>

        <div className="dash-nav-collapsible">
          <nav className="dash-nav-list">
            {NAV_ITEMS.map((item) => {
              const Icon = Icons[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `dash-nav-item ${isActive ? "dash-nav-item-active" : ""}`}
                >
                  <Icon className="dash-nav-item-icon" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <SyncStatus />

          <button type="button" className="dash-nav-logout" onClick={handleLogout}>
            <Icons.logout className="dash-nav-item-icon" />
            Logout
          </button>
        </div>
      </aside>

      <main className="dash-main">
        {!hasRecoveryQuestion && !onSettingsPage && (
          <div className="dash-recovery-banner">
            <span>
              You haven't set a recovery question yet — without one, a forgotten password can't
              be reset.
            </span>
            <NavLink to="/dashboard/settings">Set it up</NavLink>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
