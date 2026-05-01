import assert from "node:assert/strict";
import test from "node:test";
import { detectClarificationIntent } from "../src/domain/agent/intent-override";
import type { CustomerContext } from "../src/domain/agent/customer-context";

const context: CustomerContext = {
  facts: [
    {
      key: "messages_per_day",
      label: "عدد الرسائل اليومية",
      value: "50",
      text: "50 رسالة يوميًا",
      requiredTerms: ["50", "رسالة"],
    },
  ],
  messagesPerDay: 50,
  painPoints: [],
  previousAnswers: ["نستقبل 50 رسالة يوميًا"],
};

test("detectClarificationIntent routes context questions to clarification constraints", () => {
  const result = detectClarificationIntent("ماذا تقصد بـ 50 رسالة يوميًا؟", context);

  assert.equal(result.mode, "clarification_mode");
  assert.equal(result.skipResponsePolicy, true);

  if (result.mode === "clarification_mode") {
    assert.equal(result.factType, "messages_per_day");
    assert.match(result.constraints.join(" "), /WhatsApp|website chat|customer inquiries/u);
    assert.doesNotMatch(result.constraints.join(" "), /سياق المحادثة|النظام|تقديري/u);
  }
});

test("detectClarificationIntent keeps normal sales messages in the regular pipeline", () => {
  const result = detectClarificationIntent("السعر غالي وفي شركات أرخص", context);

  assert.equal(result.mode, "normal");
  assert.equal(result.skipResponsePolicy, false);
});
