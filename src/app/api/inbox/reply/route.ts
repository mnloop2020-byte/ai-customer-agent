import { NextResponse } from "next/server";
import { inboxReplySchema } from "@/domain/inbox";
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

  const parsed = inboxReplySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reply", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.data.conversationId,
      companyId: user.companyId,
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        sender: "HUMAN",
        body: parsed.data.body,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "WAITING_CUSTOMER", closedAt: null },
    }),
    prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "inbox.reply",
        entity: "Conversation",
        entityId: conversation.id,
      },
    }),
  ]);

  return NextResponse.json({ message });
}
