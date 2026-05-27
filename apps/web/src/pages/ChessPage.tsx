import { FormEvent, useState } from "react";

import { runEval } from "@/lib/backend";
import type { EvalRunResult } from "@/lib/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function ChessPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EvalRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const role = String(form.get("role") || "advisor");
    const move = String(form.get("move") || "");
    const explanation = String(form.get("explanation") || "");
    const fen = String(form.get("fen") || START_FEN);
    const answer = `${role}: ${move}. ${explanation}`.trim();
    const response = await runEval("chess", answer, fen);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Chess eval failed.");
      return;
    }
    setResult(response.data);
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h1>Chess</h1>
          <span className="tag">environment</span>
        </div>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Role</span>
            <select name="role" defaultValue="advisor">
              <option value="advisor">Advisor</option>
              <option value="player">Player</option>
              <option value="tutor">Tutor</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label className="field">
            <span>Board FEN</span>
            <input name="fen" defaultValue={START_FEN} />
          </label>
          <div className="split-fields">
            <label className="field">
              <span>Move</span>
              <input name="move" defaultValue="Nf3" />
            </label>
            <label className="field">
              <span>Goal</span>
              <input name="goal" value="legal move + clear reason" readOnly />
            </label>
          </div>
          <label className="field">
            <span>Explanation</span>
            <textarea
              name="explanation"
              rows={5}
              defaultValue="Develop the knight, fight for the center, and keep the king safe before attacking."
            />
          </label>
          <div className="btn-row">
            <button className="primary" type="submit" disabled={busy}>
              Run chess eval
            </button>
          </div>
        </form>
        {busy ? <p className="muted">Running chess eval...</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
      <section className="panel stack">
        <div className="panel-header">
          <h2>Result</h2>
          <span className={result?.passed ? "status-pill status-pill-live" : "status-pill"}>
            {result ? (result.passed ? "passed" : "needs work") : "waiting"}
          </span>
        </div>
        {result ? (
          <>
            <article className="run-card">
              <span>Score</span>
              <strong>{result.score}</strong>
              <code>{result.artifact_path}</code>
            </article>
            <div className="row-group">
              {result.comments.map((comment) => (
                <article className="data-row" key={comment.dimension}>
                  <div>
                    <span className={comment.verdict === "good" ? "status-pill status-pill-live" : "status-pill"}>
                      {comment.verdict}
                    </span>
                    <h3>{comment.dimension.replace(/_/g, " ")}</h3>
                    <p>{comment.comment}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Run a position to see rule checks, board-state validation, and explanation scoring.</p>
        )}
      </section>
    </div>
  );
}
