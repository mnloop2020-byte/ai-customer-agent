/**
 * runtime.ts — Sales Engine Runtime
 *
 * الترتيب:
 * 1. تحليل الرسالة (intent + objection + context)
 * 2. Scoring (calculateScore)
 * 3. Routing (resolveRoute)
 * 4. تحديد stage + CTA
 * 5. بناء system prompt بالنتائج
 * 6. LLM يصيغ الرد فقط
 */

import type { ChatMessageInput } from "@/domain/chat";
import type { CompanyProfile }    from "@/domain/company";
import { prisma }                 from "@/lib/db";
import { searchKnowledge }        from "@/lib/knowledge";
import { getConversationHistory, saveMessage } from "@/lib/agent/memory";
import { calculateScore }                      from "@/lib/agent/scoring";
import { resolveRoute, buildCtaButtons, stageLabel } from "@/lib/agent/routing";
import type { ConversationPhase } from "@/domain/agent/conversation-state";

const AGENT_CONTEXT_LIMIT = 12;

type RunAgentTurnInput = {
  companyId:      string;
  companyProfile: CompanyProfile;
  message:        ChatMessageInput;
};

type HistoryMsg = { sender: string; body: string };

/* ─── Intent detection ─── */
function detectIntent(message: string): string {
  if (/أريد\s+(البدء|الاشتراك|الطلب|الشراء)|كيف\s+(أبدأ|أشترك|أسجل)/u.test(message)) return "booking";
  if (/كم\s+(السعر|التكلفة|الثمن|يكلف|تكلف)|الأسعار|الباقات/u.test(message))           return "ask_price";
  if (/عرض\s+سعر|أحتاج\s+عرض|عرض\s+مخصص/u.test(message))                              return "ask_quote";
  if (/ما\s+(هي\s+)?(خدمات|خدمة|تقدمون|تقدم)|ما\s+الذي\s+تقدم/u.test(message))        return "service_inquiry";
  if (/مرحبا|أهلا|السلام|هلا|hello|hi\b/iu.test(message))                               return "greeting";
  if (/من\s+أنت|ما\s+اسمك|ما\s+هو\s+النظام/u.test(message))                            return "identity_question";
  if (/ساعات\s+(العمل|الدوام)|متى\s+تفتح/u.test(message))                              return "hours_question";
  if (/أين|موقع|عنوان|وين/u.test(message))                                              return "location_question";
  if (/(غالي|غلي|مكلف|expensive|too\s+much)/iu.test(message))                           return "objection_price";
  if (/(مو\s+محتاج|مش\s+محتاج|لست\s+مهتم|not\s+interested)/iu.test(message))           return "not_interested";
  if (/(مهتم|مهتمة|يهمني|يهمنا|interested)/iu.test(message))                           return "purchase_intent";
  if (/(ما\s+الفرق|كيف\s+يعمل|وضّح|اشرح)/u.test(message))                              return "capabilities_question";
  return "general";
}

/* ─── Objection detection ─── */
function detectObjection(message: string): { hasObjection: boolean; type: string } {
  if (/(غالي|غلي|مكلف|السعر\s+عالي|expensive)/iu.test(message))          return { hasObjection: true, type: "PRICE" };
  if (/(عندي\s+بديل|عندي\s+خيار|شركة\s+ثانية|أرخص)/u.test(message))      return { hasObjection: true, type: "COMPETITOR" };
  if (/(سأفكر|راح\s+أفكر|بعدين|لاحقًا|مش\s+الوقت)/u.test(message))      return { hasObjection: true, type: "TIMING" };
  if (/(مو\s+واثق|مش\s+واثق|احتاج\s+دليل|تثبت)/u.test(message))          return { hasObjection: true, type: "TRUST" };
  if (/(ما\s+عندي\s+صلاحية|محتاج\s+أستشير|مدير)/u.test(message))         return { hasObjection: true, type: "AUTHORITY" };
  return { hasObjection: false, type: "NONE" };
}

/* ─── Extract context from history ─── */
function extractContextFromHistory(history: HistoryMsg[]) {
  const joined = history.filter(m => m.sender === "CUSTOMER").map(m => m.body).join(" ");
  const msgMatch  = joined.match(/(\d{1,5})\s*(?:رساله|رسالة|محادثه|محادثة)/u);
  const teamMatch = joined.match(/(\d{1,3})\s*(?:أشخاص|اشخاص|موظف|شخص)\s*(?:يرد|يردون)/u);
  return {
    messagesPerDay: msgMatch  ? Number(msgMatch[1])  : undefined,
    teamSize:       teamMatch ? Number(teamMatch[1]) : undefined,
  };
}

/* ─── Missing fields ─── */
function detectMissingFields(history: HistoryMsg[], context: { messagesPerDay?: number; teamSize?: number }): string[] {
  const customerMsgs = history.filter(m => m.sender === "CUSTOMER").length;
  if (customerMsgs < 1 || customerMsgs > 4) return [];
  const fields: string[] = [];
  if (!context.messagesPerDay) fields.push("messages_per_day");
  if (!context.teamSize)       fields.push("team_size");
  return fields;
}

/* ═══════════════════════════════════════════════════════ */
export async function runAgentTurn({ companyId, companyProfile, message }: RunAgentTurnInput) {

  // 1. Get / create conversation
  const ctx = await getOrCreateConversation({
    companyId,
    conversationId:   message.conversationId,
    visitorSessionId: message.visitorSessionId,
    customerName:     message.customerName,
    customerEmail:    message.customerEmail,
  });

  // 2. Load history
  const history = await getConversationHistory(ctx.conversation.id, AGENT_CONTEXT_LIMIT);

  // 3. Save customer message
  await saveMessage({ conversationId: ctx.conversation.id, sender: "CUSTOMER", body: message.body });

  // 4. Knowledge search
  const knowledgeResults = await searchKnowledge({ companyId, query: message.body, take: 4 });

  // 5. Analyse message
  const intent             = detectIntent(message.body);
  const { hasObjection, type: objectionType } = detectObjection(message.body);
  const extractedCtx       = extractContextFromHistory(history);
  const missingFields      = detectMissingFields(history, extractedCtx);
  const handoffRequested   = /(تحدث\s+مع\s+مندوب|أريد\s+مندوب|speak\s+to\s+human)/iu.test(message.body);
  const previousScore      = (message as { leadSnapshot?: { score?: number } }).leadSnapshot?.score ?? ctx.lead.score ?? 0;

  // 6. Scoring
  const scoring = calculateScore({
    intent,
    stage:           (ctx.lead.buyingStage as ConversationPhase) ?? "DISCOVERY",
    currentMessage:  message.body,
    customerContext: {
      facts:           [],
      painPoints:      [],
      previousAnswers: history.filter(m => m.sender === "CUSTOMER").map(m => m.body).slice(-4),
      messagesPerDay:  extractedCtx.messagesPerDay,
      teamSize:        extractedCtx.teamSize,
    },
    history,
    previousScore,
  });

  // 7. Routing
  const routing = resolveRoute({
    intent, scoring, currentMessage: message.body, history,
    missingFields, hasObjection, objectionType, handoffRequested,
  });

  // 8. CTA buttons
  const ctaButtons = buildCtaButtons(routing.ctaType, scoring.temperature);

  // 9. Build system prompt
  const systemPrompt = buildSystemPrompt({
    companyProfile, knowledgeResults, scoring, routing,
    intent, missingFields, hasObjection, objectionType, ctaButtons,
  });

  // 10. Call LLM
  const messages = buildMessages(systemPrompt, history, message.body, ctx.lead);
  const reply    = await callLLM(messages, companyProfile);

  // 11. Save AI reply
  await saveMessage({ conversationId: ctx.conversation.id, sender: "AI", body: reply });

  // 12. Update lead
  const newStatus = scoring.temperature === "Hot" ? "HOT"
    : scoring.temperature === "Warm" ? "WARM"
    : scoring.temperature === "Cold" ? "COLD" : "UNQUALIFIED";

  // map ConversationPhase → Prisma BuyingStage enum
  const phaseToStage: Record<string, string> = {
    OPENING:            "NEW",
    DISCOVERY:          "DISCOVERY",
    QUALIFICATION:      "QUALIFICATION",
    VALUE_BUILDING:     "QUALIFICATION",
    OBJECTION_HANDLING: "NEGOTIATION",
    OFFER:              "OFFER",
    CLOSING:            "NEGOTIATION",
    FOLLOW_UP:          "FOLLOW_UP",
    HANDOFF:            "NEGOTIATION",
    LOST:               "LOST",
  };
  const prismaBuyingStage = phaseToStage[routing.stage] ?? "DISCOVERY";

  await prisma.lead.update({
    where: { id: ctx.lead.id },
    data: {
      score:       scoring.score,
      status:      newStatus,
      intent,
      buyingStage: prismaBuyingStage as never,
      route:       routing.route,
      lastSummary: `Intent:${intent} | Stage:${routing.stage} | Score:${scoring.score} | Temp:${scoring.temperature}`,
      agentMemory: {
        lastIntent:      intent,
        lastScore:       scoring.score,
        lastTemperature: scoring.temperature,
        lastStage:       routing.stage,
        missingFields,
        messagesPerDay:  extractedCtx.messagesPerDay,
        teamSize:        extractedCtx.teamSize,
        hasObjection,
        objectionType,
      },
    },
  });

  // 13. Return
  return {
    message:                reply,
    leadScore:              scoring.score,
    intent,
    temperature:            scoring.temperature,
    nextAction:             routing.nextAction,
    route:                  routing.route,
    conversationId:         ctx.conversation.id,
    leadId:                 ctx.lead.id,
    qualificationStatus:    missingFields.length === 0 ? "QUALIFIED" : "DISCOVERING",
    buyingStage:            routing.stage,
    missingFields,
    summary:                `Score:${scoring.score} | ${stageLabel(routing.stage)}`,
    knowledgeSources:       [...new Set(knowledgeResults.map(r => r.documentTitle))],
    knowledgeSourceDetails: knowledgeResults.map(r => ({ documentTitle: r.documentTitle, content: r.content.slice(0, 360), score: r.score })),
    matchedKnowledge:       knowledgeResults.map(r => `${r.documentTitle}: ${r.content.slice(0, 140)}`),
    aiProvider:             process.env.AI_PROVIDER ?? "groq",
    toolCalls:              [],
    ctaButtons,
    scoringSignals:         scoring.signals,
  };
}

/* ─── System Prompt ─── */
const DEFAULT_EXECUTION_RULES = `[الأوامر الإلزامية - أعلى أولوية]
- يمنع استخدام أي رد جاهز أو عام.
- يمنع البدء بسؤال. كل رد يبدأ بجملة فائدة أو إقناع ملموس.
- إذا كانت رسالة العميل تحتوي على اعتراض → قدّم إقناعاً مباشراً أولاً ثم سؤالاً واحداً.
- كل رد: فائدة مرتبطة بكلام العميل + سؤال واحد فقط.
- يمنع اختراع معلومات غير موجودة في مصادر المعرفة.
- إذا سأل العميل عن السعر → اذكر السعر مباشرة قبل أي إقناع.
- إذا أظهر جاهزية → رشّح الباقة المناسبة وأعطِ خطوة بدء واضحة فوراً.`;

function buildSystemPrompt(input: {
  companyProfile:   CompanyProfile;
  knowledgeResults: Array<{ documentTitle: string; content: string; score: number }>;
  scoring:          ReturnType<typeof calculateScore>;
  routing:          ReturnType<typeof resolveRoute>;
  intent:           string;
  missingFields:    string[];
  hasObjection:     boolean;
  objectionType:    string;
  ctaButtons:       ReturnType<typeof buildCtaButtons>;
}): string {
  const { companyProfile: p, knowledgeResults, scoring, routing, intent, missingFields, hasObjection, objectionType, ctaButtons } = input;

  const services  = p.services.map(s => `- ${s.name}: ${s.description} | السعر: ${s.price}`).join("\n");
  const knowledge = knowledgeResults.length
    ? knowledgeResults.map((r, i) => `[${i + 1}] ${r.documentTitle}:\n${r.content.slice(0, 400)}`).join("\n\n")
    : "لا توجد معلومات إضافية.";

  const executionRules = p.executionRules?.trim()
    ? `[الأوامر الإلزامية]\n${p.executionRules.trim()}`
    : DEFAULT_EXECUTION_RULES;

  const salesCtx = `[سياق العميل - محلَّل تلقائياً]
النية: ${intent} | الدرجة: ${scoring.score}/100 | الحالة: ${scoring.temperature} | المرحلة: ${stageLabel(routing.stage)}
المسار: ${routing.route} | الخطوة: ${routing.nextAction}${hasObjection ? ` | الاعتراض: ${objectionType}` : ""}${missingFields.length ? ` | حقول مفقودة: ${missingFields.join(",")}` : ""}${ctaButtons.length ? ` | CTA: ${ctaButtons.map(b => b.label).join(" | ")}` : ""}`;

  const instruction = buildResponseInstruction(routing.route, routing.nextAction, scoring.temperature, hasObjection, objectionType, missingFields);

  return [
    executionRules,
    "",
    `[تعريف الدور]\nأنت مندوب مبيعات محترف لشركة "${p.name}". تتحدث بالعربية فقط. لا تذكر أنك AI.`,
    "",
    salesCtx,
    "",
    instruction,
    "",
    `[أسلوب الرد]\n${p.tone || "ودود، احترافي، مباشر. 2-3 جمل فقط."}\n- لا تبدأ بـ "بالطبع" أو "بالتأكيد" أو "شكراً لتواصلك".`,
    "",
    `[قواعد التصعيد]\n${p.handoffRule || "صعّد عند: طلب صريح لمندوب، شكوى، اعتراض معقد."}`,
    "",
    `[معلومات الشركة]\nالاسم: ${p.name} | المجال: ${p.industry}\n${p.description}\nالموقع: ${p.location} | ساعات العمل: ${p.workingHours}\n\n[الخدمات والأسعار]\n${services}\n\n[مصادر المعرفة]\n${knowledge}`,
  ].join("\n");
}

function buildResponseInstruction(
  route: string, nextAction: string, temperature: string,
  hasObjection: boolean, objectionType: string, missingFields: string[],
): string {
  if (route === "HUMAN_HANDOFF")
    return `[تعليمات الرد]\nأخبر العميل أنك ستوصله بمندوب الآن. اجمع معلومة تواصل إذا لم تكن موجودة.`;

  if (route === "BOOKING" || nextAction === "CONFIRM_READINESS")
    return `[تعليمات الرد - إغلاق]\nرشّح الباقة المناسبة بسطر واحد + أعطِ خطوة بدء واضحة ومحددة. لا تسأل أسئلة جديدة.`;

  if (hasObjection && objectionType === "PRICE")
    return `[تعليمات الرد - اعتراض السعر]\n1. أعد تأطير القيمة بنتيجة ملموسة (توفير وقت / زيادة مبيعات)\n2. لا تتراجع عن السعر\n3. اكشف السبب: "هل الموضوع السعر تحديداً أم شيء آخر؟"`;

  if (hasObjection)
    return `[تعليمات الرد - اعتراض]\nاعترف + أعد تأطير + سؤال واحد يكشف السبب الحقيقي.`;

  if (route === "PRESENT_OFFER" || nextAction === "PRESENT_PRICE")
    return `[تعليمات الرد - عرض الأسعار]\nاذكر السعر والباقات مباشرة.\nثم: جملة تربط الباقة بوضع العميل + سؤال واحد يقرّب القرار.`;

  if (nextAction === "BUILD_VALUE")
    return `[تعليمات الرد - بناء القيمة]\nاشرح فائدة ملموسة (ليس ميزة تقنية) + ربط بمشكلة العميل + سؤال واحد.`;

  if (nextAction === "ASK_QUALIFYING_QUESTION" && missingFields.length > 0) {
    const q = missingFields[0] === "messages_per_day"
      ? "كم رسالة تستقبلون يومياً تقريباً؟"
      : "كم شخص يرد على رسائل العملاء حالياً؟";
    return `[تعليمات الرد - تأهيل]\nابدأ بجملة فائدة قصيرة عن النظام ثم اسأل: "${q}"\nسؤال واحد فقط.`;
  }

  return `[تعليمات الرد]\nأجب على سؤال العميل بشكل مباشر ومفيد.\nأضف جملة تربط الإجابة بفائدة ملموسة.\nثم سؤال واحد فقط يساعد على التقدم.`;
}

/* ─── Messages builder ─── */
function buildMessages(
  systemPrompt: string,
  history: HistoryMsg[],
  currentMessage: string,
  lead: { needsSummary?: string | null },
) {
  const hist = history.slice(-10).map(m => ({
    role: m.sender === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));
  const note = lead.needsSummary ? `\n[معلومات العميل: ${lead.needsSummary}]` : "";
  return [
    { role: "system" as const, content: systemPrompt },
    ...hist,
    { role: "user" as const, content: currentMessage + note },
  ];
}

/* ─── LLM caller ─── */
async function callLLM(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  companyProfile: CompanyProfile,
): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? "groq";
  try {
    if (provider === "groq" && process.env.GROQ_API_KEY?.trim())     return await callGroq(messages);
    if (provider === "gemini" && process.env.GEMINI_API_KEY?.trim()) return await callGemini(messages);
  } catch (err) { console.error("[LLM] failed:", err); }
  return buildFallbackReply(companyProfile, messages[messages.length - 1]?.content ?? "");
}

async function callGroq(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
  const res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant", temperature: 0.7, max_tokens: 400, messages }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq empty");
  return text;
}

async function callGemini(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const contents  = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.0-flash"}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemMsg }] }, contents, generationConfig: { temperature: 0.7, maxOutputTokens: 400 } }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("").trim();
  if (!text) throw new Error("Gemini empty");
  return text;
}

function buildFallbackReply(profile: CompanyProfile, msg: string): string {
  if (/مرحبا|أهلا|السلام|هلا/u.test(msg)) return `أهلًا! يسعدني مساعدتك. كيف أقدر أخدمك اليوم؟`;
  return `شكراً لتواصلك مع ${profile.name}. هل تريد معرفة المزيد عن خدماتنا؟`;
}

/* ─── Conversation get/create ─── */
async function getOrCreateConversation(input: {
  companyId: string; conversationId?: string; visitorSessionId?: string;
  customerName?: string; customerEmail?: string;
}) {
  if (input.conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: input.conversationId, companyId: input.companyId },
      include: { lead: { include: { service: true } } },
    });
    if (conv) return { conversation: conv, lead: conv.lead };
  }

  const lead = await prisma.lead.create({
    include: { service: true },
    data: { companyId: input.companyId, fullName: input.customerName || "زائر Web Chat", email: input.customerEmail, channel: "WEB_CHAT", status: "NEW", score: 0 },
  });
  const conversation = await prisma.conversation.create({
    data: { companyId: input.companyId, leadId: lead.id, visitorSessionId: input.visitorSessionId, channel: "WEB_CHAT", status: "OPEN" },
  });
  return { conversation, lead };
}