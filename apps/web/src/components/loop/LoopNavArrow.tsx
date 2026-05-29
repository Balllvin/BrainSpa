import { Link } from "react-router-dom";

export function LoopNavArrow({ to, label }: { to: string; label: string }) {
  return (
    <Link className="loop-nav-arrow" to={to} aria-label={label}>
      ←
    </Link>
  );
}
