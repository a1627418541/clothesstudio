import { describe, expect, it, vi } from "vitest";
import { postPersonalTryOn } from "./personal-try-on-request";

const input = { diagnosisId: "d1", recommendationId: "r1" };

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

describe("postPersonalTryOn", () => {
  it("posts to the Sprint 3.9 personal-try-on endpoint, never the legacy /try-on", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ok: true, result: { status: "COMPLETED" } }));

    const result = await postPersonalTryOn({ ...input, retry: false, fetchImpl });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/diagnosis/d1/recommendations/r1/personal-try-on",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry: false }),
      }
    );
  });

  it("sends explicit retry semantics when regenerating a FAILED generation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ok: true, result: { status: "COMPLETED" } }));

    await postPersonalTryOn({ ...input, retry: true, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/diagnosis/d1/recommendations/r1/personal-try-on",
      expect.objectContaining({ body: JSON.stringify({ retry: true }) })
    );
  });

  it("surfaces the server safe error code from a 409 body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      errorResponse(409, { ok: false, error: "ATTEMPT_CAP_REACHED" })
    );

    const result = await postPersonalTryOn({ ...input, retry: true, fetchImpl });

    expect(result).toEqual({ ok: false, errorCode: "ATTEMPT_CAP_REACHED" });
  });

  it("extracts error codes from bodies without an ok flag", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      errorResponse(500, { error: "PERSONAL_TRY_ON_REQUEST_FAILED" })
    );

    const result = await postPersonalTryOn({ ...input, retry: false, fetchImpl });

    expect(result).toEqual({ ok: false, errorCode: "PERSONAL_TRY_ON_REQUEST_FAILED" });
  });

  it("treats an ok:false payload as failure even on HTTP 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({ ok: false, error: "GENERATION_NOT_CLAIMABLE" })
    );

    const result = await postPersonalTryOn({ ...input, retry: false, fetchImpl });

    expect(result).toEqual({ ok: false, errorCode: "GENERATION_NOT_CLAIMABLE" });
  });

  it("returns a null code when the response body is not parseable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    const result = await postPersonalTryOn({ ...input, retry: false, fetchImpl });

    expect(result).toEqual({ ok: false, errorCode: null });
  });

  it("returns a null code on network failure without leaking internals", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("socket secret detail"));

    const result = await postPersonalTryOn({ ...input, retry: false, fetchImpl });

    expect(result).toEqual({ ok: false, errorCode: null });
  });
});
