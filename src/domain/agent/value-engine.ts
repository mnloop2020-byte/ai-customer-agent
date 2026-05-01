import type { CustomerContext } from "@/domain/agent/customer-context";
import type { QuestionFlowResult } from "@/domain/agent/question-flow";

export type ValuePlan = {
  shouldExplainValue: boolean;
  priority?: QuestionFlowResult["priority"];
  response: string;
};

export function buildValuePlan(input: {
  customerContext: CustomerContext;
  questionFlow: QuestionFlowResult;
}): ValuePlan {
  if (input.questionFlow.nextAction !== "EXPLAIN_VALUE") {
    return {
      shouldExplainValue: false,
      priority: input.questionFlow.priority,
      response: "",
    };
  }

  return {
    shouldExplainValue: true,
    priority: input.questionFlow.priority,
    response: buildValueResponse(input.customerContext),
  };
}

export function buildValueResponse(context: CustomerContext) {
  const workload = buildWorkloadLead(context);

  return [
    workload,
    "الحل هنا يرتب المحادثات: يرد على الأسئلة المتكررة، يسرّع الطلبات السهلة، ويصعّد الحالات المهمة للمندوب بدل ما تضغط على الفريق.",
    "بهذا يقل التأخير والتكرار وتبقى المحادثات المهمة واضحة.",
    "أي أولوية أهم لكم الآن: سرعة الرد، تقليل الضغط، أو تقليل التكرار؟",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWorkloadLead(context: CustomerContext) {
  const parts = [
    context.messagesPerDay ? `${context.messagesPerDay} رسالة يوميًا` : undefined,
    context.teamSize ? formatTeamSize(context.teamSize) : undefined,
  ].filter(Boolean);

  if (!parts.length) return "";

  return `مع ${parts.join(" و")}، المشكلة غالبًا ليست في كثرة الرسائل فقط، بل في ترتيب الأولويات وقت الزحمة.`;
}

function formatTeamSize(teamSize: number) {
  if (teamSize === 1) return "شخص واحد يرد";
  if (teamSize === 2) return "شخصين يردون";
  return `${teamSize} أشخاص يردون`;
}
