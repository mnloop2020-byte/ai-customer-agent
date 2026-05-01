import { z } from "zod";
import type { SemanticIntentClassification, SemanticIntentName } from "@/domain/agent";

type ConversationMemoryMessage = {
  sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
};

type ClassifySemanticIntentInput = {
  customerMessage: string;
  conversationHistory?: ConversationMemoryMessage[];
  currentStage?: string;
  agentMemory?: unknown;
};

const intentNameSchema = z.enum([
  "GREETING",
  "ASK_PRICE",
  "ASK_QUOTE",
  "ASK_LOCATION",
  "ASK_SERVICE",
  "ASK_HOW_IT_WORKS",
  "OBJECTION",
  "START",
  "GENERAL",
  "UNKNOWN",
]);

const classifierResponseSchema = z.object({
  intents: z.array(
    z.object({
      intent: intentNameSchema,
      confidence: z.number().min(0).max(1),
      reason: z.string().optional(),
    }),
  ).default([]),
});

export async function classifySemanticIntent(input: ClassifySemanticIntentInput): Promise<SemanticIntentClassification> {
  const provider = resolveIntentProvider();

  try {
    if (provider === "gemini" && process.env.GEMINI_API_KEY?.trim()) {
      return await classifyWithGemini(input);
    }

    if (provider === "groq" && process.env.GROQ_API_KEY?.trim()) {
      return await classifyWithGroq(input);
    }
  } catch (error) {
    if (shouldPrintIntentDebug()) {
      console.log("[AI_AGENT_INTENT_CLASSIFIER_FAILURE]", {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ...classifyWithLocalFallback(input.customerMessage),
    source: "local-fallback",
    usedFallback: true,
  };
}

async function classifyWithGemini(input: ClassifySemanticIntentInput): Promise<SemanticIntentClassification> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildClassifierPrompt(input) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 180, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) throw new Error(`Gemini intent classifier failed: ${response.status}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("").trim();
  if (!text) throw new Error("Gemini intent classifier returned empty text");

  return parseClassifierJson(text, `gemini:${model}`);
}

async function classifyWithGroq(input: ClassifySemanticIntentInput): Promise<SemanticIntentClassification> {
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Classify Arabic customer intent. Return JSON only." },
        { role: "user", content: buildClassifierPrompt(input) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Groq intent classifier failed: ${response.status}`);

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq intent classifier returned empty text");

  return parseClassifierJson(text, `groq:${model}`);
}

function buildClassifierPrompt(input: ClassifySemanticIntentInput) {
  const history = input.conversationHistory?.slice(-6).map((message) => `${message.sender}: ${message.body}`).join("\n") || "none";

  return [
    "Return a strict JSON object with this shape:",
    '{"intents":[{"intent":"ASK_PRICE","confidence":0.0,"reason":"short reason"}]}',
    "",
    "Allowed intents:",
    "GREETING, ASK_PRICE, ASK_QUOTE, ASK_LOCATION, ASK_SERVICE, ASK_HOW_IT_WORKS, OBJECTION, START, GENERAL, UNKNOWN",
    "",
    "Rules:",
    "- Classify by meaning, not exact words.",
    "- Support multi-intent when the message asks multiple things.",
    "- GREETING means the customer is only greeting or opening the conversation casually.",
    "- If a message has greeting + a real question, include GREETING and the real question intent.",
    "- ASK_QUOTE means a general package/quote/subscription request.",
    "- Custom/private project requests are still ASK_QUOTE; downstream logic can hand off if needed.",
    "- START means customer wants to begin, subscribe, book, or move forward.",
    "- UNKNOWN only when the message cannot be understood even with history.",
    "",
    `Current stage: ${input.currentStage ?? "unknown"}`,
    `Agent memory: ${JSON.stringify(input.agentMemory ?? null)}`,
    "History:",
    history,
    "",
    `Customer message: ${input.customerMessage}`,
  ].join("\n");
}

function parseClassifierJson(text: string, source: string): SemanticIntentClassification {
  const parsed = classifierResponseSchema.safeParse(JSON.parse(extractJson(text)));
  if (!parsed.success) throw new Error("Invalid intent classifier JSON");

  return {
    intents: normalizeIntentItems(parsed.data.intents),
    source,
    usedFallback: false,
  };
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/u);
  return match?.[0] ?? text;
}

function normalizeIntentItems(items: Array<{ intent: SemanticIntentName; confidence: number; reason?: string }>) {
  const byIntent = new Map<SemanticIntentName, { intent: SemanticIntentName; confidence: number; reason?: string }>();

  for (const item of items) {
    const previous = byIntent.get(item.intent);
    if (!previous || item.confidence > previous.confidence) {
      byIntent.set(item.intent, item);
    }
  }

  return [...byIntent.values()].sort((left, right) => right.confidence - left.confidence).slice(0, 3);
}

function classifyWithLocalFallback(message: string): Pick<SemanticIntentClassification, "intents"> {
  const normalized = normalize(message);
  const intents: Array<{ intent: SemanticIntentName; confidence: number; reason: string }> = [];

  if (isGreetingLike(normalized)) {
    intents.push({ intent: "GREETING", confidence: 0.8, reason: "local greeting cue" });
  }

  if (/(السعر|الاسعار|الأسعار|تكلف|بكم|كم\s+(?:سعر|السعر|التكلفة|تكلفة))/u.test(normalized)) {
    intents.push({ intent: "ASK_PRICE", confidence: 0.82, reason: "local price cue" });
  }
  if (/(عرض سعر|باقة|اشتراك)/u.test(normalized)) {
    intents.push({ intent: "ASK_QUOTE", confidence: 0.82, reason: "local quote cue" });
  }
  if (/(وين|اين|أين|موقع|مناطق|السعودية|تقدمون)/u.test(normalized)) {
    intents.push({ intent: "ASK_LOCATION", confidence: 0.8, reason: "local location cue" });
  }
  if (/(وش تقدمون|ماذا تقدمون|الخدمات|خدماتكم)/u.test(normalized)) {
    intents.push({ intent: "ASK_SERVICE", confidence: 0.82, reason: "local service cue" });
  }
  if (/(كيف يشتغل|كيف يعمل|اشرح الطريقة|طريقة العمل|واتساب|whatsapp)/iu.test(normalized)) {
    intents.push({ intent: "ASK_HOW_IT_WORKS", confidence: 0.84, reason: "local how-it-works cue" });
  }
  if (/(غالي|مرتفع|منافس|افكر|أفكر|غير مناسب)/u.test(normalized)) {
    intents.push({ intent: "OBJECTION", confidence: 0.82, reason: "local objection cue" });
  }
  if (/(ابدأ|ابدا|اشترك|حجز|موعد|نبدأ)/u.test(normalized)) {
    intents.push({ intent: "START", confidence: 0.82, reason: "local start cue" });
  }

  return { intents: intents.length ? normalizeIntentItems(intents) : [{ intent: "GENERAL", confidence: 0.55, reason: "local fallback" }] };
}

function resolveIntentProvider() {
  if (process.env.INTENT_CLASSIFIER_PROVIDER?.trim()) return process.env.INTENT_CLASSIFIER_PROVIDER;
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  return process.env.AI_PROVIDER ?? "mock";
}

function isGreetingLike(normalized: string) {
  const compact = normalized.replace(/\s+/g, "");
  if (/^(hi|hello|hey)$/iu.test(normalized)) return true;
  if (/^(السلامعليكم|سلامعليكم|سلاموعليكم|السلاموعليكم|وعليكمالسلام|مرحبا|اهلا|ياهلا|هلا)$/u.test(compact)) {
    return true;
  }
  return /^(السلام|سلام|مرحبا|اهلا|هلا)\b/u.test(normalized) && normalized.split(/\s+/).length <= 4;
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

function shouldPrintIntentDebug() {
  return process.env.AGENT_DEBUG === "1" || process.env.NODE_ENV === "development";
}
