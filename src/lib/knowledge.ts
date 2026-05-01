import type { KnowledgeSearchResult } from "@/domain/knowledge";
import { prisma } from "@/lib/db";
import { buildEmbedding, cosineSimilarity, readEmbedding } from "@/lib/knowledge-embeddings";

const chunkSize = 900;
const chunkOverlap = 120;

export function chunkKnowledgeText(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(clean.length, start + chunkSize);
    const slice = clean.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= clean.length) break;
    start = Math.max(0, end - chunkOverlap);
  }

  return chunks;
}

export async function createKnowledgeDocument({
  companyId,
  title,
  content,
  sourceName,
  status = "CURRENT",
  sourceType = "TEXT",
}: {
  companyId: string;
  title: string;
  content: string;
  sourceName?: string;
  status?: "CURRENT" | "ARCHIVED" | "DRAFT";
  sourceType?: string;
}) {
  const chunks = chunkKnowledgeText(content);

  return prisma.$transaction(async (tx) => {
    const document = await tx.knowledgeDocument.create({
      data: {
        companyId,
        title,
        status,
        content,
        sourceName,
        sourceType,
      },
    });

    if (chunks.length) {
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk, index) => ({
          companyId,
          documentId: document.id,
          content: chunk,
          embedding: buildEmbedding(`${title} ${sourceName ?? ""} ${chunk}`),
          position: index,
        })),
      });
    }

    return { ...document, chunkCount: chunks.length };
  });
}

export async function searchKnowledge({
  companyId,
  query,
  take = 4,
}: {
  companyId: string;
  query: string;
  take?: number;
}): Promise<KnowledgeSearchResult[]> {
  const terms = tokenize(query);
  const queryEmbedding = buildEmbedding(query);
  if (!terms.length && !queryEmbedding.some(Boolean)) return [];

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { companyId, document: { status: "CURRENT" } },
    include: { document: true },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  if (!chunks.length) return [];

  const latestDocumentTime = Math.max(...chunks.map((chunk) => chunk.document.updatedAt.getTime()));

  const rankedResults = chunks
    .map((chunk) => {
      const searchableText = `${chunk.document.title} ${chunk.document.sourceName ?? ""} ${chunk.content}`;
      const normalized = normalize(searchableText);
      const semanticScore = cosineSimilarity(queryEmbedding, readEmbedding(chunk.embedding) ?? buildEmbedding(searchableText)) * 35;
      const relevanceScore = terms.reduce((total, term) => {
        if (normalized.includes(term)) return total + Math.max(2, term.length);
        if (term.length >= 5 && normalized.split(/\s+/).some((word) => word.includes(term) || term.includes(word))) {
          return total + 2;
        }
        return total;
      }, 0);
      const score = Math.max(
        0,
        semanticScore + relevanceScore + scoreFreshness(searchableText) + scoreRecency(chunk.document.updatedAt, latestDocumentTime),
      );

      return {
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        chunkId: chunk.id,
        content: chunk.content,
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  return keepMostRelevantResults(rankedResults)
    .slice(0, take);
}

function keepMostRelevantResults(results: KnowledgeSearchResult[]) {
  const top = results[0];
  if (!top) return [];

  return results.filter((result) => result.documentId === top.documentId || top.score - result.score <= 4);
}

function scoreRecency(updatedAt: Date, latestDocumentTime: number) {
  const ageHours = Math.max(0, (latestDocumentTime - updatedAt.getTime()) / 3_600_000);

  if (ageHours === 0) return 30;
  if (ageHours <= 1) return 20;
  if (ageHours <= 24) return 10;
  if (ageHours <= 168) return 4;
  return 0;
}

function scoreFreshness(value: string) {
  const normalized = normalize(value);
  const hasCurrentMarker = currentMarkers.some((marker) => normalized.includes(marker));
  const hasOutdatedMarker = outdatedMarkers.some((marker) => normalized.includes(marker));
  const hasNotValidMarker = notValidMarkers.some((marker) => normalized.includes(marker));
  let score = 0;

  if ((hasOutdatedMarker || hasNotValidMarker) && !hasCurrentMarker) return -1000;
  if (hasCurrentMarker) score += 25;
  if (hasOutdatedMarker) score -= 35;
  if (hasNotValidMarker) score -= 80;

  const years = [...normalized.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year));

  if (years.length) score += Math.max(...years) - 2020;

  return score;
}

function tokenize(value: string) {
  return normalize(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopWords.has(term))
    .slice(0, 18);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, "")
    .replace(/[\u0625\u0623\u0622]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647");
}

const stopWords = new Set([
  "ما",
  "هل",
  "عن",
  "الى",
  "إلى",
  "في",
  "من",
  "على",
  "هذا",
  "هذه",
  "ذلك",
  "التي",
  "الذي",
  "with",
  "the",
  "and",
  "for",
  "what",
  "how",
]);

const currentMarkers = [
  "current",
  "latest",
  "new",
  "valid",
  "active",
  "\u062d\u0627\u0644\u064a",
  "\u062d\u0627\u0644\u064a\u0627",
  "\u0627\u0644\u062d\u0627\u0644\u064a",
  "\u0627\u0644\u0627\u062d\u062f\u062b",
  "\u062c\u062f\u064a\u062f",
  "\u0633\u0627\u0631\u064a",
  "\u0645\u0639\u062a\u0645\u062f",
];

const outdatedMarkers = [
  "old",
  "outdated",
  "previous",
  "deprecated",
  "legacy",
  "\u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u062a\u0646\u062f \u0642\u062f\u064a\u0645",
  "\u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0642\u062f\u064a\u0645\u0647",
  "\u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0647 \u0642\u062f\u064a\u0645\u0647",
  "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0642\u062f\u064a\u0645",
  "\u0627\u0644\u0627\u0633\u0639\u0627\u0631 \u0627\u0644\u0642\u062f\u064a\u0645\u0647",
  "\u0644\u0645 \u064a\u0639\u062f \u0633\u0627\u0631\u064a",
  "\u0645\u0644\u063a\u064a",
  "\u063a\u064a\u0631 \u0645\u0639\u062a\u0645\u062f",
];

const notValidMarkers = [
  "not valid",
  "invalid",
  "expired",
  "cancelled",
  "canceled",
  "do not use",
  "\u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u063a\u064a\u0631 \u0635\u0627\u0644\u062d\u0647",
  "\u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0647 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d\u0647",
  "\u0647\u0630\u0627 \u0627\u0644\u0633\u0639\u0631 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d",
  "\u0627\u0644\u0633\u0639\u0631 \u063a\u064a\u0631 \u0633\u0627\u0631\u064a",
  "\u0644\u0627 \u064a\u0633\u062a\u062e\u062f\u0645",
  "\u0644\u0627 \u062a\u0633\u062a\u062e\u062f\u0645",
];
