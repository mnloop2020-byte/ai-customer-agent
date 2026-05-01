import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIncomingMessage } from "../src/domain/agent";
import { defaultCompanyProfile } from "../src/domain/company";
import { generateAgentReply } from "../src/lib/ai/provider";

const baseLead = {
  score: 35,
  status: "QUALIFYING",
  customerType: "BUSINESS" as const,
  needsSummary: "شركة خدمات تستقبل رسائل كثيرة من العملاء",
};

const valueHistory = [
  { sender: "CUSTOMER" as const, body: "مرحبًا، عندي شركة خدمات ونستقبل رسائل كثيرة من العملاء. كيف ممكن نظامكم يساعدنا؟" },
  { sender: "AI" as const, body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
  { sender: "CUSTOMER" as const, body: "نستقبل تقريبًا 80 رسالة يوميًا" },
  { sender: "AI" as const, body: "كم شخص يرد على رسائل العملاء حاليًا؟" },
  { sender: "CUSTOMER" as const, body: "حاليًا شخصين يردون" },
  { sender: "AI" as const, body: "هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟" },
];

test("value stage explains the solution before any offer", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const decision = analyzeIncomingMessage({
      body: "نعم عندنا تأخير وقت الزحمة",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: valueHistory,
      leadSnapshot: baseLead,
    });
    const reply = await generateAgentReply({
      customerMessage: "نعم عندنا تأخير وقت الزحمة",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: valueHistory,
    });

    assert.equal(decision.nextAction, "EXPLAIN_VALUE");
    assert.equal(decision.allowOffer, false);
    assert.equal(decision.problemConfirmed, true);
    assert.match(reply.text, /يرتب المحادثات|الأسئلة المتكررة|العملاء الجاهزين/u);
    assert.doesNotMatch(reply.text, /السعر|باقة|Demo|100\$|300\$/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("offer becomes allowed only after value priority is captured", () => {
  const decision = analyzeIncomingMessage({
    body: "سرعة الرد أهم شيء",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [
      ...valueHistory,
      { sender: "CUSTOMER" as const, body: "نعم عندنا تأخير وقت الزحمة" },
      {
        sender: "AI" as const,
        body: "الحل هنا يرتب المحادثات ويقلل الضغط والتكرار. أي أولوية أهم لكم الآن: سرعة الرد، تقليل الضغط، أو تقليل التكرار؟",
      },
    ],
    leadSnapshot: { ...baseLead, decisionMaker: true },
  });

  assert.equal(decision.problemConfirmed, true);
  assert.equal(decision.valueExplained, true);
  assert.equal(decision.valuePriority, "speed");
  assert.equal(decision.allowOffer, true);
  assert.equal(decision.nextAction, "PRESENT_VALUE_OR_OFFER");
  assert.equal(decision.route, "PRESENT_OFFER");
});

test("message volume numbers are not treated as budget", () => {
  const decision = analyzeIncomingMessage({
    body: "نستقبل تقريبًا 80 رسالة يوميًا",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [],
    leadSnapshot: baseLead,
  });

  assert.equal(decision.profileUpdates.budget, undefined);
});

function restoreProvider(previousProvider: string | undefined) {
  if (previousProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = previousProvider;
  }
}
