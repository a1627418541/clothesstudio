import { NextResponse } from "next/server";
import { getOrCreateAnonymousSession } from "@/lib/anonymous-session";

export async function GET() {
  const { session, isNew } = await getOrCreateAnonymousSession();

  return NextResponse.json({
    anonymousSessionId: session.id,
    expiresAt: session.expiresAt,
    isNew,
  });
}
