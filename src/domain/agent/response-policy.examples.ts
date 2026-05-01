import { analyzeIncomingMessage } from "@/domain/agent";
import { sanitizeLanguage, validateFinalReply } from "@/domain/agent/response-policy";

export function priceObjectionValidationExample() {
  const decision = analyzeIncomingMessage({
    body: "السعر عندكم غالي، وفي شركات ثانية أرخص",
    channel: "WEB_CHAT",
    conversationHistory: [
      { sender: "CUSTOMER", body: "نستقبل 50 رسالة يوميًا" },
      { sender: "CUSTOMER", body: "شخص واحد يرد على العملاء" },
    ],
  });

  const genericReply = sanitizeLanguage("السعر ليس العامل الوحيد ويمكننا مساعدتك. समझ 可能");
  const validation = validateFinalReply({ text: genericReply, decision });

  return {
    passed: validation.valid === false,
    text: genericReply,
    validation,
  };
}
