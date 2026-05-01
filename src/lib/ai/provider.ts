import { AgentDecision } from "@/domain/agent";
import type { CompanyProfile } from "@/domain/company";
import type { KnowledgeSearchResult } from "@/domain/knowledge";
import { humanizeAgentReply } from "@/domain/agent/humanize-response";
import { buildRegenerationInstruction, validateFinalReply } from "@/domain/agent/response-policy";
import {
  buildContractFallbackReply,
  resolveResponseContent,
  type ResolvedResponseContent,
} from "@/domain/agent/content-resolver";

export type ConversationMemoryMessage = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

type GenerateReplyInput = {
  customerMessage: string;
  companyProfile: CompanyProfile;
  decision: AgentDecision;
  conversationHistory?: ConversationMemoryMessage[];
  knowledgeResults?: KnowledgeSearchResult[];
};

export type GeneratedReply = {
  text: string;
  provider: string;
};

const MAX_REGENERATION_ATTEMPTS = 2;
const SAFE_FALLBACK_REPLY = "خلني أوضح لك بشكل أبسط. كيف تفضل أساعدك؟";

export async function generateAgentReply(input: GenerateReplyInput): Promise<GeneratedReply> {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const content = resolveResponseContent({
    contract: input.decision.responseContract,
    companyProfile: input.companyProfile,
    knowledgeResults: input.knowledgeResults,
  });
  let correction: string | undefined;
  let lastGenerated: GeneratedReply | null = null;
  let providerFailed = false;
  let lastProviderError: unknown;

  for (let attempt = 0; attempt <= MAX_REGENERATION_ATTEMPTS; attempt += 1) {
    try {
      logProviderAttempt({ attempt, provider, hasCorrection: Boolean(correction) });
      const generated = await generateWithProviderFallback(input, provider, correction, content);
      lastGenerated = generated;

      const polished = humanizeAgentReply({
        text: generated.text,
        strategy: input.decision.personalizationStrategy,
        ctaPrompt: input.decision.cta.prompt,
      });
      const validation = validateFinalReply({
        text: polished,
        decision: input.decision,
        contract: input.decision.responseContract,
        content,
      });

      logValidationStep({
        attempt,
        provider: generated.provider,
        rawReply: generated.text,
        polished,
        validation,
        source: correction ? "REGENERATED" : "LLM",
      });

      if (validation.valid) {
        logFinalResponse(polished);
        debugAgentReply({
          decision: input.decision,
          selectedCta: input.decision.cta.prompt,
          rawReply: generated.text,
          finalReply: polished,
          correction,
          validationFailures: [],
        });

        return {
          text: polished,
          provider: `${generated.provider}:validated`,
        };
      }

      correction = buildRegenerationInstruction(input.decision, validation.violations);
      debugAgentReply({
        decision: input.decision,
        selectedCta: input.decision.cta.prompt,
        rawReply: generated.text,
        finalReply: polished,
        correction,
        validationFailures: validation.violations,
      });
    } catch (error) {
      providerFailed = true;
      lastProviderError = error;
      console.error("AI provider failed", error);
      break;
    }
  }

  const contractFallback = buildContractFallbackReply({
    contract: input.decision.responseContract,
    content,
    customerFacts: input.decision.personalizationStrategy.mustMentionFacts,
  }) || SAFE_FALLBACK_REPLY;

  logFinalResponse(contractFallback);
  debugAgentReply({
    decision: input.decision,
    selectedCta: input.decision.cta.prompt,
    rawReply: lastGenerated?.text ?? (providerFailed ? "provider_failed" : "validation_failed"),
    finalReply: contractFallback,
    correction,
    validationFailures: providerFailed ? [`provider_failed:${formatProviderError(lastProviderError)}`] : ["regeneration_exhausted"],
  });

  return {
    text: contractFallback,
    provider: `${lastGenerated?.provider ?? provider}:safe-fallback`,
  };
}

function logProviderAttempt({ attempt, provider, hasCorrection }: { attempt: number; provider: string; hasCorrection: boolean }) {
  if (!shouldPrintAgentDebug()) return;

  console.log("[AI_AGENT_PROVIDER_ATTEMPT]", {
    attempt,
    provider,
    hasCorrection,
    source: hasCorrection ? "REGENERATION" : "LLM",
  });
}

async function generateWithProvider(input: GenerateReplyInput, provider: string, correction: string | undefined, content: ResolvedResponseContent) {
  if (provider === "gemini") return generateWithGemini(input, correction, content);
  if (provider === "groq") return generateWithGroq(input, correction, content);
  return generateWithMock(input, correction, content);
}

async function generateWithProviderFallback(
  input: GenerateReplyInput,
  preferredProvider: string,
  correction: string | undefined,
  content: ResolvedResponseContent,
) {
  const providers = getProviderFallbackOrder(preferredProvider);
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      return await generateWithProvider(input, provider, correction, content);
    } catch (error) {
      failures.push(`${provider}:${formatProviderError(error)}`);
      logProviderFailure(provider, error);
    }
  }

  throw new Error(`All AI providers failed: ${failures.join(" | ")}`);
}

function getProviderFallbackOrder(preferredProvider: string) {
  const configured = [preferredProvider, "gemini", "groq", "mock"];
  const available = configured.filter((provider) => {
    if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY?.trim());
    if (provider === "groq") return Boolean(process.env.GROQ_API_KEY?.trim());
    return true;
  });

  return [...new Set(available)];
}

function logProviderFailure(provider: string, error: unknown) {
  if (!shouldPrintAgentDebug()) return;

  console.log("[AI_AGENT_PROVIDER_FAILURE]", {
    provider,
    error: formatProviderError(error),
    willTryNextProvider: true,
  });
}

function formatProviderError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function logValidationStep({
  attempt,
  provider,
  rawReply,
  polished,
  validation,
  source,
}: {
  attempt: number;
  provider: string;
  rawReply: string;
  polished: string;
  validation: ReturnType<typeof validateFinalReply>;
  source: "LLM" | "REGENERATED";
}) {
  if (!shouldPrintAgentDebug()) return;

  console.log("[AI_AGENT_VALIDATION]", {
    attempt,
    provider,
    source,
    rawReply,
    polished,
    validationCode: validation.code,
    validationValid: validation.valid,
    validationReason: validation.violations,
    regenerationInstruction: validation.valid ? undefined : validation.instruction,
  });
}

async function generateWithMock(
  input: GenerateReplyInput,
  correction: string | undefined,
  content: ResolvedResponseContent,
): Promise<GeneratedReply> {
  const decision = input.decision;
  const contractReply = buildMockReplyFromContract(input, content);

  if (contractReply && !correction) {
    return {
      text: contractReply,
      provider: "mock-llm:contract",
    };
  }

  if (correction?.includes("Do not ask any question") || decision.intent === "Direct Explanation Request") {
    return {
      text: "نقدم نظامًا يساعد الشركات على تنظيم رسائل العملاء وتسريع الردود باستخدام معلومات الشركة. ويساعد فريق المبيعات على متابعة العملاء وتحويل المحادثات المهمة إلى فرص وصفقات.",
      provider: "mock-llm",
    };
  }

  if (decision.intent === "Location Question") {
    return {
      text: `موقعنا: ${input.companyProfile.location || "I don't have that information"}.`,
      provider: "mock-llm",
    };
  }

  if (decision.intent === "Hours Question") {
    return {
      text: `ساعات العمل لدينا: ${input.companyProfile.workingHours || "I don't have that information"}.`,
      provider: "mock-llm",
    };
  }

  if (decision.directAnswerIntent === "ASK_PRICE" || decision.directAnswerIntent === "ASK_QUOTE") {
    return {
      text: `الأسعار الحالية: ${formatServicesPricing(input.companyProfile)}.${decision.directAnswerIntents.includes("ASK_SERVICE") ? " ويعمل النظام مع قنوات المحادثة مثل موقعك وواتساب عند ربطها بمصادر معرفة شركتك." : ""} إذا تحب، أقدر بعدها أوضح لك أي خيار أنسب لوضعك.`,
      provider: "mock-llm",
    };
  }

  if (
    (decision.directAnswerIntent === "ASK_SERVICE" || decision.directAnswerIntent === "ASK_HOW_IT_WORKS") &&
    !isRepeatedCustomerMessage(input.conversationHistory ?? [], input.customerMessage)
  ) {
    return {
      text: "نظامنا ينظم محادثات العملاء، يرد على الأسئلة المتكررة من معرفة شركتك، ويساعدك تتابع العملاء المهتمين بدون تشتت.",
      provider: "mock-llm",
    };
  }

  if (decision.intent === "Answer Reason Question") {
    return {
      text: "أعتمد على معلومات الشركة المعتمدة وما يذكره العميل أثناء المحادثة حتى يكون الرد مناسبًا، وأختار السؤال التالي فقط عندما يساعدنا نفهم الاحتياج بشكل أوضح.",
      provider: "mock-llm",
    };
  }

  if (decision.intent === "Unclear Reply") {
    return {
      text: "ما فهمت قصدك تمامًا. ممكن تكتبها بجملة أوضح؟",
      provider: "mock-llm",
    };
  }

  if (isRepeatedCustomerMessage(input.conversationHistory ?? [], input.customerMessage)) {
    return {
      text: "واضح أن النقطة نفسها ما زالت مهمة لك. أقدر أختصرها: النظام ينظم الرسائل المتكررة، يسرّع الردود، ويترك الحالات المهمة للمندوب.",
      provider: "mock-llm",
    };
  }

  if (decision.intent === "Greeting" || decision.intent === "Capabilities Question") {
    return {
      text: "وعليكم السلام. نقدم مساعدًا ينظم محادثات العملاء، يسرّع الردود، ويحوّل الطلبات المهمة إلى فرص متابعة. تقريبًا كم رسالة تستقبلون يوميًا؟",
      provider: "mock-llm",
    };
  }

  if (decision.nextAction === "ASK_MESSAGES_PER_DAY") {
    return {
      text: "نظامنا يساعدكم في تنظيم محادثات العملاء وتسريع الردود وتصعيد الحالات المهمة بدل ما تتكدس على الفريق. تقريبًا كم رسالة تستقبلون يوميًا؟",
      provider: "mock-llm",
    };
  }

  if (decision.nextAction === "ASK_TEAM_SIZE") {
    return {
      text: `ممتاز، ${decision.messagesPerDay ?? "هذا"} رسالة يوميًا عدد مناسب للبدء. النظام يساعدك تنظم الردود وتوفر وقتك خصوصًا إذا كنت ترد بنفسك. هل ترد على العملاء بنفسك حاليًا أم عندك فريق؟`,
      provider: "mock-llm",
    };
  }

  if (decision.nextAction === "CONFIRM_PROBLEM") {
    if (decision.teamSize === 1) {
      return {
        text: `مع ${decision.messagesPerDay ?? "هذا العدد من"} رسالة يوميًا وشخص واحد يرد، النظام يوفر وقتك ويرتب الأسئلة المتكررة بدل ما ترد عليها يدويًا. أقدر أوضح لك طريقة البدء بخطوتين.`,
        provider: "mock-llm",
      };
    }

    return {
      text: `مع ${decision.messagesPerDay ?? "هذا العدد من"} رسالة يوميًا و${formatTeamSize(decision.teamSize)}، النظام يساعد على تنظيم الردود وتقليل التراكم. هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟`,
      provider: "mock-llm",
    };
  }

  if (decision.nextAction === "EXPLAIN_VALUE") {
    if (decision.messagesPerDay && decision.teamSize === 1) {
      return {
        text: `مع ${decision.messagesPerDay} رسالة يوميًا وشخص واحد يرد، الحل يرتب المحادثات والأسئلة المتكررة حتى توفر وقتك وترد على المهم أسرع. أقدر أوضح لك طريقة البدء بخطوتين.`,
        provider: "mock-llm",
      };
    }

    if (decision.messagesPerDay && decision.teamSize) {
      return {
        text: `مع ${decision.messagesPerDay} رسالة يوميًا و${formatTeamSize(decision.teamSize)}، الحل يرتب المحادثات، يرد على الأسئلة المتكررة، ويساعد الفريق يركز على العملاء الجاهزين. أقدر أوضح لك طريقة البدء بخطوتين.`,
        provider: "mock-llm",
      };
    }

    return {
      text: "الحل يرتب المحادثات، يرد على الأسئلة المتكررة، ويساعد المندوب يركز على العملاء الجاهزين. أقدر أوضح لك طريقة البدء بخطوتين.",
      provider: "mock-llm",
    };
  }

  if (decision.route === "PRESENT_OFFER" && decision.recommendedOffer) {
    return {
      text: `الخيار الأقرب لكم هو ${decision.recommendedOffer.offerName} لأنه يناسب وضعكم الحالي. أقدر أشرح خطوات البدء باختصار.`,
      provider: "mock-llm",
    };
  }

  return {
    text: "أقدر أساعدك في تنظيم محادثات العملاء وتسريع المتابعة. اكتب لي ما الذي تريد تحسينه أولًا.",
    provider: "mock-llm",
  };
}

function buildMockReplyFromContract(input: GenerateReplyInput, content: ResolvedResponseContent) {
  const contract = input.decision.responseContract;
  const needs = new Set(contract.mustAnswer);

  if (input.decision.intent === "Answer Reason Question") {
    return "أعتمد على معلومات الشركة المعتمدة وما يذكره العميل أثناء المحادثة. في حالتنا الخدمة تنظم محادثات العملاء وتساعد على اختيار الخطوة التالية بدون تكرار.";
  }
  if (needs.has("greeting")) return "وعليكم السلام، أهلًا بك.";
  if (needs.has("identity")) return content.identity;
  if (needs.has("price") && needs.has("whatsapp")) {
    const how = needs.has("how_it_works") ? " يعمل بتنظيم المحادثات والردود من معرفة الشركة." : "";
    return `الأسعار الحالية: ${content.pricing}. وبالنسبة لواتساب، ${content.whatsapp}${how}`;
  }
  if (needs.has("price")) return `الأسعار الحالية: ${content.pricing}.`;
  if (needs.has("quote")) return `الخيارات المتاحة حاليًا: ${content.quote}.`;
  if (needs.has("location")) return `موقعنا في ${content.location}.`;
  if (needs.has("whatsapp")) return content.whatsapp;
  if (needs.has("custom_quote_handoff")) return content.handoff;
  if (needs.has("clarification")) return "ما فهمت قصدك تمامًا. ممكن توضحها بجملة قصيرة؟";
  if (needs.has("service") && needs.has("how_it_works")) return `${content.service}. ${content.howItWorks}`;
  if (needs.has("how_it_works")) return `ينظم الرسائل والمحادثات، يرد على الأسئلة المتكررة من معرفة الشركة، ويحول الحالات المهمة إلى متابعة أو مندوب.`;
  if (needs.has("service")) return `نقدم خدمة تساعدك على إدارة محادثات العملاء والردود والمتابعة. ينظم الرسائل والمحادثات ويرد على الأسئلة المتكررة من معرفة الشركة.`;
  if (needs.has("objection")) {
    return "أتفهم ملاحظتك. الأهم نقيس السعر مقابل الوقت والضغط الذي يقلله النظام، خصوصًا عند وجود رسائل متكررة ومتابعات كثيرة.";
  }
  if (needs.has("qualification_question")) {
    if (contract.nextAction === "ASK_MESSAGES_PER_DAY") {
      return "النظام يساعد على تنظيم محادثات العملاء وتسريع الردود بدل تراكمها. تقريبًا كم رسالة تستقبلون يوميًا؟";
    }
    if (contract.nextAction === "ASK_TEAM_SIZE") {
      const facts = input.decision.personalizationStrategy.mustMentionFacts.slice(0, 1).join(" و");
      return `ممتاز، ${facts ? `${facts} عدد مناسب للبدء. ` : ""}النظام يساعدك تنظم الردود وتوفر وقتك. هل ترد على العملاء بنفسك حاليًا أم عندك فريق؟`;
    }
    if (contract.nextAction === "CONFIRM_PROBLEM") {
      const facts = input.decision.personalizationStrategy.mustMentionFacts.slice(0, 2).join(" و");
      return `${facts ? `مع ${facts}، ` : ""}هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟`;
    }
  }
  if (needs.has("value")) {
    const facts = input.decision.personalizationStrategy.mustMentionFacts.slice(0, 2).join(" و");
    return `${facts ? `مع ${facts}، ` : ""}النظام يرتب المحادثات والأسئلة المتكررة، يوفر وقتك، ويقلل الضغط حتى تركز على العملاء الجاهزين. أقدر أوضح لك طريقة البدء بخطوتين.`;
  }
  if (needs.has("offer")) return "الخيار الأنسب هو البدء بالباقة المناسبة لحجم المحادثات، مع متابعة واضحة لقياس النتائج.";
  if (needs.has("start_cta")) return "ممتاز، نقدر نبدأ بخطوة بسيطة: نراجع بيانات الشركة والخدمة المطلوبة ثم نجهز المساعد على نفس المعلومات.";

  return undefined;
}

function debugAgentReply({
  decision,
  selectedCta,
  rawReply,
  finalReply,
  correction,
  validationFailures,
}: {
  decision: AgentDecision;
  selectedCta: string;
  rawReply: string;
  finalReply: string;
  correction?: string;
  validationFailures: string[];
}) {
  if (!shouldPrintAgentDebug()) return;

  console.log({
    intentDetected: decision.intent,
    intentType: decision.directAnswerIntents.length ? decision.directAnswerIntents.join(",") : decision.intent,
    semanticIntent: decision.semanticIntent,
    conversationStage: decision.conversationStage,
    directAnswerIntent: decision.directAnswerIntent,
    directAnswerIntents: decision.directAnswerIntents,
    intentOverride: Boolean(decision.directAnswerIntent),
    responseContract: decision.responseContract,
    messagesPerDay: decision.messagesPerDay,
    teamSize: decision.teamSize,
    problemConfirmed: decision.problemConfirmed,
    valueExplained: decision.valueExplained,
    valuePriority: decision.valuePriority,
    allowOffer: decision.allowOffer,
    allowPrice: decision.allowPrice,
    allowDemo: decision.allowDemo,
    conversationState: decision.conversationState,
    route: decision.route,
    nextAction: decision.nextAction,
    missingFields: decision.missingFields,
    selectedCta,
    rawReply,
    finalReply,
    validationFailures,
    correction,
    finalSource: validationFailures.length ? "SAFE_FALLBACK" : correction ? "REGENERATED" : "LLM",
  });
}

async function generateWithGemini(
  input: GenerateReplyInput,
  correction: string | undefined,
  content: ResolvedResponseContent,
): Promise<GeneratedReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const prompt = buildPrompt(input, correction, content);
  logFinalPrompt(`gemini:${model}`, prompt);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 240 },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("").trim();

  if (!text) throw new Error("Gemini returned an empty response");

  return { text, provider: `gemini:${model}` };
}

async function generateWithGroq(
  input: GenerateReplyInput,
  correction: string | undefined,
  content: ResolvedResponseContent,
): Promise<GeneratedReply> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const messages = buildGroqMessages(input, correction, content);
  logFinalPrompt(`groq:${model}`, JSON.stringify(messages, null, 2));

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 240,
      messages,
    }),
  });

  if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) throw new Error("Groq returned an empty response");

  return { text, provider: `groq:${model}` };
}

function buildGroqMessages(input: GenerateReplyInput, correction: string | undefined, content: ResolvedResponseContent) {
  const history = (input.conversationHistory ?? []).slice(-8).map((message) => ({
    role: message.sender === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
    content: message.body,
  }));

  return [
    { role: "system" as const, content: buildSystemPrompt(input.companyProfile, Boolean(input.knowledgeResults?.length)) },
    ...history,
    { role: "user" as const, content: buildUserPrompt(input, content) },
    ...(correction ? [{ role: "user" as const, content: correction }] : []),
  ];
}

function buildPrompt(input: GenerateReplyInput, correction: string | undefined, content: ResolvedResponseContent) {
  const history = input.conversationHistory?.length
    ? input.conversationHistory
        .slice(-8)
        .map((message) => `${message.sender}: ${message.body}`)
        .join("\n")
    : "No previous history.";

  return [
    buildSystemPrompt(input.companyProfile, Boolean(input.knowledgeResults?.length)),
    "",
    "Conversation history:",
    history,
    "",
    buildUserPrompt(input, content),
    ...(correction ? ["", correction] : []),
  ].join("\n");
}

function buildSystemPrompt(companyProfile: CompanyProfile, hasKnowledgeResults: boolean) {
  const basePrompt = [
    "You are a professional Arabic sales agent for MNtechnique.",
    "Reply in Arabic only, concise and helpful.",
    "Write like a real live-chat customer success representative, not like software.",
    "Never mention AI, bot, model, prompt, policy, route, score, analysis, system, or customer context to the customer.",
    "Use natural Arabic wording. Avoid brochure tone, technical labels, and generic slogans.",
    "Keep the reply to 1-3 short sentences unless the customer asks for details.",
    "Use one warm acknowledgement only when useful, then move directly to the point.",
    "End with one clear next step or one question. Never end with multiple questions.",
    "Do not repeat greetings after the first turn.",
    "Ask exactly one question in each reply when qualification is needed.",
    "Never ask two questions in the same reply.",
    "Never repeat the same meaning in two different phrasings.",
    "If the customer asks a direct factual question, answer it directly before any sales flow.",
    "If the customer asks not to receive questions, do not ask a question.",
    "When the customer asks about price, answer directly from Knowledge Base or services. If the context is not qualified, keep it brief and do not force qualification first.",
    "If a recommended offer is provided, present only that one recommended offer and do not list every plan.",
    "Treat the CTA plan as a suggested next step. The latest customer message and validation constraints have higher priority.",
    "Use conversation history and do not repeat the same greeting or question unnecessarily.",
    "If anti-repetition memory says risk is MEDIUM or HIGH, do not ask the same question again even with different wording.",
    "If Response Strategy says requirePersonalization=true, include a relevant customer fact or an obvious paraphrase.",
    "If mustMentionFacts exist, connect relevant facts to pain, value, savings, speed, workload, or the next action.",
    "Generic replies are invalid when customer facts exist.",
    "Avoid these customer-facing phrases: من كلامك, بما أنك ذكرت, هذه المعلومة تساعدنا, بدل رد عام.",
    "If Relevant Knowledge Base chunks are provided, answer from them before using company settings.",
    "Knowledge Base may contain conflicting or outdated information.",
    "Always prefer the most recent, most explicit, or clearly marked current/latest information.",
    "Never use knowledge marked old, outdated, previous, deprecated, not valid, cancelled, or expired.",
    "Never combine conflicting values. Return one correct answer only.",
    'If information is missing, say exactly: "I don\'t have that information"',
    "",
    `Company: ${companyProfile.name}`,
    `Industry: ${companyProfile.industry}`,
    `Description: ${companyProfile.description}`,
    `Tone: ${companyProfile.tone}`,
    `Working hours: ${companyProfile.workingHours}`,
    `Location: ${companyProfile.location}`,
    `Handoff rules: ${companyProfile.handoffRule}`,
  ];

  if (hasKnowledgeResults) {
    return [
      ...basePrompt,
      "",
      "Company settings are only background context. Do not use company settings prices when Knowledge Base chunks contain prices.",
      "For prices, policies, hours, and factual details, answer only from Relevant Knowledge Base chunks.",
    ].join("\n");
  }

  return [
    ...basePrompt,
    "",
    "Services and prices:",
    ...companyProfile.services.map((service) => `- ${service.name}: ${service.price}. ${service.description}`),
  ].join("\n");
}

function buildDirectAnswerRule(decision: AgentDecision) {
  if (decision.directAnswerIntent === "ASK_PRICE" || decision.directAnswerIntent === "ASK_QUOTE") {
    return "Answer the customer's price question directly from the available prices. Do not ask a qualification question before answering.";
  }
  if (decision.directAnswerIntent === "ASK_LOCATION") {
    return "Answer the location question directly. Do not return to discovery in this reply.";
  }
  if (decision.directAnswerIntent === "ASK_SERVICE" || decision.directAnswerIntent === "ASK_HOW_IT_WORKS") {
    return "Explain what the service does in simple customer language. Do not force a sales step before answering.";
  }
  return "none";
}

function buildUserPrompt({ customerMessage, decision, knowledgeResults = [] }: GenerateReplyInput, content: ResolvedResponseContent) {
  return [
    `Current customer message: ${customerMessage}`,
    "",
    "Response Contract. This is the single source of truth for what to answer:",
    JSON.stringify(decision.responseContract, null, 2),
    "",
    "Resolved content. Use this as content only; do not let it change the response contract:",
    JSON.stringify(content, null, 2),
    "",
    "Rules:",
    "- The LLM only writes the wording. It must not choose a different route or stage.",
    "- Answer every mustAnswer item in the Response Contract.",
    "- Avoid every forbidden item in the Response Contract.",
    "- If the contract is DIRECT_ANSWER, answer the customer's direct question before any sales flow.",
    "",
    "Decision context. Use this as strategy and constraints only; do not expose labels to the customer:",
    `Intent: ${decision.intent}`,
    `Direct answer override: ${decision.directAnswerIntent ?? "none"}`,
    `Direct answer intents: ${decision.directAnswerIntents.join(" | ") || "none"}`,
    `Semantic intent classifier: ${decision.semanticIntent ? JSON.stringify(decision.semanticIntent) : "none"}`,
    `Intent override active: ${Boolean(decision.directAnswerIntent)}`,
    `Route: ${decision.route}`,
    `Conversation stage: ${decision.conversationStage}`,
    `Offer guard: ${JSON.stringify({
      messagesPerDay: decision.messagesPerDay,
      teamSize: decision.teamSize,
      problemConfirmed: decision.problemConfirmed,
      valueExplained: decision.valueExplained,
      valuePriority: decision.valuePriority,
      allowOffer: decision.allowOffer,
      allowPrice: decision.allowPrice,
      allowDemo: decision.allowDemo,
    })}`,
    `Next action: ${decision.nextAction}`,
    `Lead summary: ${decision.summary}`,
    `Objection analysis: ${JSON.stringify(decision.objection)}`,
    `Conversation state: ${JSON.stringify(decision.conversationState)}`,
    `Anti-repetition memory: ${JSON.stringify(decision.antiRepetition)}`,
    `Prediction: ${JSON.stringify(decision.prediction)}`,
    `Sales playbook: ${JSON.stringify(decision.salesPlaybook)}`,
    `Customer context: ${JSON.stringify(decision.customerContext)}`,
    `Intent override constraints: ${JSON.stringify(decision.intentOverride)}`,
    `Response strategy: ${JSON.stringify(decision.personalizationStrategy)}`,
    `Qualification signals: ${decision.qualificationSignals.join(" | ") || "none"}`,
    `Missing fields: ${decision.missingFields.join(" | ") || "none"}`,
    `Profile updates: ${JSON.stringify(decision.profileUpdates)}`,
    `Lost deal: ${decision.lostDeal ? JSON.stringify(decision.lostDeal) : "none"}`,
    `Follow-up plan: ${decision.followUpPlan ? JSON.stringify(decision.followUpPlan) : "none"}`,
    `Recommended offer: ${decision.recommendedOffer ? JSON.stringify(decision.recommendedOffer) : "none"}`,
    `CTA plan: ${JSON.stringify(decision.cta)}`,
    `Direct answer rule: ${buildDirectAnswerRule(decision)}`,
    `Matched settings knowledge: ${knowledgeResults.length ? "ignored because Knowledge Base matched" : decision.matchedKnowledge.join(" | ") || "none"}`,
    `Knowledge sources: ${knowledgeResults.map((result) => result.documentTitle).join(" | ") || "none"}`,
    "",
    "Relevant Knowledge Base chunks:",
    ...(knowledgeResults.length
      ? knowledgeResults.map(
          (result, index) =>
            `- Priority ${index + 1} | Score ${result.score} | ${result.documentTitle}: ${result.content}`,
        )
      : ["none"]),
    "",
    "Write the final customer-facing reply now. The reply must come from you, not from any template.",
  ].join("\n");
}

function isRepeatedCustomerMessage(history: ConversationMemoryMessage[], currentMessage: string) {
  const normalizedCurrent = normalizeForCompare(currentMessage);
  if (!normalizedCurrent) return false;

  const repeatedCount = history.filter(
    (message) => message.sender === "CUSTOMER" && normalizeForCompare(message.body) === normalizedCurrent,
  ).length;

  return repeatedCount >= 2;
}

function formatTeamSize(teamSize?: number) {
  if (!teamSize) return "الفريق الحالي";
  if (teamSize === 1) return "شخص واحد يرد";
  if (teamSize === 2) return "شخصين يردون";
  return `${teamSize} أشخاص يردون`;
}

function formatServicesPricing(companyProfile: CompanyProfile) {
  const uniquePrices = [...new Set(companyProfile.services.map((service) => service.price.trim()).filter(Boolean))];
  return uniquePrices.join("، ") || "I don't have that information";
}

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function logFinalPrompt(provider: string, prompt: string) {
  if (!shouldPrintAgentDebug()) return;

  console.log("[AI_AGENT_FINAL_PROMPT]", {
    provider,
    prompt,
  });
}

function logFinalResponse(response: string) {
  if (!shouldPrintAgentDebug()) return;

  console.log("[AI_AGENT_FINAL_RESPONSE]", {
    response,
  });
}

function shouldPrintAgentDebug() {
  return process.env.AGENT_DEBUG === "1" || process.env.NODE_ENV === "development";
}
