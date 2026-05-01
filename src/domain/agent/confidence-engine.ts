import type { AgentDecision } from "@/domain/agent";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type ConfidenceResult = {
  level: ConfidenceLevel;
  score: number;
  reason: string;
  shouldAskInsteadOfPersuade: boolean;
};

export function evaluateDecisionConfidence(input: {
  messagesPerDay?: number;
  teamSize?: number;
  problemConfirmed: boolean;
  allowOffer: boolean;
  route: AgentDecision["route"];
  missingFields: string[];
}): ConfidenceResult {
  let score = 35;

  if (input.messagesPerDay) score += 18;
  if (input.teamSize) score += 18;
  if (input.problemConfirmed) score += 18;
  if (input.allowOffer) score += 8;
  if (!input.missingFields.length) score += 8;
  if (input.route === "HUMAN_HANDOFF" || input.route === "DISQUALIFY") score += 10;

  const bounded = Math.max(0, Math.min(100, score));
  const level: ConfidenceLevel = bounded >= 75 ? "HIGH" : bounded >= 55 ? "MEDIUM" : "LOW";

  return {
    level,
    score: bounded,
    reason: buildReason(input, level),
    shouldAskInsteadOfPersuade: level === "LOW" && !input.allowOffer,
  };
}

function buildReason(input: Parameters<typeof evaluateDecisionConfidence>[0], level: ConfidenceLevel) {
  if (level === "HIGH") return "Core operating context and problem are clear enough to persuade or offer.";
  if (!input.messagesPerDay) return "Message volume is still unknown.";
  if (!input.teamSize) return "Team capacity is still unknown.";
  if (!input.problemConfirmed) return "The operational pain has not been confirmed yet.";
  return "Enough context exists for value building, but offer timing is still gated.";
}
