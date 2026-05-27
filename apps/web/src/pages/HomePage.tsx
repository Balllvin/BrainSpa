import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchBrainSpaOverview } from "@/lib/backend";
import type { BrainSpaOverview } from "@/lib/types";

type LoopPart = {
  key: string;
  label: string;
  route: string;
  operator: string;
  value: (overview: BrainSpaOverview | null) => string;
  detail: (overview: BrainSpaOverview | null) => string;
};

const LOOP_PARTS: LoopPart[] = [
  {
    key: "evidence",
    label: "Evidence",
    route: "/evidence",
    operator: "Source Model",
    value: (overview) => `${overview?.sources.filter((source) => source.active).length ?? 0} active`,
    detail: () => "Find the behavior proof before data exists.",
  },
  {
    key: "datasets",
    label: "Datasets",
    route: "/datasets",
    operator: "Data Model",
    value: (overview) => `${overview?.datasets.find((dataset) => dataset.state === "active")?.row_count ?? 0} rows`,
    detail: () => "Turn evidence into examples and preference pairs.",
  },
  {
    key: "tune",
    label: "Tune",
    route: "/tune",
    operator: "Training Model",
    value: (overview) => overview?.models.find((model) => model.key === "persona_small")?.parameter_count ?? "model",
    detail: () => "Dry-run, train, and keep the artifact trail.",
  },
  {
    key: "test",
    label: "Test",
    route: "/test",
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

  return (
    <div className="loop-home">
      <h1 className="visually-hidden">Brain Spa loop</h1>
      <section className="loop-stage" aria-label="Brain Spa loop">
        <div className={`loop-center loop-center-${status}`} aria-label="Chipmunk reactor core">
          <Suspense fallback={<div className="reactor-3d reactor-3d-loading" />}>
            <ChipmunkReactor status={status} />
          </Suspense>
        </div>

        {LOOP_PARTS.map((part) => (
          <Link className={`loop-cell loop-cell-${part.key}`} key={part.key} to={part.route}>
            <span>{part.label}</span>
            <strong>{part.value(overview)}</strong>
            <p>{part.detail(overview)}</p>
            <small>{part.operator}</small>
          </Link>
        ))}
      </section>

    </div>
  );
}
