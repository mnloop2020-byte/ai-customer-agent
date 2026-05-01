import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";

const createLeadSchema = z.object({
  fullName: z.string().min(2),
  serviceName: z.string().optional(),
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

  const parsed = createLeadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead data" }, { status: 400 });
  }

  const service = parsed.data.serviceName
    ? await prisma.service.findFirst({
        where: { companyId: user.companyId, name: parsed.data.serviceName },
      })
    : null;

  const lead = await prisma.lead.create({
    data: {
      companyId: user.companyId,
      serviceId: service?.id,
      fullName: parsed.data.fullName,
      channel: "WEB_CHAT",
      status: "NEW",
      score: 20,
      intent: "Manual Lead",
    },
  });

  return NextResponse.json({ lead });
}
