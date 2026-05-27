import { beforeEach, describe, expect, it, vi } from "vitest";

import { approveEvidence, createEvidence, requestAssistantSuggestions } from "@/lib/api";

describe("persona workbench api helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts assistant suggestion requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ model: "grok-4-1-fast", task: "fill gaps", persona_gaps: [], evidence_suggestions: [], brief_patch: {}, operator_notes: [], toolchain: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestAssistantSuggestions(12, {
      task: "fill gaps",
      difficulty: "normal",
      persist_suggestions: true,
    });

    expect(response.model).toBe("grok-4-1-fast");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/12/assistant/suggest",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("posts evidence creation and approval requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 3, title: "note", source_type: "note", source_label: "memo", content_text: "x", citation_url: null, source_span: null, trust_level: "medium", approval_state: "approved", created_by: "user", metadata: {}, created_at: new Date().toISOString(), transcript_id: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 3, title: "note", source_type: "note", source_label: "memo", content_text: "x", citation_url: null, source_span: null, trust_level: "medium", approval_state: "approved", created_by: "user", metadata: {}, created_at: new Date().toISOString(), transcript_id: null }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await createEvidence(9, {
      title: "note",
      source_type: "note",
      source_label: "memo",
      content_text: "x",
      trust_level: "medium",
    });
    await approveEvidence(3, "approved");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/9/evidence",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/evidence/3/approve",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
