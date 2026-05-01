import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type ConversationMemoryMessage = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

export type ConversationClientMessage = {
  id: string;
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
};

export async function getConversationHistory(conversationId: string, take = 40): Promise<ConversationMemoryMessage[]> {
  return prisma.message
    .findMany({
      where: { conversationId },
      select: { sender: true, body: true },
      orderBy: { createdAt: "desc" },
      take,
    })
    .then((messages) => messages.reverse());
}

export async function getConversationForClient({
  conversationId,
  companyId,
  visitorSessionId,
}: {
  conversationId: string;
  companyId: string;
  visitorSessionId?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      companyId,
      ...(visitorSessionId ? { visitorSessionId } : {}),
    },
    include: {
      lead: { include: { service: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sender: true,
          body: true,
          metadata: true,
          createdAt: true,
        },
      },
      aiRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!conversation) return null;

  return {
    conversationId: conversation.id,
    leadId: conversation.leadId,
    leadScore: conversation.lead.score,
    leadStatus: conversation.lead.status,
    intent: conversation.lead.intent,
    qualificationStatus: conversation.lead.qualificationStatus,
    buyingStage: conversation.lead.buyingStage,
    route: conversation.lead.route,
    summary: conversation.lead.lastSummary,
    latestAiRun: conversation.aiRuns[0]
      ? {
          intent: conversation.aiRuns[0].intent,
          nextAction: conversation.aiRuns[0].nextAction,
          response: conversation.aiRuns[0].response,
          extractedData: conversation.aiRuns[0].extractedData,
          createdAt: conversation.aiRuns[0].createdAt.toISOString(),
        }
      : null,
    messages: conversation.messages.map((message): ConversationClientMessage => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      metadata: message.metadata,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function saveMessage({
  conversationId,
  sender,
  body,
  metadata,
}: {
  conversationId: string;
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.message.create({
    data: {
      conversationId,
      sender,
      body,
      metadata,
    },
  });
}

export function buildContextFromHistory(history: ConversationMemoryMessage[]) {
  return history.map((message) => ({
    sender: message.sender,
    body: message.body,
  }));
}
