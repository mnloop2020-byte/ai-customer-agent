import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIncomingMessage } from "../src/domain/agent";
import type { AgentStageMemory } from "../src/domain/agent/stage-memory";
import { defaultCompanyProfile } from "../src/domain/company";
import { generateAgentReply } from "../src/lib/ai/provider";
import { classifySemanticIntent } from "../src/lib/ai/semantic-intent-classifier";

type HistoryMessage = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

const baseLead = {
  score: 25,
  status: "NEW",
  customerType: "BUSINESS" as const,
  needsSummary: "شركة تحتاج تنظيم محادثات العملاء",
};

test("response contract handles essential customer turns without route leakage", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";

  try {
    const greeting = await runContractTurn("السلام عليكم", []);
    assert.equal(greeting.decision.responseContract.route, "DIRECT_ANSWER");
    assert.deepEqual(greeting.decision.responseContract.mustAnswer, ["greeting"]);
    assert.doesNotMatch(greeting.reply.text, /كم رسالة|السعر|باقة/u);

    const casualGreeting = await runContractTurn("سلام وعليكم", []);
    assert.equal(casualGreeting.decision.intent, "Greeting");
    assert.deepEqual(casualGreeting.decision.responseContract.mustAnswer, ["greeting"]);
    assert.doesNotMatch(casualGreeting.reply.text, /اكتب لي|تحسينه|كم رسالة|السعر|باقة/u);

    const identity = await runContractTurn("ما اسمك؟", []);
    assert.equal(identity.decision.responseContract.route, "DIRECT_ANSWER");
    assert.ok(identity.decision.responseContract.mustAnswer.includes("identity"));
    assert.match(identity.reply.text, /مساعد|MNtechnique/u);

    const count = await runContractTurn("50", [
      { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ]);
    assert.equal(count.decision.messagesPerDay, 50);
    assert.equal(count.decision.responseContract.route, "QUALIFICATION");
    assert.equal(count.decision.responseContract.nextAction, "ASK_TEAM_SIZE");
    assert.match(count.reply.text, /50 رسالة يوميًا|ترد على العملاء بنفسك|عندك فريق/u);
    assert.doesNotMatch(count.reply.text, /خلني أوضح لك بشكل أبسط/u);

    const multi = await runContractTurn("كم السعر وهل يشتغل مع واتساب؟", [], {
      conversationStage: "VALUE_BUILDING",
      nextAction: "EXPLAIN_VALUE",
      messagesPerDay: 50,
      teamSize: 1,
      problemConfirmed: true,
    });
    assert.equal(multi.decision.responseContract.route, "DIRECT_ANSWER");
    assert.ok(multi.decision.responseContract.mustAnswer.includes("price"));
    assert.ok(multi.decision.responseContract.mustAnswer.includes("whatsapp"));
    assert.match(multi.reply.text, /100\$|300\$/u);
    assert.match(multi.reply.text, /واتساب/u);
    assert.equal(multi.decision.stageMemory.nextAction, "EXPLAIN_VALUE");

    const location = await runContractTurn("وين تقدمون؟", [], {
      conversationStage: "VALUE_BUILDING",
      nextAction: "EXPLAIN_VALUE",
      messagesPerDay: 50,
      teamSize: 1,
      problemConfirmed: true,
    });
    assert.equal(location.decision.responseContract.route, "DIRECT_ANSWER");
    assert.ok(location.decision.responseContract.mustAnswer.includes("location"));
    assert.match(location.reply.text, /موقعنا|اسطنبول|تركيا/u);

    const how = await runContractTurn("كيف يشتغل النظام؟", []);
    assert.equal(how.decision.responseContract.route, "DIRECT_ANSWER");
    assert.ok(how.decision.responseContract.mustAnswer.includes("how_it_works"));
    assert.match(how.reply.text, /ينظم|المحادثات|الأسئلة المتكررة/u);

    const objection = await runContractTurn("غالي", [], {
      conversationStage: "VALUE_BUILDING",
      nextAction: "EXPLAIN_VALUE",
      messagesPerDay: 50,
      teamSize: 1,
      problemConfirmed: true,
    });
    assert.equal(objection.decision.responseContract.route, "OBJECTION");
    assert.ok(objection.decision.responseContract.mustAnswer.includes("objection"));
    assert.match(objection.reply.text, /أتفهم|السعر|الضغط|الوقت/u);

    const start = await runContractTurn("أبي أبدأ", [], {
      conversationStage: "VALUE_BUILDING",
      nextAction: "PRESENT_VALUE_OR_OFFER",
      messagesPerDay: 50,
      teamSize: 1,
      problemConfirmed: true,
      valueExplained: true,
    });
    assert.match(start.reply.text, /نبدأ|خطوة|البدء/u);

    const customQuote = await runContractTurn("عندي مشروع كبير وأبي عرض خاص", []);
    assert.equal(customQuote.decision.responseContract.route, "HANDOFF");
    assert.ok(customQuote.decision.responseContract.mustAnswer.includes("custom_quote_handoff"));
    assert.match(customQuote.reply.text, /مندوب|تواصل|أحوّل/u);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = previousProvider;
    }
  }
});

async function runContractTurn(body: string, conversationHistory: HistoryMessage[], agentMemory?: AgentStageMemory) {
  const semanticIntent = await classifySemanticIntent({
    customerMessage: body,
    conversationHistory,
    currentStage: agentMemory?.conversationStage,
    agentMemory,
  });
  const decision = analyzeIncomingMessage({
    body,
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    semanticIntent,
    conversationHistory,
    leadSnapshot: {
      ...baseLead,
      agentMemory,
    },
  });
  const reply = await generateAgentReply({
    customerMessage: body,
    companyProfile: defaultCompanyProfile,
    decision,
    conversationHistory,
  });

  return { decision, reply };
}
