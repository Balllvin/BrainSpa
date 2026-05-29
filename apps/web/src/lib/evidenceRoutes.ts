/**
 * Evidence stage URL slugs (user-facing) ↔ source keys in state (API).
 * Artifacts: ~/.brain-spa/artifacts/evidence/
 *   evidence_notes.json, source_claims.jsonl, evidence_manifest.json
 * Datasets should call GET /api/evidence/approved-claims or read evidence_manifest.json.
 */

const SOURCE_SLUG_TO_KEY: Record<string, string> = {
  believer: "believer_voice_refs",
  composer: "composer_training_interview",
  recovery: "recovery_commits",
};

const SOURCE_KEY_TO_SLUG: Record<string, string> = {
  believer_voice_refs: "believer",
  composer_training_interview: "composer",
  recovery_commits: "recovery",
};

const LEGACY_SOURCE_SLUGS: Record<string, string> = {
  believer_voice_refs: "believer",
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

export const BELIEVER_MODEL_SLUG = "believer";

export function isBelieverModelSlug(slugOrKey: string) {
  return canonicalSourceSlug(slugOrKey) === BELIEVER_MODEL_SLUG;
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

export function sourceFeedsBeliever(feedsModelLabels: string[]) {
  return feedsModelLabels.some((label) => label.toLowerCase().includes("believer"));
}
