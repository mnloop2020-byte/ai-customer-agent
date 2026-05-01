import type { AskedField } from "@/domain/agent";

export type AntiRepetitionMemory = {
  lastAskedField?: AskedField;
  askedFields: AskedField[];
  repeatedQuestionRisk: "LOW" | "MEDIUM" | "HIGH";
  blockedFields: AskedField[];
  responseRule: string;
};

type ConversationMemory = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

const questionSignals: Array<{ field: AskedField; keywords: string[] }> = [
  { field: "customer_type", keywords: ["لنفسك", "لشركتك", "فرد", "شركة", "individual", "business"] },
  { field: "service", keywords: ["الخدمة", "التحدي", "تبحث عنها", "need", "service"] },
  { field: "messages_per_day", keywords: ["كم رسالة", "رسالة تستقبلون", "يوميًا", "يوميا", "messages per day"] },
  { field: "team_size", keywords: ["كم شخص", "يرد على رسائل", "فريق الرد", "team size"] },
  { field: "timeline", keywords: ["متى", "البدء", "timeline", "start"] },
  { field: "budget", keywords: ["ميزانية", "budget"] },
  { field: "decision_maker", keywords: ["صاحب القرار", "decision maker"] },
  { field: "preferred_contact", keywords: ["وسيلة التواصل", "واتساب", "ايميل", "email", "whatsapp"] },
];

export function buildAntiRepetitionMemory(history: ConversationMemory[], plannedField?: AskedField): AntiRepetitionMemory {
  const askedFields = extractAskedFields(history);
  const lastAskedField = [...history]
    .reverse()
    .filter((message) => message.sender === "AI")
    .map((message) => detectQuestionField(message.body))
    .find(Boolean);
  const blockedFields = plannedField && askedFields.includes(plannedField) ? [plannedField] : [];
  const repeatedQuestionRisk = blockedFields.length
    ? "HIGH"
    : lastAskedField && plannedField === lastAskedField
      ? "MEDIUM"
      : "LOW";

  return {
    lastAskedField,
    askedFields,
    repeatedQuestionRisk,
    blockedFields,
    responseRule: buildResponseRule(repeatedQuestionRisk),
  };
}

export function pickNextUnaskedField(fields: AskedField[], history: ConversationMemory[]) {
  const askedFields = extractAskedFields(history);
  return fields.find((field) => !askedFields.includes(field));
}

function extractAskedFields(history: ConversationMemory[]) {
  return [
    ...new Set(
      history
        .filter((message) => message.sender === "AI")
        .map((message) => detectQuestionField(message.body))
        .filter((field): field is AskedField => Boolean(field)),
    ),
  ];
}

function detectQuestionField(body: string): AskedField | undefined {
  const normalized = normalize(body);
  return questionSignals.find((signal) => signal.keywords.some((keyword) => normalized.includes(normalize(keyword))))?.field;
}

function buildResponseRule(risk: AntiRepetitionMemory["repeatedQuestionRisk"]) {
  if (risk === "HIGH") {
    return "Do not ask the same qualification question again. Acknowledge what is already known and move to a different missing field or a small next step.";
  }

  if (risk === "MEDIUM") {
    return "Avoid rephrasing the same question. If the answer is still missing, ask for a smaller concrete detail.";
  }

  return "No repetition risk detected; keep the reply concise and ask at most one question.";
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
