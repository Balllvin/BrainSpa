import { Link } from "react-router-dom";

export function DatasetsNavArrow({ to, label }: { to: string; label: string }) {
  return (
    <Link className="datasets-nav-arrow" to={to} aria-label={label}>
      ←
    </Link>
  );
}
