import { prisma } from "@/lib/db";

const marker = "[DEMO_DATA]";

const demoLeads = [
  {
    fullName: "أحمد العلي",
    companyName: "شركة النور للتجارة",
    email: "ahmad.demo@mntechnique.local",
    phone: "+905551110001",
    status: "WARM" as const,
    score: 62,
    intent: "Price Inquiry",
    needsSummary: "يسأل عن السعر ويحتاج مقارنة بين الباقات.",
    conversation: [
      "مرحبًا، كم سعر نظام خدمة العملاء؟",
      "لدينا باقة أساسية تبدأ من 100$ وباقة احترافية بـ 300$. هل عدد الرسائل عندكم أقل من 100 رسالة يوميًا أم أكثر؟",
      "تقريبًا 80 رسالة يوميًا والسعر يبدو مرتفعًا قليلًا.",
    ],
    deal: { title: "عرض خدمة العملاء - شركة النور", value: 300, status: "PROPOSAL_SENT" as const },
    followUp: { kind: "RECOVER_OBJECTION" as const, message: "معالجة اعتراض السعر مع توضيح العائد" },
  },
  {
    fullName: "سارة محمد",
    companyName: "عيادة الصفوة",
    email: "sara.demo@mntechnique.local",
    phone: "+905551110002",
    status: "HOT" as const,
    score: 84,
    intent: "Booking Intent",
    needsSummary: "تريد تجربة المساعد قبل الاشتراك.",
    conversation: [
      "أريد تجربة Demo للنظام قبل الاشتراك.",
      "ممتاز، نقدر نجهز لك تجربة قصيرة توضح كيف يتم الرد على العملاء وتحويل الحالات المهمة للمندوب.",
    ],
    deal: { title: "تجربة المساعد - عيادة الصفوة", value: 300, status: "NEGOTIATION" as const },
    followUp: { kind: "BOOKING" as const, message: "موعد عرض توضيحي" },
  },
  {
    fullName: "شركة مدار التقنية",
    companyName: "مدار التقنية",
    email: "sales.demo@mntechnique.local",
    phone: "+905551110003",
    status: "NEW" as const,
    score: 35,
    intent: "General Inquiry",
    needsSummary: "يسأل عن مدة التنفيذ وربط محادثة الموقع.",
    conversation: [
      "كم يستغرق تنفيذ المساعد وربطه بالموقع؟",
      "غالبًا نبدأ بإعداد بيانات الشركة ومصادر المعرفة، ثم نربط محادثة الموقع ونختبر الردود قبل التشغيل.",
    ],
    deal: null,
    followUp: { kind: "CHECK_DECISION" as const, message: "تذكير بالرد على مدة التنفيذ" },
  },
  {
    fullName: "ليان عبدالله",
    companyName: "متجر لمسة",
    email: "layan.demo@mntechnique.local",
    phone: "+905551110004",
    status: "COLD" as const,
    score: 24,
    intent: "Human Request",
    needsSummary: "طلبت التواصل مع مندوب لمعرفة التفاصيل.",
    conversation: [
      "هل يمكن أن يتواصل معي مندوب؟",
      "أكيد، سأحول طلبك للمندوب المناسب ليتابع معك التفاصيل.",
    ],
    deal: null,
    followUp: { kind: "CONTINUE_QUALIFICATION" as const, message: "استكمال معلومات العميل" },
  },
];

export async function seedDemoData(companyId: string) {
  await clearDemoData(companyId);

  const service = await prisma.service.findFirst({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } });
  const now = new Date();

  for (const [index, demo] of demoLeads.entries()) {
    const lead = await prisma.lead.create({
      data: {
        companyId,
        serviceId: service?.id,
        fullName: demo.fullName,
        companyName: demo.companyName,
        email: demo.email,
        phone: demo.phone,
        channel: "WEB_CHAT",
        status: demo.status,
        score: demo.score,
        intent: demo.intent,
        customerType: "BUSINESS",
        qualificationStatus: demo.status === "HOT" ? "QUALIFIED" : demo.status === "NEW" ? "DISCOVERING" : "UNKNOWN",
        buyingStage: demo.deal ? "OFFER" : "FOLLOW_UP",
        needsSummary: `${marker} ${demo.needsSummary}`,
        lastSummary: demo.needsSummary,
      },
    });

    const conversation = await prisma.conversation.create({
      data: {
        companyId,
        leadId: lead.id,
        channel: "WEB_CHAT",
        visitorSessionId: `demo-session-${index + 1}`,
        status: demo.status === "HOT" ? "WAITING_AGENT" : "OPEN",
      },
    });

    await prisma.message.createMany({
      data: demo.conversation.map((body, messageIndex) => ({
        conversationId: conversation.id,
        sender: messageIndex % 2 === 0 ? "CUSTOMER" : "AI",
        body,
        metadata: { demo: true },
        createdAt: new Date(now.getTime() - (demo.conversation.length - messageIndex) * 60_000),
      })),
    });

    await prisma.aiRun.create({
      data: {
        companyId,
        conversationId: conversation.id,
        intent: demo.intent,
        nextAction: demo.deal ? "متابعة العرض" : "متابعة العميل",
        response: demo.conversation.at(-1) ?? "",
        scoreDelta: 8,
        extractedData: { demo: true },
      },
    });

    if (demo.deal) {
      await prisma.deal.create({
        data: {
          leadId: lead.id,
          title: demo.deal.title,
          value: demo.deal.value,
          status: demo.deal.status,
        },
      });
    }

    await prisma.followUp.create({
      data: {
        companyId,
        leadId: lead.id,
        kind: demo.followUp.kind,
        message: demo.followUp.message,
        dueAt: new Date(now.getTime() + (index + 1) * 3 * 60 * 60 * 1000),
        sequenceKey: `DEMO-${index + 1}`,
      },
    });
  }
}

export async function clearDemoData(companyId: string) {
  const demoLeads = await prisma.lead.findMany({
    where: {
      companyId,
      OR: [
        { needsSummary: { startsWith: marker } },
        { email: { endsWith: "@mntechnique.local" } },
      ],
    },
    select: { id: true },
  });

  if (!demoLeads.length) return 0;

  await prisma.lead.deleteMany({
    where: { id: { in: demoLeads.map((lead) => lead.id) } },
  });

  return demoLeads.length;
}
