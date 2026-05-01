import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";
import { canManageDeals } from "@/lib/auth/roles";

const updateDealStatusSchema = z.object({
  dealId: z.string().min(1),
  status: z.enum(["OPEN", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageDeals(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateDealStatusSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal status", issues: parsed.error.flatten() }, { status: 400 });
  }

  const deal = await prisma.deal.findFirst({
    where: {
      id: parsed.data.dealId,
      lead: { companyId: user.companyId },
    },
    include: { lead: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const closedAt = ["WON", "LOST"].includes(parsed.data.status) ? new Date() : null;
  const updatedDeal = await prisma.$transaction(async (tx) => {
    const nextDeal = await tx.deal.update({
      where: { id: deal.id },
      data: {
        status: parsed.data.status,
        closedAt,
      },
    });

    if (parsed.data.status === "WON" || parsed.data.status === "LOST") {
      await tx.lead.update({
        where: { id: deal.leadId },
        data: {
          status: parsed.data.status,
          buyingStage: parsed.data.status,
          route: parsed.data.status === "WON" ? "DIRECT_ANSWER" : "DISQUALIFY",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "deal.status_update",
        entity: "Deal",
        entityId: deal.id,
        metadata: {
          from: deal.status,
          to: parsed.data.status,
        },
      },
    });

    return nextDeal;
  });

  return NextResponse.json({ deal: updatedDeal });
}
