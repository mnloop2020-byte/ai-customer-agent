import { analyzeIncomingMessage } from "@/domain/agent";

export function contextClarificationExample() {
  const decision = analyzeIncomingMessage({
    body: "ماذا تقصد بـ 50 رسالة يوميًا؟",
    channel: "WEB_CHAT",
    conversationHistory: [
      { sender: "CUSTOMER", body: "نستقبل 50 رسالة يوميًا" },
      { sender: "CUSTOMER", body: "شخص واحد يرد على العملاء" },
      { sender: "AI", body: "مع 50 رسالة يوميًا وشخص واحد يرد، غالبًا يكون هناك ضغط أو تأخير في الرد." },
    ],
  });

  return {
    passed:
      decision.intentOverride.mode === "clarification_mode" &&
      decision.intentOverride.skipResponsePolicy === true &&
      decision.intentOverride.factType === "messages_per_day" &&
      decision.response === "",
    response: decision.response,
    intentOverride: decision.intentOverride,
  };
}
