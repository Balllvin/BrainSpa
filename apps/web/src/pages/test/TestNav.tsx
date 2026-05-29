import { Link } from "react-router-dom";

export function TestNavArrow({ to, label }: { to: string; label: string }) {
  return (
    <Link className="test-nav-arrow" to={to} aria-label={label}>
      ←
    </Link>
  );
}
