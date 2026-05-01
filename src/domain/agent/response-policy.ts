import type { AgentDecision } from "@/domain/agent";
import type { PersonalizationStrategy } from "@/domain/agent/customer-context";

export type ReplyValidationCode =
  | "OK"
  | "REGENERATE"
  | "BLOCK_QUESTION"
  | "REMOVE_REPEATED_QUESTION"
  | "SAFE_FALLBACK_ONLY";

export type ReplyValidationResult = {
  code: ReplyValidationCode;
  valid: boolean;
  violations: string[];
  instruction: string;
};

const genericPatterns = [
  "السعر يعتمد على القيمة",
  "السعر ليس العامل الوحيد",
  "يمكننا مساعدتك",
  "هل تريد معرفة المزيد",
  "نقدم حلول",
  "حلول مخصصة",
  "يسعدنا مساعدتك",
  "depends on the value",
  "we can help",
  "learn more",
];

const disallowedCustomerFacingPatterns = [
  /من\s+كلامك/iu,
  /بما\s+أنك\s+ذكرت/iu,
  /بما\s+انك\s+ذكرت/iu,
  /هذه\s+المعلومة\s+تساعدنا/iu,
  /نحدد\s+السؤال\s+التالي\s+بدقة/iu,
  /بدل\s+رد\s+عام/iu,
  /بدل\s+الكلام\s+العام/iu,
  /ردود\s+عامة/iu,
  /Response Strategy|Customer Context|Decision Engine|mustMentionFacts|policy|LLM/iu,
];

const blockedOfferPatterns = [
  /تبدأ\s+من/iu,
  /\$\s*\d|\d+\s*\$/u,
  /باقة/iu,
  /الباقات/iu,
  /السعر/iu,
  /أسعار|اسعار/iu,
  /Demo/iu,
  /نبدأ/iu,
  /شراء/iu,
  /اشتراك/iu,
];

export function validateFinalReply(input: {
  text: string;
  decision: AgentDecision;
}): ReplyValidationResult {
  const text = sanitizeLanguage(input.text);
  const violations: string[] = [];
  const decision = input.decision;

  if (!text || text.length < 8) {
    violations.push("empty_or_too_short");
  }

  if (disallowedCustomerFacingPatterns.some((pattern) => pattern.test(text))) {
    violations.push("customer_facing_internal_or_robotic_phrase");
  }

  if (hasGenericPattern(text) && hasCustomerFacts(decision.personalizationStrategy)) {
    violations.push("generic_reply_while_customer_context_exists");
  }

  if (decision.intent === "Direct Explanation Request" && containsQuestion(text)) {
    violations.push("question_blocked_by_customer_instruction");
  }

  const repeatedQuestion = detectRepeatedQuestion(text, decision);
  if (repeatedQuestion) {
    violations.push(`repeated_question:${repeatedQuestion}`);
  }

  if (isOfferBlocked(decision.personalizationStrategy) && containsBlockedOfferLanguage(text)) {
    violations.push("offer_or_price_before_allowed_stage");
  }

  if (shouldRequireValue(decision) && !containsValue(text)) {
    violations.push("reply_without_clear_value");
  }

  if (regressesConversation(decision, text)) {
    violations.push("conversation_stage_regression");
  }

  if (!violations.length) {
    return {
      code: "OK",
      valid: true,
      violations,
      instruction: "",
    };
  }

  return {
    code: chooseValidationCode(violations),
    valid: false,
    violations,
    instruction: buildRegenerationInstruction(decision, violations),
  };
}

export function sanitizeLanguage(reply: string) {
  return reply
    .replace(/[\u0900-\u097F]+/g, "")
    .replace(/[\u4E00-\u9FFF]+/g, "")
    .replace(/[\u3040-\u30FF]+/g, "")
    .replace(/[\u00C0-\u024F]+/g, "")
    .replace(/[A-Za-z]*[\u1E00-\u1EFF]+[A-Za-z]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRegenerationInstruction(decision: AgentDecision, violations: string[]) {
  const instructions = [
    "Rewrite the assistant reply in Arabic.",
    "The previous reply failed validation.",
    `Validation failures: ${violations.join(", ")}`,
    "Do not mention validation, policy, system, model, prompt, route, score, or internal analysis.",
    "Use the customer's latest message as the main driver of the reply.",
    "Do not use these phrases: من كلامك / بما أنك ذكرت / هذه المعلومة تساعدنا / بدل رد عام.",
    "Keep it natural, short, and useful.",
  ];

  if (decision.intent === "Direct Explanation Request") {
    instructions.push("The customer explicitly asked for no questions. Do not ask any question.");
    instructions.push("Explain what the company offers in 2 short sentences.");
  }

  if (decision.directAnswerIntent) {
    instructions.push(`The customer asked a direct factual question: ${decision.directAnswerIntent}. Answer it directly before any sales flow.`);
    instructions.push("Do not move the conversation backward or ask a discovery question in this reply.");
  }

  const repeatedQuestion = violations.find((violation) => violation.startsWith("repeated_question:"));
  if (repeatedQuestion) {
    instructions.push(`Do not repeat the question about ${repeatedQuestion.split(":")[1]}.`);
    instructions.push("Move forward based on the available conversation history.");
  }

  if (decision.nextAction === "ASK_TEAM_SIZE") {
    instructions.push("The customer already gave the daily message count. Do not ask for message count again.");
    instructions.push("Evaluate the number briefly, mention a simple benefit, then move to who handles replies.");
    instructions.push("A suitable direction: 'هذا عدد مناسب للبدء... هل ترد بنفسك حاليًا أم عندك فريق؟'");
  }

  if (decision.nextAction === "CONFIRM_PROBLEM") {
    instructions.push("Do not present prices, plans, buying CTA, or a demo.");
    instructions.push("If the customer already gave enough context, explain the value instead of asking the same discovery question.");
  }

  if (decision.nextAction === "EXPLAIN_VALUE") {
    instructions.push("Explain how the system helps, then give a low-pressure next step.");
  }

  if (decision.personalizationStrategy.mustMentionFacts.length) {
    instructions.push(`Use only naturally relevant facts from: ${decision.personalizationStrategy.mustMentionFacts.join(" | ")}`);
  }

  return instructions.join("\n");
}

function chooseValidationCode(violations: string[]): ReplyValidationCode {
  if (violations.includes("question_blocked_by_customer_instruction")) return "BLOCK_QUESTION";
  if (violations.some((violation) => violation.startsWith("repeated_question:"))) return "REMOVE_REPEATED_QUESTION";
  return "REGENERATE";
}

function detectRepeatedQuestion(text: string, decision: AgentDecision) {
  const questionField = detectQuestionField(text);
  if (!questionField) return undefined;
  if (decision.antiRepetition.lastAskedField === questionField) return questionField;
  if (questionField !== "problem_confirmation" && decision.antiRepetition.blockedFields.includes(questionField)) {
    return questionField;
  }
  return undefined;
}

function detectQuestionField(text: string) {
  const questionText = getQuestionText(text);
  const normalized = normalize(questionText);
  if (containsQuestion(text) && (normalized.includes("كم رساله") || normalized.includes("رساله تستقبلون") || normalized.includes("رسالة تستقبلون") || normalized.includes("يوميا") || normalized.includes("يوميًا"))) {
    return "messages_per_day";
  }
  if (
    containsQuestion(text) &&
    (
      normalized.includes("كم شخص") ||
      normalized.includes("يرد على رسائل") ||
      normalized.includes("فريق الرد") ||
      normalized.includes("ترد بنفسك") ||
      normalized.includes("تعمل بمفردك") ||
      normalized.includes("عندك فريق") ||
      normalized.includes("صاحب عمل صغير") ||
      normalized.includes("تعمل لوحدك") ||
      normalized.includes("تعمل وحدك")
    )
  ) {
    return "team_size";
  }
  if (containsQuestion(text) && (normalized.includes("هل تواجهون") || normalized.includes("ضغط") || normalized.includes("تاخير") || normalized.includes("تأخير"))) {
    return "problem_confirmation";
  }
  return undefined;
}

function getQuestionText(text: string) {
  const questions = text.match(/[^.؟?\n]+[؟?]/gu);
  return questions?.at(-1) ?? text;
}

function regressesConversation(decision: AgentDecision, text: string) {
  const normalized = normalize(text);
  if (decision.messagesPerDay && (normalized.includes("كم رساله") || normalized.includes("رساله تستقبلون") || normalized.includes("رسالة تستقبلون"))) return true;
  if (
    decision.teamSize &&
    (
      normalized.includes("كم شخص") ||
      normalized.includes("فريق الرد") ||
      normalized.includes("ترد بنفسك") ||
      normalized.includes("تعمل بمفردك") ||
      normalized.includes("عندك فريق") ||
      normalized.includes("صاحب عمل صغير") ||
      normalized.includes("تعمل لوحدك") ||
      normalized.includes("تعمل وحدك")
    )
  ) {
    return true;
  }
  return false;
}

function shouldRequireValue(decision: AgentDecision) {
  if (decision.directAnswerIntent) return false;
  if (["Unclear Reply", "Location Question", "Hours Question", "Answer Reason Question"].includes(decision.intent)) return false;
  return Boolean(decision.customerContext.facts.length || decision.route === "QUALIFY" || decision.nextAction === "EXPLAIN_VALUE");
}

function containsValue(text: string) {
  const normalized = normalize(text);
  return [
    "تنظيم",
    "ينظم",
    "يرتب",
    "تسريع",
    "يسرع",
    "يسرّع",
    "تقليل",
    "تخفيف",
    "يوفر",
    "ضغط",
    "تاخير",
    "تأخير",
    "متابعه",
    "متابعة",
    "فرص",
    "صفقات",
    "وقت",
    "وضوح",
    "موقعنا",
    "ساعات",
    "الأسئلة المتكررة",
    "الاسئلة المتكررة",
    "العملاء الجاهزين",
  ].some((term) => normalized.includes(normalize(term)));
}

function hasCustomerFacts(strategy: PersonalizationStrategy) {
  return strategy.mustMentionFacts.length > 0 || strategy.customerContext.facts.some((fact) => fact.key !== "conversation_phase");
}

function hasGenericPattern(text: string) {
  const normalized = normalize(text);
  return genericPatterns.some((pattern) => normalized.includes(normalize(pattern)));
}

function isOfferBlocked(strategy: PersonalizationStrategy) {
  return strategy.allowOffer === false || strategy.allowPrice === false || strategy.allowDemo === false;
}

function containsBlockedOfferLanguage(text: string) {
  return blockedOfferPatterns.some((pattern) => pattern.test(text));
}

function containsQuestion(text: string) {
  return /[؟?]/u.test(text);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}
