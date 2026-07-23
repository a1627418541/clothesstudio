import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousSessionByToken: vi.fn(),
  findDiagnosis: vi.fn(),
  runTryOnWorkflow: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/anonymous-session", () => ({
  getAnonymousSessionByToken: mocks.getAnonymousSessionByToken,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { styleDiagnosis: { findUnique: mocks.findDiagnosis } },
}));
vi.mock("@/lib/try-on/prisma-try-on-workflow", () => ({
  runTryOnWorkflow: mocks.runTryOnWorkflow,
}));

import { POST } from "./route";

const products = [
  { category: "TOP", imageUrl: "https://assets.example/top.jpg" },
  { category: "BOTTOM", imageUrl: "https://assets.example/bottom.jpg" },
];

function diagnosis(overrides: Record<string, unknown> = {}) {
  return {
    id: "diag-1",
    userId: "user-1",
    anonymousSessionId: null,
    faceTryOnConsent: true,
    faceTryOnRevokedAt: null,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    photos: [
      {
        role: "FACE_FRONT",
        mediaAsset: { url: "https://assets.example/face.jpg" },
      },
      {
        role: "FULL_BODY",
        mediaAsset: { url: "https://assets.example/body.jpg" },
      },
    ],
    recommendations: [
      {
        id: "rec-2",
        rank: 2,
        isPrimary: false,
        productPlanStatus: "READY",
        tryOnWorkflowStatus: "NOT_REQUESTED",
        tryOnProductSnapshotHash: "sha256:products",
        products,
      },
    ],
    ...overrides,
  };
}

function request() {
  return new NextRequest(
    "http://localhost/api/diagnosis/diag-1/recommendations/rec-2/try-on",
    { method: "POST" }
  );
}

const context = {
  params: Promise.resolve({ id: "diag-1", recommendationId: "rec-2" }),
};

describe("POST recommendation try-on", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findDiagnosis.mockResolvedValue(diagnosis());
    mocks.runTryOnWorkflow.mockResolvedValue({
      status: "COMPLETED",
      attemptNumber: 1,
    });
  });

  it("runs an owned recommendation on explicit request", async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.runTryOnWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnosisId: "diag-1",
        recommendationId: "rec-2",
        trigger: "USER_REQUEST",
        expectedStatuses: ["NOT_REQUESTED"],
      })
    );
  });

  it("returns 403 before exposing state to the wrong owner", async () => {
    mocks.findDiagnosis.mockResolvedValue(diagnosis({ userId: "user-2" }));

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.runTryOnWorkflow).not.toHaveBeenCalled();
  });

  it("accepts the matching anonymous session owner", async () => {
    mocks.auth.mockResolvedValue(null);
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });
    mocks.findDiagnosis.mockResolvedValue(
      diagnosis({ userId: null, anonymousSessionId: "anon-1" })
    );
    const anonymousRequest = request();
    anonymousRequest.cookies.set("aps_anonymous_session", "token-1");

    const response = await POST(anonymousRequest, context);

    expect(response.status).toBe(200);
    expect(mocks.runTryOnWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ isAnonymous: true })
    );
  });

  it("rejects inactive consent", async () => {
    mocks.findDiagnosis.mockResolvedValue(
      diagnosis({ faceTryOnConsent: false })
    );
    expect((await POST(request(), context)).status).toBe(409);
  });

  it("rejects a non-ready product plan", async () => {
    const value = diagnosis();
    value.recommendations[0].productPlanStatus = "FAILED";
    mocks.findDiagnosis.mockResolvedValue(value);
    expect((await POST(request(), context)).status).toBe(409);
  });

  it("rejects an already processing workflow", async () => {
    const value = diagnosis();
    value.recommendations[0].tryOnWorkflowStatus = "APPLYING_GARMENTS";
    mocks.findDiagnosis.mockResolvedValue(value);
    expect((await POST(request(), context)).status).toBe(409);
  });

  it("allows retrying a failed workflow", async () => {
    const value = diagnosis();
    value.recommendations[0].tryOnWorkflowStatus = "FAILED";
    mocks.findDiagnosis.mockResolvedValue(value);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.runTryOnWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatuses: ["FAILED"] })
    );
  });

  it("does not log provider exception details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.runTryOnWorkflow.mockRejectedValue(
      new Error("https://signed.example/face.jpg?secret=provider-token")
    );

    const response = await POST(request(), context);

    expect(response.status).toBe(500);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("provider-token");
    expect(errorSpy).toHaveBeenCalledWith(
      "Recommendation try-on error: TRY_ON_REQUEST_FAILED"
    );
    errorSpy.mockRestore();
  });
});
