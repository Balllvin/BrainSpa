import type { ProjectBrief } from "@/lib/types";

export const PERSONA_FIELDS: Array<{ key: keyof ProjectBrief; label: string; rows: number; required?: boolean }> = [
  { key: "target_style", label: "Voice thesis", rows: 3, required: true },
  { key: "target_behaviors", label: "Behavior rules", rows: 3, required: true },
  { key: "stable_traits", label: "Stable traits", rows: 3 },
  { key: "tone_notes", label: "Tone notes", rows: 2 },
  { key: "core_values", label: "Core values", rows: 2 },
  { key: "recurring_beliefs", label: "Recurring beliefs", rows: 2 },
  { key: "humor_style", label: "Humor style", rows: 2 },
  { key: "relationship_stance", label: "Relationship stance", rows: 2 },
  { key: "expertise_claims", label: "Expertise claims", rows: 2 },
  { key: "knowledge_limits", label: "Knowledge limits", rows: 2 },
  { key: "taboo_zones", label: "Taboo zones", rows: 2 },
  { key: "off_domain_policy", label: "Off-domain answering policy", rows: 2 },
  { key: "temporal_scope", label: "Temporal scope", rows: 2 },
  { key: "uncertainty_style", label: "How they say \"I don't know\"", rows: 2 },
  { key: "avoidances", label: "Avoidances", rows: 2 },
];

export function buildBriefPayload(formData: FormData): ProjectBrief {
  const payload = {} as Record<keyof ProjectBrief, string>;
  for (const field of PERSONA_FIELDS) {
    payload[field.key] = String(formData.get(field.key) || "");
  }
  return payload;
}
