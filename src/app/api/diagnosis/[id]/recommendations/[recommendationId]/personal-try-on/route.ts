import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { prisma } from "@/lib/prisma";
import { validateV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import { runPersonalTryOnGeneration, PersonalTryOnAction } from "@/lib/personal-try-on/personal-try-on-service";
import { deleteObjectFromR2 } from "@/lib/r2";
import { checkFullBodyImageSize } from "@/lib/personal-try-on/full-body-image-check";
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
    // Clients send an optional JSON body with an explicit action. The service
    // enforces exact-status CAS per action (GENERATE → PENDING, RETRY_FAILED
    // → FAILED, REGENERATE_COMPLETED → COMPLETED); empty bodies default to
    // GENERATE.
    let action: PersonalTryOnAction = "GENERATE";
    try {
      const body: unknown = await request.json();
      if (body && typeof body === "object" && "action" in body) {
        const candidate = (body as { action?: unknown }).action;
        if (
          candidate === "GENERATE" ||
          candidate === "RETRY_FAILED" ||
          candidate === "REGENERATE_COMPLETED"
        ) {
          action = candidate;
        } else {
          return NextResponse.json(
            { error: "INVALID_PERSONAL_TRY_ON_ACTION" },
            { status: 400 }
          );
        }
      }
    } catch {
      // Empty or non-JSON bodies default to GENERATE.
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

    // Hard input gate: blocks only generation/regeneration. Report reads,
    // existing image display, consent withdrawal, and retention are unaffected.
    const fullBodyCheck = await checkFullBodyImageSize({
      bucket: bodyPhoto.mediaAsset.bucket,
      key: bodyPhoto.mediaAsset.key,
    });
    if (!fullBodyCheck.ok) {
      return NextResponse.json({ error: fullBodyCheck.code }, { status: 409 });
    }

    const result = await runPersonalTryOnGeneration(
      {
        diagnosisId: diagnosis.id,
        recommendationId: recommendation.id,
        userId: diagnosis.userId,
        anonymousSessionId: diagnosis.anonymousSessionId,
        action,
        snapshot: snapshotValidation.snapshot,
        fullBody: { bucket: bodyPhoto.mediaAsset.bucket, key: bodyPhoto.mediaAsset.key },
        frontFace: { bucket: facePhoto.mediaAsset.bucket, key: facePhoto.mediaAsset.key },
      },
      {
        provider: getProvider(),
        storeImage: storeImageFromUrlOrBase64,
        buildImageInput: buildProviderImageInput,
        deleteObject: (input) =>
          deleteObjectFromR2({
            bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
            key: input.key,
          }),
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
