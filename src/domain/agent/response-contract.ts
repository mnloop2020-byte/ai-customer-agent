export type ResponseContractRoute =
  | "DIRECT_ANSWER"
  | "QUALIFICATION"
  | "VALUE_BUILDING"
  | "OFFER"
  | "OBJECTION"
  | "START"
  | "HANDOFF"
  | "SAFE_CLARIFY";

export type ResponseRequirement =
  | "greeting"
  | "identity"
  | "price"
  | "quote"
  | "location"
  | "service"
  | "how_it_works"
  | "whatsapp"
  | "qualification_question"
  | "value"
  | "offer"
  | "objection"
  | "start_cta"
  | "clarification"
  | "custom_quote_handoff";

export type ResponseForbidden =
  | "ignore_question"
  | "value_only"
  | "value_pitch"
  | "qualification_question"
  | "price"
  | "offer"
  | "demo"
  | "stage_regression"
  | "internal_labels"
  | "repeat_question"
  | "multiple_questions";

export type AgentResponseContract = {
  route: ResponseContractRoute;
  intents: string[];
  mustAnswer: ResponseRequirement[];
  forbidden: ResponseForbidden[];
  stageChangeAllowed: boolean;
  nextAction: string;
  responseGoal: string;
  maxQuestions: number;
  notes: string[];
};

type BuildContractInput = {
  customerMessage: string;
  intent: string;
  directAnswerIntents: string[];
  route: string;
  nextAction: string;
  conversationStage: string;
  allowOffer: boolean;
  allowPrice: boolean;
  allowDemo: boolean;
  missingFields: string[];
  problemConfirmed: boolean;
  valueExplained: boolean;
  objectionType: string;
};

export function buildResponseContract(input: BuildContractInput): AgentResponseContract {
  const mustAnswer = new Set<ResponseRequirement>();
  const forbidden = new Set<ResponseForbidden>(["internal_labels", "multiple_questions"]);
  const intents = [...new Set([input.intent, ...input.directAnswerIntents].filter(Boolean))];
  const directRequirements = directAnswerRequirements(input.directAnswerIntents, input.customerMessage);

  if (directRequirements.length) {
    directRequirements.forEach((requirement) => mustAnswer.add(requirement));
    forbidden.add("ignore_question");
    forbidden.add("value_only");
    forbidden.add("stage_regression");
    forbidden.add("qualification_question");

    return contract({
      route: input.intent === "Custom Quote" ? "HANDOFF" : "DIRECT_ANSWER",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: false,
      nextAction: "ANSWER_DIRECTLY",
      responseGoal: "answer the customer's direct question first",
      maxQuestions: 0,
      notes: ["Direct questions are temporary overrides. They must not change stage memory."],
    });
  }

  if (input.intent === "Greeting" && input.route === "DIRECT_ANSWER") {
    mustAnswer.add("greeting");
    forbidden.add("value_pitch");
    forbidden.add("qualification_question");

    return contract({
      route: "DIRECT_ANSWER",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: false,
      nextAction: "ANSWER_DIRECTLY",
      responseGoal: "reply naturally to the greeting only",
      maxQuestions: 0,
      notes: ["Pure greetings should not start qualification by themselves."],
    });
  }

  if (input.intent === "Identity Question") {
    mustAnswer.add("identity");
    forbidden.add("qualification_question");

    return contract({
      route: "DIRECT_ANSWER",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: false,
      nextAction: "ANSWER_DIRECTLY",
      responseGoal: "answer who the assistant is",
      maxQuestions: 0,
      notes: ["Do not turn identity questions into discovery."],
    });
  }

  if (input.intent === "Direct Explanation Request") {
    mustAnswer.add("service");
    mustAnswer.add("how_it_works");
    forbidden.add("qualification_question");

    return contract({
      route: "DIRECT_ANSWER",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: false,
      nextAction: "ANSWER_DIRECTLY",
      responseGoal: "explain the service without asking a question",
      maxQuestions: 0,
      notes: ["Customer explicitly asked not to be questioned."],
    });
  }

  if (input.intent === "Unclear Reply") {
    mustAnswer.add("clarification");

    return contract({
      route: "SAFE_CLARIFY",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: false,
      nextAction: "ANSWER_DIRECTLY",
      responseGoal: "ask for a small clarification",
      maxQuestions: 1,
      notes: ["Use a simple clarification only; do not restart discovery."],
    });
  }

  if (input.route === "HUMAN_HANDOFF" || input.intent === "Custom Quote" || mentionsCustomQuote(input.customerMessage)) {
    mustAnswer.add("custom_quote_handoff");
    forbidden.add("qualification_question");

    return contract({
      route: "HANDOFF",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: true,
      nextAction: "HUMAN_HANDOFF",
      responseGoal: "handoff to a human with a clear reason",
      maxQuestions: 0,
      notes: ["Use handoff only when the customer asked for direct contact, billing, or custom work."],
    });
  }

  if (input.intent === "Booking Intent" || input.route === "BOOKING" || input.nextAction === "BOOKING") {
    mustAnswer.add("start_cta");

    return contract({
      route: "START",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: true,
      nextAction: "BOOKING",
      responseGoal: "give a clear next step to start",
      maxQuestions: 1,
      notes: ["Closing is allowed only after the decision owner selected BOOKING."],
    });
  }

  if (input.objectionType !== "NONE" || input.intent === "Objection") {
    mustAnswer.add("objection");
    mustAnswer.add("value");
    if (!input.allowPrice) forbidden.add("price");
    if (!input.allowOffer) forbidden.add("offer");

    return contract({
      route: "OBJECTION",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: true,
      nextAction: input.nextAction,
      responseGoal: "handle the objection and connect it to value",
      maxQuestions: 1,
      notes: ["Do not ignore objections or answer with a generic slogan."],
    });
  }

  if (input.nextAction === "ASK_MESSAGES_PER_DAY" || input.nextAction === "ASK_TEAM_SIZE" || input.nextAction === "CONFIRM_PROBLEM") {
    mustAnswer.add("value");
    mustAnswer.add("qualification_question");
    forbidden.add("price");
    forbidden.add("offer");
    forbidden.add("demo");

    return contract({
      route: "QUALIFICATION",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: true,
      nextAction: input.nextAction,
      responseGoal: "move the conversation one qualification step forward",
      maxQuestions: 1,
      notes: ["Ask only the single question required by nextAction."],
    });
  }

  if (input.nextAction === "EXPLAIN_VALUE") {
    mustAnswer.add("value");
    if (!input.allowPrice) forbidden.add("price");
    if (!input.allowOffer) forbidden.add("offer");
    if (!input.allowDemo) forbidden.add("demo");

    return contract({
      route: "VALUE_BUILDING",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: true,
      nextAction: "EXPLAIN_VALUE",
      responseGoal: "explain practical value using known customer facts",
      maxQuestions: 1,
      notes: ["Do not go backward to already answered discovery questions."],
    });
  }

  if (input.route === "PRESENT_OFFER" || input.nextAction === "PRESENT_VALUE_OR_OFFER" || input.nextAction === "PRESENT_OFFER") {
    mustAnswer.add("offer");
    mustAnswer.add("value");

    return contract({
      route: "OFFER",
      intents,
      mustAnswer,
      forbidden,
      stageChangeAllowed: true,
      nextAction: input.nextAction,
      responseGoal: "present only the relevant offer",
      maxQuestions: 1,
      notes: ["Offer is allowed because qualification and value gates passed."],
    });
  }

  mustAnswer.add("service");

  return contract({
    route: "DIRECT_ANSWER",
    intents,
    mustAnswer,
    forbidden,
    stageChangeAllowed: false,
    nextAction: "ANSWER_DIRECTLY",
    responseGoal: "answer the latest customer message directly",
    maxQuestions: 1,
    notes: ["Default contract: do not force a sales flow when intent is not clear."],
  });
}

function directAnswerRequirements(intents: string[], customerMessage: string): ResponseRequirement[] {
  const requirements = new Set<ResponseRequirement>();

  intents.forEach((intent) => {
    if (intent === "ASK_PRICE") requirements.add("price");
    if (intent === "ASK_QUOTE") requirements.add("quote");
    if (intent === "ASK_LOCATION") requirements.add("location");
    if (intent === "ASK_SERVICE") requirements.add("service");
    if (intent === "ASK_HOW_IT_WORKS") requirements.add("how_it_works");
  });

  if (mentionsWhatsapp(customerMessage)) requirements.add("whatsapp");

  return [...requirements];
}

function mentionsWhatsapp(message: string) {
  return /whats\s*app|whatsapp|واتساب|واتس|wats/iu.test(message);
}

function mentionsCustomQuote(message: string) {
  return /عرض\s+خاص|عرض\s+مخصص|سعر\s+مخصص|مشروع\s+كبير|مشروع\s+خاص|حل\s+خاص/iu.test(message);
}

function contract(input: {
  route: ResponseContractRoute;
  intents: string[];
  mustAnswer: Set<ResponseRequirement>;
  forbidden: Set<ResponseForbidden>;
  stageChangeAllowed: boolean;
  nextAction: string;
  responseGoal: string;
  maxQuestions: number;
  notes: string[];
}): AgentResponseContract {
  return {
    route: input.route,
    intents: input.intents,
    mustAnswer: [...input.mustAnswer],
    forbidden: [...input.forbidden],
    stageChangeAllowed: input.stageChangeAllowed,
    nextAction: input.nextAction,
    responseGoal: input.responseGoal,
    maxQuestions: input.maxQuestions,
    notes: input.notes,
  };
}
