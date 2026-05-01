import assert from "node:assert/strict";
import test from "node:test";
import { humanizeAgentReply, polishHumanTone } from "../src/domain/agent/humanize-response";
import type { PersonalizationStrategy } from "../src/domain/agent/customer-context";

const strategy: PersonalizationStrategy = {
  customerContext: {
    facts: [],
    messagesPerDay: 50,
    teamSize: 1,
    painPoints: ["ضغط على الفريق"],
    previousAnswers: ["نستقبل 50 رسالة يوميًا", "شخص واحد يرد"],
    mainPain: "ضغط وتأخير",
  },
  requirePersonalization: true,
  mustMentionFacts: ["50 رسالة يوميًا", "شخص واحد يرد"],
  mustMentionTerms: [["50", "رسالة"], ["شخص", "واحد"]],
  responseGoal: "reframe_value",
  nextAction: "demo_offer",
  antiGenericRule: "Use customer facts.",
};

test("polishHumanTone removes meta language and keeps one question", () => {
  const reply = polishHumanTone(
    "حسب التحليل، أنا AI أستطيع مساعدتك. هل تستخدم الخدمة لنفسك؟ هل أنت شركة؟",
  );

  assert.doesNotMatch(reply, /AI|حسب التحليل|سياق المحادثة/u);
  assert.equal((reply.match(/[؟?]/gu) ?? []).length, 1);
});

test("humanizeAgentReply does not inject sales facts or questions", () => {
  const reply = humanizeAgentReply({
    text: "السعر ليس العامل الوحيد. هل تريد معرفة المزيد؟",
    strategy,
    ctaPrompt: "هل يناسبك Demo قصير؟",
  });

  assert.doesNotMatch(reply, /50 رسالة يوميًا|شخص واحد يرد|Demo/u);
  assert.doesNotMatch(reply, /هل تريد معرفة المزيد/u);
});
