import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, maxDuration } from "./route";
import { PERSONAL_TRY_ON_POLL_BUDGET_MS } from "@/lib/ai/evolink-personal-try-on-provider";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousSessionByToken: vi.fn(),
  runPersonalTryOnGeneration: vi.fn(),
  checkFullBodyImageSize: vi.fn(),
  prisma: {
    styleDiagnosis: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/anonymous-session", () => ({
  getAnonymousSessionByToken: mocks.getAnonymousSessionByToken,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/personal-try-on/personal-try-on-service", () => ({
  runPersonalTryOnGeneration: mocks.runPersonalTryOnGeneration,
}));
vi.mock("@/lib/personal-try-on/full-body-image-check", () => ({
  checkFullBodyImageSize: mocks.checkFullBodyImageSize,
}));

function makeRequest(cookie?: string) {
  return new NextRequest("http://localhost/api/diagnosis/d1/recommendations/r1/personal-try-on", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

function makeRequestWithBody(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/diagnosis/d1/recommendations/r1/personal-try-on", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function passingDiagnosis() {
  const archetype = V2_ARCHETYPE_MANIFEST.find((row) => row.slug === "old-money")!;
  const snapshot = buildV2RecommendationSnapshot({
    archetype,
    rank: 1,
    matchScore: 88,
    subjectContext: {
      genderPresentation: "MASCULINE",
      bodyTypeHint: "rectangle",
      faceShapeHint: "oval",
      ageBand: "25-34",
    },
  });
  return {
    id: "d1",
    userId: null,
    anonymousSessionId: "anon-1",
    faceTryOnConsent: true,
    faceTryOnRevokedAt: null,
    photos: [
      { role: "FACE_FRONT", mediaAsset: { bucket: "bucket", key: "uploads/face.jpg" } },
      { role: "FULL_BODY", mediaAsset: { bucket: "bucket", key: "uploads/body.jpg" } },
    ],
    recommendations: [
      {
        id: "r1",
        sourceMode: "ARCHETYPE_V2",
        archetypeVersion: snapshot.archetypeVersion,
        archetypeSnapshot: snapshot,
        archetypeId: snapshot.provenance.archetypeId,
        matchScore: snapshot.selection.matchScore,
        rank: 1,
      },
    ],
  };
}

const params = Promise.resolve({ id: "d1", recommendationId: "r1" });

describe("POST /api/diagnosis/[id]/recommendations/[recommendationId]/personal-try-on", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(null);
    mocks.getAnonymousSessionByToken.mockResolvedValue(null);
    mocks.checkFullBodyImageSize.mockResolvedValue({ ok: true });
    mocks.runPersonalTryOnGeneration.mockResolvedValue({
      status: "COMPLETED",
      generationId: "gen-1",
      imageUrl: "https://r2.example/result.png",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when diagnosis is missing", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(null);
    const response = await POST(makeRequest(), { params });
    expect(response.status).toBe(404);
  });

  it("returns 403 when user does not own diagnosis", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue({
      id: "d1",
      userId: "other-user",
      anonymousSessionId: null,
      faceTryOnConsent: true,
      faceTryOnRevokedAt: null,
      photos: [],
      recommendations: [],
    });
    const response = await POST(makeRequest(), { params });
    expect(response.status).toBe(403);
  });

  it("returns 409 when consent is missing", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue({
      id: "d1",
      userId: null,
      anonymousSessionId: "anon-1",
      faceTryOnConsent: false,
      faceTryOnRevokedAt: null,
      photos: [],
      recommendations: [
        {
          id: "r1",
          sourceMode: "ARCHETYPE_V2",
          archetypeVersion: 2,
          archetypeSnapshot: {},
          archetypeId: "a1",
          matchScore: 90,
          rank: 1,
        },
      ],
    });
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });
    const response = await POST(makeRequest("aps_anonymous_session=token"), { params });
    expect(response.status).toBe(409);
  });

  it("accepts an explicit retry body and still delegates to the service", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(passingDiagnosis());
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });

    const response = await POST(makeRequestWithBody({ retry: true }, "aps_anonymous_session=token"), { params });

    expect(response.status).toBe(200);
    expect(mocks.runPersonalTryOnGeneration).toHaveBeenCalledTimes(1);
  });

  it("accepts a request without a body", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(passingDiagnosis());
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });

    const response = await POST(makeRequest("aps_anonymous_session=token"), { params });

    expect(response.status).toBe(200);
    expect(mocks.runPersonalTryOnGeneration).toHaveBeenCalledTimes(1);
  });

  it("rejects undersized full-body photos before any provider work", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(passingDiagnosis());
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });
    mocks.checkFullBodyImageSize.mockResolvedValue({
      ok: false,
      code: "FULL_BODY_IMAGE_TOO_SMALL",
    });

    const response = await POST(makeRequest("aps_anonymous_session=token"), { params });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("FULL_BODY_IMAGE_TOO_SMALL");
    expect(mocks.runPersonalTryOnGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unknown action with 400 before any service work", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(passingDiagnosis());
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });

    const response = await POST(
      makeRequestWithBody({ action: "DO_A_BARREL_ROLL" }, "aps_anonymous_session=token"),
      { params }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_PERSONAL_TRY_ON_ACTION");
    expect(mocks.runPersonalTryOnGeneration).not.toHaveBeenCalled();
  });

  it("forwards an explicit REGENERATE_COMPLETED action to the service", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(passingDiagnosis());
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });

    const response = await POST(
      makeRequestWithBody({ action: "REGENERATE_COMPLETED" }, "aps_anonymous_session=token"),
      { params }
    );

    expect(response.status).toBe(200);
    expect(mocks.runPersonalTryOnGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REGENERATE_COMPLETED" }),
      expect.any(Object)
    );
  });

  it("defaults to GENERATE when no body is provided", async () => {
    mocks.prisma.styleDiagnosis.findUnique.mockResolvedValue(passingDiagnosis());
    mocks.getAnonymousSessionByToken.mockResolvedValue({ id: "anon-1" });

    const response = await POST(makeRequest("aps_anonymous_session=token"), { params });

    expect(response.status).toBe(200);
    expect(mocks.runPersonalTryOnGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GENERATE" }),
      expect.any(Object)
    );
  });
});

describe("personal try-on route duration budget", () => {
  it("keeps the provider polling budget inside maxDuration with persistence headroom", () => {
    // 180s is the highest duration this project's Vercel plan already runs in
    // production (see the style-previews route), so never exceed it here.
    expect(maxDuration).toBeLessThanOrEqual(180);
    expect(maxDuration * 1000 - PERSONAL_TRY_ON_POLL_BUDGET_MS).toBeGreaterThanOrEqual(30_000);
  });
});
