import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { fetchTestScenarios } from "@/lib/backend";
import { fallbackScenarios } from "@/lib/testScenarios";
import { canonicalModelSlug, modelKeyFromSlug, testScenarioPath } from "@/lib/testRoutes";
import type { TestScenarioMode } from "@/lib/testScenarios";

import { TestChatEnvironment } from "./TestChatEnvironment";
import { TestGenerateEnvironment } from "./TestGenerateEnvironment";
import { TestInteractiveTrain } from "./TestInteractiveTrain";
import { TestInteractiveWatch } from "./TestInteractiveWatch";
import { TestInteractivePlay } from "./TestInteractivePlay";
import { TestInteractiveCoach } from "./TestInteractiveCoach";
import { TestInteractiveArena } from "./TestInteractiveArena";

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

  if (mode === "interactive_train") {
    return <TestInteractiveTrain modelKey={modelKey} />;
  }

  if (mode === "interactive_watch") {
    return <TestInteractiveWatch modelKey={modelKey} scenarioKey={scenarioKey} />;
  }

  if (mode === "interactive_play") {
    return <TestInteractivePlay modelKey={modelKey} scenarioKey={scenarioKey} />;
  }

  if (mode === "interactive_arena") {
    return <TestInteractiveArena modelKey={modelKey} scenarioKey={scenarioKey} />;
  }

  if (mode === "interactive_coach") {
    return <TestInteractiveCoach modelKey={modelKey} />;
  }

  return <TestChatEnvironment modelKey={modelKey} scenarioKey={scenarioKey} />;
}
