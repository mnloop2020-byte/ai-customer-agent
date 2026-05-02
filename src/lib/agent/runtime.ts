import type { ChatMessageInput } from "@/domain/chat";
import type { CompanyProfile } from "@/domain/company";
import { prisma } from "@/lib/db";
import { searchKnowledge } from "@/lib/knowledge";
import { getConversationHistory, saveMessage } from "@/lib/agent/memory";

const AGENT_CONTEXT_LIMIT = 12;

type RunAgentTurnInput = {
  companyId: string;
  companyProfile: CompanyProfile;
  message: ChatMessageInput;
};

type LeadState = {
  score: number;
  status: string;
  temperature: "Hot" | "Warm" | "Cold" | "Unqualified";
  intent: string;
  needsHandoff: boolean;
};

export async function runAgentTurn({ companyId, companyProfile, message }: RunAgentTurnInput) {
  // 1. Get or create conversation
  const conversationContext = await getOrCreateConversation({
    companyId,
    conversationId: message.conversationId,
    visitorSessionId: message.visitorSessionId,
    customerName: message.customerName,
    customerEmail: message.customerEmail,
  });

  // 2. Get conversation history
  const history = await getConversationHistory(conversationContext.conversation.id, AGENT_CONTEXT_LIMIT);

  // 3. Save customer message
  await saveMessage({
    conversationId: conversationContext.conversation.id,
    sender: "CUSTOMER",
    body: message.body,
  });

  // 4. Search knowledge base
  const knowledgeResults = await searchKnowledge({
    companyId,
    query: message.body,
    take: 4,
  });

  // 5. Generate reply using LLM directly
  const { reply, leadState } = await generateSmartReply({
    customerMessage: message.body,
    companyProfile,
    history,
    knowledgeResults,
    lead: conversationContext.lead,
  });

  // 6. Save AI reply
  await saveMessage({
    conversationId: conversationContext.conversation.id,
    sender: "AI",
    body: reply,
  });

  // 7. Update lead
  await prisma.lead.update({
    where: { id: conversationContext.lead.id },
    data: {
      score: leadState.score,
      lastSummary: `Intent: ${leadState.intent} | Temp: ${leadState.temperature}`,
    },
  });

  return {
    message: reply,
    leadScore: leadState.score,
    intent: leadState.intent,
    temperature: leadState.temperature,
    nextAction: "متابعة المحادثة",
    conversationId: conversationContext.conversation.id,
    leadId: conversationContext.lead.id,
    knowledgeSources: [...new Set(knowledgeResults.map((r) => r.documentTitle))],
    knowledgeSourceDetails: knowledgeResults.map((r) => ({
      documentTitle: r.documentTitle,
      content: r.content.slice(0, 360),
      score: r.score,
    })),
    matchedKnowledge: knowledgeResults.map((r) => `${r.documentTitle}: ${r.content.slice(0, 140)}`),
    aiProvider: process.env.AI_PROVIDER ?? "groq",
    route: leadState.needsHandoff ? "HUMAN_HANDOFF" : "AI",
    qualificationStatus: "DISCOVERING",
    buyingStage: "DISCOVERY",
    missingFields: [],
    summary: "",
    toolCalls: [],
  };
}

async function generateSmartReply({
  customerMessage,
  companyProfile,
  history,
  knowledgeResults,
  lead,
}: {
  customerMessage: string;
  companyProfile: CompanyProfile;
  history: Array<{ sender: string; body: string }>;
  knowledgeResults: Array<{ documentTitle: string; content: string; score: number }>;
  lead: {
    score: number;
    status: string;
    fullName?: string | null;
    needsSummary?: string | null;
  };
}): Promise<{ reply: string; leadState: LeadState }> {
  const provider = process.env.AI_PROVIDER ?? "groq";

  const systemPrompt = buildSystemPrompt(companyProfile, knowledgeResults);
  const messages = buildMessages(systemPrompt, history, customerMessage, knowledgeResults, lead);

  try {
    let reply = "";

    if (provider === "groq" && process.env.GROQ_API_KEY?.trim()) {
      reply = await callGroq(messages);
    } else if (provider === "gemini" && process.env.GEMINI_API_KEY?.trim()) {
      reply = await callGemini(systemPrompt, history, customerMessage, knowledgeResults, lead);
    } else {
      reply = buildFallbackReply(companyProfile, customerMessage);
    }

    const leadState = extractLeadState(reply, lead);
    const cleanReply = cleanResponse(reply);

    log({ customerMessage, provider, reply: cleanReply, leadState });

    return { reply: cleanReply, leadState };
  } catch (error) {
    console.error("LLM failed:", error);
    return {
      reply: buildFallbackReply(companyProfile, customerMessage),
      leadState: { score: lead.score, status: lead.status, temperature: "Unqualified", intent: "unknown", needsHandoff: false },
    };
  }
}

function buildSystemPrompt(
  companyProfile: CompanyProfile,
  knowledgeResults: Array<{ documentTitle: string; content: string; score: number }>,
): string {
  const services = companyProfile.services
    .map((s) => `- ${s.name}: ${s.description} | السعر: ${s.price}`)
    .join("\n");

  const knowledge = knowledgeResults.length
    ? knowledgeResults.map((r, i) => `[${i + 1}] ${r.documentTitle}:\n${r.content.slice(0, 400)}`).join("\n\n")
    : "لا توجد معلومات إضافية.";

  return `أنت مساعد مبيعات احترافي لشركة "${companyProfile.name}".
تتحدث بالعربية فقط. ردودك طبيعية ومختصرة كأنك إنسان حقيقي في شات.

## معلومات الشركة
- الاسم: ${companyProfile.name}
- المجال: ${companyProfile.industry}
- الوصف: ${companyProfile.description}
- الموقع: ${companyProfile.location}
- ساعات العمل: ${companyProfile.workingHours}
- الأسلوب: ${companyProfile.tone}

## الخدمات والأسعار
${services}

## قاعدة المعرفة (استخدمها كمرجع للإجابة)
${knowledge}

## قواعد التعامل مع العملاء (اتبعها دائماً)

### المرحلة 1: استقبال العميل
- رد فوري ودافئ
- لا تسأل أكثر من سؤال واحد في كل رد
- هدفك فهم ما يريده العميل

### المرحلة 2: فهم النية
حدد نية العميل:
- يريد معرفة السعر → أجب مباشرة من الأسعار أعلاه
- يريد حجز موعد → ساعده في الحجز
- يريد مقارنة الخيارات → اشرح الفرق بإيجاز
- لديه اعتراض → تعامل معه بذكاء
- يريد التحدث مع مندوب → وضح أنك ستحوله

### المرحلة 3: جمع البيانات
اسأل فقط ما يخدم الخطوة الحالية:
- اسم العميل إذا لم يُذكر
- الخدمة المطلوبة
- نوع العميل (فرد / شركة)
- التوقيت والجاهزية
- الميزانية عند الحاجة

### المرحلة 4: التأهيل
قيّم العميل بناءً على:
- وضوح الحاجة
- جدية الشراء
- الميزانية المناسبة
- صلاحية القرار

### المرحلة 5: تقديم العرض
- لا تذكر كل الخيارات دفعة واحدة
- رشّح الخيار الأنسب لوضع العميل
- اشرح لماذا هو الأنسب

### المرحلة 6: معالجة الاعتراضات
أكثر الاعتراضات:
- "السعر مرتفع" → ربط القيمة بالنتيجة، عرض خيار أقل
- "سأفكر" → اسأل عن سبب التردد
- "عندي خيار آخر" → أبرز نقاط التميز

### المرحلة 7: الإغلاق
- دائماً أنهِ بخطوة واضحة (CTA)
- لا تترك المحادثة مفتوحة
- اقترح موعداً أو خطوة تالية محددة

### متى تحول للمندوب البشري؟
- العميل طلب صراحةً التحدث مع شخص
- اعتراض معقد يحتاج تفاوض خاص
- شكوى أو غضب واضح
- طلب استثناء بالسعر

## قواعد الرد
1. رد بـ 2-3 جمل فقط إلا إذا طُلب التفصيل
2. لا تكرر نفس الصياغة
3. استخدم المعلومات من قاعدة المعرفة كمرجع فقط - لا تنسخها
4. اسأل سؤالاً واحداً فقط في كل رد
5. كن طبيعياً ودافئاً كأنك إنسان
6. لا تذكر أنك AI أو بوت أو نظام

## تحليل الرد (أضف في نهاية ردك)
أضف هذا السطر مخفياً في آخر ردك بعد سطر فارغ:
[ANALYSIS: intent=<النية>, score=<0-100>, temperature=<Hot|Warm|Cold|Unqualified>, handoff=<yes|no>]

النية يمكن أن تكون: greeting, price_inquiry, service_inquiry, booking, objection, follow_up, handoff_request, general
`;
}

function buildMessages(
  systemPrompt: string,
  history: Array<{ sender: string; body: string }>,
  customerMessage: string,
  knowledgeResults: Array<{ documentTitle: string; content: string; score: number }>,
  lead: { score: number; status: string; fullName?: string | null; needsSummary?: string | null },
) {
  const historyMessages = history.slice(-10).map((m) => ({
    role: m.sender === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));

  const contextNote = lead.needsSummary
    ? `\n[معلومات العميل المعروفة: ${lead.needsSummary}]`
    : "";

  return [
    { role: "system" as const, content: systemPrompt },
    ...historyMessages,
    { role: "user" as const, content: customerMessage + contextNote },
  ];
}

async function callGroq(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 400,
      messages,
    }),
  });

  if (!response.ok) throw new Error(`Groq failed: ${response.status}`);

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned empty response");

  return text;
}

async function callGemini(
  systemPrompt: string,
  history: Array<{ sender: string; body: string }>,
  customerMessage: string,
  knowledgeResults: Array<{ documentTitle: string; content: string; score: number }>,
  lead: { score: number; status: string; fullName?: string | null; needsSummary?: string | null },
): Promise<string> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const messages = buildMessages(systemPrompt, history, customerMessage, knowledgeResults, lead);

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini failed: ${response.status}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  if (!text) throw new Error("Gemini returned empty response");

  return text;
}

function extractLeadState(
  reply: string,
  lead: { score: number; status: string },
): LeadState {
  const analysisMatch = reply.match(/\[ANALYSIS:\s*([^\]]+)\]/i);

  if (!analysisMatch) {
    return {
      score: lead.score,
      status: lead.status,
      temperature: scoreToTemperature(lead.score),
      intent: "general",
      needsHandoff: false,
    };
  }

  const analysis = analysisMatch[1];
  const intentMatch = analysis.match(/intent=([^,\]]+)/i);
  const scoreMatch = analysis.match(/score=(\d+)/i);
  const tempMatch = analysis.match(/temperature=([^,\]]+)/i);
  const handoffMatch = analysis.match(/handoff=(yes|no)/i);

  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : lead.score;
  const temperature = (tempMatch?.[1]?.trim() as LeadState["temperature"]) ?? scoreToTemperature(score);

  return {
    score,
    status: temperature === "Hot" ? "HOT" : temperature === "Warm" ? "WARM" : temperature === "Cold" ? "COLD" : "UNQUALIFIED",
    temperature,
    intent: intentMatch?.[1]?.trim() ?? "general",
    needsHandoff: handoffMatch?.[1] === "yes",
  };
}

function cleanResponse(reply: string): string {
  // Remove the [ANALYSIS:...] tag from the reply
  return reply.replace(/\n?\[ANALYSIS:[^\]]+\]/gi, "").trim();
}

function scoreToTemperature(score: number): LeadState["temperature"] {
  if (score >= 80) return "Hot";
  if (score >= 50) return "Warm";
  if (score >= 20) return "Cold";
  return "Unqualified";
}

function buildFallbackReply(companyProfile: CompanyProfile, customerMessage: string): string {
  const isGreeting = /مرحبا|اهلا|السلام|hello|hi/iu.test(customerMessage);
  if (isGreeting) {
    return `أهلاً وسهلاً! يسعدني مساعدتك. كيف أقدر أساعدك اليوم؟`;
  }
  return `شكراً لتواصلك مع ${companyProfile.name}. يسعدني مساعدتك، هل تريد معرفة المزيد عن خدماتنا؟`;
}

function log(payload: Record<string, unknown>) {
  if (process.env.AGENT_DEBUG !== "1" && process.env.NODE_ENV !== "development") return;
  console.log("[AI_AGENT_TURN]", payload);
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
      fullName: customerName || "زائر Web Chat",
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