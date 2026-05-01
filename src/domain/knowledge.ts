import { z } from "zod";

export const knowledgeDocumentStatusSchema = z.enum(["CURRENT", "ARCHIVED", "DRAFT"]);

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(20).max(80_000),
  sourceName: z.string().trim().max(240).optional(),
  status: knowledgeDocumentStatusSchema.default("CURRENT"),
});

export const updateKnowledgeDocumentSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  content: z.string().trim().min(20).max(80_000).optional(),
  sourceName: z.string().trim().max(240).optional().nullable(),
  status: knowledgeDocumentStatusSchema.optional(),
}).refine(
  (value) =>
    value.title !== undefined ||
    value.content !== undefined ||
    value.sourceName !== undefined ||
    value.status !== undefined,
  "At least one field is required.",
);

export type KnowledgeSearchResult = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  content: string;
  score: number;
};
