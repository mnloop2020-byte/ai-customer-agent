import { prisma } from "@/lib/db";
import { isSmtpConfigured, sendAutomationEmail } from "@/lib/integrations/email";

type ProcessDueFollowUpsInput = {
  companyId: string;
  actorId?: string;
  limit?: number;
};

type ProcessedTask = {
  id: string;
  kind: string;
  stepNumber: number;
  leadId: string;
  conversationId: string;
  deliveryStatus: "SENT" | "FAILED" | "INTERNAL_ONLY";
  deliveryChannel: "EMAIL" | "UNSUPPORTED" | "NONE";
};

type DueTask = Awaited<ReturnType<typeof processDueFollowUpsQuery>>[number];

export async function processDueFollowUps({
  companyId,
  actorId,
  limit = 50,
}: ProcessDueFollowUpsInput) {
  const now = new Date();
  const dueTasks = await processDueFollowUpsQuery(companyId, now, limit);

  const processed: ProcessedTask[] = [];

  for (const task of dueTasks) {
    const deliveryPlan = await resolveDeliveryPlan(task);
    const result = await prisma.$transaction(async (tx) => {
      const latestConversation = task.lead.conversations[0];
      const conversation = latestConversation
        ? await tx.conversation.update({
            where: { id: latestConversation.id },
            data: {
              status: "WAITING_AGENT",
              closedAt: null,
            },
          })
        : await tx.conversation.create({
            data: {
              companyId,
              leadId: task.leadId,
              channel: task.lead.channel,
              status: "WAITING_AGENT",
            },
          });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          sender: "SYSTEM",
          body: buildAutomationNote(task.kind, task.stepNumber, task.message, deliveryPlan),
          metadata: {
            automation: true,
            followUpId: task.id,
            kind: task.kind,
            stepNumber: task.stepNumber,
            deliveryChannel: deliveryPlan.channel,
            deliveryStatus: deliveryPlan.status,
          },
        },
      });

      await tx.followUp.update({
        where: { id: task.id },
        data: {
          status: deliveryPlan.status === "FAILED" ? "FAILED" : "SENT",
          sentAt: deliveryPlan.status === "FAILED" ? null : now,
        },
      });

      await tx.lead.update({
        where: { id: task.leadId },
        data: buildLeadUpdate(task.kind),
      });

      await tx.auditLog.create({
        data: {
          companyId,
          actorId,
          action: deliveryPlan.status === "FAILED" ? "follow_up.failed" : "follow_up.run",
          entity: "FollowUp",
          entityId: task.id,
          metadata: {
            kind: task.kind,
            stepNumber: task.stepNumber,
            conversationId: conversation.id,
            deliveryChannel: deliveryPlan.channel,
            deliveryStatus: deliveryPlan.status,
            reason: deliveryPlan.reason,
          },
        },
      });

      if (deliveryPlan.status === "FAILED") {
        await tx.handoff.create({
          data: {
            leadId: task.leadId,
            reason: "Automation delivery failed",
            summary: `Follow-up ${task.kind} step ${task.stepNumber} could not be delivered. Reason: ${deliveryPlan.reason}`,
          },
        });
      }

      return {
        id: task.id,
        kind: task.kind,
        stepNumber: task.stepNumber,
        leadId: task.leadId,
        conversationId: conversation.id,
        deliveryStatus: deliveryPlan.status,
        deliveryChannel: deliveryPlan.channel,
      };
    });

    processed.push(result);
  }

  return {
    processedCount: processed.length,
    tasks: processed,
  };
}

async function resolveDeliveryPlan(
  task: DueTask,
): Promise<{
  status: "SENT" | "FAILED" | "INTERNAL_ONLY";
  channel: "EMAIL" | "UNSUPPORTED" | "NONE";
  reason: string;
}> {
  const preferred = (task.lead.preferredContact || "").toLowerCase();
  const wantsEmail = preferred === "email" || (!preferred && Boolean(task.lead.email));

  if (wantsEmail && task.lead.email) {
    if (!isSmtpConfigured()) {
      return {
        status: "FAILED",
        channel: "EMAIL",
        reason: "SMTP is not configured.",
      };
    }

    try {
      await sendAutomationEmail({
        to: task.lead.email,
        customerName: task.lead.fullName,
        companyName: task.lead.companyName || "MNtechnique",
        subject: buildEmailSubject(task.kind),
        message: task.message,
      });

      return {
        status: "SENT",
        channel: "EMAIL",
        reason: "Delivered by SMTP email.",
      };
    } catch (error) {
      return {
        status: "FAILED",
        channel: "EMAIL",
        reason: error instanceof Error ? error.message : "Unknown SMTP error.",
      };
    }
  }

  if (preferred === "whatsapp" || preferred === "phone") {
    return {
      status: "FAILED",
      channel: "UNSUPPORTED",
      reason: `Preferred channel "${task.lead.preferredContact}" is not integrated yet.`,
    };
  }

  return {
    status: "INTERNAL_ONLY",
    channel: "NONE",
    reason: "No external delivery channel was available; created an internal system task only.",
  };
}

function processDueFollowUpsQuery(companyId: string, now: Date, limit: number) {
  return prisma.followUp.findMany({
    where: {
      companyId,
      status: "SCHEDULED",
      dueAt: { lte: now },
    },
    include: {
      lead: {
        include: {
          conversations: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { stepNumber: "asc" }],
    take: limit,
  });
}

function buildAutomationNote(
  kind: string,
  stepNumber: number,
  message: string,
  deliveryPlan: {
    status: "SENT" | "FAILED" | "INTERNAL_ONLY";
    channel: "EMAIL" | "UNSUPPORTED" | "NONE";
    reason: string;
  },
) {
  const label = displayKind(kind);
  return `Automation executed | ${label} | Step ${stepNumber} | ${deliveryPlan.status} | ${deliveryPlan.reason} | ${message}`;
}

function buildLeadUpdate(kind: string) {
  if (kind === "BOOKING") {
    return {
      status: "HOT" as const,
      route: "BOOKING" as const,
      buyingStage: "NEGOTIATION" as const,
    };
  }

  if (kind === "CONTINUE_QUALIFICATION") {
    return {
      route: "QUALIFY" as const,
      buyingStage: "QUALIFICATION" as const,
    };
  }

  if (kind === "REENGAGE_LOST") {
    return {
      status: "WARM" as const,
      route: "FOLLOW_UP" as const,
      buyingStage: "FOLLOW_UP" as const,
      lostReason: null,
    };
  }

  return {
    route: "FOLLOW_UP" as const,
    buyingStage: "FOLLOW_UP" as const,
  };
}

function buildEmailSubject(kind: string) {
  const labels: Record<string, string> = {
    BOOKING: "Your demo booking follow-up",
    CHECK_DECISION: "Checking in on your decision",
    CONTINUE_QUALIFICATION: "A quick follow-up on your requirements",
    RECOVER_OBJECTION: "Following up on your questions",
    REENGAGE_LOST: "We can revisit this when the timing suits you",
  };

  return labels[kind] ?? "Follow-up from MNtechnique";
}

function displayKind(kind: string) {
  const labels: Record<string, string> = {
    BOOKING: "Demo booking",
    CHECK_DECISION: "Check decision",
    CONTINUE_QUALIFICATION: "Continue qualification",
    RECOVER_OBJECTION: "Recover objection",
    REENGAGE_LOST: "Re-engagement",
  };

  return labels[kind] ?? kind;
}
