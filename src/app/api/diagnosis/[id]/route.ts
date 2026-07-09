import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { getDiagnosisDetailForViewer } from "@/lib/diagnosis-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await auth();
    const userId = session?.user?.id ?? null;

    let anonymousSessionId: string | null = null;
    if (!userId) {
      const anonymousToken = request.cookies.get("aps_anonymous_session")?.value;
      if (anonymousToken) {
        const anonymousSession = await getAnonymousSessionByToken(anonymousToken);
        anonymousSessionId = anonymousSession?.id ?? null;
      }
    }

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: id,
      userId,
      anonymousSessionId,
    });

    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: result.code }, { status });
    }

    return NextResponse.json(result.diagnosis);
  } catch (error) {
    console.error("Diagnosis detail error:", error);
    const message = error instanceof Error ? error.message : "Failed to load diagnosis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
