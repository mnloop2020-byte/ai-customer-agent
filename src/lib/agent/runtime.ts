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

/* ════════════════════════════════════════════════════════════
   SYSTEM PROMPT — Execution Contract
   ════════════════════════════════════════════════════════════ */

/**
 * بناء قواعد الحظر المطلق بناءً على المرحلة الحالية.
 * هذه القواعد تُوضع في أعلى الـ prompt وهي غير قابلة للتجاوز.
 */
function buildHardProhibitions(
  stage: ConversationPhase,
  route: string,
  hasObjection: boolean,
): string {
  const base = [
    "❌ يُحظر تقديم أي عروض أو تجارب أو خصومات غير موجودة في مصادر المعرفة.",
    "❌ يُحظر ذكر روابط أو واتساب أو طرق تواصل غير موجودة في مصادر المعرفة.",
    "❌ يُحظر شرح خطوات التنفيذ أو التفاصيل التقنية في مرحلة الإغلاق.",
    "❌ يُحظر إعطاء أكثر من خطوة واحدة في مرحلة الإغلاق.",
    "❌ يُحظر تماماً: الرد العام أو المقدمات الفارغة مثل 'بالطبع' أو 'بالتأكيد' أو 'شكراً لتواصلك'.",
    "❌ يُحظر تماماً: البدء بسؤال. كل رد يبدأ بجملة فائدة أو إقناع ملموس.",
    "❌ يُحظر تماماً: اختراع معلومات غير موجودة في مصادر المعرفة.",
    "❌ يُحظر تماماً: أكثر من سؤال واحد في نفس الرد.",
  ];

  // حظر خاص بكل مرحلة
  const stageProhibitions: Partial<Record<ConversationPhase, string[]>> = {
    DISCOVERY: [
      "❌ يُحظر في هذه المرحلة: ذكر الأسعار أو الباقات قبل فهم وضع العميل.",
      "❌ يُحظر في هذه المرحلة: عرض الخيارات أو الحلول قبل كشف المشكلة.",
    ],
    QUALIFICATION: [
      "❌ يُحظر في هذه المرحلة: الانتقال للأسعار قبل الحصول على المعلومات المطلوبة.",
    ],
    VALUE_BUILDING: [
      "❌ يُحظر في هذه المرحلة: ذكر المنافسين أو المقارنات.",
      "❌ يُحظر في هذه المرحلة: طرح أسئلة تأهيل جديدة.",
    ],
    OBJECTION_HANDLING: [
      "❌ يُحظر في هذه المرحلة: تجاهل الاعتراض والانتقال لموضوع آخر.",
      "❌ يُحظر في هذه المرحلة: التراجع عن السعر أو تقديم خصم غير مصرح به.",
      "❌ يُحظر في هذه المرحلة: الاعتذار عن السعر.",
    ],
    OFFER: [
      "❌ يُحظر في هذه المرحلة: إخفاء السعر أو التحايل على ذكره.",
      "❌ يُحظر في هذه المرحلة: طرح أسئلة تأهيل بعد ذكر السعر.",
    ],
    CLOSING: [
      "❌ يُحظر في هذه المرحلة: طرح أسئلة جديدة تُعيق القرار.",
      "❌ يُحظر في هذه المرحلة: إعادة شرح الخدمة من البداية.",
      "❌ يُحظر في هذه المرحلة: إعطاء خيارات كثيرة تُشتت العميل.",
    ],
    HANDOFF: [
      "❌ يُحظر في هذه المرحلة: محاولة الإغلاق بدلاً من التحويل.",
    ],
  };

  const specific = stageProhibitions[stage] ?? [];

  // حظر إضافي عند وجود اعتراض في مراحل غير OBJECTION_HANDLING
  const objectionExtra = hasObjection && stage !== "OBJECTION_HANDLING"
    ? ["❌ يُحظر: تجاهل الاعتراض الذي ذكره العميل. يجب معالجته أولاً."]
    : [];

  return [...base, ...specific, ...objectionExtra].join("\n");
}

/**
 * بناء عقد التنفيذ الإلزامي لكل مرحلة.
 * هذا هو القالب الذي يجب أن يلتزم به الـ LLM حرفياً.
 */
function buildExecutionContract(
  stage: ConversationPhase,
  route: string,
  nextAction: string,
  temperature: string,
  hasObjection: boolean,
  objectionType: string,
  missingFields: string[],
): string {
  const header = `[عقد التنفيذ — المرحلة: ${stageLabel(stage)} | المسار: ${route}]`;

  // ── HANDOFF ──
  if (route === "HUMAN_HANDOFF" || stage === "HANDOFF") {
    return `${header}
الإجراء الإلزامي:
1. أخبر العميل أنك ستوصله بمندوب متخصص الآن.
2. إذا لم يكن هناك رقم تواصل → اطلبه بجملة واحدة.
3. لا تحاول الإغلاق بنفسك.
القالب: [جملة تطمين] + [طلب معلومة تواصل إن لزم]`;
  }

  // ── CLOSING / BOOKING ──
 if (stage === "OFFER" || stage === "OBJECTION_HANDLING") {
    return `${header}
    
⚠️ هذا عقد تنفيذي ملزم:
- يجب الالتزام بهذه الخطوات حرفياً
- لا يُسمح بتغيير الترتيب
- لا يُسمح بإضافة شرح إضافي
- إذا لم يتم الالتزام يعتبر الرد غير صالح

في حالة READY / CLOSING:

الإجراء الإلزامي:
1. ابدأ بجملة تأكيد قصيرة (مثل: ممتاز 👍 أو تمام)
2. رشّح باقة واحدة فقط حسب حالة العميل
3. أعطِ خطوة واحدة فقط للبدء (بدون شرح)
4. اختم بسؤال إغلاق مباشر (مثل: نبدأ الآن؟)

❌ ممنوع:
- شرح خطوات التنفيذ
- ذكر تفاصيل تقنية
- إعطاء أكثر من خطوة
- اختراع رابط أو واتساب
- طرح أي سؤال غير سؤال الإغلاق

صيغة الرد المطلوبة:
[تأكيد] + [باقة مناسبة] + [خطوة واحدة] + [سؤال إغلاق]
`;
  }
  // ── OBJECTION_HANDLING ──
  if (hasObjection) {
    if (objectionType === "PRICE") {
      return `${header}
الإجراء الإلزامي — اعتراض السعر:
1. أعد تأطير القيمة بنتيجة ملموسة (وفّر وقت / زيادة مبيعات / تقليل تكلفة).
2. لا تتراجع عن السعر ولا تعتذر عنه.
3. اكشف السبب الحقيقي بسؤال واحد: "هل الموضوع السعر تحديداً أم هناك شيء آخر؟"
القالب: [قيمة ملموسة بأرقام] + [إعادة تأطير] + [سؤال كشف السبب]`;
    }
    if (objectionType === "TIMING") {
      return `${header}
الإجراء الإلزامي — اعتراض التوقيت:
1. اعترف بالتوقيت دون إلحاح.
2. أوجد urgency ملموسة (فرصة محدودة / تكلفة التأخير).
3. سؤال واحد: "ما الذي يجعل الوقت الحالي غير مناسب؟"
القالب: [اعتراف] + [تكلفة التأخير] + [سؤال]`;
    }
    if (objectionType === "TRUST") {
      return `${header}
الإجراء الإلزامي — اعتراض الثقة:
1. قدّم دليلاً اجتماعياً من مصادر المعرفة (عميل / نتيجة حقيقية).
2. عرض تجربة أو ضمان إن وُجد.
3. سؤال واحد يُقرّب: "ما الذي سيجعلك أكثر اطمئناناً؟"
القالب: [دليل ملموس] + [ضمان/تجربة] + [سؤال]`;
    }
    // اعتراض عام
    return `${header}
الإجراء الإلزامي — اعتراض (${objectionType}):
1. اعترف بالاعتراض بجملة واحدة.
2. أعد تأطير المشكلة من زاوية العميل.
3. سؤال واحد يكشف السبب الحقيقي.
القالب: [اعتراف] + [إعادة تأطير] + [سؤال تشخيصي]`;
  }

  // ── OFFER / PRESENT_PRICE ──
  if (stage === "OFFER" || route === "PRESENT_OFFER" || nextAction === "PRESENT_PRICE") {
    return `${header}
الإجراء الإلزامي:
1. اذكر السعر والباقات مباشرة في السطر الأول — لا مقدمات.
2. اربط الباقة بوضع العميل المحدد (ما ذكره من رسائل / فريق / مشكلة).
3. سؤال واحد يُقرّب القرار: "أيهما يناسبك أكثر؟" أو "متى تريد البدء؟"
القالب: [سعر + باقة مباشرة] + [ربط بوضع العميل] + [سؤال إغلاق]`;
  }

  // ── VALUE_BUILDING ──
  if (stage === "VALUE_BUILDING" || nextAction === "BUILD_VALUE") {
    return `${header}
الإجراء الإلزامي:
1. قدّم فائدة ملموسة بأرقام أو نتيجة واضحة (ليس ميزة تقنية).
2. اربطها بمشكلة ذكرها العميل أو وضعه المفهوم من السياق.
3. سؤال واحد يدفع للأمام.
القالب: [فائدة بنتيجة ملموسة] + [ربط بوضع العميل] + [سؤال]
مثال: "النظام يوفر على الفريق ساعتين يومياً في الرد — بالنسبة لوضعكم [كذا]، كيف تتعاملون مع هذا الحجم حالياً؟"`;
  }

  // ── QUALIFICATION ──
  if (stage === "QUALIFICATION" || nextAction === "ASK_QUALIFYING_QUESTION") {
    const questionMap: Record<string, string> = {
      messages_per_day: "كم رسالة تستقبلون يومياً تقريباً؟",
      team_size:        "كم شخص يرد على رسائل العملاء حالياً؟",
    };
    const q = missingFields.length > 0
      ? (questionMap[missingFields[0]] ?? "ما التحدي الأكبر الذي تواجهونه في التواصل مع العملاء؟")
      : "ما التحدي الأكبر الذي تواجهونه في التواصل مع العملاء؟";

    return `${header}
الإجراء الإلزامي:
1. ابدأ بجملة فائدة واحدة عن النظام (لا تتجاوز سطراً).
2. اسأل هذا السؤال تحديداً: "${q}"
3. سؤال واحد فقط — لا تسأل أكثر.
القالب: [جملة فائدة] + ["${q}"]`;
  }

  // ── DISCOVERY ──
  if (stage === "DISCOVERY") {
    return `${header}
الإجراء الإلزامي:
1. أجب على ما سأل عنه العميل بشكل مباشر ومفيد.
2. أضف جملة تكشف تكلفة المشكلة أو الفرصة الضائعة (pressure خفيف).
3. سؤال واحد يكشف حجم التحدي الحقيقي.
القالب: [إجابة مباشرة] + [تكلفة المشكلة] + [سؤال كشف]
مثال: "كثير من الشركات تخسر عملاء بسبب بطء الرد — كيف تتعاملون مع الرسائل خارج أوقات الدوام؟"`;
  }

  // ── DEFAULT / DIRECT_ANSWER ──
  return `${header}
الإجراء الإلزامي:
1. أجب على سؤال العميل بشكل مباشر ومفيد.
2. أضف جملة تربط الإجابة بفائدة ملموسة.
3. سؤال واحد فقط يساعد على التقدم.
القالب: [إجابة مباشرة] + [فائدة ملموسة] + [سؤال]`;
}

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
  const {
    companyProfile: p, knowledgeResults, scoring, routing,
    intent, missingFields, hasObjection, objectionType, ctaButtons,
  } = input;

  const services  = p.services.map(s => `- ${s.name}: ${s.description} | السعر: ${s.price}`).join("\n");
  const knowledge = knowledgeResults.length
    ? knowledgeResults.map((r, i) => `[${i + 1}] ${r.documentTitle}:\n${r.content.slice(0, 400)}`).join("\n\n")
    : "لا توجد معلومات إضافية.";

  // ── 1. الهوية ──
  const identity = `[الهوية]
أنت مندوب مبيعات محترف لشركة "${p.name}". تتحدث بالعربية فقط. لا تذكر أنك AI أو نظام آلي.`;

  // ── 2. حالة العميل الحالية ──
  const customerState = `[حالة العميل — محلَّلة تلقائياً]
النية: ${intent}
الدرجة: ${scoring.score}/100
الحالة: ${scoring.temperature}
المرحلة: ${stageLabel(routing.stage)} (${routing.stage})
المسار: ${routing.route}
الخطوة: ${routing.nextAction}${hasObjection ? `\nالاعتراض: ${objectionType}` : ""}${missingFields.length ? `\nحقول مفقودة: ${missingFields.join(", ")}` : ""}${ctaButtons.length ? `\nCTA المقترح: ${ctaButtons.map(b => b.label).join(" | ")}` : ""}`;

  // ── 3. الحظر المطلق (Hard Stop) ──
  const prohibitions = `[قواعد الحظر المطلق — لا استثناءات]\n${buildHardProhibitions(routing.stage, routing.route, hasObjection)}`;

  // ── 4. عقد التنفيذ الإلزامي ──
  const contract = buildExecutionContract(
    routing.stage, routing.route, routing.nextAction,
    scoring.temperature, hasObjection, objectionType, missingFields,
  );

  // ── 5. أسلوب الرد ──
  const tone = `[أسلوب الرد]
${p.tone || "ودود، احترافي، مباشر. 2-3 جمل فقط."}
- لا تبدأ بـ "بالطبع" أو "بالتأكيد" أو "شكراً لتواصلك" أو "أهلاً وسهلاً".
- الرد القصير المباشر أفضل من الرد الطويل العام.
- تحدث كإنسان محترف، ليس كنظام يقرأ قوائم.`;

  // ── 6. قواعد التصعيد ──
  const handoff = `[قواعد التصعيد]\n${p.handoffRule || "صعّد عند: طلب صريح لمندوب، شكوى، اعتراض معقد يتجاوز صلاحياتك."}`;

  // ── 7. معلومات الشركة ──
  const companyInfo = `[معلومات الشركة]
الاسم: ${p.name} | المجال: ${p.industry}
${p.description}
الموقع: ${p.location} | ساعات العمل: ${p.workingHours}

[الخدمات والأسعار]
${services}

[مصادر المعرفة — استخدمها فقط، لا تخترع]
${knowledge}`;

  // ترتيب الأقسام: الحظر أولاً → العقد → الهوية → الحالة → الأسلوب → الشركة
  return [
    prohibitions,
    "",
    contract,
    "",
    identity,
    "",
    customerState,
    "",
    tone,
    "",
    handoff,
    "",
    companyInfo,
  ].join("\n");
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