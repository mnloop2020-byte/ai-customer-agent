/**
 * scoring.ts — Sales Engine Scoring System
 *
 * يحسب leadScore (0-100) بناءً على:
 * - intent (نية العميل)
 * - temperature (حرارة العميل)
 * - stage (مرحلة المحادثة)
 * - signals من رسالة العميل (جاهزية / اعتراض / ألم)
 * - التفاعل السابق (عدد الرسائل، جودة الردود)
 */

import type { ConversationPhase } from "@/domain/agent/conversation-state";
import type { CustomerContext } from "@/domain/agent/customer-context";

export type LeadTemperature = "Hot" | "Warm" | "Cold" | "Unqualified";

export type ScoringResult = {
  score: number;
  temperature: LeadTemperature;
  signals: ScoringSignal[];
  breakdown: ScoreBreakdown;
};

export type ScoringSignal = {
  type: "positive" | "negative" | "neutral";
  label: string;
  points: number;
};

export type ScoreBreakdown = {
  intentScore:      number;
  stageScore:       number;
  signalScore:      number;
  engagementScore:  number;
  painScore:        number;
  objectionPenalty: number;
};

/* ─── Intent weights ─── */
const INTENT_SCORES: Record<string, number> = {
  // جاهزية عالية
  booking:               35,
  order:                 35,
  ready_to_buy:          35,
  ask_start:             30,
  purchase_intent:       30,
  // اهتمام واضح
  ask_price:             22,
  price_inquiry:         22,
  ask_quote:             22,
  ask_packages:          20,
  service_inquiry:       18,
  ask_features:          16,
  // استكشاف
  greeting:              8,
  general:               6,
  identity_question:     4,
  hours_question:        4,
  location_question:     4,
  capabilities_question: 10,
  // سلبي
  objection:             -5,
  not_interested:        -15,
  competitor_comparison: -5,
};

/* ─── Stage weights ─── */
const STAGE_SCORES: Record<ConversationPhase, number> = {
  OPENING:             4,
  DISCOVERY:           8,
  QUALIFICATION:       14,
  VALUE_BUILDING:      20,
  OBJECTION_HANDLING:  10,
  OFFER:               26,
  CLOSING:             35,
  FOLLOW_UP:           12,
  HANDOFF:             20,
  LOST:                0,
};

/* ─── Readiness signals في رسالة العميل ─── */
const READINESS_PATTERNS: Array<{ pattern: RegExp; points: number; label: string }> = [
  { pattern: /أريد\s+(البدء|الاشتراك|التسجيل|الطلب|الشراء)/u,       points: 25, label: "نية شراء صريحة" },
  { pattern: /كيف\s+(أبدأ|أشترك|أسجل|أطلب)/u,                       points: 20, label: "سؤال عن طريقة البدء" },
  { pattern: /متى\s+(يمكن|تقدرون|ممكن|نبدأ)/u,                      points: 18, label: "سؤال عن موعد البدء" },
  { pattern: /هل\s+(يوجد|في|عندكم)\s+.*(عرض|خصم|باقة|تجربة)/u,      points: 15, label: "سؤال عن عرض" },
  { pattern: /(موافق|تمام|حسنًا|أوكي|okay|ok|نعم|أيوه|يلا)/iu,       points: 10, label: "موافقة" },
  { pattern: /كم\s+(السعر|التكلفة|الثمن|يكلف|تكلف)/u,                points: 12, label: "سؤال عن السعر" },
  { pattern: /(جربت|جربنا|استخدمت|استخدمنا)\s+.*(مشابه|مثله|زيه)/u, points: 8,  label: "تجربة سابقة مشابهة" },
  { pattern: /(مهتم|مهتمة|يهمني|يهمنا)/u,                            points: 12, label: "إبداء اهتمام" },
  { pattern: /(ميزانية|بجت|budget)/iu,                                points: 15, label: "ذكر الميزانية" },
];

/* ─── Objection/negative signals ─── */
const OBJECTION_PATTERNS: Array<{ pattern: RegExp; penalty: number; label: string }> = [
  { pattern: /(غالي|غلي|مكلف|expensive|too much)/iu,    penalty: -12, label: "اعتراض على السعر" },
  { pattern: /(مو\s+محتاج|مش\s+محتاج|ما\s+أحتاج)/u,   penalty: -18, label: "لا يحتاج الخدمة" },
  { pattern: /(سأفكر|سوف\s+أفكر|راح\s+أفكر|بفكر)/u,    penalty: -8,  label: "تردد" },
  { pattern: /(عندي\s+بديل|عندي\s+خيار|لدي\s+بديل)/u,  penalty: -10, label: "بديل موجود" },
  { pattern: /(مش\s+الوقت|مو\s+الوقت|لاحقًا|بعدين)/u,  penalty: -8,  label: "مشكلة توقيت" },
];

/* ─── Engagement quality ─── */
function calcEngagementScore(history: Array<{ sender: string; body: string }>): number {
  const customerMsgs = history.filter(m => m.sender === "CUSTOMER");
  const count = customerMsgs.length;
  if (count === 0) return 0;

  // عدد الرسائل → engagement base
  const base = Math.min(count * 2, 14);

  // جودة الردود: رسائل أطول من 6 كلمات = مشاركة حقيقية
  const richReplies = customerMsgs.filter(m => m.body.trim().split(/\s+/).length > 6).length;
  const richBonus = Math.min(richReplies * 3, 10);

  // رسائل في آخر 3 جولات = نشاط حالي
  const recentActive = history.slice(-6).filter(m => m.sender === "CUSTOMER").length >= 2 ? 4 : 0;

  return base + richBonus + recentActive;
}

/* ─── Pain points bonus ─── */
function calcPainScore(context: CustomerContext): number {
  let score = 0;

  if (context.messagesPerDay) {
    if (context.messagesPerDay >= 100) score += 15;
    else if (context.messagesPerDay >= 50) score += 10;
    else if (context.messagesPerDay >= 20) score += 6;
    else score += 3;
  }

  if (context.teamSize) {
    // فريق صغير + حجم طلبات كبير = ضغط = فرصة
    if (context.teamSize === 1 && (context.messagesPerDay ?? 0) > 30) score += 12;
    else if (context.teamSize <= 2) score += 6;
  }

  score += Math.min(context.painPoints.length * 5, 15);

  return Math.min(score, 25);
}

/* ─── Main scoring function ─── */
export function calculateScore(input: {
  intent:          string;
  stage:           ConversationPhase;
  currentMessage:  string;
  customerContext: CustomerContext;
  history:         Array<{ sender: string; body: string }>;
  previousScore:   number;
}): ScoringResult {
  const signals: ScoringSignal[] = [];

  // 1. Intent score
  const intentKey   = input.intent.toLowerCase().replace(/\s+/g, "_");
  const intentScore = INTENT_SCORES[intentKey] ?? INTENT_SCORES[input.intent] ?? 5;
  if (intentScore !== 0) {
    signals.push({ type: intentScore > 0 ? "positive" : "negative", label: `نية: ${input.intent}`, points: intentScore });
  }

  // 2. Stage score
  const stageScore = STAGE_SCORES[input.stage] ?? 6;
  signals.push({ type: "neutral", label: `مرحلة: ${input.stage}`, points: stageScore });

  // 3. Readiness signals
  let signalScore = 0;
  for (const { pattern, points, label } of READINESS_PATTERNS) {
    if (pattern.test(input.currentMessage)) {
      signals.push({ type: "positive", label, points });
      signalScore += points;
    }
  }
  signalScore = Math.min(signalScore, 30); // cap

  // 4. Objection penalties
  let objectionPenalty = 0;
  for (const { pattern, penalty, label } of OBJECTION_PATTERNS) {
    if (pattern.test(input.currentMessage)) {
      signals.push({ type: "negative", label, points: penalty });
      objectionPenalty += penalty;
    }
  }

  // 5. Engagement score
  const engagementScore = calcEngagementScore(input.history);
  if (engagementScore > 0) {
    signals.push({ type: "positive", label: "تفاعل المحادثة", points: engagementScore });
  }

  // 6. Pain score
  const painScore = calcPainScore(input.customerContext);
  if (painScore > 0) {
    signals.push({ type: "positive", label: "نقاط ألم واضحة", points: painScore });
  }

  // 7. Calculate raw score (weighted average with momentum)
  const rawScore = intentScore + stageScore + signalScore + engagementScore + painScore + objectionPenalty;

  // 8. Momentum: لا تسقط الـ score فجأة، انزلاق تدريجي
  const momentum = 0.35; // وزن الـ score السابق
  const blendedScore = Math.round(
    input.previousScore * momentum + rawScore * (1 - momentum)
  );

  const score = Math.max(0, Math.min(100, blendedScore));

  const breakdown: ScoreBreakdown = {
    intentScore,
    stageScore,
    signalScore,
    engagementScore,
    painScore,
    objectionPenalty,
  };

  return {
    score,
    temperature: scoreToTemperature(score),
    signals,
    breakdown,
  };
}

export function scoreToTemperature(score: number): LeadTemperature {
  if (score >= 72) return "Hot";
  if (score >= 45) return "Warm";
  if (score >= 18) return "Cold";
  return "Unqualified";
}

export function temperatureLabel(temp: LeadTemperature): string {
  if (temp === "Hot")         return "عميل ساخن 🔥";
  if (temp === "Warm")        return "عميل دافئ ✨";
  if (temp === "Cold")        return "عميل بارد ❄️";
  return "غير مؤهل";
}