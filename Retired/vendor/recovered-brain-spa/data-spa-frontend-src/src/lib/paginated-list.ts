interface ListItemWithId {
  id: number;
}

export function appendUniqueItems<T extends ListItemWithId>(currentItems: T[], nextItems: T[]): T[] {
  const seen = new Set(currentItems.map((item) => item.id));
  const appendedItems = nextItems.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
  return [...currentItems, ...appendedItems];
}

export function mergeVisibleItems<T extends ListItemWithId>(currentItems: T[], refreshedItems: T[], totalItems: number): T[] {
  const seen = new Set<number>();
  const mergedItems = [...refreshedItems, ...currentItems].filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
  return mergedItems.slice(0, Math.max(refreshedItems.length, totalItems));
}
