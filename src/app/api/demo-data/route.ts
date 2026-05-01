import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { clearDemoData, seedDemoData } from "@/lib/demo-seed";
import { readJsonBody } from "@/lib/http/read-json";

const demoActionSchema = z.object({
  action: z.enum(["seed", "clear"]),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await readJsonBody(request);
  const parsed = demoActionSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid demo action" }, { status: 400 });

  if (parsed.data.action === "seed") {
    await seedDemoData(user.companyId);
    return NextResponse.json({ ok: true, message: "تم تحميل البيانات التجريبية." });
  }

  const deletedCount = await clearDemoData(user.companyId);
  return NextResponse.json({ ok: true, deletedCount, message: "تم مسح البيانات التجريبية." });
}
