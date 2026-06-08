export type TestScenarioMode =
  | "chat"
  | "generate"
  | "interactive_train"
  | "interactive_watch"
  | "interactive_play"
  | "interactive_coach"
  | "interactive_arena";

export interface TestScenario {
  key: string;
  label: string;
  mode: TestScenarioMode;
  placeholder: string;
  hint: string;
}

/** Mirrors `apps/api/brainspa_api/test_scenarios.py` when API is offline or stale. */
export const FALLBACK_SCENARIOS: Record<string, TestScenario[]> = {
  snake_policy: [
    {
      key: "autonomous-train",
      label: "AUTONOMOUS TRAIN",
      mode: "interactive_train",
      placeholder: "",
      hint: "Six boards train in parallel.",
    },
    {
      key: "autonomous-watch",
      label: "AUTONOMOUS WATCH",
      mode: "interactive_watch",
      placeholder: "",
      hint: "Policy plays solo — pick speed.",
    },
    {
      key: "human-play",
      label: "HUMAN PLAY",
      mode: "interactive_play",
      placeholder: "",
      hint: "You control the snake.",
    },
    {
      key: "coach-replay",
      label: "COACH REPLAY",
      mode: "interactive_coach",
      placeholder: "",
      hint: "Step through a saved game.",
    },
    {
      key: "human-vs-ai",
      label: "HUMAN VS AI",
      mode: "interactive_arena",
      placeholder: "",
      hint: "You vs policy on one board.",
    },
    {
      key: "dual-arena",
      label: "DUAL ARENA",
      mode: "interactive_arena",
      placeholder: "",
      hint: "Two policies head to head.",
    },
  ],
};

export function fallbackScenarios(modelKey: string): TestScenario[] {
  return FALLBACK_SCENARIOS[modelKey] ?? [];
}

/** Prefer API scenarios only when they match this model's registry harness. */
export function mergeTestScenarios(modelKey: string, apiScenarios: TestScenario[]): TestScenario[] {
  const expected = fallbackScenarios(modelKey);
  if (!expected.length) {
    return apiScenarios;
  }
  if (!apiScenarios.length) {
    return expected;
  }
  const expectedKeys = new Set(expected.map((scenario) => scenario.key));
  const overlap = apiScenarios.filter((scenario) => expectedKeys.has(scenario.key)).length;
  const minimum = Math.min(2, expectedKeys.size);
  if (overlap >= minimum) {
    return apiScenarios;
  }
  return expected;
}

export { testModelPath as modelPath, testScenarioPath as scenarioPath } from "@/lib/testRoutes";

/** User-facing tuned model name (not registry key). */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  snake_policy: "Snake Policy",
};

export function modelDisplayName(modelKey: string, apiLabel?: string | null): string {
  if (apiLabel && apiLabel !== "Persona Small") {
    return apiLabel;
  }
  return MODEL_DISPLAY_NAMES[modelKey] ?? apiLabel ?? modelKey;
}
