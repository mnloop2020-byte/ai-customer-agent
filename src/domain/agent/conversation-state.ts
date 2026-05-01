import type { AgentDecision, AskedField, QualificationStatus } from "@/domain/agent";

export type ConversationPhase =
  | "OPENING"
  | "DISCOVERY"
  | "QUALIFICATION"
  | "VALUE_BUILDING"
  | "OBJECTION_HANDLING"
  | "OFFER"
  | "CLOSING"
  | "FOLLOW_UP"
  | "HANDOFF"
  | "LOST";

export type ConversationMomentum = "ADVANCING" | "STALLED" | "AT_RISK" | "READY_TO_CLOSE";

export type ConversationState = {
  phase: ConversationPhase;
  momentum: ConversationMomentum;
  turnGoal: string;
  controlRule: string;
  lastCustomerSignal: string;
  shouldAdvance: boolean;
};

type ConversationMemory = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

type BuildConversationStateInput = {
  intent: string;
  route: AgentDecision["route"];
  qualificationStatus: QualificationStatus;
  missingFields: string[];
  focusField?: AskedField;
  history: ConversationMemory[];
  objectionType?: string;
  lostDeal?: boolean;
  bookingRequested: boolean;
};

export function buildConversationState(input: BuildConversationStateInput): ConversationState {
  const phase = determinePhase(input);
  const momentum = determineMomentum(input, phase);
  const shouldAdvance = momentum === "ADVANCING" || momentum === "READY_TO_CLOSE";

  return {
    phase,
    momentum,
    shouldAdvance,
    turnGoal: buildTurnGoal(input, phase),
    controlRule: buildControlRule(input, phase, momentum),
    lastCustomerSignal: buildLastCustomerSignal(input),
  };
}

function determinePhase(input: BuildConversationStateInput): ConversationPhase {
  if (input.lostDeal) return "LOST";
  if (input.route === "HUMAN_HANDOFF") return "HANDOFF";
  if (input.route === "BOOKING" || input.bookingRequested) return "CLOSING";
  if (input.route === "FOLLOW_UP") return "FOLLOW_UP";
  if (input.objectionType && input.objectionType !== "NONE") return "OBJECTION_HANDLING";
  if (input.route === "PRESENT_OFFER") return "OFFER";
  if (input.qualificationStatus === "QUALIFIED") return "VALUE_BUILDING";
  if (input.missingFields.length > 0) return "QUALIFICATION";
  if (input.intent === "Greeting") return "OPENING";
  return "DISCOVERY";
}

function determineMomentum(input: BuildConversationStateInput, phase: ConversationPhase): ConversationMomentum {
  const recentCustomerTurns = input.history.slice(-6).filter((message) => message.sender === "CUSTOMER");
  const shortReplies = recentCustomerTurns.filter((message) => normalize(message.body).split(" ").length <= 3).length;

  if (phase === "CLOSING") return "READY_TO_CLOSE";
  if (phase === "LOST" || phase === "HANDOFF") return "AT_RISK";
  if (phase === "OBJECTION_HANDLING") return input.objectionType === "PRICE" ? "AT_RISK" : "STALLED";
  if (shortReplies >= 2 && recentCustomerTurns.length >= 2) return "STALLED";
  if (input.qualificationStatus === "QUALIFIED" || input.route === "PRESENT_OFFER") return "ADVANCING";
  return "ADVANCING";
}

function buildTurnGoal(input: BuildConversationStateInput, phase: ConversationPhase) {
  if (phase === "OBJECTION_HANDLING") return "Resolve the objection without pressure and keep one clear next step.";
  if (phase === "QUALIFICATION") return `Collect one missing field only: ${input.focusField ?? input.missingFields[0] ?? "need"}.`;
  if (phase === "OFFER") return "Present only the best-fit offer and move toward a low-friction next step.";
  if (phase === "CLOSING") return "Confirm the booking or next sales action.";
  if (phase === "FOLLOW_UP") return "Re-open the decision with one useful question.";
  if (phase === "HANDOFF") return "Collect contact preference and route the conversation to a human.";
  if (phase === "LOST") return "Respect the decision and preserve a future re-engagement path.";
  return "Understand the customer need and move the conversation forward.";
}

function buildControlRule(
  input: BuildConversationStateInput,
  phase: ConversationPhase,
  momentum: ConversationMomentum,
) {
  if (momentum === "STALLED") return "Do not repeat the same question; reduce friction and ask for the smallest useful detail.";
  if (phase === "OBJECTION_HANDLING") return "Acknowledge once, answer the concern, then ask one forward-moving question.";
  if (input.focusField) return "Ask exactly one question for the focus field and wait for the answer.";
  if (phase === "OFFER") return "Do not list every plan; recommend one plan and give one next step.";
  return "Keep control with one clear next step and no extra questions.";
}

function buildLastCustomerSignal(input: BuildConversationStateInput) {
  if (input.objectionType && input.objectionType !== "NONE") return `Objection: ${input.objectionType}`;
  if (input.bookingRequested) return "Customer accepted or requested a booking.";
  if (input.missingFields.length > 0) return `Missing: ${input.missingFields.join(", ")}`;
  return `Intent: ${input.intent}`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
