import { NavLink, Outlet, Navigate } from "react-router-dom";

import { SettingsProvider, useAppSettings } from "@/hooks/useAppSettings";

const NAV = [
  { to: "/settings/chipmunk", label: "Chipmunk", end: false },
  { to: "/settings/connections", label: "Connections", end: false },
  { to: "/settings/agents", label: "Harnesses", end: false },
  { to: "/settings/telegram", label: "Telegram", end: false },
  { to: "/settings/models", label: "Models", end: false },
] as const;

function SettingsShell() {
  const { apiOnline, apiNeedsRestart, flash, flashError, loading } = useAppSettings();

  return (
    <div className="settings-shell">
      {apiOnline === false && !loading ? (
        <div className="settings-banner settings-banner-warn" role="status">
          API offline. Run <code className="settings-banner-code">npm run api</code> in brain spa, then reload.
        </div>
      ) : null}
      {apiNeedsRestart ? (
        <div className="settings-banner settings-banner-warn" role="status">
          API is outdated. Restart with <code className="settings-banner-code">npm run api</code>.
        </div>
      ) : null}

      <header className="settings-page-header">
        <h1>Settings</h1>
      </header>

      <nav aria-label="Settings sections" className="settings-nav">
        {NAV.map((item) => (
          <NavLink
            className={({ isActive }) => `settings-nav-link${isActive ? " settings-nav-link-active" : ""}`}
            key={item.to}
            to={item.to}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {flash ? <p className={flashError ? "error settings-flash" : "settings-note settings-flash"}>{flash}</p> : null}

      <Outlet />
    </div>
  );
}

export function SettingsLayout() {
  return (
    <SettingsProvider>
      <SettingsShell />
    </SettingsProvider>
  );
}

export function SettingsIndexRedirect() {
  return <Navigate replace to="/settings/connections" />;
}
