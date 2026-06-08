import type { PolicyEvalResult, PolicyPerformance, PolicyTrainJob } from "@/lib/snakeBackend";

import { careerFromPerformance, formatCareerRecord } from "../test/snake/snakeCareerMetrics";

const OUTCOME_LABELS: Record<string, string> = {
  died_wall: "Hit wall",
  died_self: "Hit itself",
  max_steps: "Too many moves",
  full_board: "Cleared board",
  other: "Other",
};

function formatScenario(key: string): string {
  return key.replace(/-/g, " ");
}

function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, " ");
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tune-policy-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DeathBars({ outcomes, total }: { outcomes: Record<string, number>; total: number }) {
  const items = [
    { key: "died_wall", count: outcomes.died_wall ?? 0 },
    { key: "died_self", count: outcomes.died_self ?? 0 },
    { key: "max_steps", count: outcomes.max_steps ?? 0 },
    { key: "full_board", count: outcomes.full_board ?? 0 },
  ].filter((item) => item.count > 0);

  if (!total || !items.length) {
    return <p className="tune-policy-empty">No finished games logged yet.</p>;
  }

  return (
    <ul className="tune-policy-deaths">
      {items.map((item) => (
        <li key={item.key}>
          <span className="tune-policy-death-label">{OUTCOME_LABELS[item.key]}</span>
          <div className="tune-policy-death-track">
            <div
              className="tune-policy-death-fill"
              style={{ width: `${Math.round((item.count / total) * 100)}%` }}
            />
          </div>
          <span className="tune-policy-death-count">
            {item.count} ({Math.round((item.count / total) * 100)}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

function ApplesChart({ episodes }: { episodes: PolicyPerformance["recent_episodes"] }) {
  const series = [...(episodes ?? [])].reverse().slice(-30);
  if (!series.length) {
    return <p className="tune-policy-empty">Play or train to see apples per game.</p>;
  }
  const max = Math.max(1, ...series.map((row) => row.apples));

  return (
    <div className="tune-policy-chart-wrap">
      <div className="tune-policy-chart" role="img" aria-label="Apples per game trend">
        {series.map((row, index) => (
          <div
            key={row.episode_id ?? index}
            className="tune-policy-chart-bar"
            style={{ height: `${Math.max(4, (row.apples / max) * 100)}%` }}
            title={`${row.apples} apples · ${outcomeLabel(row.outcome)}`}
          />
        ))}
      </div>
      <p className="tune-policy-chart-caption">Last {series.length} games · taller = more apples</p>
    </div>
  );
}

export function TunePolicyDashboard({
  perf,
  evalLatest,
  trainJob,
}: {
  perf: PolicyPerformance | null;
  evalLatest: PolicyEvalResult | null;
  trainJob: PolicyTrainJob | null;
}) {
  const games = perf?.totals?.episodes ?? perf?.dataset?.trajectory_count ?? 0;
  const steps = perf?.dataset?.transition_count ?? 0;
  const career = careerFromPerformance(perf);
  const recent = perf?.recent_50;
  const outcomes = perf?.outcomes ?? {};
  const evalBlock = evalLatest ?? perf?.eval_latest ?? null;

  const trainLabel =
    trainJob?.state === "running"
      ? `Training ${trainJob.episode ?? 0} / ${trainJob.episodes_target ?? "?"}`
      : trainJob?.state === "complete"
        ? "Last train run finished"
        : "Not training";

  return (
    <div className="tune-policy-dashboard">
      <dl className="tune-policy-summary">
        <SummaryStat label="Games finished" value={String(games)} />
        <SummaryStat label="Training steps" value={steps.toLocaleString()} />
        <SummaryStat
          label="Best game"
          value={career ? formatCareerRecord(career) : "none yet"}
        />
        <SummaryStat
          label="Last 50 games"
          value={
            recent && games
              ? `${recent.mean_apples.toFixed(1)} apples avg · length ${recent.mean_length.toFixed(1)}`
              : "waiting for games"
          }
        />
      </dl>

      <div className="tune-policy-panels">
        <section className="tune-policy-panel">
          <h2 className="tune-policy-panel-title">How games ended</h2>
          <DeathBars outcomes={outcomes} total={games} />
        </section>
        <section className="tune-policy-panel">
          <h2 className="tune-policy-panel-title">Apples per game</h2>
          <ApplesChart episodes={perf?.recent_episodes ?? []} />
        </section>
      </div>

      {evalBlock ? (
        <p className="tune-policy-eval-line">
          Last check: {evalBlock.mean_apples.toFixed(1)} apples per game ·{" "}
          {Math.round(evalBlock.full_board_rate * 100)}% cleared the board ·{" "}
          {evalBlock.passed ? "passing" : "still improving"}
        </p>
      ) : (
        <p className="tune-policy-eval-line tune-policy-eval-line--muted">No formal eval run yet.</p>
      )}

      <p className="tune-policy-train-line">{trainLabel}</p>

      {perf?.recent_episodes?.length ? (
        <div className="tune-policy-table-wrap">
          <table className="tune-policy-table">
            <thead>
              <tr>
                <th>Where</th>
                <th>Apples</th>
                <th>Moves</th>
                <th>Length</th>
                <th>Ended</th>
              </tr>
            </thead>
            <tbody>
              {perf.recent_episodes.map((row, index) => (
                <tr key={row.episode_id ?? `${row.scenario_key}-${index}`}>
                  <td>{formatScenario(row.scenario_key)}</td>
                  <td>{row.apples}</td>
                  <td>{row.moves}</td>
                  <td>{row.length}</td>
                  <td>{outcomeLabel(row.outcome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
