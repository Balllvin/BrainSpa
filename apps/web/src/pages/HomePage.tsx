import { lazy, Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

import { askChipmunk, fetchBrainSpaOverview } from "@/lib/backend";
import type { BrainSpaOverview, ChipmunkChatResult } from "@/lib/types";

type LoopPart = {
  key: string;
  label: string;
  route: string;
  operator: string;
  headline: (overview: BrainSpaOverview | null) => string;
  description: (overview: BrainSpaOverview | null) => string;
  meta: (overview: BrainSpaOverview | null) => string;
};

function lastItem<T>(items: T[] | undefined): T | null {
  if (!items || items.length === 0) return null;
  return items[items.length - 1];
}

const LOOP_PARTS: LoopPart[] = [
  {
    key: "evidence",
    label: "Evidence",
    route: "/evidence",
    operator: "Source Model",
    headline: (overview) => lastItem(overview?.sources)?.label ?? "No source yet",
    description: (overview) => lastItem(overview?.sources)?.summary ?? "Add proof before generating rows.",
    meta: (overview) => {
      const source = lastItem(overview?.sources);
      return source ? `${source.kind} / ${source.active ? "active" : "inactive"}` : "waiting";
    },
  },
  {
    key: "datasets",
    label: "Datasets",
    route: "/datasets",
    operator: "Data Model",
    headline: (overview) => lastItem(overview?.datasets)?.label ?? "No dataset yet",
    description: (overview) => lastItem(overview?.datasets)?.goal ?? "Turn evidence into examples and preference pairs.",
    meta: (overview) => {
      const dataset = lastItem(overview?.datasets);
      return dataset ? `${dataset.row_count} rows / ${dataset.state}` : "waiting";
    },
  },
  {
    key: "tune",
    label: "Tune",
    route: "/tune",
    operator: "Training Model",
    headline: (overview) => overview?.models.find((model) => model.state === "active")?.label ?? lastItem(overview?.models)?.label ?? "No model yet",
    description: (overview) =>
      overview?.models.find((model) => model.state === "active")?.role ??
      lastItem(overview?.models)?.role ??
      "Dry-run, train, and keep the artifact trail.",
    meta: (overview) => {
      const model = overview?.models.find((item) => item.state === "active") ?? lastItem(overview?.models);
      return model ? `${model.parameter_count} / ${model.state}` : "waiting";
    },
  },
  {
    key: "test",
    label: "Test",
    route: "/test",
    operator: "Harness Model",
    headline: (overview) => lastItem(overview?.environments)?.label ?? "No harness yet",
    description: (overview) => lastItem(overview?.environments)?.goal ?? "Put the model in an environment and score behavior.",
    meta: (overview) => lastItem(overview?.environments)?.harness ?? "waiting",
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
          <Link className={`loop-cell loop-cell-${part.key}`} key={part.key} to={part.route}>
            <span>{part.label}</span>
            <strong>{part.headline(overview)}</strong>
            <p>{part.description(overview)}</p>
            <small>{part.meta(overview)}</small>
            <em>{part.operator}</em>
          </Link>
        ))}

        <button
          className="reactor-operator-hotspot"
          type="button"
          aria-label="Talk to Chipmunk"
          onClick={() => setOperatorOpen(true)}
        />

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
