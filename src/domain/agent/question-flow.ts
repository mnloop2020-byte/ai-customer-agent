import type { CustomerContext } from "@/domain/agent/customer-context";
import type { AgentStageMemory } from "@/domain/agent/stage-memory";

type ConversationMemory = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

export type QuestionFlowAction =
  | "ASK_MESSAGES_PER_DAY"
  | "ASK_TEAM_SIZE"
  | "CONFIRM_PROBLEM"
  | "EXPLAIN_VALUE"
  | "PRESENT_VALUE_OR_OFFER"
  | "CONTINUE_REGULAR_FLOW";

export type QuestionFlowResult = {
  nextAction: QuestionFlowAction;
  problemConfirmed: boolean;
  valueExplained: boolean;
  priority?: "speed" | "pressure" | "repetition" | "lost_opportunities" | "all";
  question?: string;
};

export function resolveQuestionFlow(input: {
  customerContext: CustomerContext;
  history: ConversationMemory[];
  currentMessage: string;
  active: boolean;
  stageMemory?: AgentStageMemory;
}): QuestionFlowResult {
  if (!input.active) {
    return {
      nextAction: "CONTINUE_REGULAR_FLOW",
      problemConfirmed: false,
      valueExplained: false,
    };
  }

  const problemConfirmed =
    detectProblemConfirmed(input.customerContext) ||
    Boolean(input.stageMemory?.problemConfirmed) ||
    input.stageMemory?.nextAction === "EXPLAIN_VALUE" ||
    input.stageMemory?.nextAction === "PRESENT_VALUE_OR_OFFER";
  const valueExplained =
    detectValueExplained(input.history) ||
    Boolean(input.stageMemory?.valueExplained) ||
    input.stageMemory?.nextAction === "PRESENT_VALUE_OR_OFFER";
  const priority = detectPriorityAfterValueQuestion(input.history, input.currentMessage);

  if (!input.customerContext.messagesPerDay) {
    return {
      nextAction: "ASK_MESSAGES_PER_DAY",
      problemConfirmed,
      valueExplained,
      priority,
      question: "تقريبًا كم رسالة تستقبلون يوميًا؟",
    };
  }

  if (!input.customerContext.teamSize) {
    return {
      nextAction: "ASK_TEAM_SIZE",
      problemConfirmed,
      valueExplained,
      priority,
      question: "كم شخص يرد على رسائل العملاء حاليًا؟",
    };
  }

  if (!problemConfirmed) {
    return {
      nextAction: "CONFIRM_PROBLEM",
      problemConfirmed,
      valueExplained,
      priority,
      question: "هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟",
    };
  }

  if (!valueExplained || !priority) {
    return {
      nextAction: "EXPLAIN_VALUE",
      problemConfirmed,
      valueExplained,
      priority,
      question: "أي أولوية أهم لكم الآن: سرعة الرد، تقليل الضغط، أو تقليل التكرار؟",
    };
  }

  return {
    nextAction: "PRESENT_VALUE_OR_OFFER",
    problemConfirmed,
    valueExplained,
    priority,
  };
}

export function questionForAction(action: QuestionFlowAction) {
  if (action === "ASK_MESSAGES_PER_DAY") return "تقريبًا كم رسالة تستقبلون يوميًا؟";
  if (action === "ASK_TEAM_SIZE") return "كم شخص يرد على رسائل العملاء حاليًا؟";
  if (action === "CONFIRM_PROBLEM") return "هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟";
  if (action === "EXPLAIN_VALUE") return "أي أولوية أهم لكم الآن: سرعة الرد، تقليل الضغط، أو تقليل التكرار؟";
  return undefined;
}

function detectProblemConfirmed(context: CustomerContext) {
  if (context.messagesPerDay && context.teamSize === 1) return true;

  const normalized = normalize(context.previousAnswers.join(" "));
  const terms = [
    "ضغط",
    "زحمه",
    "زحمة",
    "تاخير",
    "نتاخر",
    "بطء",
    "بطيء",
    "عبء",
    "ضياع",
    "نفقد",
    "فرص",
    "شكوى",
    "شكاوى",
    "نعم",
    "ايه",
    "صحيح",
    "اكيد",
    "yes",
    "delay",
    "pressure",
    "overload",
    "slow",
    "missed",
  ];

  return terms.some((term) => normalized.includes(normalize(term)));
}

function detectValueExplained(history: ConversationMemory[]) {
  return history
    .filter((message) => message.sender === "AI")
    .some((message) => {
      const normalized = normalize(message.body);
      return (
        normalized.includes("سرعه الرد") &&
        normalized.includes("تقليل الضغط") &&
        normalized.includes("تقليل التكرار")
      );
    });
}

function detectPriorityAfterValueQuestion(history: ConversationMemory[], currentMessage: string): QuestionFlowResult["priority"] {
  const lastValueQuestionIndex = history.findLastIndex(
    (message) => message.sender === "AI" && normalize(message.body).includes("اي اولويه اهم"),
  );
  const customerReplies = lastValueQuestionIndex >= 0
    ? [
        ...history.slice(lastValueQuestionIndex + 1).filter((message) => message.sender === "CUSTOMER"),
        { sender: "CUSTOMER" as const, body: currentMessage },
      ]
    : [];
  const normalized = normalize(customerReplies.map((message) => message.body).join(" "));

  if (!normalized) return undefined;
  if (["كلها", "كلهم", "جميع", "الثلاث"].some((term) => normalized.includes(term))) return "all";
  if (["سرعه", "سريع", "الرد", "وقت الرد"].some((term) => normalized.includes(term))) return "speed";
  if (["ضغط", "زحمه", "عبء", "الفريق"].some((term) => normalized.includes(term))) return "pressure";
  if (["تكرار", "متكرر", "اسئله", "نفس"].some((term) => normalized.includes(term))) return "repetition";
  if (["ضياع", "فرص", "عملاء"].some((term) => normalized.includes(term))) return "lost_opportunities";
  return undefined;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}
