import type { ConversationPhase } from "@/domain/agent/conversation-state";
import type { ObjectionType } from "@/domain/agent/objection-engine";
import type { AgentStageMemory } from "@/domain/agent/stage-memory";

export type CustomerFactKey =
  | "messages_per_day"
  | "team_size"
  | "pain_point"
  | "objection"
  | "conversation_phase";

export type CustomerFact = {
  key: CustomerFactKey;
  label: string;
  value: string;
  text: string;
  requiredTerms: string[];
};

export type CustomerContext = {
  facts: CustomerFact[];
  messagesPerDay?: number;
  teamSize?: number;
  painPoints: string[];
  previousAnswers: string[];
  mainPain?: string;
  stage?: ConversationPhase;
};

export type PersonalizationStrategy = {
  customerContext: CustomerContext;
  requirePersonalization: boolean;
  mustMentionFacts: string[];
  mustMentionTerms: string[][];
  responseGoal: "answer_directly" | "qualify" | "reframe_value" | "offer_demo" | "handoff" | "follow_up";
  nextAction: "ask_one_question" | "demo_offer" | "present_offer" | "handoff" | "wait_for_reply";
  allowOffer?: boolean;
  allowPrice?: boolean;
  allowDemo?: boolean;
  gatedNextAction?:
    | "ASK_MESSAGES_PER_DAY"
    | "ASK_TEAM_SIZE"
    | "CONFIRM_PROBLEM"
    | "EXPLAIN_VALUE"
    | "PRESENT_VALUE_OR_OFFER"
    | "CONTINUE_REGULAR_FLOW";
  valueBridge?: string;
  personalizationLead?: string;
  antiGenericRule: string;
};

type ConversationMemory = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

type BuildCustomerContextInput = {
  currentMessage: string;
  history: ConversationMemory[];
  objectionType: ObjectionType;
  phase: ConversationPhase;
};

const painPointRules = [
  { label: "ضغط على الفريق", keywords: ["ضغط", "مرهق", "زحمة", "عبء", "pressure", "overload"] },
  { label: "تأخير في الرد", keywords: ["تأخير", "نتأخر", "بطء", "متأخر", "delay", "slow"] },
  { label: "ضياع فرص", keywords: ["ضياع", "نفقد", "فرص", "عملاء يروحون", "lost leads", "missed"] },
  { label: "ردود كثيرة", keywords: ["رسائل كثيرة", "محادثات كثيرة", "طلبات كثيرة", "many messages"] },
];

export function buildCustomerContext(input: BuildCustomerContextInput): CustomerContext {
  const customerMessages = [
    ...input.history.filter((message) => message.sender === "CUSTOMER").map((message) => message.body),
    input.currentMessage,
  ];
  const joined = customerMessages.join("\n");
  const lastAiMessage = [...input.history].reverse().find((message) => message.sender === "AI")?.body;
  const messagesPerDay = extractMessagesPerDay(joined) ?? extractMessageCountFromShortAnswer(input.currentMessage, lastAiMessage);
  const teamSize = extractTeamSize(joined) ?? extractTeamSizeFromShortAnswer(input.currentMessage, lastAiMessage);
  const painPoints = extractPainPoints(joined);
  const facts: CustomerFact[] = [];

  if (messagesPerDay) {
    facts.push({
      key: "messages_per_day",
      label: "عدد الرسائل اليومية",
      value: String(messagesPerDay),
      text: `${messagesPerDay} رسالة يوميًا`,
      requiredTerms: [String(messagesPerDay), "رسالة"],
    });
  }

  if (teamSize) {
    const text = teamSize === 1 ? "شخص واحد يرد" : teamSize === 2 ? "شخصين يردون" : `${teamSize} أشخاص يردون`;
    facts.push({
      key: "team_size",
      label: "حجم فريق الرد",
      value: String(teamSize),
      text,
      requiredTerms: teamSize === 1 ? ["شخص", "واحد"] : [String(teamSize), "يرد"],
    });
  }

  painPoints.forEach((painPoint) => {
    facts.push({
      key: "pain_point",
      label: "نقطة ألم",
      value: painPoint,
      text: painPoint,
      requiredTerms: painPoint.split(/\s+/).slice(0, 2),
    });
  });

  if (input.objectionType !== "NONE") {
    const objection = buildObjectionFact(input.currentMessage, input.objectionType);

    facts.push({
      key: "objection",
      label: "اعتراض العميل",
      value: input.objectionType,
      text: objection.text,
      requiredTerms: objection.requiredTerms,
    });
  }

  facts.push({
    key: "conversation_phase",
    label: "مرحلة المحادثة",
    value: input.phase,
    text: phaseText(input.phase),
    requiredTerms: [],
  });

  return {
    facts,
    messagesPerDay,
    teamSize,
    painPoints,
    previousAnswers: customerMessages.slice(-6),
    mainPain: chooseMainPain({ messagesPerDay, teamSize, painPoints }),
    stage: input.phase,
  };
}

export function mergeCustomerContextMemory(context: CustomerContext, memory: AgentStageMemory): CustomerContext {
  const messagesPerDay = context.messagesPerDay ?? memory.messagesPerDay;
  const teamSize = context.teamSize ?? memory.teamSize;
  const facts = [...context.facts];

  if (messagesPerDay && !facts.some((fact) => fact.key === "messages_per_day")) {
    facts.push({
      key: "messages_per_day",
      label: "عدد الرسائل اليومية",
      value: String(messagesPerDay),
      text: `${messagesPerDay} رسالة يوميًا`,
      requiredTerms: [String(messagesPerDay), "رسالة"],
    });
  }

  if (teamSize && !facts.some((fact) => fact.key === "team_size")) {
    const text = teamSize === 1 ? "شخص واحد يرد" : teamSize === 2 ? "شخصين يردون" : `${teamSize} أشخاص يردون`;
    facts.push({
      key: "team_size",
      label: "حجم فريق الرد",
      value: String(teamSize),
      text,
      requiredTerms: teamSize === 1 ? ["شخص", "واحد"] : [String(teamSize), "يرد"],
    });
  }

  return {
    ...context,
    facts,
    messagesPerDay,
    teamSize,
    mainPain: chooseMainPain({ messagesPerDay, teamSize, painPoints: context.painPoints }) ?? context.mainPain,
  };
}

export function buildPersonalizationStrategy(input: {
  customerContext: CustomerContext;
  route: string;
  objectionType: ObjectionType;
  hasRecommendedOffer: boolean;
  offerGuard?: {
    allowOffer: boolean;
    allowPrice: boolean;
    allowDemo: boolean;
    nextAction: PersonalizationStrategy["gatedNextAction"];
  };
}): PersonalizationStrategy {
  const factPriority: Record<CustomerFactKey, number> = {
    messages_per_day: 1,
    team_size: 2,
    objection: 3,
    pain_point: 4,
    conversation_phase: 99,
  };
  const mustUseFacts = input.customerContext.facts
    .filter((fact) => ["messages_per_day", "team_size", "pain_point", "objection"].includes(fact.key))
    .sort((left, right) => factPriority[left.key] - factPriority[right.key]);
  const requirePersonalization = mustUseFacts.length > 0;
  const responseGoal = chooseResponseGoal(input.route, input.objectionType, input.hasRecommendedOffer);

  return {
    customerContext: input.customerContext,
    requirePersonalization,
    mustMentionFacts: mustUseFacts.slice(0, 3).map((fact) => fact.text),
    mustMentionTerms: mustUseFacts.slice(0, 3).map((fact) => fact.requiredTerms).filter((terms) => terms.length > 0),
    responseGoal,
    nextAction: chooseNextAction(input.route, responseGoal),
    allowOffer: input.offerGuard?.allowOffer,
    allowPrice: input.offerGuard?.allowPrice,
    allowDemo: input.offerGuard?.allowDemo,
    gatedNextAction: input.offerGuard?.nextAction,
    valueBridge: buildValueBridge(input.customerContext, responseGoal),
    personalizationLead: buildPersonalizationLead(input.customerContext),
    antiGenericRule: requirePersonalization
      ? "A reply is invalid unless it uses at least one concrete customer fact and connects it to pain, value, or next step."
      : "Keep the reply specific to the current decision and avoid generic filler.",
  };
}

function extractMessagesPerDay(text: string) {
  const normalized = normalize(text);
  const patterns = [
    /(\d{1,5})\s*(?:رساله|رسالة|رسايل|محادثه|محادثة|محادثات)\s*(?:يومي|يوميا|في اليوم|باليوم)/u,
    /(?:نستقبل|عندنا|لدينا|يجينا|تجينا)(?:\s+\S+){0,2}\s+(\d{1,5})\s*(?:رساله|رسالة|رسايل|محادثه|محادثة|محادثات)/u,
    /(\d{1,5})\s*(?:رساله|رسالة|رسائل|رسايل|محادثه|محادثة|محادثات)/u,
    /(\d{1,5})\s*(?:messages|chats)\s*(?:per day|daily)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  return undefined;
}

function extractMessageCountFromShortAnswer(currentMessage: string, lastAiMessage?: string) {
  if (!lastAiMessage || !askedForMessageVolume(lastAiMessage)) return undefined;

  const normalized = normalize(currentMessage);
  const match = normalized.match(/(?:حوالي|تقريبا|تقريبًا|قرابة|نحو)?\s*(\d{1,5})\s*(?:رساله|رسالة|رسائل|محادثه|محادثة|يوميا|يوميًا)?/u);
  if (!match?.[1]) return undefined;

  return Number(match[1]);
}

function askedForMessageVolume(message: string) {
  const normalized = normalize(message);

  return (
    (normalized.includes("كم") && (normalized.includes("رساله") || normalized.includes("رسالة") || normalized.includes("رسائل"))) ||
    normalized.includes("رساله تستقبلون") ||
    normalized.includes("رسالة تستقبلون") ||
    normalized.includes("عدد الرسائل")
  );
}

function extractTeamSize(text: string) {
  const normalized = normalize(text);

  const singleResponderTerms = [
    "أنا أرد عليهم بنفسي",
    "انا ارد عليهم بنفسي",
    "أرد عليهم بنفسي",
    "ارد عليهم بنفسي",
    "أنا أرد بنفسي",
    "انا ارد بنفسي",
    "أرد بنفسي",
    "ارد بنفسي",
    "أنا لوحدي أرد",
    "انا لوحدي ارد",
    "أنا وحدي أرد",
    "انا وحدي ارد",
  ];

  if (singleResponderTerms.some((term) => normalized.includes(normalize(term)))) return 1;

  if (/(?:شخص|موظف|واحد|1)\s*(?:واحد)?\s*(?:يرد|يردون|للرد|مسؤول عن الرد)/u.test(normalized)) return 1;

  const wordNumber = [
    { value: 2, terms: ["شخصين", "اثنين", "إثنين", "موظفين"] },
    { value: 3, terms: ["ثلاثة", "ثلاث", "3"] },
    { value: 4, terms: ["اربعة", "أربعة", "4"] },
    { value: 5, terms: ["خمسة", "خمس", "5"] },
  ].find((item) => item.terms.some((term) => normalized.includes(normalize(term))));

  if (wordNumber && /(?:يرد|يردون|للرد|مسؤول|فريق)/u.test(normalized)) return wordNumber.value;

  const match = normalized.match(/(\d{1,3})\s*(?:اشخاص|أشخاص|موظفين|موظف|people|agents)\s*(?:يرد|يردون|للرد|support)?/iu);
  if (match?.[1]) return Number(match[1]);

  return undefined;
}

function extractTeamSizeFromShortAnswer(currentMessage: string, lastAiMessage?: string) {
  if (!lastAiMessage || !askedForTeamSize(lastAiMessage)) return undefined;

  const normalized = normalize(currentMessage);
  const compact = normalized.replace(/\s+/g, "");

  if (
    [
      "بنفسي",
      "انا",
      "اني",
      "لوحدي",
      "وحدي",
      "لحالي",
      "شخص واحد",
      "واحد",
      "1",
    ].some((term) => normalized === normalize(term) || compact === normalize(term).replace(/\s+/g, ""))
  ) {
    return 1;
  }

  if (["شخصين", "اثنين", "2"].some((term) => normalized === normalize(term))) return 2;

  const numericTeam = normalized.match(/^(\d{1,2})\s*(?:اشخاص|أشخاص|موظفين|موظف|اشخاص يردون|يردون)?$/u);
  if (numericTeam?.[1]) return Number(numericTeam[1]);

  return undefined;
}

function askedForTeamSize(message: string) {
  const normalized = normalize(message);

  return (
    (normalized.includes("كم") && (normalized.includes("شخص") || normalized.includes("موظف") || normalized.includes("فريق"))) ||
    normalized.includes("من يرد") ||
    normalized.includes("مين يرد") ||
    normalized.includes("ترد بنفسك") ||
    normalized.includes("ترد على العملاء بنفسك") ||
    normalized.includes("عندك فريق") ||
    normalized.includes("لديك فريق") ||
    normalized.includes("فريق يرد") ||
    normalized.includes("حجم الفريق")
  );
}

function extractPainPoints(text: string) {
  const normalized = normalize(text);
  const detected = painPointRules
    .filter((rule) => rule.keywords.some((keyword) => normalized.includes(normalize(keyword))))
    .map((rule) => rule.label);

  return [...new Set(detected)].slice(0, 3);
}

function chooseMainPain(input: { messagesPerDay?: number; teamSize?: number; painPoints: string[] }) {
  if (input.messagesPerDay && input.teamSize === 1) {
    return "ضغط وتأخير لأن شخصًا واحدًا يتعامل مع حجم رسائل يومي كبير";
  }

  return input.painPoints[0];
}

function buildPersonalizationLead(context: CustomerContext) {
  const importantFacts = context.facts.filter((fact) => ["messages_per_day", "team_size"].includes(fact.key));

  if (importantFacts.length >= 2) {
    return `مع ${importantFacts.map((fact) => fact.text).join(" و")}`;
  }

  if (importantFacts.length === 1) {
    return `مع ${importantFacts[0].text}`;
  }

  if (context.mainPain) return `بما أن المشكلة الأساسية هي ${context.mainPain}`;

  return undefined;
}

function buildValueBridge(context: CustomerContext, responseGoal: PersonalizationStrategy["responseGoal"]) {
  if (!context.facts.length) return undefined;

  if (responseGoal === "reframe_value") {
    return context.mainPain
      ? `الأهم هنا أن يقل ${context.mainPain} بدل النظر للسعر وحده.`
      : "الأفضل مقارنة السعر بالوقت والجهد الذي سيوفره النظام.";
  }

  if (responseGoal === "offer_demo") {
    return "التجربة القصيرة توضح كيف ينخفض الضغط ويتحسن الرد على وضعكم الفعلي.";
  }

  return context.mainPain
    ? `هذا يساعدنا نخفف ${context.mainPain} بخطوة مناسبة.`
    : "هذا يعطينا صورة أوضح للخطوة التالية.";
}

function chooseResponseGoal(route: string, objectionType: ObjectionType, hasRecommendedOffer: boolean): PersonalizationStrategy["responseGoal"] {
  if (objectionType === "PRICE") return "reframe_value";
  if (route === "BOOKING") return "offer_demo";
  if (route === "PRESENT_OFFER" || hasRecommendedOffer) return "reframe_value";
  if (route === "QUALIFY") return "qualify";
  if (route === "HUMAN_HANDOFF") return "handoff";
  if (route === "FOLLOW_UP") return "follow_up";
  return "answer_directly";
}

function chooseNextAction(route: string, responseGoal: PersonalizationStrategy["responseGoal"]): PersonalizationStrategy["nextAction"] {
  if (route === "HUMAN_HANDOFF") return "handoff";
  if (route === "BOOKING" || responseGoal === "offer_demo") return "demo_offer";
  if (route === "PRESENT_OFFER") return "present_offer";
  if (route === "QUALIFY") return "ask_one_question";
  return "wait_for_reply";
}

function objectionText(type: ObjectionType) {
  if (type === "PRICE") return "اعتراض على السعر";
  if (type === "COMPETITOR") return "مقارنة مع منافس";
  if (type === "TIMING") return "تردد في التوقيت";
  if (type === "TRUST") return "احتياج لإثبات الثقة";
  if (type === "AUTHORITY") return "قرار يحتاج موافقة شخص آخر";
  if (type === "NOT_INTERESTED") return "عدم اهتمام حالي";
  if (type === "CONFUSION") return "عدم وضوح";
  return "لا يوجد اعتراض واضح";
}

function buildObjectionFact(message: string, type: ObjectionType) {
  const normalized = normalize(message);

  if (type === "COMPETITOR" && (normalized.includes("ارخص") || normalized.includes("أرخص") || normalized.includes("cheaper"))) {
    return {
      text: "شركات ثانية أرخص",
      requiredTerms: ["شركات", "أرخص"],
    };
  }

  if (type === "PRICE") {
    return {
      text: "السعر عالي",
      requiredTerms: ["السعر", "عالي"],
    };
  }

  return {
    text: objectionText(type),
    requiredTerms: objectionText(type).split(/\s+/).slice(0, 2),
  };
}

function phaseText(phase: ConversationPhase) {
  if (phase === "OBJECTION_HANDLING") return "معالجة اعتراض";
  if (phase === "QUALIFICATION") return "تأهيل العميل";
  if (phase === "OFFER") return "عرض مناسب";
  if (phase === "CLOSING") return "إغلاق أو حجز";
  if (phase === "FOLLOW_UP") return "متابعة";
  if (phase === "HANDOFF") return "تصعيد لبشري";
  return "فهم الاحتياج";
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
