import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { fetchBrainSpaOverview, fetchTestScenarios } from "@/lib/backend";
import { fallbackScenarios, modelDisplayName } from "@/lib/testScenarios";
import { canonicalModelSlug, modelKeyFromSlug, testScenarioPath } from "@/lib/testRoutes";
import type { TestScenario } from "@/lib/types";

import { TestShell } from "./TestShell";

export function TestModelPage() {
  const { modelSlug = "" } = useParams();
  const modelKey = modelKeyFromSlug(modelSlug);
  const canonicalSlug = canonicalModelSlug(modelSlug);

  const [displayName, setDisplayName] = useState(() => modelDisplayName(modelKey));
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [ready, setReady] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    void fetchBrainSpaOverview().then((response) => {
      const model = response.overview?.models.find((item) => item.key === modelKey);
      setDisplayName(modelDisplayName(modelKey, model?.label));
    });
    void (async () => {
      const response = await fetchTestScenarios(modelKey);
      if (response.ok && response.scenarios.length) {
        setScenarios(response.scenarios);
        setUsedFallback(false);
      } else {
        setScenarios(fallbackScenarios(modelKey));
        setUsedFallback(true);
      }
      setReady(true);
    })();
  }, [modelKey]);

  if (modelSlug !== canonicalSlug) {
    return <Navigate replace to={`/test/${canonicalSlug}`} />;
  }

  return (
    <TestShell backTo="/test" backLabel="Test" title={displayName}>
      {ready && usedFallback ? (
        <p className="test-warn">Restart API (npm run api) for latest environments.</p>
      ) : null}
      {!ready ? <p className="test-empty">Loading…</p> : null}
      {ready ? (
        <ul className="test-scenario-list">
          {scenarios.map((scenario) => (
            <li key={scenario.key}>
              <Link className="test-scenario-link" to={testScenarioPath(modelKey, scenario.key)}>
                <span className="test-scenario-name">{formatScenarioName(scenario.label)}</span>
                <span className="test-scenario-hint">{scenario.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </TestShell>
  );
}

function formatScenarioName(label: string) {
  return label
    .split(" ")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}
