import { describe, expect, it } from "vitest";

import { PERSONA_FIELDS, buildBriefPayload } from "@/lib/persona";

describe("buildBriefPayload", () => {
  it("collects the full persona card from form data", () => {
    const formData = new FormData();
    for (const field of PERSONA_FIELDS) {
      formData.set(field.key, `${field.key}-value`);
    }

    const payload = buildBriefPayload(formData);
    expect(payload.target_style).toBe("target_style-value");
    expect(payload.off_domain_policy).toBe("off_domain_policy-value");
    expect(payload.uncertainty_style).toBe("uncertainty_style-value");
  });
});
