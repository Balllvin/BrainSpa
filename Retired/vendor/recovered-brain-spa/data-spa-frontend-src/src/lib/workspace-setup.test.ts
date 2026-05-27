import { beforeEach, describe, expect, it } from "vitest";

import { PERSONA_FIELDS } from "@/lib/persona";
import {
  WORKSPACE_SETUP_CORRUPTION_NOTICE,
  WORKSPACE_SETUP_STORAGE_KEY,
  buildWorkspaceProjectPayload,
  consumeWorkspaceSetupNotice,
  clearWorkspaceSetupDraft,
  createEmptyWorkspaceSetupDraft,
  getEarliestBlockedWorkspaceSetupStep,
  getNextWorkspaceSetupStep,
  loadWorkspaceSetupDraft,
  saveWorkspaceSetupDraft,
} from "@/lib/workspace-setup";

describe("workspace setup helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists and reloads the workspace setup draft", () => {
    const draft = {
      ...createEmptyWorkspaceSetupDraft(),
      name: "Sharp Operator",
      goal: "Train a clear operator persona.",
      target_style: "Dry and decisive.",
      stable_traits: "Specific and grounded.",
    };

    saveWorkspaceSetupDraft(draft);

    expect(window.sessionStorage.getItem(WORKSPACE_SETUP_STORAGE_KEY)).toContain("Sharp Operator");
    expect(loadWorkspaceSetupDraft()).toEqual({
      draft: {
        ...createEmptyWorkspaceSetupDraft(),
        ...draft,
      },
      notice: null,
    });

    clearWorkspaceSetupDraft();
    expect(loadWorkspaceSetupDraft()).toEqual({ draft: null, notice: null });
  });

  it("clears malformed stored drafts and surfaces a reset notice", () => {
    window.sessionStorage.setItem(WORKSPACE_SETUP_STORAGE_KEY, "{not-json");

    expect(loadWorkspaceSetupDraft()).toEqual({
      draft: null,
      notice: WORKSPACE_SETUP_CORRUPTION_NOTICE,
    });
    expect(window.sessionStorage.getItem(WORKSPACE_SETUP_STORAGE_KEY)).toBeNull();
    expect(consumeWorkspaceSetupNotice()).toBe(WORKSPACE_SETUP_CORRUPTION_NOTICE);
    expect(consumeWorkspaceSetupNotice()).toBeNull();
  });

  it("builds the final project payload from the guided draft", () => {
    const draft = createEmptyWorkspaceSetupDraft();
    draft.name = "  Sharp Operator  ";
    draft.goal = "  Train a clear operator persona.  ";
    for (const field of PERSONA_FIELDS) {
      draft[field.key] = `  ${field.label} content  `;
    }

    const payload = buildWorkspaceProjectPayload(draft);

    expect(payload.name).toBe("Sharp Operator");
    expect(payload.description).toBe("Train a clear operator persona.");
    expect(payload.learning_goal).toBe("hybrid");
    for (const field of PERSONA_FIELDS) {
      expect(payload.brief[field.key]).toBe(`${field.label} content`);
    }
  });

  it("advances through the setup steps in order", () => {
    expect(getNextWorkspaceSetupStep("target_style")).toBe("target_behaviors");
    expect(getNextWorkspaceSetupStep("target_behaviors")).toBe("stable_traits");
    expect(getNextWorkspaceSetupStep("avoidances")).toBeNull();
  });

  it("forces earlier unfinished steps before later routes", () => {
    const draft = createEmptyWorkspaceSetupDraft();
    draft.name = "Operator";
    draft.goal = "Train a clear and disciplined persona.";
    draft.target_style = "Grounded, crisp, direct.";

    expect(getEarliestBlockedWorkspaceSetupStep(draft, "stable_traits")).toBe("target_behaviors");
    expect(getEarliestBlockedWorkspaceSetupStep(draft, "target_behaviors")).toBeNull();
  });
});
