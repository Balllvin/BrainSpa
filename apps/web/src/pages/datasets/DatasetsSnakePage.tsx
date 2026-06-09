import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchSnakeDatasetSummary, fetchSnakeTransitions, type SnakeTransitionRow } from "@/lib/snakeBackend";
import { datasetsHomePath } from "@/lib/datasetsRoutes";
import { testScenarioPath } from "@/lib/testRoutes";

import { DatasetsShell } from "./DatasetsShell";

const PAGE_SIZE = 20;

export function DatasetsSnakePage() {
  const [summary, setSummary] = useState<{
    trajectory_count: number;
    transition_count: number;
    trajectories_path: string;
    transitions_path: string;
  } | null>(null);
  const [rows, setRows] = useState<SnakeTransitionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    void fetchSnakeDatasetSummary().then((response) => {
      if (response.ok && response.summary) {
        setSummary(response.summary);
      }
    });
  }, []);

  useEffect(() => {
    if (summary && summary.transition_count > 0 && offset >= summary.transition_count) {
      setOffset(0);
    }
  }, [summary, offset]);

  useEffect(() => {
    void fetchSnakeTransitions(PAGE_SIZE, offset).then((response) => {
      if (response.ok) {
        setRows(response.rows);
        setTotal(response.total);
        if (response.total > 0 && offset >= response.total) {
          setOffset(0);
        }
      }
    });
  }, [offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DatasetsShell backTo={datasetsHomePath()} backLabel="Datasets" title="Snake rollout">
      <p className="test-scenario-hint">Fed by autonomous training — no Evidence step.</p>
      {summary ? (
        <article className="run-card">
          <span>Logged data</span>
          <strong>
            {summary.transition_count} transitions · {summary.trajectory_count} episodes
          </strong>
          <code>{summary.transitions_path}</code>
        </article>
      ) : (
        <p className="test-empty">No rollouts yet.</p>
      )}
      <div className="btn-row">
        <Link className="secondary" to={testScenarioPath("snake", "autonomous-train")}>
          Autonomous train
        </Link>
      </div>
      {total > 0 ? (
        <>
          <table className="datasets-snake-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Reward</th>
                <th>Profile</th>
                <th>Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.episode_id ?? "ep"}-${offset + index}`}>
                  <td>{row.action}</td>
                  <td>{row.total_reward.toFixed(2)}</td>
                  <td>{row.env_profile ?? "coords"}</td>
                  <td>{row.done ? "yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="snake-bar" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="snake-bar-btn"
              disabled={offset <= 0}
              onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            >
              ←
            </button>
            <span className="snake-telemetry">
              {page}/{pageCount} · {total} rows
            </span>
            <button
              type="button"
              className="snake-bar-btn"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((value) => value + PAGE_SIZE)}
            >
              →
            </button>
          </div>
        </>
      ) : summary && summary.transition_count === 0 ? (
        <p className="test-empty">Run autonomous train in Test to log transitions.</p>
      ) : null}
    </DatasetsShell>
  );
}
