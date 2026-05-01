import type { AgentDecision } from "@/domain/agent";

const closingCtaPatterns = [
  /متى\s+تتوقع\s+البدء/iu,
  /متى\s+تبدأ/iu,
  /نرتب\s+Demo/iu,
  /أقدر\s+أرتب\s+لك\s+Demo/iu,
  /هل\s+نبدأ/iu,
  /Demo\s+قصير/iu,
];

export function isDiscoveryLocked(
  decision: Pick<AgentDecision, "intent" | "conversationState" | "missingFields" | "focusField" | "nextAction">,
) {
  if (["Unclear Reply", "Answer Reason Question", "Direct Explanation Request", "Identity Question", "Capabilities Question", "Hours Question", "Location Question"].includes(decision.intent)) {
    return false;
  }

  return (
    ["OPENING", "DISCOVERY", "QUALIFICATION"].includes(decision.conversationState.phase) &&
    (decision.nextAction === "ASK_MESSAGES_PER_DAY" ||
      decision.nextAction === "ASK_TEAM_SIZE" ||
      decision.focusField === "messages_per_day" ||
      decision.focusField === "team_size" ||
      decision.missingFields.includes("messages_per_day") ||
      decision.missingFields.includes("team_size"))
  );
}

export function discoveryQuestionForField(field?: string) {
  if (field === "team_size") return "كم شخص يرد على رسائل العملاء حاليًا؟";
  return "تقريبًا كم رسالة تستقبلون يوميًا؟";
}

function discoveryQuestionForDecision(decision: AgentDecision) {
  if (decision.nextAction === "ASK_TEAM_SIZE") return discoveryQuestionForField("team_size");
  if (decision.nextAction === "ASK_MESSAGES_PER_DAY") return discoveryQuestionForField("messages_per_day");
  return discoveryQuestionForField(decision.focusField);
}

export function enforceDiscoveryReplyPolicy(text: string, decision: AgentDecision) {
  if (!isDiscoveryLocked(decision)) return text;

  const question = discoveryQuestionForDecision(decision);
  const questionField = question.includes("شخص") ? "team_size" : "messages_per_day";
  const cleaned = stripClosingCtas(text);
  const repeatedSameQuestion =
    decision.antiRepetition.lastAskedField === questionField ||
    decision.antiRepetition.blockedFields.includes(questionField);

  if (repeatedSameQuestion) {
    const withoutRepeatedQuestion = stripQuestion(cleaned, question);

    return withoutRepeatedQuestion || "تمام، أرسل لي المعلومة بشكل تقريبي حتى أحدد الخطوة المناسبة.";
  }

  const withoutExtraQuestions = keepOnlyDiscoveryQuestion(cleaned, question);
  const hasSimpleValue = /تنظيم|تسريع|تصعيد|ضغط|تأخير|رسائل العملاء|المحادثات/u.test(withoutExtraQuestions);
  const valueLine = hasSimpleValue
    ? withoutExtraQuestions
    : `نظامنا يساعدكم في تنظيم رسائل العملاء وتسريع الردود وتصعيد الحالات المهمة بدل ما تتكدس على الفريق. ${withoutExtraQuestions}`;

  return ensureEndsWithQuestion(valueLine, question);
}

export function containsClosingCta(text: string) {
  return closingCtaPatterns.some((pattern) => pattern.test(text));
}

function stripClosingCtas(text: string) {
  return splitSentences(text)
    .filter((sentence) => !containsClosingCta(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function keepOnlyDiscoveryQuestion(text: string, question: string) {
  const sentences = splitSentences(text).filter((sentence) => !/[؟?]/u.test(sentence));
  return [...sentences, question].join(" ").replace(/\s+/g, " ").trim();
}

function stripQuestion(text: string, question: string) {
  const normalizedQuestion = normalize(question);

  return splitSentences(text)
    .filter((sentence) => normalize(sentence) !== normalizedQuestion && !normalize(sentence).includes(normalizedQuestion))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureEndsWithQuestion(text: string, question: string) {
  const normalizedText = normalize(text);
  const normalizedQuestion = normalize(question);

  if (normalizedText.endsWith(normalizedQuestion)) return text;

  return `${text.replace(/[؟?]\s*$/u, "").trim()} ${question}`.replace(/\s+/g, " ").trim();
}

function splitSentences(text: string) {
  return (text.match(/[^.!؟?\n]+[.!؟?]?/gu) ?? [text])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
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
