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
  persona_small: [
    {
      key: "counsel",
      label: "COUNSEL",
      mode: "chat",
      placeholder: "What weighs on you?",
      hint: "Talk through something on your mind.",
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
      label: "DAILY WORD",
      mode: "generate",
      placeholder: "",
      hint: "One short encouragement for today.",
    },
    {
      key: "witness",
      label: "WITNESS",
      mode: "chat",
      placeholder: "Someone said faith is only coping…",
      hint: "Answer a challenge to faith.",
    },
  ],
  snake_policy: [
    {
      key: "autonomous-train",
      label: "AUTONOMOUS TRAIN",
      mode: "interactive_train",
      placeholder: "",
      hint: "Parallel boards.",
    },
    {
      key: "autonomous-watch",
      label: "AUTONOMOUS WATCH",
      mode: "interactive_watch",
      placeholder: "",
      hint: "Policy only.",
    },
    {
      key: "human-play",
      label: "HUMAN PLAY",
      mode: "interactive_play",
      placeholder: "",
      hint: "Keys.",
    },
    {
      key: "coach-replay",
      label: "COACH REPLAY",
      mode: "interactive_coach",
      placeholder: "",
      hint: "Replay.",
    },
    {
      key: "human-vs-ai",
      label: "HUMAN VS AI",
      mode: "interactive_arena",
      placeholder: "",
      hint: "Vs AI.",
    },
    {
      key: "dual-arena",
      label: "DUAL ARENA",
      mode: "interactive_arena",
      placeholder: "",
      hint: "Dual AI.",
    },
  ],
  coding_small: [
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
  return FALLBACK_SCENARIOS[modelKey] ?? FALLBACK_SCENARIOS.persona_small;
}

export { testModelPath as modelPath, testScenarioPath as scenarioPath } from "@/lib/testRoutes";

/** User-facing tuned model name (not registry key). */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  persona_small: "Believer",
  coding_small: "Coding Worker",
  snake_policy: "Snake Policy",
};

export function modelDisplayName(modelKey: string, apiLabel?: string | null): string {
  if (apiLabel && apiLabel !== "Persona Small") {
    return apiLabel;
  }
  return MODEL_DISPLAY_NAMES[modelKey] ?? apiLabel ?? modelKey;
}
