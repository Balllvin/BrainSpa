import { PERSONA_FIELDS } from "@/lib/persona";
import type { ProjectBrief, SetupSection, WorkspaceSetupDraft } from "@/lib/types";

export const WORKSPACE_SETUP_STORAGE_KEY = "workspace-setup-draft";
export const WORKSPACE_SETUP_NOTICE_STORAGE_KEY = "workspace-setup-notice";
export const WORKSPACE_SETUP_MIN_NAME_LENGTH = 2;
export const WORKSPACE_SETUP_MIN_GOAL_LENGTH = 4;
export const WORKSPACE_SETUP_MIN_REQUIRED_BRIEF_LENGTH = 10;
export const WORKSPACE_SETUP_CORRUPTION_NOTICE =
  "A saved project setup draft could not be restored, so it was reset.";

export type WorkspaceSetupStepSlug = "start" | SetupSection;

export interface WorkspaceSetupStepDefinition {
  slug: SetupSection;
  section: SetupSection;
  label: string;
  title: string;
  description: string;
  rows: number;
  required: boolean;
}

export interface WorkspaceSetupDraftLoadResult {
  draft: WorkspaceSetupDraft | null;
  notice: string | null;
}

const STEP_COPY: Record<SetupSection, { label: string; title: string; description: string }> = {
  target_style: {
    label: "Voice",
    title: "Shape the voice.",
    description: "Keep the draft if it feels right, or tighten the point of view before moving on.",
  },
  target_behaviors: {
    label: "Behaviors",
    title: "Lock the behavior rules.",
    description: "Focus on how the project should answer, decide, and move the user forward.",
  },
  stable_traits: {
    label: "Traits",
    title: "Name the stable traits.",
    description: "Capture the qualities that should remain recognizable across many contexts.",
  },
  tone_notes: {
    label: "Tone",
    title: "Tune the tone.",
    description: "Adjust the warmth, sharpness, or formality so the voice lands consistently.",
  },
  core_values: {
    label: "Values",
    title: "State the core values.",
    description: "Make the principles explicit so the project stays aligned under pressure.",
  },
  recurring_beliefs: {
    label: "Beliefs",
    title: "Surface recurring beliefs.",
    description: "Clarify the worldview patterns the persona should return to on its own.",
  },
  humor_style: {
    label: "Humor",
    title: "Define the humor style.",
    description: "Decide whether humor is dry, playful, restrained, or mostly absent.",
  },
  relationship_stance: {
    label: "Relationship stance",
    title: "Set the relationship stance.",
    description: "Describe how the project tends to relate to the person on the other side.",
  },
  expertise_claims: {
    label: "Expertise",
    title: "Set the expertise claims.",
    description: "Keep the competence credible instead of broad or inflated.",
  },
  knowledge_limits: {
    label: "Knowledge limits",
    title: "Mark the knowledge limits.",
    description: "Say where the persona should stop pretending and start qualifying uncertainty.",
  },
  taboo_zones: {
    label: "Taboo zones",
    title: "Mark the taboo zones.",
    description: "List the lines this project should not cross, even if prompted.",
  },
  off_domain_policy: {
    label: "Off-domain policy",
    title: "Handle off-domain questions.",
    description: "Tell the project what to do when the request falls outside its lane.",
  },
  temporal_scope: {
    label: "Temporal scope",
    title: "Define the temporal scope.",
    description: "Make clear how present-day, timeless, or era-specific the voice should feel.",
  },
  uncertainty_style: {
    label: "Uncertainty style",
    title: "Define the uncertainty style.",
    description: "Control how the project says it is unsure without sounding evasive.",
  },
  avoidances: {
    label: "Avoidances",
    title: "Protect the edges.",
    description: "Spell out the drift, habits, and tonal failures the project should avoid.",
  },
};

export const WORKSPACE_SETUP_STEPS: WorkspaceSetupStepDefinition[] = PERSONA_FIELDS.map((field) => ({
  slug: field.key,
  section: field.key,
  label: STEP_COPY[field.key].label,
  title: STEP_COPY[field.key].title,
  description: STEP_COPY[field.key].description,
  rows: field.rows + (field.key === "target_style" || field.key === "target_behaviors" ? 2 : 1),
  required: Boolean(field.required),
}));

function createEmptyBrief(): ProjectBrief {
  return {
    target_style: "",
    target_behaviors: "",
    avoidances: "",
    stable_traits: "",
    tone_notes: "",
    core_values: "",
    recurring_beliefs: "",
    humor_style: "",
    relationship_stance: "",
    expertise_claims: "",
    knowledge_limits: "",
    taboo_zones: "",
    off_domain_policy: "",
    temporal_scope: "",
    uncertainty_style: "",
  };
}

export function createEmptyWorkspaceSetupDraft(): WorkspaceSetupDraft {
  return {
    name: "",
    goal: "",
    ...createEmptyBrief(),
  };
}

export function isWorkspaceSetupStepSlug(value: string): value is SetupSection {
  return WORKSPACE_SETUP_STEPS.some((step) => step.slug === value);
}

export function getWorkspaceSetupStep(slug: SetupSection): WorkspaceSetupStepDefinition {
  const match = WORKSPACE_SETUP_STEPS.find((step) => step.slug === slug);
  if (!match) {
    throw new Error(`Unknown workspace setup step: ${slug}`);
  }
  return match;
}

export function getNextWorkspaceSetupStep(slug: SetupSection): SetupSection | null {
  const index = WORKSPACE_SETUP_STEPS.findIndex((step) => step.slug === slug);
  if (index === -1 || index === WORKSPACE_SETUP_STEPS.length - 1) {
    return null;
  }
  return WORKSPACE_SETUP_STEPS[index + 1].slug;
}

export function getPreviousWorkspaceSetupStep(slug: WorkspaceSetupStepSlug): WorkspaceSetupStepSlug | null {
  if (slug === "start") {
    return null;
  }
  const index = WORKSPACE_SETUP_STEPS.findIndex((step) => step.slug === slug);
  if (index <= 0) {
    return "start";
  }
  return WORKSPACE_SETUP_STEPS[index - 1].slug;
}

export function getWorkspaceSetupProgressIndex(slug: WorkspaceSetupStepSlug): number {
  if (slug === "start") {
    return 1;
  }
  return WORKSPACE_SETUP_STEPS.findIndex((step) => step.slug === slug) + 2;
}

export function getEarliestBlockedWorkspaceSetupStep(
  draft: WorkspaceSetupDraft,
  requestedStep: SetupSection
): WorkspaceSetupStepSlug | null {
  if (draft.name.trim().length < WORKSPACE_SETUP_MIN_NAME_LENGTH || draft.goal.trim().length < WORKSPACE_SETUP_MIN_GOAL_LENGTH) {
    return "start";
  }

  for (const step of WORKSPACE_SETUP_STEPS) {
    if (step.slug === requestedStep) {
      return null;
    }
    if (!draft[step.section].trim()) {
      return step.slug;
    }
  }

  return null;
}

export function consumeWorkspaceSetupNotice(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const notice = window.sessionStorage.getItem(WORKSPACE_SETUP_NOTICE_STORAGE_KEY);
  if (!notice) {
    return null;
  }
  window.sessionStorage.removeItem(WORKSPACE_SETUP_NOTICE_STORAGE_KEY);
  return notice;
}

export function loadWorkspaceSetupDraft(): WorkspaceSetupDraftLoadResult {
  if (typeof window === "undefined") {
    return { draft: null, notice: null };
  }
  const raw = window.sessionStorage.getItem(WORKSPACE_SETUP_STORAGE_KEY);
  if (!raw) {
    return { draft: null, notice: null };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceSetupDraft>;
    return {
      draft: {
        ...createEmptyWorkspaceSetupDraft(),
        ...parsed,
      },
      notice: null,
    };
  } catch {
    window.sessionStorage.removeItem(WORKSPACE_SETUP_STORAGE_KEY);
    window.sessionStorage.setItem(WORKSPACE_SETUP_NOTICE_STORAGE_KEY, WORKSPACE_SETUP_CORRUPTION_NOTICE);
    return {
      draft: null,
      notice: WORKSPACE_SETUP_CORRUPTION_NOTICE,
    };
  }
}

export function saveWorkspaceSetupDraft(draft: WorkspaceSetupDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(WORKSPACE_SETUP_STORAGE_KEY, JSON.stringify(draft));
}

export function clearWorkspaceSetupDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(WORKSPACE_SETUP_STORAGE_KEY);
}

export function validateWorkspaceSetupStart(draft: WorkspaceSetupDraft): string | null {
  if (draft.name.trim().length < WORKSPACE_SETUP_MIN_NAME_LENGTH) {
    return "Project title must be at least 2 characters.";
  }
  if (draft.goal.trim().length < WORKSPACE_SETUP_MIN_GOAL_LENGTH) {
    return "Goal must be at least 4 characters.";
  }
  return null;
}

export function validateWorkspaceSetupStep(draft: WorkspaceSetupDraft, section: SetupSection): string | null {
  const value = draft[section].trim();
  if (!value) {
    return `Add ${STEP_COPY[section].label.toLowerCase()} before continuing.`;
  }
  if (
    (section === "target_style" || section === "target_behaviors") &&
    value.length < WORKSPACE_SETUP_MIN_REQUIRED_BRIEF_LENGTH
  ) {
    return `${STEP_COPY[section].label} must be at least ${WORKSPACE_SETUP_MIN_REQUIRED_BRIEF_LENGTH} characters.`;
  }
  return null;
}

export function buildWorkspaceProjectPayload(draft: WorkspaceSetupDraft) {
  const brief = {} as ProjectBrief;
  for (const field of PERSONA_FIELDS) {
    brief[field.key] = draft[field.key].trim();
  }

  return {
    name: draft.name.trim(),
    description: draft.goal.trim(),
    learning_goal: "hybrid",
    brief,
  };
}
