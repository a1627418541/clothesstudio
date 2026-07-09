import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";

const ANONYMOUS_SESSION_COOKIE = "aps_anonymous_session";
const ANONYMOUS_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface AnonymousSession {
  id: string;
  token: string;
  expiresAt: Date;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnonymousSessionResult {
  session: AnonymousSession;
  isNew: boolean;
}

export async function getOrCreateAnonymousSession(): Promise<AnonymousSessionResult> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value;

  if (existingToken) {
    const session = await prisma.anonymousSession.findUnique({
      where: { token: existingToken },
    });

    if (session && session.expiresAt > new Date()) {
      return { session, isNew: false };
    }
  }

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + ANONYMOUS_SESSION_MAX_AGE * 1000);

  const session = await prisma.anonymousSession.create({
    data: {
      token,
      expiresAt,
    },
  });

  cookieStore.set(ANONYMOUS_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANONYMOUS_SESSION_MAX_AGE,
  });

  return { session, isNew: true };
}

export async function getAnonymousSessionByToken(token: string): Promise<AnonymousSession | null> {
  const session = await prisma.anonymousSession.findUnique({
    where: { token },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session;
}

export async function linkAnonymousSessionToUser(token: string, userId: string): Promise<void> {
  await prisma.anonymousSession.updateMany({
    where: { token },
    data: { userId },
  });
}
