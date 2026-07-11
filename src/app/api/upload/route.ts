import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { uploadBufferToR2 } from "@/lib/r2";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { DiagnosisPhotoRole } from "@prisma/client";
import { isOwnedByActor } from "@/lib/ownership";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "bin";
  }
}

export async function POST(request: NextRequest) {
  try {
    // Resolve user or anonymous session
    const session = await auth();
    const userId = session?.user?.id;

    let anonymousSessionId: string | null = null;
    if (!userId) {
      const cookieStore = request.cookies;
      const anonymousToken = cookieStore.get("aps_anonymous_session")?.value;
      if (!anonymousToken) {
        return NextResponse.json({ error: "Anonymous session required" }, { status: 401 });
      }
      const anonymousSession = await getAnonymousSessionByToken(anonymousToken);
      if (!anonymousSession) {
        return NextResponse.json({ error: "Invalid or expired anonymous session" }, { status: 401 });
      }
      anonymousSessionId = anonymousSession.id;
    }

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get("file");
    const role = formData.get("role") as DiagnosisPhotoRole | null;
    const diagnosisId = formData.get("diagnosisId") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Max 10MB." }, { status: 400 });
    }

    if (diagnosisId) {
      if (!role || !Object.values(DiagnosisPhotoRole).includes(role)) {
        return NextResponse.json(
          { error: "A valid photo role is required when diagnosisId is provided" },
          { status: 400 }
        );
      }

      const diagnosis = await prisma.styleDiagnosis.findUnique({
        where: { id: diagnosisId },
        select: {
          userId: true,
          anonymousSessionId: true,
        },
      });

      if (!diagnosis) {
        return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 });
      }

      if (
        !isOwnedByActor(diagnosis, {
          userId: userId ?? null,
          anonymousSessionId,
        })
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate R2 key
    const ownerPrefix = userId ? `user/${userId}` : `anonymous/${anonymousSessionId}`;
    const key = `uploads/${ownerPrefix}/${nanoid(16)}.${getExtensionFromMimeType(file.type)}`;

    const { bucket, url } = await uploadBufferToR2({
      key,
      body: buffer,
      contentType: file.type,
    });

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        userId,
        anonymousSessionId,
        type: "UPLOAD",
        bucket,
        key,
        url,
        mimeType: file.type,
        size: file.size,
        status: "UPLOADED",
      },
    });

    if (diagnosisId && role && Object.values(DiagnosisPhotoRole).includes(role)) {
      await prisma.diagnosisPhoto.upsert({
        where: {
          diagnosisId_role: {
            diagnosisId,
            role,
          },
        },
        update: {
          mediaAssetId: mediaAsset.id,
        },
        create: {
          diagnosisId,
          mediaAssetId: mediaAsset.id,
          role,
        },
      });
    }

    return NextResponse.json({
      id: mediaAsset.id,
      type: mediaAsset.type,
      url: mediaAsset.url,
      status: mediaAsset.status,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
