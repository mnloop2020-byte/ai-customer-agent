import type { AgentDecision } from "@/domain/agent";
import type { ConversationState } from "@/domain/agent/conversation-state";
import type { PersonalizationStrategy } from "@/domain/agent/customer-context";
import type { ObjectionAnalysis } from "@/domain/agent/objection-engine";
import type { PredictionEngineResult } from "@/domain/agent/prediction-engine";

export type SalesPlaybookStep = {
  framework: "DISCOVERY" | "VALUE" | "OBJECTION" | "OFFER" | "CLOSE" | "FOLLOW_UP" | "HANDOFF";
  tone: "CALM" | "CONFIDENT" | "REASSURING" | "DIRECT";
  personalizationRequired: boolean;
  requiredFacts: string[];
  replyShape: string[];
  do: string[];
  avoid: string[];
};

type BuildSalesPlaybookInput = {
  route: AgentDecision["route"];
  intent: string;
  conversationState: ConversationState;
  objection: ObjectionAnalysis;
  prediction: PredictionEngineResult;
  hasRecommendedOffer: boolean;
  personalizationStrategy: PersonalizationStrategy;
};

export function buildSalesPlaybook(input: BuildSalesPlaybookInput): SalesPlaybookStep {
  const personalization = buildPersonalizationRules(input.personalizationStrategy);

  if (input.route === "HUMAN_HANDOFF") {
    return {
      framework: "HANDOFF",
      tone: "REASSURING",
      ...personalization,
      replyShape: ["Acknowledge", "Explain that a specialist will continue", "Ask for one contact preference if missing"],
      do: ["Make the handoff feel intentional and helpful", ...humanStyleDo, ...personalization.do],
      avoid: ["Do not keep selling after handoff is required", ...humanStyleAvoid, ...personalization.avoid],
    };
  }

  if (input.conversationState.phase === "OBJECTION_HANDLING") {
    return {
      framework: "OBJECTION",
      tone: "REASSURING",
      ...personalization,
      replyShape: ["Acknowledge the concern", "Reframe with one concrete value angle", "Ask one forward-moving question"],
      do: [input.objection.responseStrategy, input.prediction.recommendedPreventiveMove, ...humanStyleDo, ...personalization.do],
      avoid: ["Do not argue", "Do not discount before value is clear", "Do not ask multiple questions", ...humanStyleAvoid, ...personalization.avoid],
    };
  }

  if (input.route === "PRESENT_OFFER" || input.hasRecommendedOffer) {
    return {
      framework: "OFFER",
      tone: "CONFIDENT",
      ...personalization,
      replyShape: ["Summarize the fit in one sentence", "Present one recommended offer", "Give one next step"],
      do: ["Tie the offer to the customer's stated need", "Use one price only", ...humanStyleDo, ...personalization.do],
      avoid: ["Do not list every package", "Do not sound like a brochure", ...humanStyleAvoid, ...personalization.avoid],
    };
  }

  if (input.route === "BOOKING") {
    return {
      framework: "CLOSE",
      tone: "DIRECT",
      ...personalization,
      replyShape: ["Confirm readiness", "State the booking action", "Ask for one scheduling detail if needed"],
      do: ["Make the next action easy and concrete", ...humanStyleDo, ...personalization.do],
      avoid: ["Do not reopen earlier discovery unless critical information is missing", ...humanStyleAvoid, ...personalization.avoid],
    };
  }

  if (input.route === "FOLLOW_UP") {
    return {
      framework: "FOLLOW_UP",
      tone: "CALM",
      ...personalization,
      replyShape: ["Acknowledge", "Give a useful reason to continue", "Ask one small decision question"],
      do: ["Reduce pressure", "Keep the opportunity alive", ...humanStyleDo, ...personalization.do],
      avoid: ["Do not repeat the full pitch", ...humanStyleAvoid, ...personalization.avoid],
    };
  }

  if (["OPENING", "DISCOVERY", "QUALIFICATION"].includes(input.conversationState.phase)) {
    return {
      framework: "DISCOVERY",
      tone: "CALM",
      ...personalization,
      replyShape: ["Give one simple benefit", "Ask one operational qualification question", "Wait for the answer"],
      do: ["Ask for message volume or team size before timeline, demo, or closing", ...humanStyleDo, ...personalization.do],
      avoid: [
        "Do not ask when the customer wants to start",
        "Do not offer a demo",
        "Do not close before message volume and team size are known",
        ...humanStyleAvoid,
        ...personalization.avoid,
      ],
    };
  }

  return {
    framework: "VALUE",
    tone: "CALM",
    ...personalization,
    replyShape: ["Answer briefly if needed", "Use what is known", "Ask one clear qualification question"],
    do: ["Keep the conversation moving one step at a time", "Use simple language", ...humanStyleDo, ...personalization.do],
    avoid: ["Do not ask two questions", "Do not repeat the same meaning", "Do not give generic filler", ...humanStyleAvoid, ...personalization.avoid],
  };
}

const humanStyleDo = [
  "Write like a real person in live chat: warm, brief, and direct",
  "Use one concrete next step instead of broad marketing language",
];

const humanStyleAvoid = [
  "Do not mention AI, system, policy, analysis, context, route, or score",
  "Do not sound like a technical report or FAQ article",
];

function buildPersonalizationRules(strategy: PersonalizationStrategy) {
  return {
    personalizationRequired: strategy.requirePersonalization,
    requiredFacts: strategy.mustMentionFacts,
    do: strategy.requirePersonalization
      ? [
          `Use at least one customer fact: ${strategy.mustMentionFacts.join(" | ")}`,
          strategy.valueBridge ?? "Connect the customer fact to value, pain, or the next step.",
        ]
      : [],
    avoid: strategy.requirePersonalization
      ? ["Do not give a generic value statement without customer facts", "Do not ignore the customer's numbers or pain points"]
      : [],
  };
}
