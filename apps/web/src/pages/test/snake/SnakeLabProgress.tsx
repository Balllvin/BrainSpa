export function SnakeLabProgress({
  episode,
  target,
  draining,
}: {
  episode: number;
  target: number;
  draining?: boolean;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((episode / target) * 100)) : 0;

  return (
    <div className="snake-lab-progress" role="progressbar" aria-valuenow={episode} aria-valuemin={0} aria-valuemax={target}>
      <div className="snake-lab-progress-track">
        <div className="snake-lab-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="snake-lab-progress-text">
        {episode} / {target} episodes · {pct}%
        {draining ? " · finishing boards" : ""}
      </span>
    </div>
  );
}
