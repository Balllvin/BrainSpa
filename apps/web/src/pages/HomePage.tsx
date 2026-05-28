import { lazy, Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { askChipmunk, fetchBrainSpaOverview } from "@/lib/backend";
import type { BrainSpaOverview, ChipmunkChatResult } from "@/lib/types";

type LoopPart = {
  key: string;
  label: string;
  operator: string;
  value: (overview: BrainSpaOverview | null) => string;
  detail: (overview: BrainSpaOverview | null) => string;
};

const LOOP_PARTS: LoopPart[] = [
  {
    key: "evidence",
    label: "Evidence",
    operator: "Source Model",
    value: (overview) => `${overview?.sources.filter((source) => source.active).length ?? 0} active`,
    detail: () => "Find the behavior proof before data exists.",
  },
  {
    key: "datasets",
    label: "Datasets",
    operator: "Data Model",
    value: (overview) => `${overview?.datasets.find((dataset) => dataset.state === "active")?.row_count ?? 0} rows`,
    detail: () => "Turn evidence into examples and preference pairs.",
  },
  {
    key: "tune",
    label: "Tune",
    operator: "Training Model",
    value: (overview) => overview?.models.find((model) => model.key === "persona_small")?.parameter_count ?? "model",
    detail: () => "Dry-run, train, and keep the artifact trail.",
  },
  {
    key: "test",
    label: "Test",
    operator: "Harness Model",
    value: (overview) => `${overview?.environments.length ?? 0} harnesses`,
    detail: () => "Put the model in an environment and score behavior.",
  },
];

const ChipmunkReactor = lazy(() =>
  import("@/components/ChipmunkReactor").then((module) => ({ default: module.ChipmunkReactor })),
);

export function HomePage() {
  const [overview, setOverview] = useState<BrainSpaOverview | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorBusy, setOperatorBusy] = useState(false);
  const [operatorResult, setOperatorResult] = useState<ChipmunkChatResult | null>(null);
  const [operatorError, setOperatorError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBrainSpaOverview().then((result) => {
      if (cancelled) return;
      setOnline(result.ok);
      setOverview(result.overview);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = online === null ? "checking" : online ? "online" : "offline";
  const showOperator = operatorOpen || operatorBusy || operatorResult !== null || operatorError !== null;

  const handleOperatorSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = operatorMessage.trim();
    if (!message || operatorBusy) return;

    setOperatorOpen(true);
    setOperatorBusy(true);
    setOperatorResult(null);
    setOperatorError(null);

    const result = await askChipmunk(message);
    if (result.ok && result.data) {
      setOperatorResult(result.data);
    } else {
      setOperatorError(result.error ?? "Chipmunk did not answer.");
    }
    setOperatorBusy(false);
  };

  const closeOperator = () => {
    setOperatorOpen(false);
    setOperatorResult(null);
    setOperatorError(null);
  };

  return (
    <div className="loop-home">
      <h1 className="visually-hidden">Brain Spa loop</h1>
      <section className={`loop-stage loop-stage-${status}`} aria-label="Brain Spa loop">
        <button
          className="loop-reactor-trigger"
          type="button"
          aria-label="Open Chipmunk operator"
          onClick={() => setOperatorOpen(true)}
        >
          <Suspense fallback={<div className="reactor-3d reactor-3d-loading" />}>
            <ChipmunkReactor status={status} intensity={showOperator ? "active" : "idle"} />
          </Suspense>
        </button>

        {LOOP_PARTS.map((part) => (
          <article className={`loop-cell loop-cell-${part.key}`} key={part.key}>
            <span>{part.label}</span>
            <strong>{part.value(overview)}</strong>
            <p>{part.detail(overview)}</p>
            <small>{part.operator}</small>
          </article>
        ))}

        <aside className={`operator-panel ${showOperator ? "operator-panel-open" : ""}`} aria-hidden={!showOperator}>
          <div className="operator-panel-header">
            <span>Operator</span>
            <button type="button" onClick={closeOperator}>
              Hide
            </button>
          </div>
          <form className="operator-form" onSubmit={handleOperatorSubmit}>
            <label htmlFor="chipmunk-request">Tell Chipmunk what to do.</label>
            <textarea
              id="chipmunk-request"
              value={operatorMessage}
              onChange={(event) => setOperatorMessage(event.target.value)}
              placeholder="Build a harness for the next behavior test."
              rows={5}
            />
            <button type="submit" disabled={operatorBusy || operatorMessage.trim().length === 0}>
              {operatorBusy ? "Working" : "Send"}
            </button>
          </form>
          {operatorBusy ? (
            <div className="operator-log">
              <span>Active</span>
              <p>Routing request through the loop.</p>
            </div>
          ) : null}
          {operatorError ? (
            <div className="operator-log operator-log-error">
              <span>Missing</span>
              <p>{operatorError}</p>
            </div>
          ) : null}
          {operatorResult ? (
            <div className="operator-log">
              <span>{operatorResult.routed_to}</span>
              <p>{operatorResult.reply}</p>
              {operatorResult.suggested_actions.length > 0 ? (
                <ul>
                  {operatorResult.suggested_actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>

    </div>
  );
}
