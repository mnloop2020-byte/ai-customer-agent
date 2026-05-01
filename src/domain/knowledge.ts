import { z } from "zod";

export const knowledgeDocumentStatusSchema = z.enum(["CURRENT", "ARCHIVED", "DRAFT"]);

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(20).max(80_000),
  sourceName: z.string().trim().max(240).optional(),
  status: knowledgeDocumentStatusSchema.default("CURRENT"),
});

export const updateKnowledgeDocumentSchema = z.object({
  status: knowledgeDocumentStatusSchema,
});

export type KnowledgeSearchResult = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  content: string;
  score: number;
};
