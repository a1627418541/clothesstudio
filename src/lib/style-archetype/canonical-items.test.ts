import { describe, expect, it } from "vitest";
import {
  canonicalizeItem,
  canonicalizeItemList,
  findRequiredForbiddenConflicts,
} from "./canonical-items";

describe("canonical item dictionary", () => {
  it.each([
    ["tee", "t-shirt"],
    ["tees", "t-shirt"],
    ["T shirt", "t-shirt"],
    ["sneaker", "sneakers"],
    ["trainers", "sneakers"],
    ["trouser", "tailored-trousers"],
    ["dress pants", "tailored-trousers"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(canonicalizeItem(input)).toBe(expected);
  });

  it("deduplicates deterministically after canonicalization", () => {
    expect(
      canonicalizeItemList(["Trainers", "tee", "sneakers", "tees"])
    ).toEqual(["sneakers", "t-shirt"]);
  });

  it("detects a broad canonical family conflict", () => {
    expect(
      findRequiredForbiddenConflicts(["statement sneakers"], ["sneakers"])
    ).toEqual([
      { required: "statement-sneakers", forbidden: "sneakers" },
    ]);
  });

  it("does not infer canonical items from arbitrary substrings", () => {
    expect(canonicalizeItem("a story about sneaker culture")).toBeNull();
  });

  it.each([
    ["oversized shirt", "oversized-shirt"],
    ["relaxed layering", "relaxed-layering"],
    ["ripped jeans", "ripped-jeans"],
    ["chunky sneakers", "chunky-sneakers"],
    ["tight polo", "tight-polo"],
    ["business suit", "business-suit"],
    ["loud graphics", "loud-graphics"],
  ])("covers manifest anchor %s", (input, expected) => {
    expect(canonicalizeItem(input)).toBe(expected);
  });
});
