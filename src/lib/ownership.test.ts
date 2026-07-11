import { describe, expect, it } from "vitest";
import { isOwnedByActor } from "./ownership";

describe("isOwnedByActor", () => {
  it("allows the matching logged-in user", () => {
    expect(
      isOwnedByActor(
        { userId: "user-1", anonymousSessionId: null },
        { userId: "user-1", anonymousSessionId: null }
      )
    ).toBe(true);
  });

  it("allows the matching anonymous session", () => {
    expect(
      isOwnedByActor(
        { userId: null, anonymousSessionId: "anonymous-1" },
        { userId: null, anonymousSessionId: "anonymous-1" }
      )
    ).toBe(true);
  });

  it("denies cross-owner and ownerless access", () => {
    expect(
      isOwnedByActor(
        { userId: "user-1", anonymousSessionId: null },
        { userId: "user-2", anonymousSessionId: null }
      )
    ).toBe(false);
    expect(
      isOwnedByActor(
        { userId: null, anonymousSessionId: "anonymous-1" },
        { userId: null, anonymousSessionId: "anonymous-2" }
      )
    ).toBe(false);
    expect(
      isOwnedByActor(
        { userId: null, anonymousSessionId: null },
        { userId: null, anonymousSessionId: null }
      )
    ).toBe(false);
  });
});
