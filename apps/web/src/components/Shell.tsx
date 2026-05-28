import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

const NAV = [
  { to: "/chipmunk", label: "CHIPMUNK", end: true },
  { to: "/workspace", label: "WORKSPACE", end: true },
  { to: "/evidence", label: "EVIDENCE", end: false },
  { to: "/datasets", label: "DATASETS", end: false },
  { to: "/tune", label: "TUNE", end: false },
  { to: "/test", label: "TEST", end: false },
  { to: "/settings", label: "SETTINGS", end: false },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const immersive = pathname === "/chipmunk";

  return (
    <div className={`shell${immersive ? " shell-immersive" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <NavLink className="brand-ascii" to="/chipmunk">[ BRAIN SPA ]</NavLink>
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
