import { Link } from "react-router-dom";

export function TuneNavArrow({ to, label }: { to: string; label: string }) {
  return (
    <Link className="tune-nav-arrow" to={to} aria-label={label}>
      ←
    </Link>
  );
}
