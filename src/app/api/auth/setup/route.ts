import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { ensureMntechniqueCompany } from "@/lib/mntechnique-seed";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";
import { checkRateLimit, getClientKey } from "@/lib/security/rate-limit";

const setupSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
});

export async function GET() {
  const userCount = await prisma.user.count();

  return NextResponse.json({ needsSetup: userCount === 0 });
}

export async function POST(request: Request) {
  const limit = checkRateLimit({
    key: getClientKey(request, "auth-setup"),
    limit: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many setup attempts. Please wait a moment." }, { status: 429 });
  }

  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return NextResponse.json({ error: "Setup is already completed" }, { status: 409 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = setupSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setup data", issues: parsed.error.flatten() }, { status: 400 });
  }

  const company = await ensureMntechniqueCompany();
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: hashPassword(parsed.data.password),
      role: "OWNER",
    },
  });

  await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  });

  return NextResponse.json({ ok: true });
}
