/** URL slugs for Tune routes (user-facing), mapped to registry model keys (API). */

const MODEL_SLUG_TO_KEY: Record<string, string> = {
  starter: "starter_model",
  "coding-worker": "coding_model",
};

const MODEL_KEY_TO_SLUG: Record<string, string> = {
  starter_model: "starter",
  coding_model: "coding-worker",
};

const LEGACY_MODEL_SLUGS: Record<string, string> = {
  starter_model: "starter",
  coding_model: "coding-worker",
};

export function modelKeyFromSlug(slug: string): string {
  if (MODEL_SLUG_TO_KEY[slug]) {
    return MODEL_SLUG_TO_KEY[slug];
  }
  if (LEGACY_MODEL_SLUGS[slug]) {
    return slug;
  }
  return slug;
}

export function modelSlugFromKey(modelKey: string): string {
  return MODEL_KEY_TO_SLUG[modelKey] ?? modelKey;
}

export function canonicalModelSlug(slugOrKey: string): string {
  if (MODEL_SLUG_TO_KEY[slugOrKey]) {
    return slugOrKey;
  }
  return modelSlugFromKey(slugOrKey);
}

export function tuneHomePath() {
  return "/tune";
}

export function tuneModelPath(modelKeyOrSlug: string) {
  return `/tune/${encodeURIComponent(canonicalModelSlug(modelKeyOrSlug))}`;
}

export function tuneBuildPath(modelKeyOrSlug: string) {
  return `${tuneModelPath(modelKeyOrSlug)}/build`;
}

export function tuneStatusPath(modelKeyOrSlug: string) {
  return `${tuneModelPath(modelKeyOrSlug)}/status`;
}

export function tuneTryPath(modelKeyOrSlug: string) {
  return `${tuneModelPath(modelKeyOrSlug)}/try`;
}
