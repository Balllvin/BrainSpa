export type TestScenarioMode = "chat" | "generate";

export interface TestScenario {
  key: string;
  label: string;
  mode: TestScenarioMode;
  placeholder: string;
  hint: string;
}

/** Mirrors `apps/api/brainspa_api/test_scenarios.py` when API is offline or stale. */
export const FALLBACK_SCENARIOS: Record<string, TestScenario[]> = {
  starter_model: [
    {
      key: "counsel",
      label: "COUNSEL",
      mode: "chat",
      placeholder: "What needs to be clearer?",
      hint: "Ask for direct practical guidance.",
    },
    {
      key: "advice",
      label: "ADVICE",
      mode: "chat",
      placeholder: "What should I do when…",
      hint: "Ask what to do in a situation.",
    },
    {
      key: "daily-word",
      label: "DAILY NOTE",
      mode: "generate",
      placeholder: "",
      hint: "One short operational note for today.",
    },
    {
      key: "review",
      label: "REVIEW",
      mode: "chat",
      placeholder: "This answer feels vague…",
      hint: "Pressure-test an answer or plan.",
    },
  ],
  coding_model: [
    {
      key: "cli-task",
      label: "CLI TASK",
      mode: "chat",
      placeholder: "What should the worker do?",
      hint: "Describe a repo task to run.",
    },
  ],
};

export function fallbackScenarios(modelKey: string): TestScenario[] {
  return FALLBACK_SCENARIOS[modelKey] ?? FALLBACK_SCENARIOS.starter_model;
}

export { testModelPath as modelPath, testScenarioPath as scenarioPath } from "@/lib/testRoutes";

/** User-facing tuned model name (not registry key). */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  starter_model: "Starter",
  coding_model: "Coding Worker",
};

export function modelDisplayName(modelKey: string, apiLabel?: string | null): string {
  if (apiLabel && apiLabel !== "Persona Small") {
    return apiLabel;
  }
  return MODEL_DISPLAY_NAMES[modelKey] ?? apiLabel ?? modelKey;
}
