/**
 * routing.ts — Sales Engine Routing System
 *
 * يحدد بناءً على scoring + context:
 * - route (المسار)
 * - stage (المرحلة)
 * - nextAction (الخطوة التالية)
 * - ctaType (نوع الزر الذكي)
 * - needsHandoff (هل يحتاج تصعيد)
 */

import type { ConversationPhase } from "@/domain/agent/conversation-state";
import type { ScoringResult, LeadTemperature } from "@/lib/agent/scoring";

export type AgentRoute =
  | "DIRECT_ANSWER"
  | "QUALIFY"
  | "PRESENT_OFFER"
  | "BOOKING"
  | "FOLLOW_UP"
  | "HUMAN_HANDOFF"
  | "DISQUALIFY";

export type AgentNextAction =
  | "ANSWER_DIRECTLY"
  | "ASK_QUALIFYING_QUESTION"
  | "PRESENT_OFFER"
  | "PRESENT_PRICE"
  | "BOOKING"
  | "FOLLOW_UP"
  | "HUMAN_HANDOFF"
  | "DISQUALIFY"
  | "HANDLE_OBJECTION"
  | "BUILD_VALUE"
  | "CONFIRM_READINESS";

export type CtaType =
  | "start_now"
  | "show_packages"
  | "complete_order"
  | "learn_more"
  | "talk_to_agent"
  | "none";

export type RoutingResult = {
  route:        AgentRoute;
  stage:        ConversationPhase;
  nextAction:   AgentNextAction;
  ctaType:      CtaType;
  needsHandoff: boolean;
  reasoning:    string;
};

type RoutingInput = {
  intent:          string;
  scoring:         ScoringResult;
  currentMessage:  string;
  history:         Array<{ sender: string; body: string }>;
  missingFields:   string[];
  hasObjection:    boolean;
  objectionType:   string;
  handoffRequested: boolean;
};

/* ─── Handoff triggers ─── */
const HANDOFF_PATTERNS = [
  /تحدث\s+مع\s+مندوب/u,
  /أريد\s+مندوب/u,
  /اتصل\s+بي/u,
  /تواصل\s+معي/u,
  /بشري/u,
  /إنسان/u,
  /speak\s+to\s+(a\s+)?human/i,
  /talk\s+to\s+(a\s+)?agent/i,
];

const DISQUALIFY_PATTERNS = [
  /لست\s+مهتمًا/u,
  /مش\s+مهتم/u,
  /لا\s+يهمني/u,
  /not\s+interested/i,
  /غلط\s+رقم/u,
  /خطأ\s+رقم/u,
];

/* ─── Core routing logic ─── */
export function resolveRoute(input: RoutingInput): RoutingResult {
  const { intent, scoring, currentMessage, missingFields, hasObjection, objectionType, handoffRequested } = input;
  const { score, temperature } = scoring;

  // ── 1. Disqualify ──
  if (DISQUALIFY_PATTERNS.some(p => p.test(currentMessage))) {
    return {
      route: "DISQUALIFY", stage: "LOST",
      nextAction: "DISQUALIFY", ctaType: "none",
      needsHandoff: false,
      reasoning: "العميل أبدى عدم اهتمام صريح",
    };
  }

  // ── 2. Handoff ──
  const needsHandoff =
    handoffRequested ||
    HANDOFF_PATTERNS.some(p => p.test(currentMessage)) ||
    (score >= 85 && temperature === "Hot") || // hot جداً → حوّل لإغلاق بشري
    (hasObjection && objectionType === "PRICE" && score >= 55); // اعتراض سعر + مهتم

  if (needsHandoff) {
    return {
      route: "HUMAN_HANDOFF", stage: "HANDOFF",
      nextAction: "HUMAN_HANDOFF", ctaType: "talk_to_agent",
      needsHandoff: true,
      reasoning: "العميل يحتاج تدخل بشري للإغلاق",
    };
  }

  // ── 3. Booking / Ready ──
  const intentLower = intent.toLowerCase();
  if (
    score >= 70 ||
    intentLower.includes("booking") ||
    intentLower.includes("ready") ||
    intentLower.includes("purchase") ||
    /أريد\s+(البدء|الاشتراك|الطلب|الشراء)/u.test(currentMessage) ||
    /كيف\s+(أبدأ|أشترك|أسجل)/u.test(currentMessage)
  ) {
    return {
      route: "BOOKING", stage: "CLOSING",
      nextAction: "CONFIRM_READINESS", ctaType: "complete_order",
      needsHandoff: false,
      reasoning: "العميل أبدى جاهزية عالية أو score مرتفع",
    };
  }

  // ── 4. Objection handling ──
  if (hasObjection) {
    return {
      route: "QUALIFY", stage: "OBJECTION_HANDLING",
      nextAction: "HANDLE_OBJECTION", ctaType: "learn_more",
      needsHandoff: false,
      reasoning: `معالجة اعتراض: ${objectionType}`,
    };
  }

  // ── 5. Price / Offer inquiry ──
  if (
    intentLower.includes("price") ||
    intentLower.includes("ask_price") ||
    intentLower.includes("ask_quote") ||
    intentLower.includes("packages") ||
    /كم\s+(السعر|التكلفة|الثمن|يكلف)/u.test(currentMessage)
  ) {
    const stage: ConversationPhase = score >= 50 ? "OFFER" : "VALUE_BUILDING";
    return {
      route: "PRESENT_OFFER", stage,
      nextAction: "PRESENT_PRICE", ctaType: "show_packages",
      needsHandoff: false,
      reasoning: "العميل سأل عن السعر أو الباقات",
    };
  }

  // ── 6. Warm — Build value + offer ──
  if (temperature === "Warm" && missingFields.length === 0) {
    return {
      route: "PRESENT_OFFER", stage: "VALUE_BUILDING",
      nextAction: "BUILD_VALUE", ctaType: "start_now",
      needsHandoff: false,
      reasoning: "عميل دافئ — وقت بناء القيمة والعرض",
    };
  }

  // ── 7. Qualify — missing data ──
  if (missingFields.length > 0 && score < 60) {
    return {
      route: "QUALIFY", stage: "QUALIFICATION",
      nextAction: "ASK_QUALIFYING_QUESTION", ctaType: "none",
      needsHandoff: false,
      reasoning: `يحتاج تأهيل: ${missingFields.slice(0, 2).join(", ")}`,
    };
  }

  // ── 8. Direct answer — information questions ──
  if (
    intentLower.includes("greeting") ||
    intentLower.includes("identity") ||
    intentLower.includes("hours") ||
    intentLower.includes("location") ||
    intentLower.includes("general")
  ) {
    return {
      route: "DIRECT_ANSWER", stage: "DISCOVERY",
      nextAction: "ANSWER_DIRECTLY", ctaType: resolveDiscoveryCta(temperature),
      needsHandoff: false,
      reasoning: "سؤال مباشر يحتاج إجابة",
    };
  }

  // ── 9. Default — Discovery ──
  return {
    route: "QUALIFY", stage: "DISCOVERY",
    nextAction: "ASK_QUALIFYING_QUESTION", ctaType: "learn_more",
    needsHandoff: false,
    reasoning: "مرحلة استكشاف",
  };
}

function resolveDiscoveryCta(temperature: LeadTemperature): CtaType {
  if (temperature === "Warm") return "show_packages";
  if (temperature === "Hot")  return "complete_order";
  return "none";
}

/* ─── CTA labels builder ─── */
export type CtaButton = {
  label: string;
  icon:  "start" | "packages" | "order" | "info" | "agent";
  value: string;
};

export function buildCtaButtons(ctaType: CtaType, temperature: LeadTemperature): CtaButton[] {
  switch (ctaType) {
    case "complete_order":
      return [{ label: "إتمام الطلب الآن", icon: "order", value: "أريد إتمام الطلب الآن" }];

    case "show_packages":
      return [
        { label: "عرض الباقات",  icon: "packages", value: "أريد رؤية الباقات والأسعار" },
        { label: "ابدأ الآن",    icon: "start",    value: "أريد البدء الآن" },
      ];

    case "start_now":
      return [{ label: "ابدأ الآن", icon: "start", value: "كيف أبدأ مع الخدمة؟" }];

    case "learn_more":
      return temperature === "Warm"
        ? [
            { label: "اعرف أكثر",      icon: "info",  value: "أريد معرفة المزيد عن الخدمة" },
            { label: "تحدث مع مندوب", icon: "agent", value: "أريد التحدث مع مندوب" },
          ]
        : [{ label: "اعرف أكثر", icon: "info", value: "أريد معرفة المزيد عن الخدمة" }];

    case "talk_to_agent":
      return [{ label: "تحدث مع مندوب", icon: "agent", value: "أريد التحدث مع مندوب" }];

    case "none":
    default:
      return [];
  }
}

/* ─── Stage label (Arabic) ─── */
export function stageLabel(stage: ConversationPhase): string {
  const labels: Record<ConversationPhase, string> = {
    OPENING:             "بداية المحادثة",
    DISCOVERY:           "استكشاف",
    QUALIFICATION:       "تأهيل",
    VALUE_BUILDING:      "بناء قيمة",
    OBJECTION_HANDLING:  "معالجة اعتراض",
    OFFER:               "عرض",
    CLOSING:             "إغلاق",
    FOLLOW_UP:           "متابعة",
    HANDOFF:             "تصعيد",
    LOST:                "خسارة",
  };
  return labels[stage] ?? stage;
}