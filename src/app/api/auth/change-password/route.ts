import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" }, { status: 400 });
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, passwordHash: true },
  });

  if (!account || !verifyPassword(parsed.data.currentPassword, account.passwordHash)) {
    return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: account.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  return NextResponse.json({ ok: true });
}
