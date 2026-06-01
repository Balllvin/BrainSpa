/**
 * Evidence stage URL slugs (user-facing) ↔ source keys in state (API).
 * Artifacts: ~/.brain-spa/artifacts/evidence/
 *   evidence_notes.json, source_claims.jsonl, evidence_manifest.json
 * Datasets should call GET /api/evidence/approved-claims or read evidence_manifest.json.
 */

const SOURCE_SLUG_TO_KEY: Record<string, string> = {
  starter: "starter_voice_refs",
  composer: "composer_training_interview",
  recovery: "recovery_commits",
};

const SOURCE_KEY_TO_SLUG: Record<string, string> = {
  starter_voice_refs: "starter",
  composer_training_interview: "composer",
  recovery_commits: "recovery",
};

const LEGACY_SOURCE_SLUGS: Record<string, string> = {
  starter_voice_refs: "starter",
  composer_training_interview: "composer",
  recovery_commits: "recovery",
};

export function sourceKeyFromSlug(slug: string): string {
  if (SOURCE_SLUG_TO_KEY[slug]) {
    return SOURCE_SLUG_TO_KEY[slug];
  }
  if (LEGACY_SOURCE_SLUGS[slug]) {
    return slug;
  }
  return slug;
}

export function sourceSlugFromKey(sourceKey: string): string {
  return SOURCE_KEY_TO_SLUG[sourceKey] ?? sourceKey;
}

export function canonicalSourceSlug(slugOrKey: string): string {
  if (SOURCE_SLUG_TO_KEY[slugOrKey]) {
    return slugOrKey;
  }
  return sourceSlugFromKey(slugOrKey);
}

export function evidenceHomePath() {
  return "/evidence";
}

export function evidenceSourcePath(slugOrKey: string) {
  return `/evidence/sources/${encodeURIComponent(canonicalSourceSlug(slugOrKey))}`;
}

export const STARTER_MODEL_SLUG = "starter";

export function isStarterModelSlug(slugOrKey: string) {
  return canonicalSourceSlug(slugOrKey) === STARTER_MODEL_SLUG;
}

export function evidenceReviewPath(slugOrKey: string, filter?: string) {
  const base = `/evidence/${encodeURIComponent(canonicalSourceSlug(slugOrKey))}/review`;
  if (!filter) {
    return base;
  }
  return `${base}?filter=${encodeURIComponent(filter)}`;
}

export function evidenceReviewPathWithAdd(slugOrKey: string) {
  return `${evidenceReviewPath(slugOrKey, "pending")}&add=1`;
}

export function sourceFeedsStarter(feedsModelLabels: string[]) {
  return feedsModelLabels.some((label) => label.toLowerCase().includes("starter"));
}
