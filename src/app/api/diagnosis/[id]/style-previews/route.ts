import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { getRequestedPreviewStatuses } from "@/lib/ai/style-preview-policy";
import { runStylePreviewAttempt } from "@/lib/ai/style-preview-attempt-service";
import {
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
  STYLE_PREVIEW_COMPILER_VERSION,
} from "@/lib/ai/style-preview-compiler";
import { buildStylePreviewPrompt } from "@/lib/ai/style-preview-prompt";
import { parseV2RecommendationSet } from "@/lib/style-archetype/recommendation-snapshot";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const maxDuration = 180;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const session = await auth();
    const userId = session?.user?.id ?? null;

    let anonymousSessionId: string | null = null;
    if (!userId) {
      const cookieStore = await cookies();
      const anonymousToken = cookieStore.get("aps_anonymous_session")?.value;
      if (anonymousToken) {
        const anonymousSession = await getAnonymousSessionByToken(anonymousToken);
        anonymousSessionId = anonymousSession?.id ?? null;
      }
    }

    const diagnosis = await prisma.styleDiagnosis.findUnique({
      where: { id },
      include: {
        photos: {
          include: {
            mediaAsset: true,
          },
        },
        recommendations: {
          orderBy: { rank: "asc" },
        },
      },
    });

    if (!diagnosis) {
      return NextResponse.json({ ok: false, error: "Diagnosis not found" }, { status: 404 });
    }

    if (diagnosis.userId) {
      if (!userId || diagnosis.userId !== userId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    } else {
      if (!anonymousSessionId || diagnosis.anonymousSessionId !== anonymousSessionId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const retryFailed = request.nextUrl.searchParams.get("retryFailed") === "true";
    const requestedStatuses = getRequestedPreviewStatuses(retryFailed);
    const containsV2 = diagnosis.recommendations.some(
      (recommendation) => recommendation.sourceMode === "ARCHETYPE_V2"
    );
    const v2Snapshots = containsV2
      ? parseV2RecommendationSet(diagnosis.recommendations)
      : null;

    const faceFrontPhoto = diagnosis.photos.find(
      (photo) => photo.role === "FACE_FRONT"
    );
    const faceImageUrl = faceFrontPhoto?.mediaAsset.url ?? undefined;
    const faceTryOnConsent = diagnosis.faceTryOnConsent;

    if (containsV2 && !v2Snapshots) {
      return NextResponse.json({
        ok: true,
        data: {
          updated: 0,
          skipped: diagnosis.recommendations.length,
          failed: 0,
        },
      });
    }

    const candidates = diagnosis.recommendations.filter((rec) =>
      requestedStatuses.includes(rec.previewImageStatus)
    );

    let updated = 0;
    let skipped = diagnosis.recommendations.length - candidates.length;
    let failed = 0;

    const outcomes = await Promise.all(
      candidates.map(async (rec) => {
        let finalPrompt: string;
        let compilerVersion: number | null;
        if (rec.sourceMode === "ARCHETYPE_V2") {
          const snapshot = v2Snapshots?.find(
            (candidate) => candidate.selection.rank === rec.rank
          );
          if (!snapshot) return "skipped" as const;
          finalPrompt = compileStylePreviewPrompt(
            buildCompiledStylePrompt(snapshot)
          );
          compilerVersion = STYLE_PREVIEW_COMPILER_VERSION;
        } else if (rec.sourceMode === "LEGACY_AI") {
          finalPrompt = buildStylePreviewPrompt({
            gender: diagnosis.gender,
            age: diagnosis.age,
            title: rec.title,
            description: rec.description,
            summary: rec.summary,
            clothingAdvice: rec.clothingAdvice,
            hairstyleAdvice: rec.hairstyleAdvice,
            shoesAdvice: rec.shoesAdvice,
            colorPalette: rec.colorPalette,
          });
          compilerVersion = null;
        } else {
          return "skipped" as const;
        }

        const result = await runStylePreviewAttempt({
          client: prisma,
          recommendation: rec,
          owner: {
            userId: diagnosis.userId,
            anonymousSessionId: diagnosis.anonymousSessionId,
          },
          expectedStatus: retryFailed ? "FAILED" : "PENDING",
          finalPrompt,
          compilerVersion,
          faceImageUrl,
          faceTryOnConsent,
        });

        if (result.status === "COMPLETED") return "updated" as const;
        if (result.status === "SKIPPED") return "skipped" as const;
        return "failed" as const;
      })
    );

    for (const outcome of outcomes) {
      if (outcome === "updated") {
        updated++;
      } else if (outcome === "skipped") {
        skipped++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      data: { updated, skipped, failed },
    });
  } catch (error) {
    console.error("Style preview generation error:", error);
    const message = error instanceof Error ? error.message : "Style preview generation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
