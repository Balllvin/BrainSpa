import { describe, expect, it } from "vitest";

import { appendUniqueItems, mergeVisibleItems } from "@/lib/paginated-list";

describe("paginated-list helpers", () => {
  it("appends only unseen items", () => {
    expect(
      appendUniqueItems(
        [
          { id: 1, label: "one" },
          { id: 2, label: "two" },
        ],
        [
          { id: 2, label: "two duplicate" },
          { id: 3, label: "three" },
        ]
      )
    ).toEqual([
      { id: 1, label: "one" },
      { id: 2, label: "two" },
      { id: 3, label: "three" },
    ]);
  });

  it("merges a refreshed first page without dropping expanded items", () => {
    expect(
      mergeVisibleItems(
        [
          { id: 4, label: "older" },
          { id: 3, label: "oldest" },
        ],
        [
          { id: 6, label: "new" },
          { id: 5, label: "updated" },
        ],
        4
      )
    ).toEqual([
      { id: 6, label: "new" },
      { id: 5, label: "updated" },
      { id: 4, label: "older" },
      { id: 3, label: "oldest" },
    ]);
  });
});
