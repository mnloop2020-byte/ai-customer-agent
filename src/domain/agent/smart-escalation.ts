import type { AgentDecision } from "@/domain/agent";
import type { ConversationPhase } from "@/domain/agent/conversation-state";
import type { ObjectionAnalysis } from "@/domain/agent/objection-engine";

export type SmartEscalationResult = {
  shouldEscalate: boolean;
  reason?: string;
};

export function assessSmartEscalation(input: {
  intent: string;
  score: number;
  stage: ConversationPhase;
  route: AgentDecision["route"];
  objection: ObjectionAnalysis;
  handoffReason?: string;
  problemConfirmed: boolean;
}): SmartEscalationResult {
  if (input.handoffReason && ["Human Request", "Custom Quote", "Billing Question"].includes(input.intent)) {
    return { shouldEscalate: true, reason: input.handoffReason };
  }

  if (input.handoffReason && isHighRiskHandoff(input.handoffReason)) {
    return { shouldEscalate: true, reason: input.handoffReason };
  }

  if (input.route === "HUMAN_HANDOFF" && input.score >= 35) {
    return { shouldEscalate: true, reason: input.handoffReason ?? "Conversation needs a human representative." };
  }

  if (
    input.objection.type === "TRUST" &&
    input.score >= 55 &&
    ["VALUE_BUILDING", "OFFER", "CLOSING", "OBJECTION_HANDLING"].includes(input.stage)
  ) {
    return { shouldEscalate: true, reason: "Customer needs proof or reassurance after qualification." };
  }

  if (input.objection.type === "PRICE" && input.problemConfirmed && input.score >= 70 && input.stage === "OBJECTION_HANDLING") {
    return { shouldEscalate: true, reason: "High-intent customer has a price objection after problem confirmation." };
  }

  return { shouldEscalate: false };
}

function isHighRiskHandoff(reason: string) {
  const normalized = reason.toLowerCase();
  return ["unhappy", "custom quote", "billing", "payment", "human representative"].some((term) => normalized.includes(term));
}
