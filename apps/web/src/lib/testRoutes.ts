/** URL slugs for Test routes (user-facing), mapped to registry model keys (API). */

const MODEL_SLUG_TO_KEY: Record<string, string> = {
  snake: "snake_policy",
};

const MODEL_KEY_TO_SLUG: Record<string, string> = {
  snake_policy: "snake",
};

const LEGACY_MODEL_SLUGS: Record<string, string> = {};

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

export function testModelPath(modelKeyOrSlug: string) {
  return `/test/${encodeURIComponent(canonicalModelSlug(modelKeyOrSlug))}`;
}

export function testScenarioPath(modelKeyOrSlug: string, scenarioKey: string) {
  return `${testModelPath(modelKeyOrSlug)}/${encodeURIComponent(scenarioKey)}`;
}
