/** URL slugs for Datasets routes (user-facing), mapped to registry dataset keys (API). */

const DATASET_SLUG_TO_KEY: Record<string, string> = {
  starter: "starter_seed",
};

const DATASET_KEY_TO_SLUG: Record<string, string> = {
  starter_seed: "starter",
};

const LEGACY_DATASET_SLUGS: Record<string, string> = {
  starter_seed: "starter",
};

export function datasetKeyFromSlug(slug: string): string {
  if (DATASET_SLUG_TO_KEY[slug]) {
    return DATASET_SLUG_TO_KEY[slug];
  }
  if (LEGACY_DATASET_SLUGS[slug]) {
    return slug;
  }
  return slug;
}

export function datasetSlugFromKey(datasetKey: string): string {
  return DATASET_KEY_TO_SLUG[datasetKey] ?? datasetKey;
}

export function canonicalDatasetSlug(slugOrKey: string): string {
  if (DATASET_SLUG_TO_KEY[slugOrKey]) {
    return slugOrKey;
  }
  return datasetSlugFromKey(slugOrKey);
}

export function datasetDisplayLabel(datasetKey: string, registryLabel?: string): string {
  if (datasetKey === "starter_seed") {
    return "Starter training set";
  }
  return registryLabel ?? datasetKey;
}

export function datasetsHomePath() {
  return "/datasets";
}

export function datasetGeneratePath(slugOrKey: string) {
  return `/datasets/${encodeURIComponent(canonicalDatasetSlug(slugOrKey))}/generate`;
}

export function datasetRowsPath(slugOrKey: string) {
  return `/datasets/${encodeURIComponent(canonicalDatasetSlug(slugOrKey))}/rows`;
}
