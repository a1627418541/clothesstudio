import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { prisma } from "@/lib/prisma";

const consentBodySchema = z.object({
  consent: z.boolean(),
  deleteGenerated: z.boolean().default(false),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const parsed = consentBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_CONSENT_REQUEST" },
        { status: 400 }
      );
    }

    const session = await auth();
    const userId = session?.user?.id ?? null;
    let anonymousSessionId: string | null = null;
    if (!userId) {
      const token = request.cookies.get("aps_anonymous_session")?.value;
      if (token) {
        anonymousSessionId =
          (await getAnonymousSessionByToken(token))?.id ?? null;
      }
    }
    const diagnosis = await prisma.styleDiagnosis.findUnique({
      where: { id },
      select: { id: true, userId: true, anonymousSessionId: true },
    });
    if (!diagnosis) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const owned = diagnosis.userId
      ? diagnosis.userId === userId
      : Boolean(
          anonymousSessionId &&
            diagnosis.anonymousSessionId === anonymousSessionId
        );
    if (!owned) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (parsed.data.consent) {
        await tx.styleDiagnosis.update({
          where: { id },
          data: {
            faceTryOnConsent: true,
            faceTryOnConsentAt: now,
            faceTryOnRevokedAt: null,
          },
        });
        return;
      }

      await tx.styleDiagnosis.update({
        where: { id },
        data: {
          faceTryOnConsent: false,
          faceTryOnRevokedAt: now,
        },
      });
      await tx.styleRecommendation.updateMany({
        where: {
          diagnosisId: id,
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
      if (parsed.data.deleteGenerated) {
        await tx.styleRecommendation.updateMany({
          where: { diagnosisId: id },
          data: {
            tryOnImageUrl: null,
            tryOnImageStatus: "PENDING",
            tryOnImageError: null,
            tryOnWorkflowStatus: "CANCELLED",
            tryOnFailureCode: null,
            tryOnProvider: null,
            identityScore: null,
            productFidelityScore: null,
            tryOnExpiresAt: null,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      consent: parsed.data.consent,
      deletedGenerated: !parsed.data.consent && parsed.data.deleteGenerated,
    });
  } catch {
    console.error("Try-on consent error: CONSENT_UPDATE_FAILED");
    return NextResponse.json(
      { error: "CONSENT_UPDATE_FAILED" },
      { status: 500 }
    );
  }
}
