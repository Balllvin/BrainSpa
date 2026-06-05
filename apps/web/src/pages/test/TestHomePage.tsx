import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchBrainSpaOverview } from "@/lib/backend";
import { modelDisplayName } from "@/lib/testScenarios";
import { testModelPath } from "@/lib/testRoutes";
import type { ModelProfile } from "@/lib/types";

import { TestShell } from "./TestShell";

export function TestHomePage() {
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchBrainSpaOverview().then((response) => {
      setModels(response.overview?.models ?? []);
      setReady(true);
    });
  }, []);

  const testable = models.filter((model) => model.state !== "retired" && model.state !== "archived");

  return (
    <TestShell title="Test">
      {!ready ? <p className="test-empty">Loading…</p> : null}
      {ready && !testable.length ? (
        <p className="test-empty">
          No models ready. <Link to="/tune">Tune</Link> first.
        </p>
      ) : null}
      {ready && testable.length ? (
        <div
          className={`test-picker-grid${testable.length === 1 ? " test-picker-grid--solo" : ""}`}
        >
          {testable.map((model) => (
            <Link key={model.key} className="test-picker-card" to={testModelPath(model.key)}>
              <strong>{modelDisplayName(model.key, model.label)}</strong>
              <span className="test-picker-meta test-picker-meta--muted">
                {model.model_kind === "policy" ? model.policy_arch ?? "policy" : model.base_model}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </TestShell>
  );
}
