import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { fetchTestScenarios } from "@/lib/backend";
import { fallbackScenarios } from "@/lib/testScenarios";
import { canonicalModelSlug, modelKeyFromSlug, testScenarioPath } from "@/lib/testRoutes";
import type { TestScenarioMode } from "@/lib/testScenarios";

import { TestChatEnvironment } from "./TestChatEnvironment";
import { TestGenerateEnvironment } from "./TestGenerateEnvironment";

export function TestEnvironmentPage() {
  const { modelSlug = "", scenarioKey = "" } = useParams();
  const modelKey = modelKeyFromSlug(modelSlug);
  const canonicalSlug = canonicalModelSlug(modelSlug);
  const [mode, setMode] = useState<TestScenarioMode | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetchTestScenarios(modelKey);
      const list =
        response.ok && response.scenarios.length
          ? response.scenarios
          : fallbackScenarios(modelKey);
      const scenario = list.find((item) => item.key === scenarioKey);
      setMode(scenario?.mode ?? "chat");
    })();
  }, [modelKey, scenarioKey]);

  if (modelSlug !== canonicalSlug) {
    return <Navigate replace to={testScenarioPath(canonicalSlug, scenarioKey)} />;
  }

  if (!mode) {
    return <p className="test-empty">Loading…</p>;
  }

  if (mode === "generate") {
    return <TestGenerateEnvironment modelKey={modelKey} scenarioKey={scenarioKey} />;
  }

  return <TestChatEnvironment modelKey={modelKey} scenarioKey={scenarioKey} />;
}
