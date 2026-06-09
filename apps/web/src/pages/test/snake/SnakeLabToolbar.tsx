import type { SnakeLabStat } from "./SnakeTestUtils";

import { SnakeLabProgress } from "./SnakeLabProgress";

export function SnakeLabToolbar({
  stats,
  running,
  busy,
  episode,
  target,
  draining,
  onToggle,
}: {
  stats: SnakeLabStat[];
  running: boolean;
  busy: boolean;
  episode: number;
  target: number;
  draining?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="snake-lab-toolbar">
      <button
        type="button"
        className={`snake-lab-run${running ? " snake-lab-run--stop" : ""}`}
        disabled={busy}
        onClick={onToggle}
      >
        {running ? "Stop" : "Run"}
      </button>
      <div className="snake-lab-toolbar-main">
        <SnakeLabProgress episode={episode} target={target} draining={draining} />
        <dl className="snake-lab-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="snake-lab-stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
