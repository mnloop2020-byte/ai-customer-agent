import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";
import { checkRateLimit, getClientKey } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const limit = checkRateLimit({
    key: getClientKey(request, "auth-login"),
    limit: 8,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many login attempts. Please wait a moment." }, { status: 429 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login data" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  });

  return NextResponse.json({ ok: true });
}
