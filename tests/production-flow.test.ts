import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIncomingMessage } from "../src/domain/agent";
import { buildCustomerContext } from "../src/domain/agent/customer-context";
import { resolveDecisionEngine } from "../src/domain/agent/decision-engine";
import { assessSmartEscalation } from "../src/domain/agent/escalation-engine";
import { analyzeObjection } from "../src/domain/agent/objection-engine";
import { buildOfferGuard } from "../src/domain/agent/offer-guard";
import { defaultCompanyProfile } from "../src/domain/company";
import { generateAgentReply } from "../src/lib/ai/provider";
import { classifySemanticIntent } from "../src/lib/ai/semantic-intent-classifier";

const lead = {
  score: 35,
  status: "QUALIFYING",
  customerType: "BUSINESS" as const,
  needsSummary: "شركة خدمات تستقبل رسائل كثيرة من العملاء",
};

test("production flow asks the right question at each early stage without decision templates", () => {
  const first = analyzeIncomingMessage({
    body: "مرحبًا، عندي شركة خدمات ونستقبل رسائل كثيرة من العملاء. كيف ممكن نظامكم يساعدنا؟",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [],
    leadSnapshot: lead,
  });

  assert.equal(first.nextAction, "ASK_MESSAGES_PER_DAY");
  assert.equal(first.allowOffer, false);
  assert.equal(first.response, "");
  assert.doesNotMatch(first.cta.prompt, /السعر|باقة|Demo|متى تتوقع البدء|نرتب/u);
  assert.match(first.cta.prompt, /كم رسالة|رسالة تستقبل/u);

  const afterMessages = analyzeIncomingMessage({
    body: "نستقبل تقريبًا 80 رسالة يوميًا",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [
      { sender: "CUSTOMER" as const, body: "مرحبًا، عندي شركة خدمات ونستقبل رسائل كثيرة من العملاء. كيف ممكن نظامكم يساعدنا؟" },
      { sender: "AI" as const, body: first.cta.prompt },
    ],
    leadSnapshot: lead,
  });

  assert.equal(afterMessages.messagesPerDay, 80);
  assert.equal(afterMessages.nextAction, "ASK_TEAM_SIZE");
  assert.equal(afterMessages.response, "");
  assert.match(afterMessages.cta.prompt, /كم شخص يرد/u);
  assert.doesNotMatch(afterMessages.cta.prompt, /السعر|باقة|Demo/u);
});

test("decision engine keeps offer blocked until value priority is known", () => {
  const history = [
    { sender: "CUSTOMER" as const, body: "نستقبل تقريبًا 80 رسالة يوميًا" },
    { sender: "CUSTOMER" as const, body: "حاليًا شخصين يردون" },
  ];
  const context = buildCustomerContext({
    currentMessage: "نعم عندنا ضغط وتأخير وقت الزحمة",
    history,
    objectionType: "NONE",
    phase: "DISCOVERY",
  });
  const guard = buildOfferGuard({
    customerContext: context,
    conversationStage: "DISCOVERY",
    history,
    currentMessage: "نعم عندنا ضغط وتأخير وقت الزحمة",
    active: true,
  });
  const decision = resolveDecisionEngine({ initialRoute: "PRESENT_OFFER", offerGuard: guard });

  assert.equal(decision.route, "QUALIFY");
  assert.equal(decision.nextAction, "EXPLAIN_VALUE");
  assert.equal(decision.allowOffer, false);
  assert.equal(decision.allowPrice, false);
  assert.equal(decision.allowDemo, false);
});

test("stage memory preserves known facts and prevents returning to qualification", () => {
  const decision = analyzeIncomingMessage({
    body: "تمام",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [],
    leadSnapshot: {
      ...lead,
      agentMemory: {
        conversationStage: "VALUE_BUILDING",
        nextAction: "EXPLAIN_VALUE",
        messagesPerDay: 30,
        teamSize: 1,
        problemConfirmed: true,
        valueExplained: false,
      },
    },
  });

  assert.equal(decision.messagesPerDay, 30);
  assert.equal(decision.teamSize, 1);
  assert.equal(decision.problemConfirmed, true);
  assert.equal(decision.nextAction, "EXPLAIN_VALUE");
  assert.equal(decision.conversationStage, "VALUE_BUILDING");
  assert.equal(decision.stageMemory.messagesPerDay, 30);
  assert.equal(decision.stageMemory.teamSize, 1);
});

test("direct price question answers without changing advanced stage memory", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const decision = analyzeIncomingMessage({
      body: "\u0643\u0645 \u0627\u0644\u0633\u0639\u0631\u061F",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: [],
      leadSnapshot: {
        ...lead,
        agentMemory: {
          conversationStage: "VALUE_BUILDING",
          nextAction: "EXPLAIN_VALUE",
          messagesPerDay: 30,
          teamSize: 1,
          problemConfirmed: true,
          valueExplained: false,
        },
      },
    });

    const reply = await generateAgentReply({
      customerMessage: "\u0643\u0645 \u0627\u0644\u0633\u0639\u0631\u061F",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: [],
    });

    assert.equal(decision.intent, "Price Inquiry");
    assert.equal(decision.directAnswerIntent, "ASK_PRICE");
    assert.equal(decision.route, "DIRECT_ANSWER");
    assert.equal(decision.nextAction, "ANSWER_DIRECTLY");
    assert.equal(decision.conversationStage, "VALUE_BUILDING");
    assert.equal(decision.stageMemory.nextAction, "EXPLAIN_VALUE");
    assert.equal(decision.allowPrice, true);
    assert.match(reply.text, /100\$|300\$/u);
    assert.doesNotMatch(reply.text, /\u0643\u0645 \u0631\u0633\u0627\u0644\u0629/u);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = previousProvider;
    }
  }
});

test("direct Arabic questions use intent override before question flow", async () => {
  const cases = [
    {
      body: "\u0648\u064a\u0646 \u062a\u0642\u062f\u0645\u0648\u0646\u061f",
      intent: "Location Question",
      direct: "ASK_LOCATION",
    },
    {
      body: "\u0643\u064a\u0641 \u064a\u0634\u062a\u063a\u0644 \u0627\u0644\u0646\u0638\u0627\u0645\u061f",
      intent: "Capabilities Question",
      direct: "ASK_HOW_IT_WORKS",
    },
    {
      body: "\u0623\u062d\u062a\u0627\u062c \u0639\u0631\u0636 \u0633\u0639\u0631",
      intent: "Quote Request",
      direct: "ASK_QUOTE",
    },
    {
      body: "\u0643\u0645 \u0627\u0644\u0633\u0639\u0631\u061f",
      intent: "Price Inquiry",
      direct: "ASK_PRICE",
    },
  ] as const;

  for (const item of cases) {
    const decision = analyzeIncomingMessage({
      body: item.body,
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: [],
      leadSnapshot: {
        ...lead,
        agentMemory: {
          conversationStage: "VALUE_BUILDING",
          nextAction: "EXPLAIN_VALUE",
          messagesPerDay: 30,
          teamSize: 1,
          problemConfirmed: true,
        },
      },
    });

    assert.equal(decision.intent, item.intent);
    assert.equal(decision.directAnswerIntent, item.direct);
    assert.equal(decision.route, "DIRECT_ANSWER");
    assert.equal(decision.nextAction, "ANSWER_DIRECTLY");
    assert.equal(decision.conversationStage, "VALUE_BUILDING");
    assert.equal(decision.stageMemory.nextAction, "EXPLAIN_VALUE");
  }
});

test("semantic intent classifier supports multi-intent direct questions", async () => {
  const semanticIntent = await classifySemanticIntent({
    customerMessage: "\u0643\u0645 \u0627\u0644\u0633\u0639\u0631 \u0648\u0647\u0644 \u064a\u0634\u062a\u063a\u0644 \u0645\u0639 \u0648\u0627\u062a\u0633\u0627\u0628\u061f",
    conversationHistory: [],
    currentStage: "VALUE_BUILDING",
  });
  const intents = semanticIntent.intents.map((item) => item.intent);

  assert.ok(intents.includes("ASK_PRICE"));
  assert.ok(intents.includes("ASK_SERVICE") || intents.includes("ASK_HOW_IT_WORKS"));

  const decision = analyzeIncomingMessage({
    body: "\u0643\u0645 \u0627\u0644\u0633\u0639\u0631 \u0648\u0647\u0644 \u064a\u0634\u062a\u063a\u0644 \u0645\u0639 \u0648\u0627\u062a\u0633\u0627\u0628\u061f",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [],
    semanticIntent,
    leadSnapshot: {
      ...lead,
      agentMemory: {
        conversationStage: "VALUE_BUILDING",
        nextAction: "EXPLAIN_VALUE",
        messagesPerDay: 30,
        teamSize: 1,
        problemConfirmed: true,
      },
    },
  });

  assert.equal(decision.route, "DIRECT_ANSWER");
  assert.equal(decision.nextAction, "ANSWER_DIRECTLY");
  assert.ok(decision.directAnswerIntents.includes("ASK_PRICE"));
  assert.ok(decision.directAnswerIntents.includes("ASK_SERVICE") || decision.directAnswerIntents.includes("ASK_HOW_IT_WORKS"));
  assert.equal(decision.conversationStage, "VALUE_BUILDING");
  assert.equal(decision.stageMemory.nextAction, "EXPLAIN_VALUE");
});

test("smart escalation escalates explicit human needs but not early price objections", () => {
  const explicitHuman = assessSmartEscalation({
    intent: "Human Request",
    score: 15,
    stage: "DISCOVERY",
    route: "HUMAN_HANDOFF",
    objection: analyzeObjection("أريد التواصل مع مندوب"),
    handoffReason: "Customer explicitly requested a human representative.",
    problemConfirmed: false,
  });

  assert.equal(explicitHuman.shouldEscalate, true);

  const earlyPrice = assessSmartEscalation({
    intent: "Objection",
    score: 40,
    stage: "DISCOVERY",
    route: "QUALIFY",
    objection: analyzeObjection("السعر غالي"),
    problemConfirmed: false,
  });

  assert.equal(earlyPrice.shouldEscalate, false);
});
