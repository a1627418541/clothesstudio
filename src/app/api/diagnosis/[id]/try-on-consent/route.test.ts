import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousSessionByToken: vi.fn(),
  findDiagnosis: vi.fn(),
  updateDiagnosis: vi.fn(),
  updateRecommendations: vi.fn(),
  findPersonalTryOns: vi.fn(),
  deletePersonalTryOns: vi.fn(),
  deleteObjectFromR2: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/anonymous-session", () => ({
  getAnonymousSessionByToken: mocks.getAnonymousSessionByToken,
}));
vi.mock("@/lib/r2", () => ({
  deleteObjectFromR2: mocks.deleteObjectFromR2,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    styleDiagnosis: { findUnique: mocks.findDiagnosis },
    personalTryOnGeneration: { findMany: mocks.findPersonalTryOns },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest(
    "http://localhost/api/diagnosis/diag-1/try-on-consent",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const context = { params: Promise.resolve({ id: "diag-1" }) };

describe("POST try-on consent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLOUDFLARE_R2_BUCKET_NAME", "test-bucket");
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findDiagnosis.mockResolvedValue({
      id: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });
    mocks.updateDiagnosis.mockResolvedValue({ id: "diag-1" });
    mocks.updateRecommendations.mockResolvedValue({ count: 3 });
    mocks.findPersonalTryOns.mockResolvedValue([
      { imageObjectKey: "personal/key-1.png" },
      { imageObjectKey: "personal/key-2.png" },
    ]);
    mocks.deletePersonalTryOns.mockResolvedValue({ count: 2 });
    mocks.deleteObjectFromR2.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        styleDiagnosis: { update: mocks.updateDiagnosis },
        styleRecommendation: { updateMany: mocks.updateRecommendations },
        personalTryOnGeneration: {
          deleteMany: mocks.deletePersonalTryOns,
        },
      })
    );
  });

  it("grants consent and clears the revoked timestamp", async () => {
    const response = await POST(request({ consent: true }), context);

    expect(response.status).toBe(200);
    expect(mocks.updateDiagnosis).toHaveBeenCalledWith({
      where: { id: "diag-1" },
      data: {
        faceTryOnConsent: true,
        faceTryOnConsentAt: expect.any(Date),
        faceTryOnRevokedAt: null,
      },
    });
    expect(mocks.updateRecommendations).not.toHaveBeenCalled();
  });

  it("revokes consent, cancels workflows, and deletes generated results", async () => {
    const response = await POST(
      request({ consent: false, deleteGenerated: true }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.updateDiagnosis).toHaveBeenCalledWith({
      where: { id: "diag-1" },
      data: {
        faceTryOnConsent: false,
        faceTryOnRevokedAt: expect.any(Date),
      },
    });
    expect(mocks.updateRecommendations).toHaveBeenCalledWith({
      where: {
        diagnosisId: "diag-1",
        tryOnWorkflowStatus: {
          in: [
            "QUEUED",
            "APPLYING_GARMENTS",
            "APPLYING_HAT",
            "RESTORING_IDENTITY",
            "QUALITY_CHECKING",
            "FAILED",
          ],
        },
      },
      data: { tryOnWorkflowStatus: "CANCELLED" },
    });
    expect(mocks.updateRecommendations).toHaveBeenCalledWith({
      where: { diagnosisId: "diag-1" },
      data: expect.objectContaining({
        tryOnImageUrl: null,
        tryOnImageStatus: "PENDING",
        tryOnWorkflowStatus: "CANCELLED",
      }),
    });
  });

  it("rejects a viewer who does not own the diagnosis", async () => {
    mocks.findDiagnosis.mockResolvedValue({
      id: "diag-1",
      userId: "user-2",
      anonymousSessionId: null,
    });

    expect((await POST(request({ consent: true }), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not log storage details when consent persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.transaction.mockRejectedValue(
      new Error("r2://private-bucket/face.jpg?secret=storage-token")
    );

    const response = await POST(request({ consent: false }), context);

    expect(response.status).toBe(500);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("storage-token");
    expect(errorSpy).toHaveBeenCalledWith(
      "Try-on consent error: CONSENT_UPDATE_FAILED"
    );
    errorSpy.mockRestore();
  });

  it("deletes personal try-on R2 objects and rows when revoking consent with deleteGenerated", async () => {
    const response = await POST(
      request({ consent: false, deleteGenerated: true }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.findPersonalTryOns).toHaveBeenCalledWith({
      where: { diagnosisId: "diag-1" },
      select: { imageObjectKey: true },
    });
    expect(mocks.findPersonalTryOns).toHaveBeenCalledBefore(mocks.transaction);
    expect(mocks.deletePersonalTryOns).toHaveBeenCalledWith({
      where: { diagnosisId: "diag-1" },
    });
    expect(mocks.deleteObjectFromR2).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key: "personal/key-1.png",
    });
    expect(mocks.deleteObjectFromR2).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key: "personal/key-2.png",
    });
    expect(mocks.deleteObjectFromR2).toHaveBeenCalledAfter(mocks.deletePersonalTryOns);
  });

  it("skips R2 deletion for personal try-on rows without an imageObjectKey", async () => {
    mocks.findPersonalTryOns.mockResolvedValue([
      { imageObjectKey: "personal/key-1.png" },
      { imageObjectKey: null },
    ]);

    const response = await POST(
      request({ consent: false, deleteGenerated: true }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteObjectFromR2).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObjectFromR2).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key: "personal/key-1.png",
    });
    expect(mocks.deletePersonalTryOns).toHaveBeenCalledWith({
      where: { diagnosisId: "diag-1" },
    });
  });

  it("continues cleanup and logs no URLs when R2 deletion fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deleteObjectFromR2.mockRejectedValueOnce(
      new Error("r2://private-bucket/secret.png?token=storage-token")
    );

    const response = await POST(
      request({ consent: false, deleteGenerated: true }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.deletePersonalTryOns).toHaveBeenCalledWith({
      where: { diagnosisId: "diag-1" },
    });
    const errorLog = JSON.stringify(errorSpy.mock.calls);
    expect(errorLog).not.toContain("storage-token");
    expect(errorLog).not.toContain("private-bucket");
    errorSpy.mockRestore();
  });
});
