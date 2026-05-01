import { z } from "zod";
import { CompanyProfile, companyProfileSchema, defaultCompanyProfile } from "@/domain/company";
import { buildAntiRepetitionMemory, pickNextUnaskedField, type AntiRepetitionMemory } from "@/domain/agent/anti-repetition";
import { buildConversationState, type ConversationState } from "@/domain/agent/conversation-state";
import {
  buildCustomerContext,
  mergeCustomerContextMemory,
  buildPersonalizationStrategy,
  type CustomerContext,
  type PersonalizationStrategy,
} from "@/domain/agent/customer-context";
import { canUseBookingFlow, resolveDecisionEngine } from "@/domain/agent/decision-engine";
import { detectClarificationIntent, type IntentOverride } from "@/domain/agent/intent-override";
import { analyzeObjection, type ObjectionAnalysis } from "@/domain/agent/objection-engine";
import { buildOfferGuard, guardQuestion, type OfferGuard } from "@/domain/agent/offer-guard";
import { evaluateDecisionConfidence, type ConfidenceResult } from "@/domain/agent/confidence-engine";
import { predictNextCustomerMove, type PredictionEngineResult } from "@/domain/agent/prediction-engine";
import { buildSalesPlaybook, type SalesPlaybookStep } from "@/domain/agent/sales-playbook";
import { assessSmartEscalation, type SmartEscalationResult } from "@/domain/agent/escalation-engine";
import { buildValuePlan, type ValuePlan } from "@/domain/agent/value-engine";
import { mergeStageMemory, readAgentStageMemory, shouldFreezeForward, type AgentStageMemory } from "@/domain/agent/stage-memory";
import { buildResponseContract, type AgentResponseContract } from "@/domain/agent/response-contract";

const channelSchema = z.enum(["WEB_CHAT", "WHATSAPP", "EMAIL", "INSTAGRAM", "FACEBOOK", "PHONE"]);
const customerTypeSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);
const qualificationStatusSchema = z.enum(["UNKNOWN", "DISCOVERING", "QUALIFIED", "NEEDS_REVIEW", "DISQUALIFIED"]);
const buyingStageSchema = z.enum(["NEW", "DISCOVERY", "QUALIFICATION", "OFFER", "NEGOTIATION", "FOLLOW_UP", "WON", "LOST"]);
const conversationMemorySchema = z.object({
  sender: z.enum(["CUSTOMER", "AI", "HUMAN", "SYSTEM"]),
  body: z.string().min(1),
});
const semanticIntentNameSchema = z.enum([
  "GREETING",
  "ASK_PRICE",
  "ASK_QUOTE",
  "ASK_LOCATION",
  "ASK_SERVICE",
  "ASK_HOW_IT_WORKS",
  "OBJECTION",
  "START",
  "GENERAL",
  "UNKNOWN",
]);
const semanticIntentItemSchema = z.object({
  intent: semanticIntentNameSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});
const semanticIntentClassificationSchema = z.object({
  intents: z.array(semanticIntentItemSchema).default([]),
  source: z.string().optional(),
  usedFallback: z.boolean().optional(),
});

const leadSnapshotSchema = z.object({
  score: z.number().min(0).max(100).default(0),
  status: z.string().default("NEW"),
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  companyName: z.string().optional(),
  serviceName: z.string().optional(),
  preferredContact: z.string().optional(),
  budget: z.string().optional(),
  timeline: z.string().optional(),
  decisionMaker: z.boolean().optional(),
  customerType: customerTypeSchema.optional(),
  needsSummary: z.string().optional(),
  qualificationStatus: qualificationStatusSchema.optional(),
  buyingStage: buyingStageSchema.optional(),
  route: z.string().optional(),
  agentMemory: z.unknown().optional(),
});

export const incomingMessageSchema = z.object({
  body: z.string().min(1),
  channel: channelSchema,
  companyProfile: companyProfileSchema.optional(),
  conversationHistory: z.array(conversationMemorySchema).max(12).optional(),
  leadSnapshot: leadSnapshotSchema.optional(),
  semanticIntent: semanticIntentClassificationSchema.optional(),
});

export type IncomingMessage = z.infer<typeof incomingMessageSchema>;
export type CustomerType = z.infer<typeof customerTypeSchema>;
export type QualificationStatus = z.infer<typeof qualificationStatusSchema>;
export type BuyingStage = z.infer<typeof buyingStageSchema>;
export type AgentNextAction =
  | "ANSWER_DIRECTLY"
  | "ASK_QUALIFYING_QUESTION"
  | "ASK_MESSAGES_PER_DAY"
  | "ASK_TEAM_SIZE"
  | "CONFIRM_PROBLEM"
  | "EXPLAIN_VALUE"
  | "PRESENT_VALUE_OR_OFFER"
  | "PRESENT_OFFER"
  | "BOOKING"
  | "FOLLOW_UP"
  | "HUMAN_HANDOFF"
  | "DISQUALIFY";
export type DirectAnswerIntent = "ASK_PRICE" | "ASK_QUOTE" | "ASK_SERVICE" | "ASK_LOCATION" | "ASK_HOW_IT_WORKS";
export type SemanticIntentName = z.infer<typeof semanticIntentNameSchema>;
export type SemanticIntentClassification = z.infer<typeof semanticIntentClassificationSchema>;
export type AskedField =
  | "service"
  | "customer_type"
  | "messages_per_day"
  | "team_size"
  | "timeline"
  | "budget"
  | "decision_maker"
  | "preferred_contact";

export type LeadProfileUpdate = {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  companyName?: string;
  serviceName?: string;
  preferredContact?: string;
  budget?: string;
  timeline?: string;
  decisionMaker?: boolean;
  customerType?: CustomerType;
  needsSummary?: string;
};

export type SalesOfferRecommendation = {
  serviceName: string;
  offerName: string;
  price: string;
  reason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type CtaPlan = {
  type:
    | "ASK_QUALIFYING_QUESTION"
    | "BOOK_DEMO"
    | "SHARE_START_STEPS"
    | "REQUEST_CONTACT"
    | "HANDOFF_TO_HUMAN"
    | "WAIT_FOR_REPLY";
  label: string;
  prompt: string;
};

export type FollowUpPlan = {
  kind: "CHECK_DECISION" | "CONTINUE_QUALIFICATION" | "RECOVER_OBJECTION" | "REENGAGE_LOST";
  delayHours: number;
  reason: string;
  message: string;
};

export type LostDealPlan = {
  reason: "NO_BUDGET" | "NO_TIMING" | "COMPETITOR" | "NOT_INTERESTED" | "NO_FIT";
  summary: string;
  reEngageAfterDays?: number;
};

export type AgentDecision = {
  intent: string;
  directAnswerIntent?: DirectAnswerIntent;
  directAnswerIntents: DirectAnswerIntent[];
  semanticIntent?: SemanticIntentClassification;
  objection: ObjectionAnalysis;
  conversationState: ConversationState;
  customerContext: CustomerContext;
  personalizationStrategy: PersonalizationStrategy;
  intentOverride: IntentOverride;
  antiRepetition: AntiRepetitionMemory;
  prediction: PredictionEngineResult;
  salesPlaybook: SalesPlaybookStep;
  conversationStage: ConversationState["phase"];
  messagesPerDay?: number;
  teamSize?: number;
  problemConfirmed: boolean;
  valueExplained: boolean;
  valuePriority?: OfferGuard["priority"];
  allowOffer: boolean;
  allowPrice: boolean;
  allowDemo: boolean;
  confidence: ConfidenceResult;
  smartEscalation: SmartEscalationResult;
  valuePlan: ValuePlan;
  responseContract: AgentResponseContract;
  stageMemory: AgentStageMemory;
  qualificationSignals: string[];
  missingFields: string[];
  focusField?: AskedField;
  bookingRequested: boolean;
  lostDeal?: LostDealPlan;
  followUpPlan?: FollowUpPlan;
  recommendedOffer?: SalesOfferRecommendation;
  cta: CtaPlan;
  matchedKnowledge: string[];
  scoreDelta: number;
  absoluteScore: number;
  temperature: "Hot" | "Warm" | "Cold" | "Unqualified";
  nextAction: AgentNextAction;
  route: "DIRECT_ANSWER" | "QUALIFY" | "PRESENT_OFFER" | "BOOKING" | "FOLLOW_UP" | "HUMAN_HANDOFF" | "DISQUALIFY";
  qualificationStatus: QualificationStatus;
  buyingStage: BuyingStage;
  summary: string;
  profileUpdates: LeadProfileUpdate;
  handoffReason?: string;
  response: string;
  aiProvider?: string;
};

type LeadSnapshot = z.infer<typeof leadSnapshotSchema>;
type ConversationMemory = z.infer<typeof conversationMemorySchema>;

type OfferOption = {
  planName: string;
  priceLabel: string;
  numericPrice?: number;
};

const businessKeywords = ["شركة", "مؤسسة", "فريق", "موظف", "موظفين", "قسم", "عمل", "business", "team", "company"];
const individualKeywords = ["لنفسي", "شخصي", "فرد", "individual", "personal"];
const directHandoffKeywords = ["غاضب", "زعلان", "شكوى", "غير راضي", "مو عاجبني", "مشكلة كبيرة"];
const cityKeywords = ["اسطنبول", "إسطنبول", "دبي", "الرياض", "جدة", "القاهرة", "عمان", "الدوحة", "الدمام", "أنقرة"];
const preferredContactLabels = [
  { label: "WhatsApp", keywords: ["واتساب", "whatsapp"] },
  { label: "Email", keywords: ["إيميل", "ايميل", "email"] },
  { label: "Phone", keywords: ["اتصال", "مكالمة", "هاتف", "جوال", "phone"] },
];
const timelineLabels = [
  { label: "Immediately", keywords: ["اليوم", "فورًا", "فورا", "الآن", "الان", "immediately", "asap"] },
  { label: "This week", keywords: ["هذا الأسبوع", "هذا الاسبوع", "خلال أسبوع", "خلال اسبوع", "this week"] },
  { label: "This month", keywords: ["هذا الشهر", "خلال شهر", "this month"] },
  { label: "Researching", keywords: ["أفكر", "افكر", "أبحث", "ابحث", "مقارنة", "لاحقًا", "لاحقا", "research"] },
];

export function analyzeIncomingMessage(input: IncomingMessage): AgentDecision {
  const parsed = incomingMessageSchema.parse(input);
  const profile = parsed.companyProfile ?? defaultCompanyProfile;
  const normalizedMessage = normalize(parsed.body);
  const leadSnapshot = parsed.leadSnapshot ?? { score: 0, status: "NEW" };
  const previousStageMemory = readAgentStageMemory(leadSnapshot.agentMemory);
  const history = parsed.conversationHistory ?? [];

  const semanticIntent = parsed.semanticIntent;
  const semanticPrimaryIntent = pickHighConfidenceSemanticIntent(semanticIntent);
  const intent = semanticPrimaryIntent ? mapSemanticIntentToLegacyIntent(semanticPrimaryIntent.intent) : detectIntent(normalizedMessage);
  let directAnswerIntents: DirectAnswerIntent[] = semanticPrimaryIntent
    ? directAnswerIntentsFromSemantic(semanticIntent)
    : directAnswerIntentFromLegacy(intent, normalizedMessage);
  let directAnswerIntent: DirectAnswerIntent | undefined = directAnswerIntents[0];
  const objection = analyzeObjection(parsed.body);
  const profileUpdates = extractProfileUpdates(parsed.body, normalizedMessage, leadSnapshot, profile);
  const mergedLead = mergeLeadSnapshot(leadSnapshot, profileUpdates);
  const matchedKnowledge = findCompanyKnowledge(normalizedMessage, profile, mergedLead.serviceName);
  const qualificationSignals = collectQualificationSignals(normalizedMessage, mergedLead, intent);
  const absoluteScore = computeLeadScore(intent, mergedLead, qualificationSignals);
  const scoreDelta = absoluteScore - (leadSnapshot.score ?? 0);
  const qualificationStatus = determineQualificationStatus(intent, mergedLead, qualificationSignals);
  const preliminaryCustomerContext = mergeCustomerContextMemory(
    buildCustomerContext({
      currentMessage: parsed.body,
      history,
      objectionType: objection.type,
      phase: "DISCOVERY",
    }),
    previousStageMemory,
  );
  const missingFields = determineMissingFields(intent, mergedLead, qualificationStatus, preliminaryCustomerContext);
  if (
    directAnswerIntent &&
    ["ASK_SERVICE", "ASK_HOW_IT_WORKS"].includes(directAnswerIntent) &&
    missingFields.some((field) => field === "messages_per_day" || field === "team_size")
  ) {
    directAnswerIntents = [];
    directAnswerIntent = undefined;
  }
  const askedFields = readAskedFields(history);
  const focusField = determineFocusField(missingFields, askedFields, history);
  const antiRepetition = buildAntiRepetitionMemory(history, focusField);
  const temperature = getTemperature(absoluteScore);
  const lostDeal = detectLostDeal(normalizedMessage, intent, qualificationStatus);
  const initialRoute = chooseRoute(intent, qualificationStatus, temperature, missingFields, parsed.body, Boolean(lostDeal), objection.type);
  const preliminaryBookingRequested = detectBookingRequest(normalizedMessage, history, initialRoute);
  const preliminaryConversationState = buildConversationState({
    intent,
    route: initialRoute,
    qualificationStatus,
    missingFields,
    focusField,
    history,
    objectionType: objection.type,
    lostDeal: Boolean(lostDeal),
    bookingRequested: preliminaryBookingRequested,
  });
  const customerContext = mergeCustomerContextMemory(
    buildCustomerContext({
      currentMessage: parsed.body,
      history,
      objectionType: objection.type,
      phase: preliminaryConversationState.phase,
    }),
    previousStageMemory,
  );
  const offerGuard = buildOfferGuard({
    customerContext,
    conversationStage: preliminaryConversationState.phase,
    history,
    currentMessage: parsed.body,
    active: shouldAskOperationalDiscovery(mergedLead, customerContext),
    stageMemory: previousStageMemory,
  });
  const effectiveOfferGuard = directAnswerIntent ? buildDirectAnswerOfferGuard(offerGuard) : offerGuard;
  const effectiveInitialRoute = directAnswerIntent ? "DIRECT_ANSWER" : initialRoute;
  const decisionEngine = resolveDecisionEngine({ initialRoute: effectiveInitialRoute, offerGuard: effectiveOfferGuard });
  const route = decisionEngine.route;
  const nextAction = decisionEngine.nextAction;
  const bookingRequested =
    canUseBookingFlow({ route, offerGuard: effectiveOfferGuard }) && detectBookingRequest(normalizedMessage, history, route);
  const recommendedOffer = effectiveOfferGuard.allowOffer && !directAnswerIntent ? matchOffer(profile, mergedLead, intent, route) : undefined;
  const rawConversationState = buildConversationState({
    intent,
    route,
    qualificationStatus,
    missingFields,
    focusField,
    history,
    objectionType: objection.type,
    lostDeal: Boolean(lostDeal),
    bookingRequested,
  });
  const conversationState = alignConversationStateWithMemory({
    current: rawConversationState,
    previousMemory: previousStageMemory,
    nextAction,
    route,
  });
  const intentOverride = intent === "Direct Explanation Request"
    ? ({ mode: "normal", skipResponsePolicy: false } satisfies IntentOverride)
    : detectClarificationIntent(parsed.body, customerContext);
  const personalizationStrategy = buildPersonalizationStrategy({
    customerContext,
    route,
    objectionType: objection.type,
    hasRecommendedOffer: Boolean(recommendedOffer),
    offerGuard: effectiveOfferGuard,
  });
  const valuePlan = buildValuePlan({ customerContext, questionFlow: offerGuard });
  const prediction = predictNextCustomerMove({
    intent,
    missingFields,
    temperature,
    qualificationStatus,
    objection,
    conversationState,
    hasRecommendedOffer: Boolean(recommendedOffer),
  });
  const salesPlaybook = buildSalesPlaybook({
    route,
    intent,
    conversationState,
    objection,
    prediction,
    hasRecommendedOffer: Boolean(recommendedOffer),
    personalizationStrategy,
  });
  const followUpPlan = buildFollowUpPlan({
    intent,
    route,
    temperature,
    qualificationStatus,
    lead: mergedLead,
    bookingRequested,
    lostDeal,
    recommendedOffer,
  });
  const buyingStage = determineBuyingStage(route, intent, qualificationStatus, mergedLead, Boolean(lostDeal));
  const confidence = evaluateDecisionConfidence({
    messagesPerDay: offerGuard.messagesPerDay,
    teamSize: offerGuard.teamSize,
    problemConfirmed: offerGuard.problemConfirmed,
    allowOffer: effectiveOfferGuard.allowOffer,
    route,
    missingFields,
  });
  const cta = buildCta({
    route,
    lead: mergedLead,
    focusField,
    profile,
    recommendedOffer,
    temperature,
    bookingRequested,
    objection,
    antiRepetition,
    conversationState,
    missingFields,
    customerContext,
    offerGuard: effectiveOfferGuard,
    isFirstCustomerTurn: history.filter((message) => message.sender === "CUSTOMER").length === 0,
  });
  const summary = buildSummary(
    intent,
    mergedLead,
    qualificationStatus,
    temperature,
    route,
    missingFields,
    recommendedOffer,
    followUpPlan,
    lostDeal,
    objection,
    conversationState,
    prediction,
    personalizationStrategy,
  );
  const baseHandoffReason = getHandoffReason(intent, parsed.body, qualificationStatus);
  const smartEscalation = assessSmartEscalation({
    intent,
    score: absoluteScore,
    stage: conversationState.phase,
    route,
    objection,
    handoffReason: baseHandoffReason,
    problemConfirmed: offerGuard.problemConfirmed,
  });
  const handoffReason = smartEscalation.shouldEscalate ? smartEscalation.reason : undefined;
  const stageMemory = mergeStageMemory(previousStageMemory, {
    conversationStage: directAnswerIntent && previousStageMemory.conversationStage ? previousStageMemory.conversationStage : conversationState.phase,
    nextAction: directAnswerIntent && previousStageMemory.nextAction ? previousStageMemory.nextAction : nextAction,
    messagesPerDay: offerGuard.messagesPerDay,
    teamSize: offerGuard.teamSize,
    problemConfirmed:
      offerGuard.problemConfirmed ||
      (!directAnswerIntent && (nextAction === "EXPLAIN_VALUE" || nextAction === "PRESENT_VALUE_OR_OFFER")),
    valueExplained: offerGuard.valueExplained || (!directAnswerIntent && nextAction === "PRESENT_VALUE_OR_OFFER"),
  });
  const responseContract = buildResponseContract({
    customerMessage: parsed.body,
    intent,
    directAnswerIntents,
    route,
    nextAction,
    conversationStage: conversationState.phase,
    allowOffer: effectiveOfferGuard.allowOffer,
    allowPrice: effectiveOfferGuard.allowPrice,
    allowDemo: effectiveOfferGuard.allowDemo,
    missingFields,
    problemConfirmed: offerGuard.problemConfirmed,
    valueExplained: offerGuard.valueExplained,
    objectionType: objection.type,
  });

  logDecisionFlow({
    currentMessage: parsed.body,
    intentDetected: intent,
    intentType: directAnswerIntent ?? intent,
    semanticIntent,
    directAnswerIntent,
    intentOverride: Boolean(directAnswerIntent),
    previousStage: previousStageMemory.conversationStage,
    previousNextAction: previousStageMemory.nextAction,
    preliminaryStage: preliminaryConversationState.phase,
    rawFinalStage: rawConversationState.phase,
    finalStage: conversationState.phase,
    initialRoute,
    route,
    nextAction,
    messagesPerDay: offerGuard.messagesPerDay,
    teamSize: offerGuard.teamSize,
    problemConfirmed: offerGuard.problemConfirmed,
    valueExplained: offerGuard.valueExplained,
    backwardTransitionBlocked: shouldFreezeForward({
      previousStage: previousStageMemory.conversationStage,
      currentStage: conversationState.phase,
      previousNextAction: previousStageMemory.nextAction,
      currentNextAction: nextAction,
    }),
    missingFields,
    focusField,
    responseContract,
  });

  return {
    intent,
    directAnswerIntent,
    directAnswerIntents,
    semanticIntent,
    objection,
    conversationState,
    customerContext,
    personalizationStrategy,
    intentOverride,
    antiRepetition,
    prediction,
    salesPlaybook,
    conversationStage: conversationState.phase,
    messagesPerDay: offerGuard.messagesPerDay,
    teamSize: offerGuard.teamSize,
    problemConfirmed: offerGuard.problemConfirmed,
    valueExplained: offerGuard.valueExplained,
    valuePriority: offerGuard.priority,
    allowOffer: effectiveOfferGuard.allowOffer,
    allowPrice: effectiveOfferGuard.allowPrice,
    allowDemo: effectiveOfferGuard.allowDemo,
    confidence,
    smartEscalation,
    valuePlan,
    responseContract,
    stageMemory,
    qualificationSignals,
    missingFields,
    focusField,
    bookingRequested,
    lostDeal,
    followUpPlan,
    recommendedOffer,
    cta,
    matchedKnowledge,
    scoreDelta,
    absoluteScore,
    temperature,
    nextAction,
    route,
    qualificationStatus,
    buyingStage,
    summary,
    profileUpdates,
    handoffReason,
    response: "",
  };
}

function logDecisionFlow(payload: {
  currentMessage: string;
  intentDetected: string;
  intentType: string;
  semanticIntent?: SemanticIntentClassification;
  directAnswerIntent?: DirectAnswerIntent;
  intentOverride: boolean;
  previousStage?: ConversationState["phase"];
  previousNextAction?: AgentNextAction;
  preliminaryStage: ConversationState["phase"];
  rawFinalStage: ConversationState["phase"];
  finalStage: ConversationState["phase"];
  initialRoute: AgentDecision["route"];
  route: AgentDecision["route"];
  nextAction: AgentNextAction;
  messagesPerDay?: number;
  teamSize?: number;
  problemConfirmed: boolean;
  valueExplained: boolean;
  backwardTransitionBlocked: boolean;
  missingFields: string[];
  focusField?: AskedField;
  responseContract: AgentResponseContract;
}) {
  if (process.env.AGENT_DEBUG !== "1" && process.env.NODE_ENV !== "development") return;

  console.log("[AI_AGENT_DECISION_FLOW]", payload);
}

function alignConversationStateWithMemory({
  current,
  previousMemory,
  nextAction,
  route,
}: {
  current: ConversationState;
  previousMemory: AgentStageMemory;
  nextAction: AgentNextAction;
  route: AgentDecision["route"];
}): ConversationState {
  const targetPhase = phaseFromNextAction(nextAction, route);
  const previousStage = previousMemory.conversationStage;
  const shouldKeepPrevious =
    previousStage &&
    shouldFreezeForward({
      previousStage,
      currentStage: targetPhase ?? current.phase,
      previousNextAction: previousMemory.nextAction,
      currentNextAction: nextAction,
    });
  const phase = shouldKeepPrevious ? previousStage : targetPhase ?? current.phase;

  if (phase === current.phase) return current;

  return {
    ...current,
    phase,
    turnGoal: phase === "VALUE_BUILDING"
      ? "Explain the practical value using known customer facts and move one step forward."
      : current.turnGoal,
    controlRule: phase === "VALUE_BUILDING"
      ? "Do not return to discovery questions that were already answered; explain value and use one clear next step."
      : current.controlRule,
    shouldAdvance: true,
  };
}

const SEMANTIC_INTENT_CONFIDENCE = 0.72;

function pickHighConfidenceSemanticIntent(classification?: SemanticIntentClassification) {
  return classification?.intents
    .filter((item) => item.intent !== "UNKNOWN" && item.confidence >= SEMANTIC_INTENT_CONFIDENCE)
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function directAnswerIntentsFromSemantic(classification?: SemanticIntentClassification): DirectAnswerIntent[] {
  const directIntents = new Set<DirectAnswerIntent>();

  classification?.intents
    .filter((item) => item.confidence >= SEMANTIC_INTENT_CONFIDENCE)
    .forEach((item) => {
      const direct = semanticIntentToDirectAnswer(item.intent);
      if (direct) directIntents.add(direct);
    });

  return [...directIntents];
}

function semanticIntentToDirectAnswer(intent: SemanticIntentName): DirectAnswerIntent | undefined {
  if (intent === "ASK_PRICE") return "ASK_PRICE";
  if (intent === "ASK_QUOTE") return "ASK_QUOTE";
  if (intent === "ASK_LOCATION") return "ASK_LOCATION";
  if (intent === "ASK_SERVICE") return "ASK_SERVICE";
  if (intent === "ASK_HOW_IT_WORKS") return "ASK_HOW_IT_WORKS";
  return undefined;
}

function mapSemanticIntentToLegacyIntent(intent: SemanticIntentName) {
  if (intent === "GREETING") return "Greeting";
  if (intent === "ASK_PRICE") return "Price Inquiry";
  if (intent === "ASK_QUOTE") return "Quote Request";
  if (intent === "ASK_LOCATION") return "Location Question";
  if (intent === "ASK_SERVICE" || intent === "ASK_HOW_IT_WORKS") return "Capabilities Question";
  if (intent === "OBJECTION") return "Objection";
  if (intent === "START") return "Booking Intent";
  return "General Inquiry";
}

function directAnswerIntentFromLegacy(intent: string, normalizedMessage: string): DirectAnswerIntent[] {
  if (intent === "Price Inquiry") return ["ASK_PRICE"];
  if (intent === "Quote Request") return ["ASK_QUOTE"];
  if (intent === "Location Question") return ["ASK_LOCATION"];
  if (intent === "Capabilities Question") {
    if (containsPattern(normalizedMessage, ["رسائل", "رسالة", "محاثات", "محادثات", "عملاء", "خدمة العملاء", "شركة خدمات", "ضغط", "ردود"])) {
      return [];
    }
    if (containsPattern(normalizedMessage, ["الخدمات", "خدماتكم", "service", "services"])) return ["ASK_SERVICE"];
    return ["ASK_HOW_IT_WORKS"];
  }
  return [];
}

function buildDirectAnswerOfferGuard(guard: OfferGuard): OfferGuard {
  return {
    ...guard,
    allowOffer: true,
    allowPrice: true,
    allowDemo: true,
    nextAction: "CONTINUE_REGULAR_FLOW",
  };
}

function phaseFromNextAction(nextAction: AgentNextAction, route: AgentDecision["route"]): ConversationState["phase"] | undefined {
  if (nextAction === "EXPLAIN_VALUE") return "VALUE_BUILDING";
  if (nextAction === "PRESENT_VALUE_OR_OFFER" || nextAction === "PRESENT_OFFER" || route === "PRESENT_OFFER") return "OFFER";
  if (nextAction === "BOOKING" || route === "BOOKING") return "CLOSING";
  if (nextAction === "HUMAN_HANDOFF" || route === "HUMAN_HANDOFF") return "HANDOFF";
  if (nextAction === "FOLLOW_UP" || route === "FOLLOW_UP") return "FOLLOW_UP";
  if (nextAction === "DISQUALIFY" || route === "DISQUALIFY") return "LOST";
  return undefined;
}

function detectIntent(message: string) {
  if (isUnclearShortReply(message)) return "Unclear Reply";
  if (isPureGreetingMessage(message)) return "Greeting";
  if (requestsAnswerWithoutQuestion(message)) return "Direct Explanation Request";
  if (containsPattern(message, ["مصادر المعرفة", "تعتمد في ردك", "المعلومات التي استخدمتها", "لماذا اخترت هذا السؤال", "ليش اخترت هذا السؤال"])) return "Answer Reason Question";
  if (isCustomQuoteRequest(message)) return "Custom Quote";
  if (isGeneralQuoteRequest(message)) return "Quote Request";
  if (containsPattern(message, ["مندوب", "تواصل مباشر", "واتساب", "اتصال", "إيميل", "ايميل"])) return "Human Request";
  if (containsPattern(message, ["ساعات العمل", "الدوام", "متى تفتحون", "أوقات العمل"])) return "Hours Question";
  if (containsPattern(message, ["وين موقعكم", "أين موقعكم", "العنوان", "الموقع", "وين تقدمون", "في أي مناطق", "في اي مناطق", "هل تخدمون السعودية", "تخدمون السعودية", "مناطق الخدمة"])) return "Location Question";
  if (containsPattern(message, ["فاتورة", "فوتره", "الدفع", "تحويل بنكي"])) return "Billing Question";
  if (containsPattern(message, ["أريد الاشتراك", "كيف أبدأ", "كيف ابدا", "ابدأ", "ابدا", "احجز", "حجز", "موعد", "استشارة", "demo"])) {
    return "Booking Intent";
  }
  if (containsPattern(message, ["غالي", "مرتفع", "سأفكر", "سافكر", "أفكر", "منافس", "غير مناسب"])) return "Objection";
  if (isPriceInquiry(message)) return "Price Inquiry";
  if (containsPattern(message, ["من أنت", "من انت", "اسمك", "عرفني", "تعرف عن نفسك"])) return "Identity Question";
  if (containsPattern(message, ["ماذا تفعل", "كيف تساعد", "وش تسوي", "ما خدماتكم", "الخدمات", "وش تقدمون", "ايش تقدمون", "إيش تقدمون", "شنو تقدمون", "ما الذي تقدمونه", "كيف يشتغل النظام", "كيف يشتغل", "كيف يعمل", "كيف تعمل", "اشرح الطريقة", "طريقة العمل", "كيف تشتغل الخدمة"])) return "Capabilities Question";
  if (containsPattern(message, ["مرحبا", "أهلا", "اهلا", "السلام عليكم", "hello", "hi"])) return "Greeting";
  if (containsPattern(message, ["العرض السابق", "تواصلنا", "متابعة", "رجعت", "الطلب السابق"])) return "Follow-up";

  return "General Inquiry";
}

function isPureGreetingMessage(message: string) {
  const normalized = normalize(message);
  const compact = normalized.replace(/\s+/g, "");
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (/^(hi|hello|hey)$/iu.test(normalized)) return true;
  if (/^(السلامعليكم|السلاموعليكم|سلامعليكم|سلاموعليكم|وعليكمالسلام|مرحبا|اهلا|أهلا|هلا|ياهلا)$/u.test(compact)) {
    return true;
  }

  return /^(السلام|سلام|مرحبا|اهلا|أهلا|هلا)\b/u.test(normalized) && wordCount <= 4;
}

function isPriceInquiry(message: string) {
  if (containsPattern(message, ["السعر", "الاسعار", "الأسعار", "تكلفة", "التكلفة", "بكم", "كم التكلفة", "كم السعر", "كم سعر", "سعرها"])) {
    return true;
  }

  return /(?:كم|بكم)\s+(?:السعر|سعر|سعرها|التكلفة|تكلفة|الكلفة|كلفة|الباقة|باقة)/iu.test(message);
}

function isGeneralQuoteRequest(message: string) {
  return containsPattern(message, [
    "احتاج عرض سعر",
    "أحتاج عرض سعر",
    "اريد عرض سعر",
    "أريد عرض سعر",
    "ابغى عرض سعر",
    "أبغى عرض سعر",
    "عطيني عرض سعر",
    "عطيني باقة",
    "اعطيني باقة",
    "أعطيني باقة",
    "ابي اشتراك",
    "أبي اشتراك",
    "ابغى اشتراك",
    "أبغى اشتراك",
    "اريد الاشتراك",
    "أريد الاشتراك",
  ]);
}

function isCustomQuoteRequest(message: string) {
  return containsPattern(message, [
    "عرض مخصص",
    "سعر مخصص",
    "مخصص",
    "مشروع خاص",
    "حل خاص",
    "تنفيذ خاص",
    "احتياج خاص",
  ]);
}

function extractProfileUpdates(
  rawMessage: string,
  message: string,
  leadSnapshot: LeadSnapshot,
  profile: CompanyProfile,
): LeadProfileUpdate {
  const updates: LeadProfileUpdate = {};

  const fullName = extractName(rawMessage);
  if (fullName && !leadSnapshot.fullName) updates.fullName = fullName;

  const email = rawMessage.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  if (email && email !== leadSnapshot.email) updates.email = email;

  const phone = rawMessage.match(/(?:\+?\d[\d\s-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ").trim();
  if (phone && phone !== leadSnapshot.phone) updates.phone = phone;

  const companyName = extractCompanyName(rawMessage);
  if (companyName && companyName !== leadSnapshot.companyName) updates.companyName = companyName;

  const city = extractCity(rawMessage);
  if (city && city !== leadSnapshot.city) updates.city = city;

  const serviceName = findServiceName(message, profile);
  if (serviceName && serviceName !== leadSnapshot.serviceName) updates.serviceName = serviceName;

  const preferredContact = extractPreferredContact(message);
  if (preferredContact && preferredContact !== leadSnapshot.preferredContact) updates.preferredContact = preferredContact;

  const budget = extractBudget(rawMessage);
  if (budget && budget !== leadSnapshot.budget) updates.budget = budget;

  const timeline = extractTimeline(message);
  if (timeline && timeline !== leadSnapshot.timeline) updates.timeline = timeline;

  const decisionMaker = extractDecisionMaker(message);
  if (typeof decisionMaker === "boolean" && decisionMaker !== leadSnapshot.decisionMaker) {
    updates.decisionMaker = decisionMaker;
  }

  const customerType = extractCustomerType(message);
  if (customerType && customerType !== leadSnapshot.customerType) updates.customerType = customerType;

  const needsSummary = extractNeedSummary(rawMessage, leadSnapshot.serviceName ?? serviceName);
  if (needsSummary && needsSummary !== leadSnapshot.needsSummary) updates.needsSummary = needsSummary;

  return updates;
}

function mergeLeadSnapshot(leadSnapshot: LeadSnapshot, updates: LeadProfileUpdate) {
  return {
    ...leadSnapshot,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
  };
}

function collectQualificationSignals(message: string, lead: ReturnType<typeof mergeLeadSnapshot>, intent: string) {
  const signals: string[] = [];

  if (lead.serviceName || lead.needsSummary) signals.push("clear_need");
  if (lead.customerType === "BUSINESS") signals.push("business_fit");
  if (lead.budget) signals.push("budget_known");
  if (lead.timeline) signals.push("timeline_known");
  if (lead.decisionMaker === true) signals.push("decision_maker");
  if (lead.email || lead.phone) signals.push("contact_available");
  if (lead.preferredContact) signals.push("preferred_contact_known");
  if (intent === "Booking Intent") signals.push("booking_intent");
  if (intent === "Custom Quote") signals.push("custom_quote");
  if (intent === "Follow-up") signals.push("follow_up_context");
  if (containsPattern(message, directHandoffKeywords)) signals.push("sensitive_escalation");

  return signals;
}

function computeLeadScore(intent: string, lead: ReturnType<typeof mergeLeadSnapshot>, signals: string[]) {
  let score = 0;

  if (signals.includes("clear_need")) score += 22;
  if (signals.includes("business_fit")) score += 12;
  if (signals.includes("budget_known")) score += 15;
  if (signals.includes("timeline_known")) score += 15;
  if (signals.includes("decision_maker")) score += 15;
  if (signals.includes("contact_available")) score += 6;
  if (signals.includes("preferred_contact_known")) score += 5;
  if (signals.includes("booking_intent")) score += 18;
  if (signals.includes("custom_quote")) score += 12;
  if (signals.includes("follow_up_context")) score += 8;
  if (intent === "Price Inquiry") score += 8;
  if (intent === "Objection") score += 6;
  if (intent === "Human Request") score += 10;
  if (intent === "Billing Question") score += 10;
  if (lead.customerType === "INDIVIDUAL") score += 5;
  if (isFastTimeline(lead.timeline)) score += 7;
  if (signals.includes("sensitive_escalation")) score = Math.max(score, 45);

  return Math.min(100, score);
}

function determineQualificationStatus(
  intent: string,
  lead: ReturnType<typeof mergeLeadSnapshot>,
  signals: string[],
): QualificationStatus {
  if (intent === "Billing Question") return "NEEDS_REVIEW";
  if (signals.includes("sensitive_escalation")) return "NEEDS_REVIEW";

  const hasNeed = Boolean(lead.serviceName || lead.needsSummary);
  const hasReadiness = Boolean(lead.timeline || lead.budget || lead.decisionMaker === true);

  if (!hasNeed) return "DISCOVERING";
  if (hasNeed && hasReadiness) return "QUALIFIED";
  return "NEEDS_REVIEW";
}

function determineMissingFields(
  intent: string,
  lead: ReturnType<typeof mergeLeadSnapshot>,
  qualificationStatus: QualificationStatus,
  customerContext: CustomerContext,
) {
  const missing: string[] = [];
  const needsOperationalDiscovery = shouldAskOperationalDiscovery(lead, customerContext);

  if (!lead.serviceName && !lead.needsSummary) missing.push("service");
  if (!lead.customerType && ["Price Inquiry", "Booking Intent", "Custom Quote", "General Inquiry"].includes(intent)) {
    missing.push("customer_type");
  }

  if (needsOperationalDiscovery && !customerContext.messagesPerDay) missing.push("messages_per_day");
  if (needsOperationalDiscovery && customerContext.messagesPerDay && !customerContext.teamSize) missing.push("team_size");

  if (!lead.timeline && ["Price Inquiry", "Booking Intent", "Custom Quote", "Follow-up"].includes(intent) && !needsOperationalDiscovery) {
    missing.push("timeline");
  }
  if (!lead.budget && intent === "Custom Quote") missing.push("budget");
  if (lead.customerType === "BUSINESS" && lead.decisionMaker !== true && qualificationStatus !== "DISCOVERING") {
    missing.push("decision_maker");
  }
  if (!lead.preferredContact && ["Human Request", "Custom Quote", "Booking Intent"].includes(intent)) {
    missing.push("preferred_contact");
  }

  return missing;
}

function shouldAskOperationalDiscovery(lead: ReturnType<typeof mergeLeadSnapshot>, customerContext: CustomerContext) {
  const knownOperationalFact = Boolean(customerContext.messagesPerDay || customerContext.teamSize);
  const supportNeed = normalize(`${lead.needsSummary ?? ""} ${lead.serviceName ?? ""}`);
  const mentionsSupportLoad = containsPattern(supportNeed, [
    "رسائل",
    "رسايل",
    "محادثات",
    "عملاء",
    "خدمة العملاء",
    "دعم",
    "ردود",
    "customer",
    "support",
    "messages",
    "chats",
    // متاجر وطلبات
    "متجر",
    "متجره",
    "طلبات",
    "طلب",
    "اوردر",
    "اوردرات",
    "orders",
    "order",
    "مبيعات",
    "sales",
    "تجارة",
    "تجاره",
    "store",
    "shop",
    "منتج",
    "منتجات",
    "products",
  ]);

  return knownOperationalFact || Boolean(customerContext.painPoints.length) || mentionsSupportLoad;
}

function readAskedFields(history: ConversationMemory[]): AskedField[] {
  const askedFields: AskedField[] = [];

  history
    .filter((message) => message.sender === "AI")
    .forEach((message) => {
      const field = detectAskedField(message.body);
      if (field && !askedFields.includes(field)) askedFields.push(field);
    });

  return askedFields;
}

function determineFocusField(missingFields: string[], askedFields: AskedField[], history: ConversationMemory[]) {
  const orderedMissingFields = missingFields.filter((field): field is AskedField =>
    [
      "service",
      "customer_type",
      "messages_per_day",
      "team_size",
      "timeline",
      "budget",
      "decision_maker",
      "preferred_contact",
    ].includes(field),
  );

  if (!orderedMissingFields.length) return undefined;

  return orderedMissingFields.find((field) => !askedFields.includes(field)) ?? pickNextUnaskedField(orderedMissingFields, history);
}

function chooseRoute(
  intent: string,
  qualificationStatus: QualificationStatus,
  temperature: AgentDecision["temperature"],
  missingFields: string[],
  rawMessage: string,
  lostDeal = false,
  objectionType: ObjectionAnalysis["type"] = "NONE",
): AgentDecision["route"] {
  const normalized = normalize(rawMessage);

  if (intent === "Human Request" || intent === "Custom Quote" || intent === "Billing Question") {
    return "HUMAN_HANDOFF";
  }
  if (lostDeal) return "DISQUALIFY";
  if (containsPattern(normalized, directHandoffKeywords)) return "HUMAN_HANDOFF";
  if (qualificationStatus === "DISQUALIFIED") return "DISQUALIFY";

  if (intent === "Greeting" && isPureGreetingMessage(rawMessage)) return "DIRECT_ANSWER";

  if (
    ["Greeting", "Capabilities Question"].includes(intent) &&
    missingFields.some((field) => field === "messages_per_day" || field === "team_size")
  ) {
    return "QUALIFY";
  }

  if (["Greeting", "Identity Question", "Capabilities Question", "Hours Question", "Location Question", "Quote Request", "Answer Reason Question", "Direct Explanation Request", "Unclear Reply"].includes(intent)) {
    return "DIRECT_ANSWER";
  }

  if (objectionType !== "NONE") {
    if (objectionType === "TIMING") return "FOLLOW_UP";
    if (missingFields.length > 0 && qualificationStatus !== "QUALIFIED") return "QUALIFY";
    return temperature === "Unqualified" ? "QUALIFY" : "PRESENT_OFFER";
  }

  if (missingFields.length > 0 && qualificationStatus !== "QUALIFIED") {
    return "QUALIFY";
  }

  if (intent === "Booking Intent" && ["Hot", "Warm"].includes(temperature)) {
    return "BOOKING";
  }

  if ((intent === "Price Inquiry" || qualificationStatus === "QUALIFIED") && temperature !== "Unqualified") {
    return "PRESENT_OFFER";
  }

  if (intent === "Follow-up") return "FOLLOW_UP";

  return "QUALIFY";
}

function determineBuyingStage(
  route: AgentDecision["route"],
  intent: string,
  qualificationStatus: QualificationStatus,
  lead: ReturnType<typeof mergeLeadSnapshot>,
  lostDeal = false,
): BuyingStage {
  if (lostDeal) return "LOST";
  if (route === "BOOKING") return "NEGOTIATION";
  if (route === "PRESENT_OFFER") return "OFFER";
  if (route === "FOLLOW_UP") return "FOLLOW_UP";
  if (qualificationStatus === "QUALIFIED" && (lead.timeline || lead.budget)) return "QUALIFICATION";
  if (intent === "Greeting") return "NEW";
  return "DISCOVERY";
}

function detectBookingRequest(
  message: string,
  history: ConversationMemory[],
  route: AgentDecision["route"],
) {
  if (route !== "BOOKING") return false;

  if (containsPattern(message, ["احجز", "حجز", "موعد", "مكالمة", "demo", "ديمو", "meeting", "call"])) {
    return true;
  }

  const lastAiMessage = [...history].reverse().find((entry) => entry.sender === "AI")?.body ?? "";
  const aiOfferedBooking = containsPattern(normalize(lastAiMessage), ["demo", "ديمو", "نرتب", "حجز", "موعد"]);
  const customerAccepted = containsPattern(message, ["نعم", "ايوه", "أكيد", "اكيد", "مناسب", "تمام", "يلا", "yes", "ok"]);

  return aiOfferedBooking && customerAccepted;
}

function detectLostDeal(
  message: string,
  intent: string,
  qualificationStatus: QualificationStatus,
): LostDealPlan | undefined {
  if (containsPattern(message, ["لا نحتاج", "ما نحتاج", "غير مهتم", "لا أريد", "مو مهتم", "not interested"])) {
    return {
      reason: "NOT_INTERESTED",
      summary: "Lead explicitly said they are not interested at this time.",
    };
  }

  if (containsPattern(message, ["اخترنا شركة اخرى", "اخترنا شركة أخرى", "لدينا مزود اخر", "لدينا مزود آخر", "competitor", "vendor"])) {
    return {
      reason: "COMPETITOR",
      summary: "Lead chose another provider or mentioned an active competitor.",
      reEngageAfterDays: 30,
    };
  }

  if (containsPattern(message, ["لا توجد ميزانية", "ما عندي ميزانية", "ليس لدينا ميزانية", "الميزانية غير متوفرة", "budget not available"])) {
    return {
      reason: "NO_BUDGET",
      summary: "Lead paused because budget is not currently available.",
      reEngageAfterDays: 21,
    };
  }

  if (containsPattern(message, ["ليس الان", "ليس الآن", "مو الآن", "بعد عدة اشهر", "بعد عدة أشهر", "اوقفنا المشروع", "وقفنا المشروع"])) {
    return {
      reason: "NO_TIMING",
      summary: "Lead is not ready now and wants to revisit later.",
      reEngageAfterDays: 30,
    };
  }

  if (qualificationStatus === "DISQUALIFIED" || intent === "Billing Question") {
    return {
      reason: "NO_FIT",
      summary: "Lead does not fit the current service flow and should be closed for now.",
    };
  }

  return undefined;
}

function buildFollowUpPlan({
  intent,
  route,
  temperature,
  qualificationStatus,
  lead,
  bookingRequested,
  lostDeal,
  recommendedOffer,
}: {
  intent: string;
  route: AgentDecision["route"];
  temperature: AgentDecision["temperature"];
  qualificationStatus: QualificationStatus;
  lead: ReturnType<typeof mergeLeadSnapshot>;
  bookingRequested: boolean;
  lostDeal?: LostDealPlan;
  recommendedOffer?: SalesOfferRecommendation;
}): FollowUpPlan | undefined {
  if (bookingRequested) return undefined;
  if (lostDeal) {
    if (!lostDeal.reEngageAfterDays) return undefined;

    return {
      kind: "REENGAGE_LOST",
      delayHours: lostDeal.reEngageAfterDays * 24,
      reason: `Lead marked lost with reason ${lostDeal.reason} but should be revisited later.`,
      message: buildFollowUpMessage("REENGAGE_LOST", lead, recommendedOffer),
    };
  }

  if (["DIRECT_ANSWER", "BOOKING", "HUMAN_HANDOFF", "DISQUALIFY"].includes(route)) return undefined;

  if (intent === "Objection") {
    return {
      kind: "RECOVER_OBJECTION",
      delayHours: temperature === "Hot" ? 12 : 24,
      reason: "Customer hesitated or raised an objection after showing interest.",
      message: buildFollowUpMessage("RECOVER_OBJECTION", lead, recommendedOffer),
    };
  }

  if (route === "FOLLOW_UP") {
    return {
      kind: "CHECK_DECISION",
      delayHours: temperature === "Warm" ? 24 : 48,
      reason: "Customer asked to continue later or returned to a previous discussion.",
      message: buildFollowUpMessage("CHECK_DECISION", lead, recommendedOffer),
    };
  }

  if (route === "PRESENT_OFFER" && ["Warm", "Cold"].includes(temperature)) {
    return {
      kind: "CHECK_DECISION",
      delayHours: temperature === "Warm" ? 24 : 48,
      reason: "Customer has a recommended offer but has not committed yet.",
      message: buildFollowUpMessage("CHECK_DECISION", lead, recommendedOffer),
    };
  }

  if (route === "QUALIFY" && qualificationStatus === "DISCOVERING" && Boolean(lead.serviceName || lead.needsSummary)) {
    return {
      kind: "CONTINUE_QUALIFICATION",
      delayHours: 48,
      reason: "Customer showed a need but key qualification details are still missing.",
      message: buildFollowUpMessage("CONTINUE_QUALIFICATION", lead, recommendedOffer),
    };
  }

  return undefined;
}

function buildFollowUpMessage(
  kind: FollowUpPlan["kind"],
  lead: ReturnType<typeof mergeLeadSnapshot>,
  recommendedOffer?: SalesOfferRecommendation,
) {
  const contact = lead.fullName ?? lead.companyName ?? "Lead";
  const service = lead.serviceName ?? recommendedOffer?.serviceName ?? "service";
  const offer = recommendedOffer ? `${recommendedOffer.offerName} - ${recommendedOffer.price}` : "recommended option";

  if (kind === "RECOVER_OBJECTION") {
    return `Follow up with ${contact} about objection handling for ${service}. Revisit ${offer}.`;
  }

  if (kind === "CONTINUE_QUALIFICATION") {
    return `Continue qualification with ${contact} and collect the missing buying details for ${service}.`;
  }

  if (kind === "REENGAGE_LOST") {
    return `Re-engage ${contact} later to revisit ${service} and reopen the opportunity if timing improves.`;
  }

  return `Check back with ${contact} on the decision for ${service}. Review ${offer}.`;
}

function matchOffer(
  profile: CompanyProfile,
  lead: ReturnType<typeof mergeLeadSnapshot>,
  intent: string,
  route: AgentDecision["route"],
): SalesOfferRecommendation | undefined {
  if (!["PRESENT_OFFER", "BOOKING"].includes(route)) return undefined;
  if (!lead.serviceName && !lead.needsSummary && intent !== "Price Inquiry") return undefined;

  const service = findRecommendedService(profile, lead);
  if (!service) return undefined;

  const options = parseOfferOptions(service.price);
  const selected = selectOfferOption(options, lead);

  return {
    serviceName: service.name,
    offerName: selected.planName,
    price: selected.priceLabel,
    reason: explainOfferChoice(selected, lead),
    confidence: options.length > 1 ? "HIGH" : "MEDIUM",
  };
}

function buildCta({
  route,
  lead,
  focusField,
  profile,
  recommendedOffer,
  temperature,
  bookingRequested,
  objection,
  antiRepetition,
  conversationState,
  missingFields,
  customerContext,
  offerGuard,
  isFirstCustomerTurn,
}: {
  route: AgentDecision["route"];
  lead: ReturnType<typeof mergeLeadSnapshot>;
  focusField?: AskedField;
  profile: CompanyProfile;
  recommendedOffer?: SalesOfferRecommendation;
  temperature: AgentDecision["temperature"];
  bookingRequested: boolean;
  objection: ObjectionAnalysis;
  antiRepetition: AntiRepetitionMemory;
  conversationState: ConversationState;
  missingFields: string[];
  customerContext: CustomerContext;
  offerGuard: OfferGuard;
  isFirstCustomerTurn: boolean;
}): CtaPlan {
  if (route === "DIRECT_ANSWER") {
    return {
      type: "WAIT_FOR_REPLY",
      label: "Direct answer",
      prompt: "أجب عن سؤال العميل مباشرة بدون سؤال تأهيلي أو رجوع لمرحلة سابقة.",
    };
  }

  const guardedQuestion = guardQuestion(offerGuard.nextAction);
  if (guardedQuestion && !offerGuard.allowOffer) {
    return {
      type: "ASK_QUALIFYING_QUESTION",
      label: "Offer guard",
      prompt: guardedQuestion,
    };
  }

  const discoveryQuestion = getDiscoveryCtaQuestion({
    focusField,
    profile,
    conversationState,
    missingFields,
    customerContext,
    isFirstCustomerTurn,
  });
  if (discoveryQuestion) {
    return {
      type: "ASK_QUALIFYING_QUESTION",
      label: "Discovery qualification",
      prompt: discoveryQuestion,
    };
  }

  if (route !== "HUMAN_HANDOFF" && objection.type !== "NONE" && objection.nextQuestion) {
    return {
      type: "WAIT_FOR_REPLY",
      label: "Handle objection",
      prompt: objection.nextQuestion,
    };
  }

  if (route === "QUALIFY") {
    if (!focusField || antiRepetition.repeatedQuestionRisk === "HIGH") {
      return {
        type: "ASK_QUALIFYING_QUESTION",
        label: "Reduce repetition",
        prompt: "ما أهم نتيجة تريد الوصول لها من الحل؟",
      };
    }

    return {
      type: "ASK_QUALIFYING_QUESTION",
      label: "Collect qualification",
      prompt: askForField(focusField ?? "service", profile, lead.customerType),
    };
  }

  if (route === "HUMAN_HANDOFF") {
    if (!lead.preferredContact) {
      return {
        type: "REQUEST_CONTACT",
        label: "Collect preferred contact",
        prompt: askForField("preferred_contact", profile, lead.customerType),
      };
    }

    return {
      type: "HANDOFF_TO_HUMAN",
      label: "Route to human",
      prompt: "سأحول طلبك الآن إلى المندوب المناسب.",
    };
  }

  if (route === "BOOKING") {
    if (bookingRequested) {
      return {
        type: "BOOK_DEMO",
        label: "Booking requested",
        prompt: "تم تسجيل طلب الحجز وسيتم التنسيق معك على الموعد المناسب.",
      };
    }

    return {
      type: "BOOK_DEMO",
      label: "Book demo",
      prompt: "هل يناسبك أن نرتب Demo قصير هذا الأسبوع؟",
    };
  }

  if (route === "PRESENT_OFFER" && recommendedOffer) {
    if (temperature === "Hot" || isFastTimeline(lead.timeline) || lead.customerType === "BUSINESS") {
      return {
        type: "BOOK_DEMO",
        label: "Book sales demo",
        prompt: "هل يناسبك أن نرتب Demo قصير للبدء؟",
      };
    }

    return {
      type: "SHARE_START_STEPS",
      label: "Share start steps",
      prompt: "هل تريد خطوات البدء في هذه الخطة؟",
    };
  }

  if (route === "FOLLOW_UP") {
    return {
      type: "WAIT_FOR_REPLY",
      label: "Follow up",
      prompt: askForField(focusField ?? "timeline", profile, lead.customerType),
    };
  }

  return {
    type: "WAIT_FOR_REPLY",
    label: "Continue conversation",
    prompt: "أنا جاهز أكمل معك حسب ما يناسبك.",
  };
}

function getDiscoveryCtaQuestion({
  focusField,
  profile,
  conversationState,
  missingFields,
  customerContext,
  isFirstCustomerTurn,
}: {
  focusField?: AskedField;
  profile: CompanyProfile;
  conversationState: ConversationState;
  missingFields: string[];
  customerContext: CustomerContext;
  isFirstCustomerTurn: boolean;
}) {
  const inEarlyDiscovery = ["OPENING", "DISCOVERY", "QUALIFICATION"].includes(conversationState.phase);
  if (!inEarlyDiscovery) return undefined;

  const hasOperationalNeed =
    missingFields.includes("messages_per_day") ||
    missingFields.includes("team_size") ||
    Boolean(customerContext.messagesPerDay) ||
    Boolean(customerContext.teamSize) ||
    Boolean(customerContext.painPoints.length);

  if (!hasOperationalNeed && !isFirstCustomerTurn) return undefined;
  if (focusField === "team_size" || (customerContext.messagesPerDay && missingFields.includes("team_size"))) {
    return askForField("team_size", profile);
  }
  if (focusField === "messages_per_day" || missingFields.includes("messages_per_day")) {
    return askForField("messages_per_day", profile);
  }

  return undefined;
}

function findRecommendedService(profile: CompanyProfile, lead: ReturnType<typeof mergeLeadSnapshot>) {
  if (lead.serviceName) {
    const exact = profile.services.find((service) => service.name === lead.serviceName);
    if (exact) return exact;
  }

  const summary = normalize(lead.needsSummary ?? "");
  if (!summary) return undefined;

  return profile.services.find((service) => {
    const haystack = normalize(`${service.name} ${service.description}`);
    return summary
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .some((token) => haystack.includes(token));
  });
}

function parseOfferOptions(price: string): OfferOption[] {
  const segments = price
    .split(/[,\u060C;\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const parsed = segments.reduce<OfferOption[]>((accumulator, segment) => {
    const match = segment.match(/^(.+?)\s*[:\-]\s*(.+)$/);
    if (!match) return accumulator;

    accumulator.push({
      planName: cleanOfferName(match[1]),
      priceLabel: match[2].trim(),
      numericPrice: readNumber(match[2]),
    });

    return accumulator;
  }, []);

  if (parsed.length) return parsed;

  return [
    {
      planName: "الخطة المناسبة",
      priceLabel: price.trim(),
      numericPrice: readNumber(price),
    },
  ];
}

function cleanOfferName(value: string) {
  return value.replace(/^باقة\s+/u, "").replace(/^خطة\s+/u, "").trim();
}

function selectOfferOption(options: OfferOption[], lead: ReturnType<typeof mergeLeadSnapshot>) {
  const sorted = [...options].sort((left, right) => {
    const a = left.numericPrice ?? Number.POSITIVE_INFINITY;
    const b = right.numericPrice ?? Number.POSITIVE_INFINITY;
    return a - b;
  });
  const budget = readNumber(lead.budget);
  const businessLead = lead.customerType === "BUSINESS" || lead.decisionMaker === true;
  const fastStart = isFastTimeline(lead.timeline);

  if (budget !== undefined) {
    const affordable = sorted.filter((option) => option.numericPrice !== undefined && option.numericPrice <= budget);
    if (affordable.length) {
      return businessLead || fastStart ? affordable.at(-1) ?? affordable[0] : affordable[0];
    }

    return sorted[0];
  }

  const businessOption =
    sorted.find((option) => /(احتراف|متقدم|pro|business|enterprise)/i.test(normalize(option.planName))) ??
    sorted.at(-1);
  const starterOption =
    sorted.find((option) => /(أساسي|basic|starter|start)/i.test(normalize(option.planName))) ?? sorted[0];

  if (businessLead || fastStart) {
    return businessOption ?? sorted[0];
  }

  return starterOption ?? sorted[0];
}

function explainOfferChoice(option: OfferOption, lead: ReturnType<typeof mergeLeadSnapshot>) {
  if (lead.customerType === "BUSINESS") {
    return "لأنها أنسب لاحتياج شركة وتدعم التوسع بشكل أفضل.";
  }

  if (isFastTimeline(lead.timeline)) {
    return "لأنها مناسبة لبدء سريع بدون تعقيد.";
  }

  if (lead.budget && option.numericPrice !== undefined) {
    return "لأنها الأقرب إلى الميزانية التي ذكرتها.";
  }

  return "لأنها الأنسب حسب الاحتياج الحالي الذي ذكرته.";
}

function isFastTimeline(timeline?: string) {
  return containsPattern(normalize(timeline ?? ""), ["immediately", "this week", "اليوم", "هذا الأسبوع", "فور", "الآن"]);
}

function readNumber(value?: string) {
  if (!value) return undefined;

  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;

  return Number(match[1].replace(",", "."));
}

function buildSummary(
  intent: string,
  lead: ReturnType<typeof mergeLeadSnapshot>,
  qualificationStatus: QualificationStatus,
  temperature: AgentDecision["temperature"],
  route: AgentDecision["route"],
  missingFields: string[],
  recommendedOffer?: SalesOfferRecommendation,
  followUpPlan?: FollowUpPlan,
  lostDeal?: LostDealPlan,
  objection?: ObjectionAnalysis,
  conversationState?: ConversationState,
  prediction?: PredictionEngineResult,
  personalizationStrategy?: PersonalizationStrategy,
) {
  const parts = [
    `Intent=${intent}`,
    `Service=${lead.serviceName ?? "unknown"}`,
    `Type=${lead.customerType ?? "unknown"}`,
    `Qualification=${qualificationStatus}`,
    `Temperature=${temperature}`,
    `Route=${route}`,
  ];

  if (lead.timeline) parts.push(`Timeline=${lead.timeline}`);
  if (lead.budget) parts.push(`Budget=${lead.budget}`);
  if (recommendedOffer) parts.push(`Offer=${recommendedOffer.offerName}`);
  if (followUpPlan) parts.push(`FollowUp=${followUpPlan.kind}`);
  if (lostDeal) parts.push(`Lost=${lostDeal.reason}`);
  if (objection && objection.type !== "NONE") parts.push(`Objection=${objection.type}`);
  if (conversationState) parts.push(`Phase=${conversationState.phase}`, `Momentum=${conversationState.momentum}`);
  if (prediction) parts.push(`EscapeRisk=${prediction.escapeRisk}`);
  if (personalizationStrategy?.requirePersonalization) {
    parts.push(`MustUseFacts=${personalizationStrategy.mustMentionFacts.join(";")}`);
  }
  if (missingFields.length) parts.push(`Missing=${missingFields.join(",")}`);

  return parts.join(" | ");
}

function getHandoffReason(intent: string, rawMessage: string, qualificationStatus: QualificationStatus) {
  const normalized = normalize(rawMessage);

  if (intent === "Human Request") return "Customer explicitly requested a human representative.";
  if (intent === "Custom Quote") return "Customer requested a custom quote or special project.";
  if (intent === "Billing Question") return "Billing or payment questions should go to sales or finance.";
  if (containsPattern(normalized, directHandoffKeywords)) return "Customer is unhappy and needs a human handoff.";
  if (qualificationStatus === "NEEDS_REVIEW") return "Conversation needs manual review before continuing.";

  return undefined;
}

export function buildResponse({
  intent,
  route,
  profile,
  matchedKnowledge,
  lead,
  focusField,
  bookingRequested,
  lostDeal,
  recommendedOffer,
  cta,
  objection,
  conversationState,
  salesPlaybook,
  personalizationStrategy,
  intentOverride,
  antiRepetition,
  offerGuard,
  valuePlan,
}: {
  intent: string;
  route: AgentDecision["route"];
  profile: CompanyProfile;
  matchedKnowledge: string[];
  lead: ReturnType<typeof mergeLeadSnapshot>;
  focusField?: AskedField;
  bookingRequested: boolean;
  lostDeal?: LostDealPlan;
  recommendedOffer?: SalesOfferRecommendation;
  cta: CtaPlan;
  objection: ObjectionAnalysis;
  conversationState: ConversationState;
  salesPlaybook: SalesPlaybookStep;
  personalizationStrategy: PersonalizationStrategy;
  intentOverride: IntentOverride;
  antiRepetition: AntiRepetitionMemory;
  offerGuard: OfferGuard;
  valuePlan: ValuePlan;
}) {
  const safeKnowledge = offerGuard.allowPrice
    ? matchedKnowledge
    : matchedKnowledge.filter((item) => !containsCommercialKnowledge(item));
  const knowledgeLine = safeKnowledge.length ? `حسب المعلومات الحالية: ${safeKnowledge[0]}. ` : "";

  if (intentOverride.mode === "clarification_mode") {
    return "";
  }

  if (intent === "Greeting") {
    if (antiRepetition.lastAskedField) {
      return `وعليكم السلام. نكمل من آخر نقطة: ${askForField(antiRepetition.lastAskedField, profile, lead.customerType)}`;
    }

    return `أهلًا وسهلًا، معك مساعد ${profile.name}. ${askForField(focusField ?? "service", profile, lead.customerType)}`;
  }

  if (intent === "Identity Question") {
    return `معك مساعد ${profile.name}. أساعدك تفهم الخيار الأنسب لك وأرتب لك الخطوة التالية.`;
  }

  if (intent === "Capabilities Question") {
    return "أساعدك تفهم الخدمة المناسبة، أوضح التفاصيل المهمة، ثم أرتب لك الخطوة التالية.";
  }

  if (intent === "Direct Explanation Request") {
    return "نقدم نظامًا يساعد الشركات على تنظيم رسائل العملاء، تسريع الردود، واستخدام معلومات الشركة للرد بدقة. كما يساعد فريق المبيعات على متابعة العملاء وتحويل المحادثات المهمة إلى فرص وصفقات.";
  }

  if (intent === "Hours Question") {
    return `ساعات العمل لدينا: ${profile.workingHours || "I don't have that information"}.`;
  }

  if (intent === "Location Question") {
    return `موقعنا: ${profile.location || "I don't have that information"}.`;
  }

  if (intent === "Answer Reason Question") {
    return "أعتمد على معلومات الشركة المعتمدة وما تذكره أنت أثناء المحادثة. اخترت السؤال لأن معرفة حجم الرسائل أو عدد من يرد عليها تساعدني أحدد الحل الأنسب بدون تخمين.";
  }

  if (intent === "Unclear Reply") {
    return "ما فهمت قصدك تمامًا. ممكن تكتبها بجملة أوضح؟";
  }

  if (route === "HUMAN_HANDOFF") {
    return `أكيد. ${cta.prompt}`;
  }

  if (!offerGuard.allowOffer && offerGuard.nextAction === "EXPLAIN_VALUE") {
    return valuePlan.response;
  }

  if (!offerGuard.allowOffer && offerGuard.nextAction === "CONFIRM_PROBLEM") {
    return `${buildProblemConfirmationLine(offerGuard)} ${cta.prompt}`;
  }

  if (route === "QUALIFY" && (focusField === "messages_per_day" || focusField === "team_size")) {
    return `${knowledgeLine}${buildDiscoveryValueLine(focusField)} ${cta.prompt}`.trim();
  }

  if (route === "BOOKING") {
    if (bookingRequested) {
      return `${knowledgeLine}${cta.prompt}`;
    }

    if (recommendedOffer) {
      return `${knowledgeLine}أنسب خيار مبدئي لك هو ${recommendedOffer.offerName} من خدمة ${recommendedOffer.serviceName} بسعر ${recommendedOffer.price}. ${recommendedOffer.reason} ${cta.prompt}`;
    }

    return `${knowledgeLine}ممتاز. ${cta.prompt}`;
  }

  if (route === "PRESENT_OFFER") {
    if (intent === "Price Inquiry" && focusField) {
      return askForField(focusField, profile, lead.customerType);
    }

    if (recommendedOffer) {
      return `${knowledgeLine}أنسب خيار لك هو ${recommendedOffer.offerName} من خدمة ${recommendedOffer.serviceName} بسعر ${recommendedOffer.price}. ${recommendedOffer.reason} ${cta.prompt}`;
    }

    return `${knowledgeLine}بناءً على ما ذكرته، أستطيع ترشيح الخيار الأنسب لك. ${cta.prompt}`;
  }

  if (route === "FOLLOW_UP") {
    return `واضح. ${cta.prompt}`;
  }

  if (route === "DISQUALIFY") {
    if (lostDeal?.reEngageAfterDays) {
      return "أتفهم. سأغلق الطلب الحالي الآن، ويمكننا العودة لك لاحقًا إذا تغير التوقيت أو الميزانية.";
    }

    if (lostDeal) {
      return "أتفهم. سأغلق هذا الطلب الآن، وإذا تغير احتياجك لاحقًا يسعدنا العودة معك.";
    }

    return "شكرًا لك. هذا الطلب يحتاج مراجعة بشرية قبل المتابعة.";
  }

  if (intent === "Objection" || objection.type !== "NONE" || conversationState.phase === "OBJECTION_HANDLING") {
    const contextLine = personalizationStrategy.personalizationLead ? `${personalizationStrategy.personalizationLead}، ` : "";
    const valueLine = objection.type !== "NONE" ? `${objection.valueAngle}` : "";
    const nextStep = salesPlaybook.framework === "OBJECTION" ? ` ${cta.prompt}` : "";
    return `أتفهم ذلك. ${contextLine}${valueLine}${nextStep}`.trim();
  }

  if (personalizationStrategy.requirePersonalization && personalizationStrategy.personalizationLead) {
    return `${knowledgeLine}${personalizationStrategy.personalizationLead} ${personalizationStrategy.valueBridge ?? ""} ${cta.prompt}`.trim();
  }

  return `${knowledgeLine}${cta.prompt}`;
}

function buildDiscoveryValueLine(focusField?: AskedField) {
  if (focusField === "team_size") {
    return "ممتاز، بعد معرفة حجم الرسائل نحتاج نفهم ضغط الفريق حتى نحدد كيف نقلل التأخير ونرتب التصعيد.";
  }

  return "أكيد، نظامنا يساعدكم في تنظيم رسائل العملاء وتسريع الردود وتصعيد الحالات المهمة بدل ما تتكدس على الفريق.";
}

function containsCommercialKnowledge(value: string) {
  return /السعر|أسعار|الأسعار|باقة|باقات|\$\s*\d|\d+\s*\$/iu.test(value);
}

function isUnclearShortReply(message: string) {
  const normalized = normalize(message);
  if (!normalized) return true;
  if (["نعم", "اي", "إي", "ايوه", "أيوه", "لا", "تمام", "اوكي", "ok", "yes", "no"].some((term) => normalized === normalize(term))) {
    return false;
  }

  const compact = normalized.replace(/\s+/g, "");
  return compact.length <= 2 && !/\d/u.test(compact);
}

function requestsAnswerWithoutQuestion(message: string) {
  const normalized = normalize(message);
  const forbidsQuestion = [
    "لا تطرح اي سؤال",
    "لا تطرح سؤال",
    "بدون سؤال",
    "لا تسال",
    "لا تسأل",
    "فقط اشرح",
    "اشرح فقط",
    "جاوب فقط",
  ].some((term) => normalized.includes(normalize(term)));

  if (!forbidsQuestion) return false;

  return ["ماذا تقدمون", "وش تقدمون", "خدمتكم", "الخدمه", "الخدمة", "اشرح", "تشرح"].some((term) =>
    normalized.includes(normalize(term)),
  );
}

function buildProblemConfirmationLine(offerGuard: OfferGuard) {
  const facts = [
    offerGuard.messagesPerDay ? `${offerGuard.messagesPerDay} رسالة يوميًا` : undefined,
    offerGuard.teamSize ? formatTeamSizeFact(offerGuard.teamSize) : undefined,
  ].filter(Boolean);

  if (!facts.length) return "قبل اقتراح الحل المناسب، نحتاج نتأكد من المشكلة الفعلية.";

  return `مع ${facts.join(" و")}، خلّينا نتأكد من المشكلة الفعلية قبل اقتراح الحل المناسب.`;
}

function formatTeamSizeFact(teamSize: number) {
  if (teamSize === 1) return "شخص واحد يرد";
  if (teamSize === 2) return "شخصين يردون";
  return `${teamSize} أشخاص يردون`;
}

function askForField(field: AskedField, profile: CompanyProfile, customerType?: CustomerType) {
  if (field === "service") {
    return customerType === "BUSINESS"
      ? "ما الخدمة أو التحدي الذي تريدون حله داخل الشركة؟"
      : "ما الخدمة التي تبحث عنها تحديدًا؟";
  }

  if (field === "customer_type") {
    return "هل تستخدم الخدمة لنفسك أم لشركتك؟";
  }

  if (field === "messages_per_day") {
    return "تقريبًا كم رسالة تستقبلون يوميًا؟";
  }

  if (field === "team_size") {
    return "كم شخص يرد على رسائل العملاء حاليًا؟";
  }

  if (field === "timeline") {
    return "متى تتوقع البدء؟";
  }

  if (field === "budget") {
    return "هل لديك ميزانية تقريبية؟";
  }

  if (field === "decision_maker") {
    return "هل أنت صاحب القرار النهائي؟";
  }

  if (field === "preferred_contact") {
    return "ما وسيلة التواصل المفضلة لديك؟";
  }

  return `ما الخدمة التي تبحث عنها من ${profile.name}؟`;
}

function findCompanyKnowledge(message: string, profile: CompanyProfile, serviceName?: string) {
  const matches: string[] = [];

  if (serviceName) {
    const service = profile.services.find((item) => item.name === serviceName);
    if (service) matches.push(`${service.name}: ${service.price}`);
  }

  if (containsPattern(message, ["الدوام", "ساعات العمل", "متى تفتحون"])) {
    matches.push(`ساعات العمل: ${profile.workingHours}`);
  }

  if (containsPattern(message, ["وين", "أين", "الموقع", "العنوان"])) {
    matches.push(`الموقع: ${profile.location}`);
  }

  profile.faqs.forEach((faq) => {
    const normalizedQuestion = normalize(faq.question);
    if (message.includes(normalizedQuestion) || containsPattern(message, normalizedQuestion.split(" "))) {
      matches.push(faq.answer);
    }
  });

  return [...new Set(matches)].slice(0, 4);
}

function findServiceName(message: string, profile: CompanyProfile) {
  const normalizedServices = profile.services.map((service) => ({
    name: service.name,
    terms: [service.name, service.description]
      .flatMap((value) => value.split(/[\s,/.-]+/))
      .map((part) => normalize(part))
      .filter((part) => part.length > 2),
  }));

  return normalizedServices.find((service) => service.terms.some((term) => message.includes(term)))?.name;
}

function detectAskedField(body: string): AskedField | undefined {
  const normalized = normalize(body);

  if (normalized.includes(normalize("هل تستخدم الخدمة لنفسك أم لشركتك"))) return "customer_type";
  if (normalized.includes(normalize("ما الخدمة أو التحدي الذي تريدون حله داخل الشركة"))) return "service";
  if (normalized.includes(normalize("ما الخدمة التي تبحث عنها تحديدًا"))) return "service";
  if (normalized.includes(normalize("كم رسالة تستقبلون يوميًا"))) return "messages_per_day";
  if (normalized.includes(normalize("كم شخص يرد على رسائل العملاء"))) return "team_size";
  if (normalized.includes(normalize("متى تتوقع البدء"))) return "timeline";
  if (normalized.includes(normalize("هل لديك ميزانية تقريبية"))) return "budget";
  if (normalized.includes(normalize("هل أنت صاحب القرار النهائي"))) return "decision_maker";
  if (normalized.includes(normalize("ما وسيلة التواصل المفضلة لديك"))) return "preferred_contact";

  return undefined;
}

function extractName(rawMessage: string) {
  const patterns = [
    /(?:اسمي|انا|أنا)\s+([A-Za-z\u0600-\u06FF]{2,}(?:\s+[A-Za-z\u0600-\u06FF]{2,}){0,2})/u,
    /name\s+is\s+([A-Za-z\s]{2,40})/i,
  ];

  for (const pattern of patterns) {
    const match = rawMessage.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return undefined;
}

function extractCompanyName(rawMessage: string) {
  const patterns = [
    /(?:شركتي|شركة|مؤسسة)\s+([A-Za-z\u0600-\u06FF0-9\s]{2,40})/u,
    /company\s+name\s+is\s+([A-Za-z0-9\s]{2,40})/i,
  ];

  for (const pattern of patterns) {
    const match = rawMessage.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return undefined;
}

function extractCity(rawMessage: string) {
  return cityKeywords.find((city) => normalize(rawMessage).includes(normalize(city)));
}

function extractPreferredContact(message: string) {
  return preferredContactLabels.find((item) => item.keywords.some((keyword) => message.includes(normalize(keyword))))?.label;
}

function extractBudget(rawMessage: string) {
  const normalized = normalize(rawMessage);
  if (/(?:رساله|رسالة|رسايل|محادثه|محادثة|محادثات|عميل|عملاء)/u.test(normalized)) return undefined;
  if (!/(?:ميزانيه|ميزانية|budget|usd|دولار|ريال|ليرة|\$|تكلفه|تكلفة|المبلغ)/iu.test(normalized)) return undefined;

  const budgetMatch = rawMessage.match(/(\d+(?:[.,]\d+)?)\s*(?:\$|usd|دولار|ريال|ليرة)?/i);
  return budgetMatch?.[0]?.trim();
}

function extractTimeline(message: string) {
  return timelineLabels.find((item) => item.keywords.some((keyword) => message.includes(normalize(keyword))))?.label;
}

function extractDecisionMaker(message: string) {
  if (containsPattern(message, ["أنا صاحب القرار", "انا صاحب القرار", "صاحب القرار", "أنا المسؤول", "انا المسؤول"])) {
    return true;
  }

  if (containsPattern(message, ["لست صاحب القرار", "مو صاحب القرار", "مديري يقرر", "الإدارة تقرر", "someone else decides"])) {
    return false;
  }

  return undefined;
}

function extractCustomerType(message: string): CustomerType | undefined {
  if (containsPattern(message, businessKeywords)) return "BUSINESS";
  if (containsPattern(message, individualKeywords)) return "INDIVIDUAL";
  return undefined;
}

function extractNeedSummary(rawMessage: string, serviceName?: string) {
  if (serviceName) return serviceName;

  const clean = rawMessage.trim();
  if (clean.length < 8) return undefined;

  // إذا ذكر متجر أو طلبات، اربطها بخدمة العملاء حتى يُفعَّل operational discovery
  const normalized = normalize(clean);
  if (
    containsPattern(normalized, [
      "متجر",
      "متجره",
      "طلبات",
      "اوردر",
      "اوردرات",
      "مبيعات",
      "تجارة",
      "تجاره",
      "store",
      "shop",
      "orders",
    ])
  ) {
    return `خدمة عملاء - ${clean.slice(0, 160)}`;
  }

  return clean.slice(0, 220);
}

function getTemperature(score: number): AgentDecision["temperature"] {
  if (score >= 70) return "Hot";
  if (score >= 45) return "Warm";
  if (score >= 20) return "Cold";
  return "Unqualified";
}

function containsPattern(message: string, patterns: string[]) {
  return patterns.some((pattern) => message.includes(normalize(pattern)));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s$]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}