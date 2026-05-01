export type ObjectionType =
  | "PRICE"
  | "TIMING"
  | "COMPETITOR"
  | "TRUST"
  | "AUTHORITY"
  | "NOT_INTERESTED"
  | "CONFUSION"
  | "NONE";

export type ObjectionSeverity = "LOW" | "MEDIUM" | "HIGH";

export type ObjectionAnalysis = {
  type: ObjectionType;
  severity: ObjectionSeverity;
  confidence: number;
  summary: string;
  responseStrategy: string;
  valueAngle: string;
  nextQuestion?: string;
  shouldAvoidDiscounting: boolean;
  shouldEscalate: boolean;
};

const objectionRules: Array<{
  type: Exclude<ObjectionType, "NONE">;
  severity: ObjectionSeverity;
  keywords: string[];
  summary: string;
  responseStrategy: string;
  valueAngle: string;
  nextQuestion?: string;
  shouldEscalate?: boolean;
}> = [
  {
    type: "PRICE",
    severity: "MEDIUM",
    keywords: ["غالي", "مرتفع", "مكلف", "السعر كثير", "expensive", "too much", "costly"],
    summary: "Customer is concerned about price or perceived value.",
    responseStrategy: "Acknowledge the concern, reframe around outcome and risk reduction, then ask about expected value.",
    valueAngle: "Show the cost of manual support, slow response, and lost leads compared with automation.",
    nextQuestion: "ما النتيجة الأهم التي تريد أن يحققها النظام حتى يكون السعر منطقيًا لك؟",
  },
  {
    type: "TIMING",
    severity: "MEDIUM",
    keywords: ["بفكر", "افكر", "لاحقا", "بعدها", "ليس الآن", "مو الآن", "think", "later", "not now"],
    summary: "Customer is delaying the decision or needs more certainty.",
    responseStrategy: "Respect the delay, reduce the decision size, and suggest a small next step.",
    valueAngle: "Make the next step feel low-risk and useful even before buying.",
    nextQuestion: "ما الشيء الذي تحتاج تتأكد منه قبل أن تقرر؟",
  },
  {
    type: "COMPETITOR",
    severity: "HIGH",
    keywords: ["منافس", "شركة ثانية", "مزود آخر", "نقارن", "competitor", "another provider", "compare"],
    summary: "Customer is comparing alternatives.",
    responseStrategy: "Avoid attacking competitors, clarify the decision criteria, and position around fit.",
    valueAngle: "Focus on implementation quality, support flow, and measurable customer-service outcomes.",
    nextQuestion: "ما أهم معيار تقارن عليه بين الحلول؟",
  },
  {
    type: "TRUST",
    severity: "MEDIUM",
    keywords: ["أضمن", "ضمان", "يثبت", "تجارب", "نتائج", "ثقة", "trust", "proof", "guarantee"],
    summary: "Customer needs proof before moving forward.",
    responseStrategy: "Give concrete proof points where available and offer a focused demo or pilot.",
    valueAngle: "Reduce uncertainty with a clear evaluation path instead of broad promises.",
    nextQuestion: "ما الدليل الذي يجعلك مطمئنًا أكثر: تجربة قصيرة أم أمثلة نتائج؟",
  },
  {
    type: "AUTHORITY",
    severity: "LOW",
    keywords: ["المدير", "الإدارة", "الشريك", "أرجع لهم", "manager", "team decides", "boss"],
    summary: "Customer is not the only decision maker.",
    responseStrategy: "Help the customer prepare a simple internal case and identify the decision process.",
    valueAngle: "Make it easy to explain the business benefit internally.",
    nextQuestion: "من الشخص الذي يحتاج يوافق على القرار؟",
  },
  {
    type: "NOT_INTERESTED",
    severity: "HIGH",
    keywords: ["غير مهتم", "لا أريد", "لا نحتاج", "مو مهتم", "not interested", "no need"],
    summary: "Customer is rejecting the offer for now.",
    responseStrategy: "Respect the rejection, avoid pressure, and leave a clean re-open path.",
    valueAngle: "Protect the relationship instead of forcing a sale.",
    shouldEscalate: false,
  },
  {
    type: "CONFUSION",
    severity: "LOW",
    keywords: ["ما فهمت", "غير واضح", "اشرح", "وضح", "confused", "not clear"],
    summary: "Customer needs a simpler explanation.",
    responseStrategy: "Simplify the explanation and ask one narrow clarification question.",
    valueAngle: "Make the solution easy to understand before moving to price or booking.",
    nextQuestion: "أي جزء تريدني أوضحه أكثر: طريقة العمل أم النتيجة المتوقعة؟",
  },
];

export function analyzeObjection(message: string): ObjectionAnalysis {
  const normalized = normalize(message);
  const compound = detectCompoundObjection(normalized);

  if (compound) return compound;

  const matched = objectionRules
    .map((rule) => ({
      rule,
      hits: rule.keywords.filter((keyword) => normalized.includes(normalize(keyword))).length,
    }))
    .filter((item) => item.hits > 0)
    .sort((left, right) => right.hits - left.hits)[0];

  if (!matched) {
    return {
      type: "NONE",
      severity: "LOW",
      confidence: 0,
      summary: "No clear objection detected.",
      responseStrategy: "Continue the planned conversation path.",
      valueAngle: "Use the current customer need and next step.",
      shouldAvoidDiscounting: true,
      shouldEscalate: false,
    };
  }

  return {
    type: matched.rule.type,
    severity: matched.rule.severity,
    confidence: Math.min(0.95, 0.55 + matched.hits * 0.2),
    summary: matched.rule.summary,
    responseStrategy: matched.rule.responseStrategy,
    valueAngle: matched.rule.valueAngle,
    nextQuestion: matched.rule.nextQuestion,
    shouldAvoidDiscounting: matched.rule.type === "PRICE",
    shouldEscalate: Boolean(matched.rule.shouldEscalate),
  };
}

function detectCompoundObjection(message: string): ObjectionAnalysis | undefined {
  const mentionsPrice = containsAny(message, ["السعر", "غالي", "عالي", "مرتفع", "مكلف", "price", "expensive"]);
  const mentionsCompetitor = containsAny(message, ["شركات", "شركة ثانية", "منافس", "ارخص", "أرخص", "cheaper", "competitor", "another provider"]);

  if (mentionsPrice && mentionsCompetitor) {
    return {
      type: "COMPETITOR",
      severity: "HIGH",
      confidence: 0.92,
      summary: "Customer believes competitors are cheaper and is comparing on price.",
      responseStrategy: "Acknowledge that cheaper options exist, then shift the comparison from price alone to response speed, workload, reliability, and measurable outcome.",
      valueAngle: "الخيار الأرخص قد يبدو مناسبًا، لكن المقارنة الصحيحة تكون على سرعة الرد، تقليل الضغط، وعدم ضياع العملاء.",
      nextQuestion: "هل تريد أن نقارن بناءً على السعر فقط أم على سرعة الرد وتقليل الضغط على الفريق؟",
      shouldAvoidDiscounting: true,
      shouldEscalate: false,
    };
  }

  return undefined;
}

function containsAny(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(normalize(keyword)));
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
