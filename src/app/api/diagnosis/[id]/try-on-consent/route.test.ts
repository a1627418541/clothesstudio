import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousSessionByToken: vi.fn(),
  findDiagnosis: vi.fn(),
  updateDiagnosis: vi.fn(),
  updateRecommendations: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/anonymous-session", () => ({
  getAnonymousSessionByToken: mocks.getAnonymousSessionByToken,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    styleDiagnosis: { findUnique: mocks.findDiagnosis },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findDiagnosis.mockResolvedValue({
      id: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });
    mocks.updateDiagnosis.mockResolvedValue({ id: "diag-1" });
    mocks.updateRecommendations.mockResolvedValue({ count: 3 });
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        styleDiagnosis: { update: mocks.updateDiagnosis },
        styleRecommendation: { updateMany: mocks.updateRecommendations },
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
        tryOnWorkflowStatus: { in: ["QUEUED", "FAILED"] },
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
});
