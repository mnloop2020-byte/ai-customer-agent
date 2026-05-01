import type { AgentDecision, AgentNextAction } from "@/domain/agent";
import type { OfferGuard } from "@/domain/agent/offer-guard";

export type DecisionEngineResult = {
  route: AgentDecision["route"];
  nextAction: AgentNextAction;
  allowOffer: boolean;
  allowPrice: boolean;
  allowDemo: boolean;
};

export function resolveDecisionEngine(input: {
  initialRoute: AgentDecision["route"];
  offerGuard: OfferGuard;
}): DecisionEngineResult {
  const route = resolveGuardedRoute(input.initialRoute, input.offerGuard);

  return {
    route,
    nextAction: resolveGuardedNextAction(route, input.offerGuard),
    allowOffer: input.offerGuard.allowOffer,
    allowPrice: input.offerGuard.allowPrice,
    allowDemo: input.offerGuard.allowDemo,
  };
}

export function resolveGuardedRoute(route: AgentDecision["route"], guard: OfferGuard): AgentDecision["route"] {
  if (guard.allowOffer && route === "QUALIFY") return "PRESENT_OFFER";
  if (guard.nextAction === "CONTINUE_REGULAR_FLOW" || guard.allowOffer) return route;
  if (route === "DIRECT_ANSWER" || route === "HUMAN_HANDOFF" || route === "DISQUALIFY" || route === "FOLLOW_UP") return route;
  return "QUALIFY";
}

export function resolveGuardedNextAction(route: AgentDecision["route"], guard?: OfferGuard): AgentNextAction {
  if (route === "DIRECT_ANSWER") return "ANSWER_DIRECTLY";
  if (guard && guard.nextAction !== "CONTINUE_REGULAR_FLOW") return guard.nextAction;
  if (route === "PRESENT_OFFER") return "PRESENT_OFFER";
  if (route === "BOOKING") return "BOOKING";
  if (route === "FOLLOW_UP") return "FOLLOW_UP";
  if (route === "HUMAN_HANDOFF") return "HUMAN_HANDOFF";
  if (route === "DISQUALIFY") return "DISQUALIFY";
  return "ASK_QUALIFYING_QUESTION";
}

export function canUseBookingFlow(input: {
  route: AgentDecision["route"];
  offerGuard: OfferGuard;
}) {
  return input.route === "BOOKING" && input.offerGuard.allowDemo;
}
