import type { AgentNextAction } from "@/domain/agent";
import type { ConversationPhase } from "@/domain/agent/conversation-state";

export type AgentStageMemory = {
  conversationStage?: ConversationPhase;
  nextAction?: AgentNextAction;
  messagesPerDay?: number;
  teamSize?: number;
  problemConfirmed?: boolean;
  valueExplained?: boolean;
  updatedAt?: string;
};

const stageRank: Record<ConversationPhase, number> = {
  OPENING: 0,
  DISCOVERY: 1,
  QUALIFICATION: 2,
  VALUE_BUILDING: 3,
  OBJECTION_HANDLING: 4,
  OFFER: 5,
  CLOSING: 6,
  FOLLOW_UP: 7,
  HANDOFF: 8,
  LOST: 9,
};

export function readAgentStageMemory(value: unknown): AgentStageMemory {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;

  return {
    conversationStage: readStage(record.conversationStage),
    nextAction: readNextAction(record.nextAction),
    messagesPerDay: readPositiveNumber(record.messagesPerDay),
    teamSize: readPositiveNumber(record.teamSize),
    problemConfirmed: typeof record.problemConfirmed === "boolean" ? record.problemConfirmed : undefined,
    valueExplained: typeof record.valueExplained === "boolean" ? record.valueExplained : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

export function mergeStageMemory(
  previous: AgentStageMemory,
  current: Omit<AgentStageMemory, "updatedAt">,
): AgentStageMemory {
  return {
    conversationStage: mostAdvancedStage(previous.conversationStage, current.conversationStage),
    nextAction: current.nextAction ?? previous.nextAction,
    messagesPerDay: current.messagesPerDay ?? previous.messagesPerDay,
    teamSize: current.teamSize ?? previous.teamSize,
    problemConfirmed: current.problemConfirmed || previous.problemConfirmed || undefined,
    valueExplained: current.valueExplained || previous.valueExplained || undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function shouldFreezeForward(input: {
  previousStage?: ConversationPhase;
  currentStage: ConversationPhase;
  previousNextAction?: AgentNextAction;
  currentNextAction: AgentNextAction;
}) {
  if (!input.previousStage) return false;
  if (input.previousStage === "VALUE_BUILDING" && ["QUALIFICATION", "DISCOVERY", "OPENING"].includes(input.currentStage)) {
    return true;
  }

  if (
    input.previousNextAction === "EXPLAIN_VALUE" &&
    ["ASK_MESSAGES_PER_DAY", "ASK_TEAM_SIZE", "CONFIRM_PROBLEM"].includes(input.currentNextAction)
  ) {
    return true;
  }

  return stageRank[input.currentStage] < stageRank[input.previousStage] && stageRank[input.previousStage] >= stageRank.VALUE_BUILDING;
}

export function mostAdvancedStage(left?: ConversationPhase, right?: ConversationPhase): ConversationPhase | undefined {
  if (!left) return right;
  if (!right) return left;
  return stageRank[right] >= stageRank[left] ? right : left;
}

function readPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function readStage(value: unknown): ConversationPhase | undefined {
  if (typeof value !== "string") return undefined;
  if (value in stageRank) return value as ConversationPhase;
  return undefined;
}

function readNextAction(value: unknown): AgentNextAction | undefined {
  if (typeof value !== "string") return undefined;
  if (
    [
      "ANSWER_DIRECTLY",
      "ASK_QUALIFYING_QUESTION",
      "ASK_MESSAGES_PER_DAY",
      "ASK_TEAM_SIZE",
      "CONFIRM_PROBLEM",
      "EXPLAIN_VALUE",
      "PRESENT_VALUE_OR_OFFER",
      "PRESENT_OFFER",
      "BOOKING",
      "FOLLOW_UP",
      "HUMAN_HANDOFF",
      "DISQUALIFY",
    ].includes(value)
  ) {
    return value as AgentNextAction;
  }
  return undefined;
}
