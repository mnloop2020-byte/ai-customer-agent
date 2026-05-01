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

test("response policy accepts clean Arabic direct answers for contract requirements", () => {
  const priceDecision = analyzeIncomingMessage({
    body: "كم السعر؟",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
  });

  const priceValidation = validateFinalReply({
    text: "الأسعار الحالية: الباقة الأساسية 100$ والباقة الاحترافية 300$.",
    decision: priceDecision,
  });

  assert.equal(priceValidation.valid, true, priceValidation.violations.join(", "));

  const locationDecision = analyzeIncomingMessage({
    body: "وين تقدمون؟",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
  });

  const locationValidation = validateFinalReply({
    text: "نقدم الخدمة من اسطنبول، تركيا، ويمكننا خدمة العملاء عن بعد.",
    decision: locationDecision,
  });

  assert.equal(locationValidation.valid, true, locationValidation.violations.join(", "));

  const howDecision = analyzeIncomingMessage({
    body: "كيف يشتغل النظام؟",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
  });

  const howValidation = validateFinalReply({
    text: "ينظم النظام المحادثات، يستخدم مصادر معرفة الشركة للرد على الأسئلة المتكررة، ويحوّل الحالات المهمة إلى متابعة واضحة.",
    decision: howDecision,
  });

  assert.equal(howValidation.valid, true, howValidation.violations.join(", "));
});

test("response policy detects Arabic question marks and allows useful value replies", () => {
  const decision = analyzeIncomingMessage({
    body: "حوالي 15 رسالة يوميًا",
    channel: "WEB_CHAT",
    companyProfile: defaultCompanyProfile,
    conversationHistory: [
      { sender: "AI", body: "تقريبًا كم رسالة تستقبلون يوميًا؟" },
    ],
  });

  const usefulReply = validateFinalReply({
    text: "هذا عدد مناسب للبدء. النظام يرتب الرسائل المتكررة ويوفر وقت الرد، فمن يرد على العملاء حاليًا؟",
    decision,
  });

  assert.equal(usefulReply.valid, true, usefulReply.violations.join(", "));

  const tooManyQuestions = validateFinalReply({
    text: "هذا عدد مناسب للبدء. من يرد على العملاء حاليًا؟ وهل عندكم ضغط وقت الزحمة؟",
    decision,
  });

  assert.equal(tooManyQuestions.valid, false);
  assert.match(tooManyQuestions.violations.join(" "), /too_many_questions_for_contract/u);
});
