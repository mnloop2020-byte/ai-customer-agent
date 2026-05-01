import { NextResponse } from "next/server";
import { conversationActionSchema } from "@/domain/inbox";
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

  const parsed = conversationActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.data.conversationId,
      companyId: user.companyId,
    },
    include: {
      lead: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 6,
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (parsed.data.action === "escalate") {
    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "ESCALATED", closedAt: null },
      }),
      prisma.handoff.create({
        data: {
          leadId: conversation.leadId,
          userId: user.id,
          reason: "Manual escalation from inbox",
          summary: buildHandoffSummary(conversation.messages),
        },
      }),
      prisma.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "inbox.escalate",
          entity: "Conversation",
          entityId: conversation.id,
        },
      }),
    ]);

    return NextResponse.json({ status: "ESCALATED" });
  }

  const nextStatus = parsed.data.action === "close" ? "CLOSED" : "OPEN";
  const closedAt = parsed.data.action === "close" ? new Date() : null;

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: nextStatus, closedAt },
    }),
    prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: `inbox.${parsed.data.action}`,
        entity: "Conversation",
        entityId: conversation.id,
      },
    }),
  ]);

  return NextResponse.json({ status: nextStatus });
}

function buildHandoffSummary(messages: Array<{ sender: string; body: string }>) {
  if (messages.length === 0) return "No messages yet.";

  return messages
    .slice()
    .reverse()
    .map((message) => `${message.sender}: ${message.body}`)
    .join("\n")
    .slice(0, 2000);
}
