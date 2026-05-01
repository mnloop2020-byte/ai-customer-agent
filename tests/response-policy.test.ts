import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIncomingMessage } from "../src/domain/agent";
import { defaultCompanyProfile } from "../src/domain/company";
import { buildRegenerationInstruction, sanitizeLanguage, validateFinalReply } from "../src/domain/agent/response-policy";

test("response policy is a validator and blocks customer-facing internal phrases", () => {
  const decision = analyzeIncomingMessage({
    body: "حوالي 15 رسالة يوميًا",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [
      { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ],
  });

  const validation = validateFinalReply({
    text: "من كلامك عن 15 رسالة يوميًا، هذه المعلومة تساعدنا نحدد السؤال التالي بدقة.",
    decision,
  });

  assert.equal(validation.valid, false);
  assert.match(validation.violations.join(" "), /customer_facing_internal_or_robotic_phrase/u);
  assert.match(buildRegenerationInstruction(decision, validation.violations), /Do not use these phrases/u);
});

test("response policy blocks repeated questions instead of generating a replacement reply", () => {
  const decision = analyzeIncomingMessage({
    body: "حوالي 15 رسالة يوميًا",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [
      { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ],
  });

  const validation = validateFinalReply({
    text: "تقريبًا كم رسالة تستقبلون يوميًا؟",
    decision,
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.code, "REMOVE_REPEATED_QUESTION");
  assert.match(validation.violations.join(" "), /repeated_question|conversation_stage_regression/u);
});

test("response policy blocks questions when customer asked for direct explanation only", () => {
  const decision = analyzeIncomingMessage({
    body: "لا تطرح أي سؤال. فقط اشرح ماذا تقدمون.",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
  });

  const validation = validateFinalReply({
    text: "نساعدكم في تنظيم محادثات العملاء وتسريع الردود. كم رسالة تستقبلون يوميًا؟",
    decision,
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.code, "BLOCK_QUESTION");
});

test("sanitizeLanguage removes unexpected script fragments", () => {
  assert.equal(sanitizeLanguage("أفهم اعتراضك समझ 可能 mḗt"), "أفهم اعتراضك");
});

test("empty or weak replies request regeneration instead of immediate safe fallback", () => {
  const decision = analyzeIncomingMessage({
    body: "حوالي 15 رسالة يوميًا",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [
      { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ],
  });

  const validation = validateFinalReply({ text: "", decision });

  assert.equal(validation.valid, false);
  assert.equal(validation.code, "REGENERATE");
  assert.match(validation.violations.join(" "), /empty_or_too_short/u);
});
