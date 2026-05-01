import type { CustomerContext } from "@/domain/agent/customer-context";
import type { ConversationPhase } from "@/domain/agent/conversation-state";
import { questionForAction, resolveQuestionFlow, type QuestionFlowAction } from "@/domain/agent/question-flow";
import type { AgentStageMemory } from "@/domain/agent/stage-memory";

export type OfferGuardNextAction =
  | "ASK_MESSAGES_PER_DAY"
  | "ASK_TEAM_SIZE"
  | "CONFIRM_PROBLEM"
  | "EXPLAIN_VALUE"
  | "PRESENT_VALUE_OR_OFFER"
  | "CONTINUE_REGULAR_FLOW";

export type OfferGuard = {
  conversationStage: ConversationPhase;
  messagesPerDay?: number;
  teamSize?: number;
  problemConfirmed: boolean;
  valueExplained: boolean;
  priority?: "speed" | "pressure" | "repetition" | "lost_opportunities" | "all";
  allowOffer: boolean;
  allowPrice: boolean;
  allowDemo: boolean;
  nextAction: OfferGuardNextAction;
};

type ConversationMemory = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

export function buildOfferGuard(input: {
  customerContext: CustomerContext;
  conversationStage: ConversationPhase;
  history: ConversationMemory[];
  currentMessage: string;
  active: boolean;
  stageMemory?: AgentStageMemory;
}): OfferGuard {
  if (!input.active) {
    return {
      conversationStage: input.conversationStage,
      messagesPerDay: input.customerContext.messagesPerDay,
      teamSize: input.customerContext.teamSize,
      problemConfirmed: false,
      valueExplained: false,
      allowOffer: true,
      allowPrice: true,
      allowDemo: true,
      nextAction: "CONTINUE_REGULAR_FLOW",
    };
  }

  const flow = resolveQuestionFlow({
    customerContext: input.customerContext,
    history: input.history,
    currentMessage: input.currentMessage,
    active: input.active,
    stageMemory: input.stageMemory,
  });
  const allowOffer = flow.nextAction === "PRESENT_VALUE_OR_OFFER";

  return {
    conversationStage: input.conversationStage,
    messagesPerDay: input.customerContext.messagesPerDay,
    teamSize: input.customerContext.teamSize,
    problemConfirmed: flow.problemConfirmed,
    valueExplained: flow.valueExplained,
    priority: flow.priority,
    allowOffer,
    allowPrice: allowOffer,
    allowDemo: allowOffer,
    nextAction: flow.nextAction,
  };
}

export function forceQualificationUntilOfferAllowed<Route extends string>(route: Route, guard: OfferGuard) {
  if (guard.allowOffer && route === "QUALIFY") return "PRESENT_OFFER" as Route;
  if (guard.nextAction === "CONTINUE_REGULAR_FLOW" || guard.allowOffer) return route;
  if (route === "HUMAN_HANDOFF" || route === "DISQUALIFY" || route === "FOLLOW_UP") return route;
  return "QUALIFY" as Route;
}

export function guardQuestion(nextAction: OfferGuardNextAction) {
  return questionForAction(nextAction as QuestionFlowAction);
}
