import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { generateStylePreviewImage } from "@/lib/ai/style-preview-service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
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

    const candidates = diagnosis.recommendations.filter(
      (rec) => rec.previewImageStatus === "PENDING" || rec.previewImageStatus === "FAILED"
    );

    let updated = 0;
    const skipped = diagnosis.recommendations.length - candidates.length;
    let failed = 0;

    for (const rec of candidates) {
      await prisma.styleRecommendation.update({
        where: { id: rec.id },
        data: { previewImageStatus: "PROCESSING", previewImageError: null },
      });

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
          updated++;
        } else {
          await prisma.styleRecommendation.update({
            where: { id: rec.id },
            data: {
              previewImageStatus: "FAILED",
              previewImagePrompt: result.prompt,
              previewImageError: result.error,
            },
          });
          failed++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown generation error";
        await prisma.styleRecommendation.update({
          where: { id: rec.id },
          data: {
            previewImageStatus: "FAILED",
            previewImageError: message,
          },
        });
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
