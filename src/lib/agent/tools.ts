import type { AgentDecision } from "@/domain/agent";
import type { Prisma } from "@/generated/prisma/client";
import type { GeneratedReply } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";

export type AgentToolName =
  | "save_customer_message"
  | "save_ai_message"
  | "record_ai_run"
  | "search_knowledge"
  | "upsert_deal"
  | "schedule_booking"
  | "schedule_follow_up"
  | "update_lead_qualification"
  | "update_conversation_status"
  | "handoff_to_human";

export type AgentToolCall = {
  name: AgentToolName;
  reason: string;
};

type ExecuteAgentToolsInput = {
  companyId: string;
  conversationId: string;
  leadId: string;
  customerMessage: string;
  decision: AgentDecision;
  generated: GeneratedReply;
  knowledgeResults?: Array<{ documentTitle: string; chunkId: string; score: number; content: string }>;
  leadScore: number;
  leadStatus: "HOT" | "WARM" | "COLD" | "UNQUALIFIED";
};

type ScheduledTask = {
  id: string;
  dueAt: Date;
  message: string;
  kind: string;
  stepNumber: number;
};

type SequenceDraft = {
  kind: "BOOKING" | "CHECK_DECISION" | "CONTINUE_QUALIFICATION" | "RECOVER_OBJECTION" | "REENGAGE_LOST";
  sequenceKey: string;
  stepNumber: number;
  dueAt: Date;
  message: string;
};

export async function executeAgentTools(input: ExecuteAgentToolsInput) {
  const toolCalls = planAgentTools(input.decision, Boolean(input.knowledgeResults?.length));
  const shouldHandoff = toolCalls.some((tool) => tool.name === "handoff_to_human");
  const shouldUpsertDeal = toolCalls.some((tool) => tool.name === "upsert_deal");
  const shouldScheduleBooking = toolCalls.some((tool) => tool.name === "schedule_booking");
  const shouldScheduleFollowUp = toolCalls.some((tool) => tool.name === "schedule_follow_up");
  const matchedService = input.decision.profileUpdates.serviceName
    ? await prisma.service.findFirst({
        where: {
          companyId: input.companyId,
          name: input.decision.profileUpdates.serviceName,
          isActive: true,
        },
      })
    : null;
  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.message.create({
      data: {
        conversationId: input.conversationId,
        sender: "AI",
        body: input.generated.text,
      metadata: {
          tool: "save_ai_message",
          provider: input.generated.provider,
          intent: input.decision.intent,
          nextAction: input.decision.nextAction,
          matchedKnowledge: input.decision.matchedKnowledge,
          route: input.decision.route,
          qualificationStatus: input.decision.qualificationStatus,
          bookingRequested: input.decision.bookingRequested,
        },
      },
    }),
    prisma.aiRun.create({
      data: {
        companyId: input.companyId,
        conversationId: input.conversationId,
        intent: input.decision.intent,
        extractedData: {
          toolCalls,
          temperature: input.decision.temperature,
          route: input.decision.route,
          qualificationStatus: input.decision.qualificationStatus,
          buyingStage: input.decision.buyingStage,
          missingFields: input.decision.missingFields,
          qualificationSignals: input.decision.qualificationSignals,
          summary: input.decision.summary,
          customerContext: input.decision.customerContext,
          personalizationStrategy: input.decision.personalizationStrategy,
          intentOverride: input.decision.intentOverride,
          objection: input.decision.objection,
          conversationState: input.decision.conversationState,
          antiRepetition: input.decision.antiRepetition,
          prediction: input.decision.prediction,
          salesPlaybook: input.decision.salesPlaybook,
          stageMemory: input.decision.stageMemory,
          bookingRequested: input.decision.bookingRequested,
          lostDeal: input.decision.lostDeal,
          followUpPlan: input.decision.followUpPlan,
          recommendedOffer: input.decision.recommendedOffer,
          cta: input.decision.cta,
          profileUpdates: input.decision.profileUpdates,
          matchedKnowledge: input.decision.matchedKnowledge,
          knowledgeResults: input.knowledgeResults ?? [],
          aiProvider: input.generated.provider,
        },
        scoreDelta: input.decision.scoreDelta,
        nextAction: input.decision.nextAction,
        response: input.generated.text,
      },
    }),
    prisma.lead.update({
      where: { id: input.leadId },
      data: {
        score: input.leadScore,
        intent: input.decision.intent,
        status: input.decision.lostDeal ? "LOST" : input.leadStatus,
        service: matchedService ? { connect: { id: matchedService.id } } : undefined,
        fullName: input.decision.profileUpdates.fullName,
        email: input.decision.profileUpdates.email,
        phone: input.decision.profileUpdates.phone,
        city: input.decision.profileUpdates.city,
        companyName: input.decision.profileUpdates.companyName,
        customerType: input.decision.profileUpdates.customerType,
        preferredContact: input.decision.profileUpdates.preferredContact,
        budget: input.decision.profileUpdates.budget,
        timeline: input.decision.profileUpdates.timeline,
        decisionMaker: input.decision.profileUpdates.decisionMaker,
        needsSummary: input.decision.profileUpdates.needsSummary,
        qualificationStatus: input.decision.qualificationStatus,
        buyingStage: input.decision.buyingStage,
        route: input.decision.route,
        agentMemory: input.decision.stageMemory as Prisma.InputJsonValue,
        qualificationSignals: input.decision.qualificationSignals,
        missingFields: input.decision.missingFields,
        lastSummary: input.decision.summary,
        lostReason: input.decision.lostDeal?.summary,
      },
    }),
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        status: input.decision.lostDeal
          ? shouldScheduleFollowUp
            ? "WAITING_AGENT"
            : "CLOSED"
          : shouldHandoff || shouldScheduleBooking || shouldScheduleFollowUp
            ? "WAITING_AGENT"
            : "WAITING_CUSTOMER",
      },
    }),
  ];

  let booking: ScheduledTask | null = null;
  let bookingWriteIndexes: number[] = [];
  let followUp: ScheduledTask | null = null;
  let followUpWriteIndexes: number[] = [];

  if (shouldUpsertDeal && input.decision.recommendedOffer) {
    const existingDeal = await prisma.deal.findFirst({
      where: {
        leadId: input.leadId,
        status: { in: ["OPEN", "PROPOSAL_SENT", "NEGOTIATION"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existingDeal) {
      writes.push(
        prisma.deal.create({
          data: {
            leadId: input.leadId,
            title: buildDealTitle(input.decision),
            value: parseMoney(input.decision.recommendedOffer.price),
            currency: "USD",
            status: input.decision.route === "BOOKING" ? "NEGOTIATION" : "PROPOSAL_SENT",
          },
        }),
      );

      writes.push(
        prisma.auditLog.create({
          data: {
            companyId: input.companyId,
            action: "deal.auto_create",
            entity: "Lead",
            entityId: input.leadId,
            metadata: {
              offerName: input.decision.recommendedOffer.offerName,
              serviceName: input.decision.recommendedOffer.serviceName,
              price: input.decision.recommendedOffer.price,
            },
          },
        }),
      );
    } else if (input.decision.route === "BOOKING" && existingDeal.status !== "NEGOTIATION") {
      writes.push(
        prisma.deal.update({
          where: { id: existingDeal.id },
          data: { status: "NEGOTIATION" },
        }),
      );
    }
  }

  if (shouldScheduleBooking) {
    const bookingSequence = buildBookingSequence(input.decision);
    const bookingResult = await ensureFollowUpSequence({
      companyId: input.companyId,
      leadId: input.leadId,
      sequence: bookingSequence,
      writes,
    });
    booking = bookingResult.primary;
    bookingWriteIndexes = bookingResult.writeIndexes;

    if (bookingResult.writeIndexes.length) {
      writes.push(
        prisma.auditLog.create({
          data: {
            companyId: input.companyId,
            action: "booking.auto_create",
            entity: "Lead",
            entityId: input.leadId,
            metadata: {
              kind: "BOOKING",
              steps: bookingSequence.length,
            },
          },
        }),
      );
    }
  }

  if (shouldScheduleFollowUp && input.decision.followUpPlan) {
    const followUpSequence = buildFollowUpSequence(input.decision.followUpPlan);
    const followUpResult = await ensureFollowUpSequence({
      companyId: input.companyId,
      leadId: input.leadId,
      sequence: followUpSequence,
      writes,
    });
    followUp = followUpResult.primary;
    followUpWriteIndexes = followUpResult.writeIndexes;

    if (followUpResult.writeIndexes.length) {
      writes.push(
        prisma.auditLog.create({
          data: {
            companyId: input.companyId,
            action: "follow_up.auto_create",
            entity: "Lead",
            entityId: input.leadId,
            metadata: {
              kind: input.decision.followUpPlan.kind,
              steps: followUpSequence.length,
            },
          },
        }),
      );
    }
  }

  if (shouldHandoff) {
    writes.push(
      prisma.handoff.create({
        data: {
          leadId: input.leadId,
          reason: input.decision.handoffReason ?? input.decision.intent,
          summary: `${input.decision.summary}\nCustomer: ${input.customerMessage}\nAI: ${input.generated.text}`,
        },
      }),
    );
  }

  const results = await prisma.$transaction(writes);

  if (!booking && bookingWriteIndexes.length) {
    const createdBookings = bookingWriteIndexes
      .map((index) => results[index] as ScheduledTask)
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
    booking = createdBookings[0] ?? null;
  }

  if (!followUp && followUpWriteIndexes.length) {
    const createdFollowUps = followUpWriteIndexes
      .map((index) => results[index] as ScheduledTask)
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
    followUp = createdFollowUps[0] ?? null;
  }

  return { toolCalls, booking, followUp };
}

export function planAgentTools(decision: AgentDecision, searchedKnowledge = false): AgentToolCall[] {
  const tools: AgentToolCall[] = [
    {
      name: "search_knowledge",
      reason: searchedKnowledge
        ? "Search company knowledge base and use matching chunks before answering."
        : "Search company knowledge base; no matching chunks were found for this turn.",
    },
    {
      name: "save_customer_message",
      reason: "Store the incoming customer message in the conversation timeline.",
    },
    {
      name: "save_ai_message",
      reason: "Store the AI response for the inbox and future conversation memory.",
    },
    {
      name: "record_ai_run",
      reason: "Keep an auditable record of the agent decision, provider, score delta, and matched knowledge.",
    },
    {
      name: "upsert_deal",
      reason: decision.recommendedOffer && ["PRESENT_OFFER", "BOOKING"].includes(decision.route)
        ? "Create or update a real CRM deal when the agent presents a suitable offer."
        : "No deal should be created for this turn.",
    },
    {
      name: "schedule_booking",
      reason: decision.bookingRequested
        ? "Create a real booking follow-up when the customer confirms the demo or asks for a meeting."
        : "No booking request was confirmed in this turn.",
    },
    {
      name: "schedule_follow_up",
      reason: decision.followUpPlan
        ? "Schedule an automatic follow-up so the lead does not go cold after this stage."
        : "No follow-up sequence is needed for this turn.",
    },
    {
      name: "update_lead_qualification",
      reason: "Update lead score, intent, and temperature after the agent analysis.",
    },
    {
      name: "update_conversation_status",
      reason: "Move the conversation to the next operational state.",
    },
  ];

  if (decision.nextAction === "HUMAN_HANDOFF") {
    tools.push({
      name: "handoff_to_human",
      reason: "The message matches handoff rules and needs a human representative.",
    });
  }

  return tools.filter((tool) => {
    if (tool.name === "upsert_deal" && !(decision.recommendedOffer && ["PRESENT_OFFER", "BOOKING"].includes(decision.route))) {
      return false;
    }
    if (tool.name === "schedule_booking" && !decision.bookingRequested) return false;
    if (tool.name === "schedule_follow_up" && !decision.followUpPlan) return false;
    return true;
  });
}

function getBookingDueAt(timeline?: string) {
  const now = new Date();
  const slot = new Date(now);

  if (timeline === "Immediately") {
    slot.setDate(slot.getDate() + 1);
    slot.setHours(10, 0, 0, 0);
    return slot;
  }

  if (timeline === "This week") {
    slot.setDate(slot.getDate() + 2);
    slot.setHours(11, 0, 0, 0);
    return slot;
  }

  if (timeline === "This month") {
    slot.setDate(slot.getDate() + 7);
    slot.setHours(12, 0, 0, 0);
    return slot;
  }

  slot.setDate(slot.getDate() + 3);
  slot.setHours(11, 0, 0, 0);
  return slot;
}

function getFollowUpDueAt(delayHours: number) {
  const dueAt = new Date();
  dueAt.setHours(dueAt.getHours() + delayHours);
  return dueAt;
}

function buildBookingMessage(decision: AgentDecision) {
  const offer = decision.recommendedOffer
    ? `${decision.recommendedOffer.offerName} - ${decision.recommendedOffer.price}`
    : "عرض مناسب للعميل";

  return `Demo request | ${offer} | ${decision.summary}`;
}

function buildDealTitle(decision: AgentDecision) {
  if (!decision.recommendedOffer) return "AI generated opportunity";

  return `${decision.recommendedOffer.serviceName} | ${decision.recommendedOffer.offerName}`;
}

function parseMoney(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;

  return Number(match[1].replace(",", "."));
}

function buildBookingSequence(decision: AgentDecision): SequenceDraft[] {
  return [
    {
      kind: "BOOKING",
      sequenceKey: "AUTO-BOOKING",
      stepNumber: 1,
      dueAt: getBookingDueAt(decision.profileUpdates.timeline),
      message: buildBookingMessage(decision),
    },
  ];
}

function buildFollowUpSequence(plan: NonNullable<AgentDecision["followUpPlan"]>): SequenceDraft[] {
  const baseMessage = `[${plan.kind}] ${plan.message}`;

  if (plan.kind === "CHECK_DECISION") {
    return [
      {
        kind: plan.kind,
        sequenceKey: "AUTO-CHECK_DECISION",
        stepNumber: 1,
        dueAt: getFollowUpDueAt(plan.delayHours),
        message: baseMessage,
      },
      {
        kind: plan.kind,
        sequenceKey: "AUTO-CHECK_DECISION",
        stepNumber: 2,
        dueAt: getFollowUpDueAt(plan.delayHours + 48),
        message: "[CHECK_DECISION] Follow up again if the customer still has not decided.",
      },
    ];
  }

  if (plan.kind === "CONTINUE_QUALIFICATION") {
    return [
      {
        kind: plan.kind,
        sequenceKey: "AUTO-CONTINUE_QUALIFICATION",
        stepNumber: 1,
        dueAt: getFollowUpDueAt(plan.delayHours),
        message: baseMessage,
      },
      {
        kind: plan.kind,
        sequenceKey: "AUTO-CONTINUE_QUALIFICATION",
        stepNumber: 2,
        dueAt: getFollowUpDueAt(plan.delayHours + 72),
        message: "[CONTINUE_QUALIFICATION] Collect the remaining qualification details and move the lead forward.",
      },
    ];
  }

  if (plan.kind === "RECOVER_OBJECTION") {
    return [
      {
        kind: plan.kind,
        sequenceKey: "AUTO-RECOVER_OBJECTION",
        stepNumber: 1,
        dueAt: getFollowUpDueAt(plan.delayHours),
        message: baseMessage,
      },
      {
        kind: plan.kind,
        sequenceKey: "AUTO-RECOVER_OBJECTION",
        stepNumber: 2,
        dueAt: getFollowUpDueAt(plan.delayHours + 78),
        message: "[RECOVER_OBJECTION] Revisit the objection and offer a simpler next step.",
      },
    ];
  }

  return [
    {
      kind: plan.kind,
      sequenceKey: "AUTO-REENGAGE_LOST",
      stepNumber: 1,
      dueAt: getFollowUpDueAt(plan.delayHours),
      message: baseMessage,
    },
    {
      kind: plan.kind,
      sequenceKey: "AUTO-REENGAGE_LOST",
      stepNumber: 2,
      dueAt: getFollowUpDueAt(plan.delayHours + 24 * 30),
      message: "[REENGAGE_LOST] Re-open the opportunity if timing or budget changed.",
    },
  ];
}

async function ensureFollowUpSequence({
  companyId,
  leadId,
  sequence,
  writes,
}: {
  companyId: string;
  leadId: string;
  sequence: SequenceDraft[];
  writes: Prisma.PrismaPromise<unknown>[];
}) {
  const kind = sequence[0]?.kind;
  if (!kind) {
    return { primary: null as ScheduledTask | null, writeIndexes: [] as number[] };
  }

  const existing = await prisma.followUp.findMany({
    where: {
      companyId,
      leadId,
      kind,
      status: "SCHEDULED",
    },
    orderBy: [{ stepNumber: "asc" }, { dueAt: "asc" }],
  });

  const existingByStep = new Map(existing.map((item) => [item.stepNumber, item]));
  const writeIndexes: number[] = [];

  for (const step of sequence) {
    if (existingByStep.has(step.stepNumber)) continue;

    writeIndexes.push(writes.length);
    writes.push(
      prisma.followUp.create({
        data: {
          companyId,
          leadId,
          kind: step.kind,
          sequenceKey: step.sequenceKey,
          stepNumber: step.stepNumber,
          status: "SCHEDULED",
          dueAt: step.dueAt,
          message: step.message,
        },
      }),
    );
  }

  const primary = [...existing].sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())[0] ?? null;
  return { primary, writeIndexes };
}
