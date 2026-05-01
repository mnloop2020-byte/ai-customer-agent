import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIncomingMessage } from "../src/domain/agent";
import { containsClosingCta } from "../src/domain/agent/discovery-policy";
import { validateFinalReply } from "../src/domain/agent/response-policy";
import { defaultCompanyProfile } from "../src/domain/company";
import { generateAgentReply } from "../src/lib/ai/provider";

const discoveryMessage = "مرحبًا، عندي شركة خدمات ونستقبل رسائل كثيرة من العملاء. كيف ممكن نظامكم يساعدنا؟";

test("first discovery turn asks for message volume instead of closing", () => {
  const decision = analyzeIncomingMessage({
    body: discoveryMessage,
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [],
  });

  assert.equal(decision.route, "QUALIFY");
  assert.equal(decision.nextAction, "ASK_MESSAGES_PER_DAY");
  assert.equal(decision.focusField, "messages_per_day");
  assert.match(decision.cta.prompt, /كم رسالة|رسالة تستقبلون/u);
  assert.equal(decision.response, "");
});

test("discovery validation rejects closing CTAs without generating a replacement reply", () => {
  const decision = analyzeIncomingMessage({
    body: discoveryMessage,
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [],
  });

  const validation = validateFinalReply({
    text: "أقدر أرتب لك Demo قصير. متى تتوقع البدء؟",
    decision,
  });

  assert.equal(validation.valid, false);
  assert.match(validation.violations.join(" "), /offer_or_price_before_allowed_stage/u);
});

test("generated discovery reply does not close early when provider is mock", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const decision = analyzeIncomingMessage({
      body: discoveryMessage,
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: [],
    });
    const reply = await generateAgentReply({
      customerMessage: discoveryMessage,
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: [],
    });

    assert.equal(containsClosingCta(reply.text), false);
    assert.match(reply.text, /تنظم|تنظيم|يسرّع|يسرع|متابعة/u);
    assert.match(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("unclear short replies ask for clarification instead of repeating discovery", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const history = [
      { sender: "CUSTOMER" as const, body: "السلام عليكم، حاب أعرف وش تقدمون بالضبط؟" },
      { sender: "AI" as const, body: "نظامنا يساعدكم في تنظيم رسائل العملاء وتسريع الردود. تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ];
    const decision = analyzeIncomingMessage({
      body: "ي",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: history,
    });
    const reply = await generateAgentReply({
      customerMessage: "ي",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: history,
    });

    assert.equal(decision.intent, "Unclear Reply");
    assert.equal(decision.route, "DIRECT_ANSWER");
    assert.match(reply.text, /ما فهمت قصدك/u);
    assert.doesNotMatch(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("direct no-question instruction is respected", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const message = "لا تطرح أي سؤال. فقط اشرح ماذا تقدمون.";
    const decision = analyzeIncomingMessage({
      body: message,
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: [],
    });
    const reply = await generateAgentReply({
      customerMessage: message,
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: [],
    });

    assert.equal(decision.intent, "Direct Explanation Request");
    assert.equal(decision.route, "DIRECT_ANSWER");
    assert.match(reply.text, /نظامًا يساعد الشركات|تنظيم رسائل العملاء/u);
    assert.equal((reply.text.match(/[؟?]/gu) ?? []).length, 0);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("discovery guard does not repeat the same question twice", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const history = [
      { sender: "CUSTOMER" as const, body: "السلام عليكم، وش تقدمون؟" },
      { sender: "AI" as const, body: "نظامنا يساعدكم في تنظيم رسائل العملاء. تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ];
    const decision = analyzeIncomingMessage({
      body: "سلام عليكم",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: history,
    });
    const reply = await generateAgentReply({
      customerMessage: "سلام عليكم",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: history,
    });

    assert.doesNotMatch(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("topic changes to location are answered directly without returning to discovery question", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const history = [
      { sender: "CUSTOMER" as const, body: "السلام عليكم، وش تقدمون؟" },
      { sender: "AI" as const, body: "نظامنا يساعدكم في تنظيم رسائل العملاء. تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ];
    const decision = analyzeIncomingMessage({
      body: "وين موقعكم؟",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: history,
    });
    const reply = await generateAgentReply({
      customerMessage: "وين موقعكم؟",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: history,
    });

    assert.equal(decision.intent, "Location Question");
    assert.equal(decision.route, "DIRECT_ANSWER");
    assert.match(reply.text, /موقعنا/u);
    assert.doesNotMatch(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("repeating the same customer message three times changes direction instead of repeating the same reply", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const message = "السلام عليكم، وش تقدمون؟";
    const history = [
      { sender: "CUSTOMER" as const, body: message },
      { sender: "AI" as const, body: "نظامنا يساعدكم في تنظيم رسائل العملاء. تقريبًا كم رسالة تستقبلون يوميًا؟" },
      { sender: "CUSTOMER" as const, body: message },
      { sender: "AI" as const, body: "أقدر أشرحها ببساطة: نرتب المحادثات ونسرع الردود." },
    ];
    const decision = analyzeIncomingMessage({
      body: message,
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: history,
    });
    const reply = await generateAgentReply({
      customerMessage: message,
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: history,
    });

    assert.match(reply.text, /أختصرها|النقطة نفسها|ينظم الرسائل/u);
    assert.doesNotMatch(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

function restoreProvider(previousProvider: string | undefined) {
  if (previousProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = previousProvider;
  }
}
