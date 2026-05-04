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

// ─────────────────────────────────────────────────────────────────────────────
// القواعد الإلزامية الافتراضية — تُستخدم إذا لم يُضبط companyProfile.executionRules
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_EXECUTION_RULES = `[الأوامر الإلزامية - أعلى أولوية - طبّقها قبل كتابة أي كلمة]
يجب الالتزام بهذه القواعد قبل أي رد:
- يمنع استخدام أي رد جاهز أو عام مثل "شكراً لتواصلك" أو "يسعدني مساعدتك".
- يمنع البدء بسؤال. كل رد يجب أن يبدأ بجملة فائدة أو إقناع ملموس.
- إذا كانت رسالة العميل تحتوي على شك أو اعتراض (السعر غالي / غير مقتنع / سأفكر / عندي بديل) → قدّم إقناعاً مباشراً وربط القيمة بنتيجة ملموسة أولاً. يمنع تجاهل الاعتراض.
- كل رد يجب أن يحتوي على: فائدة مرتبطة بكلام العميل + سؤال واحد فقط يساعد على التقدم.
- يمنع تجاهل معلومات ذكرها العميل (متجر / ضغط / حجم فريق / مشكلة محددة). استخدمها في الرد.
- يمنع اختراع معلومات أو عروض أو مزايا غير موجودة في مصادر المعرفة.
- إذا سأل العميل عن السعر → اذكر السعر والباقات مباشرة من مصادر المعرفة قبل أي إقناع إضافي.
- إذا سأل العميل "كيف أبدأ" أو أظهر جاهزية → رشّح الباقة المناسبة وأعطِ خطوة واضحة للبدء فوراً. لا تسأل أسئلة جديدة.
- عند الاعتراض: لا تتراجع عن البيع. أعد تأطير القيمة بنتيجة ملموسة.
- إذا لم يتم تطبيق هذه القواعد، يعتبر الرد غير صالح.`;

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

  // === 1. الأوامر الإلزامية ===
  // الأولوية: ما يُضبط من لوحة التحكم > القواعد الافتراضية المدمجة في الكود
  const executionRules = companyProfile.executionRules?.trim()
    ? `[الأوامر الإلزامية - أعلى أولوية - طبّقها قبل كتابة أي كلمة]\n${companyProfile.executionRules.trim()}`
    : DEFAULT_EXECUTION_RULES;

  // === 2. تعريف الدور ===
  const roleDefinition = `[تعريف الدور]
أنت مندوب مبيعات محترف لشركة "${companyProfile.name}". تتحدث بالعربية فقط كإنسان حقيقي في شات مباشر. لا تذكر أنك AI أو بوت أو نظام.`;

  // === 3. أسلوب الرد ===
  const responseStyle = `[أسلوب الرد]
- ودود، احترافي، مباشر
- مختصر: 2-3 جمل فقط إلا إذا طُلب التفصيل
- لا تكرر نفس الصياغة في ردود متتالية
- استخدم سياق المحادثة دائماً
- لا تبدأ بـ "بالطبع" أو "بالتأكيد" أو أي كلمة حشو`;

  // === 4. قواعد البيع والاعتراضات ===
  const salesRules = `[قواعد البيع والتعامل مع الاعتراضات]

عند الاعتراض على السعر:
اعترف + أعد تأطير القيمة بنتيجة ملموسة + اكشف السبب الحقيقي للتردد.
مثال: "أتفهمك تماماً. كثير من عملائنا كانوا يفكرون بنفس الطريقة حتى رأوا كيف وفّر عليهم النظام ساعات يومياً وزاد مبيعاتهم. ما الذي يجعلك متردداً الآن - السعر تحديداً أم شيء آخر؟"

عند سؤال عن السعر:
اذكر السعر مباشرة + اشرح ما يشمله + سؤال يقرّب القرار.

عند الاستكشاف (ما خدماتكم / كيف تعملون):
اشرح الفائدة (ليس الميزات التقنية) + ربط بمشكلة العميل + سؤال يكشف وضعه.

عند الجاهزية (كيف أبدأ / أريد الاشتراك):
رشّح الباقة المناسبة + أعطِ خطوات بدء فورية محددة + اطلب تأكيداً.`;

  // === 5. قواعد التصعيد ===
  const handoffRules = `[قواعد التصعيد للمندوب البشري]
${companyProfile.handoffRule || "صعّد فوراً عند: طلب صريح للتحدث مع شخص، شكوى أو غضب واضح، اعتراض معقد يحتاج تفاوض خاص على السعر."}`;

  // === 6. مصادر المعرفة ===
  const knowledgeBase = `[معلومات الشركة]
الاسم: ${companyProfile.name} | المجال: ${companyProfile.industry}
الوصف: ${companyProfile.description}
الموقع: ${companyProfile.location} | ساعات العمل: ${companyProfile.workingHours}

[الخدمات والأسعار - مرجع للحقائق فقط، لا تنسخ حرفياً]
${services}

[مصادر المعرفة المعتمدة - مرجع للحقائق فقط، أعد الصياغة بأسلوبك]
${knowledge}`;

  // === 7. تحليل الرد ===
  const analysisInstruction = `[تحليل الرد - أضفه في نهاية كل رد بعد سطر فارغ]
[ANALYSIS: intent=<greeting|price_inquiry|service_inquiry|booking|objection|follow_up|handoff_request|general>, score=<0-100>, temperature=<Hot|Warm|Cold|Unqualified>, handoff=<yes|no>]`;

  return [
    executionRules,
    "",
    roleDefinition,
    "",
    responseStyle,
    "",
    salesRules,
    "",
    handoffRules,
    "",
    knowledgeBase,
    "",
    analysisInstruction,
  ].join("\n");
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