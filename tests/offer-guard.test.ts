import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIncomingMessage } from "../src/domain/agent";
import { defaultCompanyProfile } from "../src/domain/company";
import { generateAgentReply } from "../src/lib/ai/provider";

const history = [
  { sender: "CUSTOMER" as const, body: "نستقبل تقريبًا 80 رسالة يوميًا" },
  { sender: "AI" as const, body: "كم شخص يرد على رسائل العملاء حاليًا؟" },
];

test("offer guard blocks price and package before the problem is confirmed", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const decision = analyzeIncomingMessage({
      body: "حاليًا شخصين يردون",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: history,
    });

    assert.equal(decision.messagesPerDay, 80);
    assert.equal(decision.teamSize, 2);
    assert.equal(decision.problemConfirmed, false);
    assert.equal(decision.allowOffer, false);
    assert.equal(decision.allowPrice, false);
    assert.equal(decision.allowDemo, false);
    assert.equal(decision.nextAction, "CONFIRM_PROBLEM");
    assert.equal(decision.recommendedOffer, undefined);
    assert.match(decision.cta.prompt, /هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟/u);

    const reply = await generateAgentReply({
      customerMessage: "حاليًا شخصين يردون",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: history,
    });

    assert.doesNotMatch(reply.text, /السعر|باقة|Demo|نبدأ|شراء|100\$|300\$|تبدأ من/u);
    assert.match(reply.text, /80 رسالة يوميًا/u);
    assert.match(reply.text, /شخصين يردون/u);
    assert.match(reply.text, /هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("solo responder answer moves to value instead of asking another pressure question", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const soloHistory = [
      { sender: "CUSTOMER" as const, body: "حوالي 15 رسالة يوميًا" },
      { sender: "AI" as const, body: "كم شخص يرد على رسائل العملاء حاليًا؟" },
    ];
    const decision = analyzeIncomingMessage({
      body: "أنا أرد عليهم بنفسي حاليًا",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: soloHistory,
    });

    assert.equal(decision.messagesPerDay, 15);
    assert.equal(decision.teamSize, 1);
    assert.equal(decision.problemConfirmed, true);
    assert.equal(decision.nextAction, "EXPLAIN_VALUE");

    const reply = await generateAgentReply({
      customerMessage: "أنا أرد عليهم بنفسي حاليًا",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: soloHistory,
    });

    assert.match(reply.text, /15 رسالة يوميًا/u);
    assert.match(reply.text, /شخص واحد يرد/u);
    assert.match(reply.text, /يوفر وقتك|يرتب الأسئلة المتكررة|طريقة البدء/u);
    assert.doesNotMatch(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
    assert.doesNotMatch(reply.text, /هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟/u);
    assert.doesNotMatch(reply.text, /استخدم معلومة العميل|اربط الرد/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("short solo answer after team-size question moves to value stage", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const soloHistory = [
      { sender: "CUSTOMER" as const, body: "30 رسالة" },
      {
        sender: "AI" as const,
        body: "مع 30 رسالة يوميًا، النظام يساعدك تنظم الردود وتوفر وقتك. هل ترد على العملاء بنفسك حاليًا أم عندك فريق؟",
      },
    ];
    const decision = analyzeIncomingMessage({
      body: "بنفسي",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: soloHistory,
    });

    assert.equal(decision.messagesPerDay, 30);
    assert.equal(decision.teamSize, 1);
    assert.equal(decision.problemConfirmed, true);
    assert.equal(decision.nextAction, "EXPLAIN_VALUE");

    const reply = await generateAgentReply({
      customerMessage: "بنفسي",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: soloHistory,
    });

    assert.match(reply.text, /30 رسالة يوميًا/u);
    assert.match(reply.text, /شخص واحد يرد/u);
    assert.match(reply.text, /يوفر وقتك|يرتب|الأسئلة المتكررة|طريقة البدء/u);
    assert.doesNotMatch(reply.text, /صاحب عمل صغير|تعمل بمفردك|ترد بنفسك|عندك فريق|كم شخص/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("message count answer generates value and moves to team-size question without fallback", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const decision = analyzeIncomingMessage({
      body: "حوالي 15 رسالة يوميًا",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: [
        { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
      ],
    });

    const reply = await generateAgentReply({
      customerMessage: "حوالي 15 رسالة يوميًا",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: [
        { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
      ],
    });

    assert.equal(decision.intent, "General Inquiry");
    assert.equal(decision.messagesPerDay, 15);
    assert.equal(decision.nextAction, "ASK_TEAM_SIZE");
    assert.doesNotMatch(reply.text, /خلني أوضح لك بشكل أبسط/u);
    assert.doesNotMatch(reply.text, /تقريبًا كم رسالة تستقبلون يوميًا/u);
    assert.match(reply.text, /15 رسالة يوميًا/u);
    assert.match(reply.text, /تنظم الردود|توفر وقتك|عدد مناسب للبدء/u);
    assert.match(reply.text, /ترد على العملاء بنفسك|عندك فريق/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("short numeric answer is understood as message count when last question asked message volume", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const history = [
      { sender: "AI" as const, body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ];
    const decision = analyzeIncomingMessage({
      body: "15",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: history,
    });
    const reply = await generateAgentReply({
      customerMessage: "15",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: history,
    });

    assert.notEqual(decision.intent, "Unclear Reply");
    assert.equal(decision.messagesPerDay, 15);
    assert.equal(decision.nextAction, "ASK_TEAM_SIZE");
    assert.doesNotMatch(reply.text, /خلني أوضح لك بشكل أبسط|ما فهمت قصدك/u);
    assert.match(reply.text, /15 رسالة يوميًا/u);
    assert.match(reply.text, /ترد على العملاء بنفسك|عندك فريق/u);
  } finally {
    restoreProvider(previousProvider);
  }
});

test("customer debug question gets a direct human-safe explanation from LLM output", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const decision = analyzeIncomingMessage({
      body: "هل تعتمد في ردك على مصادر المعرفة؟ وما هي المعلومات التي استخدمتها؟ ولماذا اخترت هذا السؤال تحديدًا؟",
      channel: "WEB_CHAT",
      companyProfile: defaultCompanyProfile,
      conversationHistory: [
        { sender: "CUSTOMER", body: "حوالي 15 رسالة يوميًا" },
        { sender: "CUSTOMER", body: "أنا أرد عليهم بنفسي حاليًا" },
      ],
    });

    const reply = await generateAgentReply({
      customerMessage: "هل تعتمد في ردك على مصادر المعرفة؟ وما هي المعلومات التي استخدمتها؟ ولماذا اخترت هذا السؤال تحديدًا؟",
      companyProfile: defaultCompanyProfile,
      decision,
      conversationHistory: [
        { sender: "CUSTOMER", body: "حوالي 15 رسالة يوميًا" },
        { sender: "CUSTOMER", body: "أنا أرد عليهم بنفسي حاليًا" },
      ],
    });

    assert.equal(decision.intent, "Answer Reason Question");
    assert.equal(decision.route, "DIRECT_ANSWER");
    assert.equal(decision.response, "");
    assert.match(reply.text, /معلومات الشركة المعتمدة/u);
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
