import { z } from "zod";
import { companyProfileSchema } from "@/domain/company";

export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().max(120).optional(),
  visitorSessionId: z.string().trim().min(12).max(160).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerEmail: z.email().max(180).optional(),
  companyProfile: companyProfileSchema.optional(),
  leadSnapshot: z
    .object({
      score: z.number().min(0).max(100).default(0),
      status: z.string().default("NEW"),
    })
    .optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export type ChatKnowledgeSource = {
  documentTitle: string;
  content: string;
  score: number;
};

export type ChatReply = {
  message: string;
  leadScore: number;
  intent: string;
  temperature: string;
  nextAction: string;
  route: string;
  qualificationStatus: string;
  buyingStage: string;
  customerContext?: unknown;
  personalizationStrategy?: unknown;
  intentOverride?: unknown;
  objection?: unknown;
  conversationState?: unknown;
  antiRepetition?: unknown;
  prediction?: unknown;
  salesPlaybook?: unknown;
  missingFields: string[];
  summary: string;
  recommendedOffer?: {
    serviceName: string;
    offerName: string;
    price: string;
    reason: string;
  };
  cta?: {
    type: string;
    label: string;
    prompt: string;
  };
  booking?: {
    id: string;
    dueAt: string;
    message: string;
    kind?: string;
    stepNumber?: number;
  };
  followUp?: {
    id: string;
    dueAt: string;
    message: string;
    kind?: string;
    stepNumber?: number;
  };
  lostDeal?: {
    reason: string;
    summary: string;
    reEngageAfterDays?: number;
  };
  matchedKnowledge: string[];
  knowledgeSources?: string[];
  knowledgeSourceDetails?: ChatKnowledgeSource[];
  aiProvider: string;
  conversationId: string;
  leadId: string;
};
