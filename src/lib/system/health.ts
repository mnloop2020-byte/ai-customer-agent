import { prisma } from "@/lib/db";

export async function getSystemHealth(companyId: string) {
  const now = new Date();
  const [
    leadCount,
    conversationCount,
    scheduledFollowUps,
    failedFollowUps,
    pendingHandoffs,
    recentFailures,
    lastAutomationRun,
  ] = await Promise.all([
    prisma.lead.count({ where: { companyId } }),
    prisma.conversation.count({ where: { companyId } }),
    prisma.followUp.count({ where: { companyId, status: "SCHEDULED" } }),
    prisma.followUp.count({ where: { companyId, status: "FAILED" } }),
    prisma.handoff.count({ where: { lead: { companyId }, status: "PENDING" } }),
    prisma.followUp.findMany({
      where: { companyId, status: "FAILED" },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.auditLog.findFirst({
      where: { companyId, action: { in: ["follow_up.run", "follow_up.failed"] } },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, metadata: true },
    }),
  ]);

  return {
    checkedAt: now.toISOString(),
    database: {
      ok: true,
      leadCount,
      conversationCount,
    },
    environment: {
      databaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
      automationSecret: Boolean(process.env.AUTOMATION_SECRET?.trim()),
      aiProvider: process.env.AI_PROVIDER || "mock",
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
      smtp: isSmtpReady(),
      whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
      googleCalendar: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() && process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()),
      payment: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    },
    automation: {
      scheduledFollowUps,
      failedFollowUps,
      pendingHandoffs,
      lastRun: lastAutomationRun,
      recentFailures: recentFailures.map((item) => ({
        id: item.id,
        kind: item.kind,
        stepNumber: item.stepNumber,
        leadName: item.lead.fullName ?? "Web Chat visitor",
        message: item.message,
        createdAt: item.createdAt,
      })),
    },
    readiness: buildReadiness({
      failedFollowUps,
      pendingHandoffs,
      smtp: isSmtpReady(),
      automationSecret: Boolean(process.env.AUTOMATION_SECRET?.trim()),
      aiConfigured: isAiConfigured(),
    }),
  };
}

function buildReadiness({
  failedFollowUps,
  pendingHandoffs,
  smtp,
  automationSecret,
  aiConfigured,
}: {
  failedFollowUps: number;
  pendingHandoffs: number;
  smtp: boolean;
  automationSecret: boolean;
  aiConfigured: boolean;
}) {
  const items = [
    {
      key: "ai",
      label: "AI provider",
      ok: aiConfigured,
      action: aiConfigured ? "Ready" : "Add at least one AI provider key.",
    },
    {
      key: "automation",
      label: "Automation secret",
      ok: automationSecret,
      action: automationSecret ? "Ready" : "Set AUTOMATION_SECRET in .env.",
    },
    {
      key: "smtp",
      label: "Email delivery",
      ok: smtp,
      action: smtp ? "Ready" : "Add SMTP credentials before external follow-up delivery.",
    },
    {
      key: "failed-followups",
      label: "Failed follow-ups",
      ok: failedFollowUps === 0,
      action: failedFollowUps === 0 ? "Clear" : "Review failed follow-ups and pending handoffs.",
    },
    {
      key: "handoffs",
      label: "Pending handoffs",
      ok: pendingHandoffs === 0,
      action: pendingHandoffs === 0 ? "Clear" : "Assign or resolve pending handoffs.",
    },
  ];

  return {
    ok: items.every((item) => item.ok),
    items,
  };
}

function isAiConfigured() {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GROQ_API_KEY?.trim() ||
      process.env.AI_PROVIDER === "mock",
  );
}

function isSmtpReady() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_PORT?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM_EMAIL?.trim(),
  );
}
