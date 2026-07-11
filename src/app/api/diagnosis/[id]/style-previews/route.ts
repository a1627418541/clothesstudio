import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { generateStylePreviewImage } from "@/lib/ai/style-preview-service";
import { getRequestedPreviewStatuses } from "@/lib/ai/style-preview-policy";

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
    const candidates = diagnosis.recommendations.filter((rec) =>
      requestedStatuses.includes(rec.previewImageStatus)
    );

    let updated = 0;
    let skipped = diagnosis.recommendations.length - candidates.length;
    let failed = 0;
    const claimedRecommendations = [];

    for (const rec of candidates) {
      const claim = await prisma.styleRecommendation.updateMany({
        where: {
          id: rec.id,
          previewImageStatus: rec.previewImageStatus,
        },
        data: { previewImageStatus: "PROCESSING", previewImageError: null },
      });

      if (claim.count === 0) {
        skipped++;
        continue;
      }

      claimedRecommendations.push(rec);
    }

    const outcomes = await Promise.all(
      claimedRecommendations.map(async (rec) => {
        try {
          const result = await generateStylePreviewImage({
            diagnosis: {
              id: diagnosis.id,
              gender: diagnosis.gender,
              age: diagnosis.age,
              heightCm: diagnosis.heightCm,
              weightKg: diagnosis.weightKg,
            },
            recommendation: rec,
          });
          if (result.status === "COMPLETED") {
            await prisma.styleRecommendation.update({
              where: { id: rec.id },
              data: {
                previewImageUrl: result.url,
                previewImageStatus: "COMPLETED",
                previewImagePrompt: result.prompt,
                previewImageError: null,
              },
            });
            return "updated" as const;
          }
          await prisma.styleRecommendation.update({
            where: { id: rec.id },
            data: {
              previewImageStatus: "FAILED",
              previewImagePrompt: result.prompt,
              previewImageError: result.error,
            },
          });
          return "failed" as const;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown generation error";
          await prisma.styleRecommendation.update({
            where: { id: rec.id },
            data: {
              previewImageStatus: "FAILED",
              previewImageError: message,
            },
          });
          return "failed" as const;
        }
      })
    );

    for (const outcome of outcomes) {
      if (outcome === "updated") {
        updated++;
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
