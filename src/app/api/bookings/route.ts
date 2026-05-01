import { NextResponse } from "next/server";
import { createBookingSchema } from "@/domain/booking";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid booking", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      companyId: user.companyId,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const booking = await prisma.followUp.create({
    data: {
      companyId: user.companyId,
      leadId: lead.id,
      kind: "BOOKING",
      sequenceKey: "MANUAL-BOOKING",
      stepNumber: 1,
      message: parsed.data.message,
      dueAt: parsed.data.dueAt,
      status: "SCHEDULED",
    },
    include: { lead: true },
  });

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "booking.create",
      entity: "FollowUp",
      entityId: booking.id,
    },
  });

  return NextResponse.json({ booking });
}
