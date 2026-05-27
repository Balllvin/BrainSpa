import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/evidence", label: "EVIDENCE", end: false },
  { to: "/datasets", label: "DATASETS", end: false },
  { to: "/tune", label: "TUNE", end: false },
  { to: "/test", label: "TEST", end: false },
  { to: "/settings", label: "SETTINGS", end: false },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <NavLink className="brand-ascii" to="/">[ BRAIN SPA ]</NavLink>
        </div>
        <nav className="topnav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
              end={item.end}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
