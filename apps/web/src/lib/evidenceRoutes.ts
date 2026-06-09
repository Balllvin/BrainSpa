/**
 * Evidence stage URL helpers.
 * Source keys are user-owned runtime state, so unknown slugs pass through unchanged.
 */

const SOURCE_SLUG_TO_KEY: Record<string, string> = {};
const SOURCE_KEY_TO_SLUG: Record<string, string> = {};

export function sourceKeyFromSlug(slug: string): string {
  return SOURCE_SLUG_TO_KEY[slug] ?? slug;
}

export function sourceSlugFromKey(sourceKey: string): string {
  return SOURCE_KEY_TO_SLUG[sourceKey] ?? sourceKey;
}

export function canonicalSourceSlug(slugOrKey: string): string {
  return SOURCE_SLUG_TO_KEY[slugOrKey] ? slugOrKey : sourceSlugFromKey(slugOrKey);
}

export function evidenceHomePath() {
  return "/evidence";
}

export function evidenceSourcePath(slugOrKey: string) {
  return `/evidence/sources/${encodeURIComponent(canonicalSourceSlug(slugOrKey))}`;
}

export function evidenceReviewPath(slugOrKey: string, filter?: string) {
  const base = `/evidence/${encodeURIComponent(canonicalSourceSlug(slugOrKey))}/review`;
  return filter ? `${base}?filter=${encodeURIComponent(filter)}` : base;
}

export function evidenceReviewPathWithAdd(slugOrKey: string) {
  return `${evidenceReviewPath(slugOrKey, "pending")}&add=1`;
}
