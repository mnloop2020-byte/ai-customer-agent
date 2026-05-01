import type { ObjectionAnalysis } from "@/domain/agent/objection-engine";
import type { ConversationState } from "@/domain/agent/conversation-state";

export type PredictionEngineResult = {
  likelyNextCustomerMove: string;
  likelyObjections: string[];
  likelyQuestions: string[];
  escapeRisk: "LOW" | "MEDIUM" | "HIGH";
  recommendedPreventiveMove: string;
};

type BuildPredictionInput = {
  intent: string;
  missingFields: string[];
  temperature: string;
  qualificationStatus: string;
  objection: ObjectionAnalysis;
  conversationState: ConversationState;
  hasRecommendedOffer: boolean;
};

export function predictNextCustomerMove(input: BuildPredictionInput): PredictionEngineResult {
  const likelyObjections = buildLikelyObjections(input);
  const likelyQuestions = buildLikelyQuestions(input);
  const escapeRisk = computeEscapeRisk(input);

  return {
    likelyNextCustomerMove: buildLikelyMove(input, escapeRisk),
    likelyObjections,
    likelyQuestions,
    escapeRisk,
    recommendedPreventiveMove: buildPreventiveMove(input, escapeRisk),
  };
}

function buildLikelyObjections(input: BuildPredictionInput) {
  const objections = new Set<string>();

  if (input.objection.type !== "NONE") objections.add(input.objection.type);
  if (input.intent === "Price Inquiry" || input.hasRecommendedOffer) objections.add("PRICE");
  if (input.missingFields.includes("timeline")) objections.add("TIMING");
  if (input.conversationState.momentum === "STALLED") objections.add("CONFUSION");
  if (input.temperature === "Cold") objections.add("TRUST");

  return [...objections];
}

function buildLikelyQuestions(input: BuildPredictionInput) {
  const questions = new Set<string>();

  if (input.intent === "Price Inquiry" || input.hasRecommendedOffer) {
    questions.add("What is included in this price?");
    questions.add("Can I compare plans?");
  }

  if (input.missingFields.includes("service")) questions.add("What exactly can you help me with?");
  if (input.missingFields.includes("timeline")) questions.add("How long does implementation take?");
  if (input.temperature === "Hot") questions.add("How do we start?");

  return [...questions];
}

function computeEscapeRisk(input: BuildPredictionInput): PredictionEngineResult["escapeRisk"] {
  if (input.objection.severity === "HIGH") return "HIGH";
  if (input.conversationState.momentum === "AT_RISK") return "HIGH";
  if (input.conversationState.momentum === "STALLED") return "MEDIUM";
  if (input.temperature === "Cold" && input.missingFields.length > 2) return "MEDIUM";
  return "LOW";
}

function buildLikelyMove(input: BuildPredictionInput, escapeRisk: PredictionEngineResult["escapeRisk"]) {
  if (escapeRisk === "HIGH") return "Customer may disengage unless the reply lowers pressure and gives a simple next step.";
  if (input.hasRecommendedOffer) return "Customer may ask what is included or whether the offer fits their exact case.";
  if (input.missingFields.length) return "Customer may answer the current qualification question or avoid it if it feels too broad.";
  return "Customer is likely ready for a concrete next step.";
}

function buildPreventiveMove(input: BuildPredictionInput, escapeRisk: PredictionEngineResult["escapeRisk"]) {
  if (input.objection.type === "PRICE") return "Do not discount first; connect price to the result and ask about the value they expect.";
  if (input.objection.type === "COMPETITOR") return "Ask for the comparison criterion and position around fit, not superiority claims.";
  if (escapeRisk === "HIGH") return "Use a short, low-pressure reply and avoid asking for commitment immediately.";
  if (input.missingFields.length) return "Ask only the next missing field, in plain language.";
  return "Move toward a demo, booking, or clear start step.";
}
