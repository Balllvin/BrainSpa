import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "WORK", end: true },
  { to: "/data", label: "DATA", end: false },
  { to: "/chess", label: "CHESS", end: false },
  { to: "/registry", label: "REGISTRY", end: false },
  { to: "/settings", label: "SETTINGS", end: false },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-ascii">[ BRAIN SPA ]</span>
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
