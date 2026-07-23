import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousSessionByToken: vi.fn(),
  runPersonalTryOnGeneration: vi.fn(),
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

function makeRequest(cookie?: string) {
  return new NextRequest("http://localhost/api/diagnosis/d1/recommendations/r1/personal-try-on", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

const params = Promise.resolve({ id: "d1", recommendationId: "r1" });

describe("POST /api/diagnosis/[id]/recommendations/[recommendationId]/personal-try-on", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(null);
    mocks.getAnonymousSessionByToken.mockResolvedValue(null);
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
});
