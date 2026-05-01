import { analyzeIncomingMessage } from "@/domain/agent";
import type { ChatMessageInput } from "@/domain/chat";
import type { CompanyProfile } from "@/domain/company";
import { generateAgentReply } from "@/lib/ai/provider";
import { classifySemanticIntent } from "@/lib/ai/semantic-intent-classifier";
import { prisma } from "@/lib/db";
import { executeAgentTools } from "@/lib/agent/tools";
import { searchKnowledge } from "@/lib/knowledge";
import { buildContextFromHistory, getConversationHistory, saveMessage } from "@/lib/agent/memory";

const AGENT_CONTEXT_LIMIT = 12;

type RunAgentTurnInput = {
  companyId: string;
  companyProfile: CompanyProfile;
  message: ChatMessageInput;
};

export async function runAgentTurn({ companyId, companyProfile, message }: RunAgentTurnInput) {
  const conversationContext = await getOrCreateConversation({
    companyId,
    conversationId: message.conversationId,
    visitorSessionId: message.visitorSessionId,
    customerName: message.customerName,
    customerEmail: message.customerEmail,
  });
  const conversationHistory = buildContextFromHistory(
    await getConversationHistory(conversationContext.conversation.id, AGENT_CONTEXT_LIMIT),
  );

  await saveMessage({
    conversationId: conversationContext.conversation.id,
    sender: "CUSTOMER",
    body: message.body,
    metadata: {
      tool: "save_customer_message",
      savedBeforeAiRun: true,
    },
  });

  const knowledgeResults = await searchKnowledge({
    companyId,
    query: message.body,
    take: 4,
  });
  const semanticIntent = await classifySemanticIntent({
    customerMessage: message.body,
    conversationHistory,
    currentStage: conversationContext.lead.buyingStage ?? undefined,
    agentMemory: conversationContext.lead.agentMemory ?? undefined,
  });
  const decision = analyzeIncomingMessage({
    body: message.body,
    channel: "WEB_CHAT",
    companyProfile,
    conversationHistory,
    semanticIntent,
    leadSnapshot: {
      score: conversationContext.lead.score,
      status: conversationContext.lead.status,
      fullName: conversationContext.lead.fullName ?? undefined,
      email: conversationContext.lead.email ?? undefined,
      phone: conversationContext.lead.phone ?? undefined,
      city: conversationContext.lead.city ?? undefined,
      companyName: conversationContext.lead.companyName ?? undefined,
      serviceName: conversationContext.lead.service?.name ?? undefined,
      preferredContact: conversationContext.lead.preferredContact ?? undefined,
      budget: conversationContext.lead.budget ?? undefined,
      timeline: conversationContext.lead.timeline ?? undefined,
      decisionMaker: conversationContext.lead.decisionMaker ?? undefined,
      customerType: conversationContext.lead.customerType ?? undefined,
      needsSummary: conversationContext.lead.needsSummary ?? undefined,
      qualificationStatus: conversationContext.lead.qualificationStatus ?? undefined,
      buyingStage: conversationContext.lead.buyingStage ?? undefined,
      route: conversationContext.lead.route ?? undefined,
      agentMemory: conversationContext.lead.agentMemory ?? undefined,
    },
  });
  const generated = await generateAgentReply({
    customerMessage: message.body,
    companyProfile,
    decision,
    conversationHistory,
    knowledgeResults,
  });
  const leadScore = decision.absoluteScore;
  const leadStatus = statusFromTemperature(decision.temperature);
  const { toolCalls, booking, followUp } = await executeAgentTools({
    companyId,
    conversationId: conversationContext.conversation.id,
    leadId: conversationContext.lead.id,
    customerMessage: message.body,
    decision,
    generated,
    knowledgeResults,
    leadScore,
    leadStatus,
  });

  return {
    message: generated.text,
    leadScore,
    intent: decision.intent,
    temperature: decision.temperature,
    nextAction: decision.nextAction,
    matchedKnowledge: [
      ...(knowledgeResults.length ? [] : decision.matchedKnowledge),
      ...knowledgeResults.map((result) => `${result.documentTitle}: ${result.content.slice(0, 140)}`),
    ],
    knowledgeSources: [...new Set(knowledgeResults.map((result) => result.documentTitle))],
    knowledgeSourceDetails: knowledgeResults.map((result) => ({
      documentTitle: result.documentTitle,
      content: result.content.slice(0, 360),
      score: result.score,
    })),
    aiProvider: generated.provider,
    conversationId: conversationContext.conversation.id,
    leadId: conversationContext.lead.id,
    toolCalls,
    route: decision.route,
    qualificationStatus: decision.qualificationStatus,
    buyingStage: decision.buyingStage,
    customerContext: decision.customerContext,
    personalizationStrategy: decision.personalizationStrategy,
    intentOverride: decision.intentOverride,
    objection: decision.objection,
    conversationState: decision.conversationState,
    antiRepetition: decision.antiRepetition,
    prediction: decision.prediction,
    salesPlaybook: decision.salesPlaybook,
    missingFields: decision.missingFields,
    summary: decision.summary,
    recommendedOffer: decision.recommendedOffer,
    cta: decision.cta,
    lostDeal: decision.lostDeal
      ? {
          reason: decision.lostDeal.reason,
          summary: decision.lostDeal.summary,
          reEngageAfterDays: decision.lostDeal.reEngageAfterDays,
        }
      : undefined,
    booking: booking
      ? {
          id: booking.id,
          dueAt: booking.dueAt.toISOString(),
          message: booking.message,
          kind: booking.kind,
          stepNumber: booking.stepNumber,
        }
      : undefined,
    followUp: followUp
      ? {
          id: followUp.id,
          dueAt: followUp.dueAt.toISOString(),
          message: followUp.message,
          kind: followUp.kind,
          stepNumber: followUp.stepNumber,
        }
      : undefined,
  };
}

async function getOrCreateConversation({
  companyId,
  conversationId,
  visitorSessionId,
  customerName,
  customerEmail,
}: {
  companyId: string;
  conversationId?: string;
  visitorSessionId?: string;
  customerName?: string;
  customerEmail?: string;
}) {
  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        companyId,
        ...(visitorSessionId ? { visitorSessionId } : {}),
      },
      include: { lead: { include: { service: true } } },
    });

    if (conversation) return { conversation, lead: conversation.lead };
  }

  const lead = await prisma.lead.create({
    include: { service: true },
    data: {
      companyId,
      fullName: customerName || "\u0632\u0627\u0626\u0631 Web Chat",
      email: customerEmail,
      channel: "WEB_CHAT",
      status: "NEW",
      score: 0,
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      companyId,
      leadId: lead.id,
      visitorSessionId,
      channel: "WEB_CHAT",
      status: "OPEN",
    },
  });

  return { conversation, lead };
}

function statusFromTemperature(temperature: string) {
  if (temperature === "Hot") return "HOT";
  if (temperature === "Warm") return "WARM";
  if (temperature === "Cold") return "COLD";
  return "UNQUALIFIED";
}
