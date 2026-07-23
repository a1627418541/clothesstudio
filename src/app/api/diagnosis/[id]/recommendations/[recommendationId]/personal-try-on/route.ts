import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { prisma } from "@/lib/prisma";
import { validateV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import { runPersonalTryOnGeneration } from "@/lib/personal-try-on/personal-try-on-service";
import { evolinkPersonalTryOnProvider } from "@/lib/ai/evolink-personal-try-on-provider";
import { mockPersonalTryOnProvider } from "@/lib/ai/mock-personal-try-on-provider";
import { buildProviderImageInput } from "@/lib/personal-try-on/provider-image-input";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";

// Matches the longest duration this Vercel plan already runs in production
// (style-previews route); the provider polling budget stays 30s below this.
export const maxDuration = 180;

interface RouteContext {
  params: Promise<{ id: string; recommendationId: string }>;
}

function getProvider() {
  const name = process.env.PERSONAL_TRY_ON_PROVIDER?.toLowerCase().trim();
  if (name === "mock") return { ...mockPersonalTryOnProvider, name: "mock" };
  return { ...evolinkPersonalTryOnProvider, name: "evolink" };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id, recommendationId } = await params;
    // Clients may send an optional JSON body ({ retry: true }) to make FAILED
    // regeneration explicit. Claim/retry semantics are enforced by the
    // generation service's exact-status CAS, so the flag is informational
    // and the body is only drained tolerantly.
    try {
      await request.json();
    } catch {
      // Empty or non-JSON bodies are acceptable.
    }
    const session = await auth();
    const userId = session?.user?.id ?? null;
    let anonymousSessionId: string | null = null;
    if (!userId) {
      const token = request.cookies.get("aps_anonymous_session")?.value;
      if (token) {
        anonymousSessionId = (await getAnonymousSessionByToken(token))?.id ?? null;
      }
    }

    const diagnosis = await prisma.styleDiagnosis.findUnique({
      where: { id },
      include: {
        photos: { include: { mediaAsset: true } },
        recommendations: { where: { id: recommendationId } },
      },
    });
    if (!diagnosis) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const owned = diagnosis.userId
      ? diagnosis.userId === userId
      : Boolean(anonymousSessionId && diagnosis.anonymousSessionId === anonymousSessionId);
    if (!owned) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const recommendation = diagnosis.recommendations[0];
    if (!recommendation) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (recommendation.sourceMode !== "ARCHETYPE_V2") {
      return NextResponse.json({ error: "UNSUPPORTED_SOURCE_MODE" }, { status: 409 });
    }
    if (!diagnosis.faceTryOnConsent || diagnosis.faceTryOnRevokedAt) {
      return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 409 });
    }

    const snapshotValidation = validateV2RecommendationSnapshot({
      sourceMode: recommendation.sourceMode,
      archetypeVersion: recommendation.archetypeVersion,
      archetypeSnapshot: recommendation.archetypeSnapshot,
      archetypeId: recommendation.archetypeId,
      matchScore: recommendation.matchScore,
      rank: recommendation.rank,
    });
    if (!snapshotValidation.valid) {
      return NextResponse.json({ error: "INVALID_SNAPSHOT" }, { status: 409 });
    }

    const facePhoto = diagnosis.photos.find((photo) => photo.role === "FACE_FRONT");
    const bodyPhoto = diagnosis.photos.find((photo) => photo.role === "FULL_BODY");
    if (!facePhoto?.mediaAsset || !bodyPhoto?.mediaAsset) {
      return NextResponse.json({ error: "REQUIRED_PHOTOS_NOT_READY" }, { status: 409 });
    }

    const result = await runPersonalTryOnGeneration(
      {
        diagnosisId: diagnosis.id,
        recommendationId: recommendation.id,
        userId: diagnosis.userId,
        anonymousSessionId: diagnosis.anonymousSessionId,
        snapshot: snapshotValidation.snapshot,
        fullBody: { bucket: bodyPhoto.mediaAsset.bucket, key: bodyPhoto.mediaAsset.key },
        frontFace: { bucket: facePhoto.mediaAsset.bucket, key: facePhoto.mediaAsset.key },
      },
      {
        provider: getProvider(),
        storeImage: storeImageFromUrlOrBase64,
        buildImageInput: buildProviderImageInput,
        client: prisma,
      }
    );

    if (result.status === "FAILED") {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true, result });
  } catch {
    console.error("Personal try-on request failed: PERSONAL_TRY_ON_REQUEST_FAILED");
    return NextResponse.json({ error: "PERSONAL_TRY_ON_REQUEST_FAILED" }, { status: 500 });
  }
}
