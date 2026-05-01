import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const cookieName = "ai_customer_agent_session";
const sessionDays = 7;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
};

export async function createSession(user: AuthUser) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await deleteExpiredSessions();

  await prisma.session.create({
    data: {
      tokenHash,
      expiresAt,
      userId: user.id,
      companyId: user.companyId,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }

    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    companyId: session.companyId,
  };
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(cookieName);
}

export async function deleteExpiredSessions() {
  await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
