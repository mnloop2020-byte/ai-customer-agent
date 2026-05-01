import type { PersonalizationStrategy } from "@/domain/agent/customer-context";
import { sanitizeLanguage } from "@/domain/agent/response-policy";

type HumanizeReplyInput = {
  text: string;
  strategy: PersonalizationStrategy;
  ctaPrompt?: string;
};

const metaLanguagePatterns = [
  /(?:أنا|كمساعد)\s+(?:AI|ذكاء اصطناعي|مساعد ذكاء اصطناعي)\s*[،,]?\s*/giu,
  /(?:حسب|وفق)\s+(?:التحليل|النظام|سياق المحادثة)\s*[،,]?\s*/giu,
  /(?:من خلال|بناء على|بناءً على)\s+سياق المحادثة\s*[،,]?\s*/giu,
  /النظام\s+(?:يرى|حدد|استنتج|يعرف)[^.!؟?]*/giu,
  /(?:Response Strategy|Customer Context|Decision Engine|mustMentionFacts|policy|LLM)/giu,
];

const roboticReplacements: Array<[RegExp, string]> = [
  [/بناءً على ما ذكرت عن/giu, "مع"],
  [/بناء على ما ذكرت عن/giu, "مع"],
  [/بناءً على/giu, "حسب"],
  [/بناء على/giu, "حسب"],
  [/من المهم أن/giu, ""],
  [/ربط القرار/giu, "تقييم القرار"],
  [/اربط الرد بـ\s*([^.!؟?]+)/giu, "هذا مرتبط بـ $1"],
  [/اربط السعر بتقليل\s*([^.!؟?]+)/giu, "السعر يُقاس بقدرته على تقليل $1"],
  [/أنا أفهم/giu, "أتفهم"],
  [/أعتقد أن/giu, "يبدو أن"],
  [/أريد أن أسلط الضوء على أن لدينا قيمة فريدة في/giu, "الأهم هنا هو"],
  [/السعر ليس العامل الوحيد/giu, "أتفهم أن السعر مهم"],
  [/السعر يعتمد على القيمة/giu, "الأهم أن نربط السعر بالنتيجة التي ستحصل عليها"],
  [/يمكننا مساعدتك/giu, "نقدر نرتب لك خطوة مناسبة"],
  [/يسعدنا مساعدتك/giu, "أكيد، أقدر أساعدك"],
  [/كيف يمكنني مساعدتك/giu, "كيف نقدر نساعدك"],
  [/مع اعتراضك على السعر[،,]?\s*/giu, "أتفهم نقطة السعر. "],
  [/أريد أن أفهم بشكل أفضل/giu, "خلّيني أفهم منك"],
  [/هل (?:تريد|ترغب في) معرفة المزيد[؟?]?/giu, ""],
];

export function humanizeAgentReply(input: HumanizeReplyInput) {
  void input.strategy;
  void input.ctaPrompt;
  return polishHumanTone(input.text);
}

export function polishHumanTone(text: string) {
  return [
    sanitizeLanguage,
    replaceRoboticPhrases,
    removeMetaLanguage,
    removeDuplicateSentences,
    keepOneQuestion,
    normalizeArabicSpacing,
  ].reduce((current, transform) => transform(current), text);
}

function replaceRoboticPhrases(text: string) {
  return roboticReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function removeMetaLanguage(text: string) {
  return metaLanguagePatterns.reduce((current, pattern) => current.replace(pattern, ""), text);
}

function removeDuplicateSentences(text: string) {
  const seen = new Set<string>();
  const sentences = splitSentences(text);

  return sentences
    .filter((sentence) => {
      const key = normalizeForCompare(sentence);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

function keepOneQuestion(text: string) {
  const sentences = splitSentences(text);
  let keptQuestion = false;

  return sentences
    .reverse()
    .filter((sentence) => {
      const isQuestion = /[؟?]/u.test(sentence);
      if (!isQuestion) return true;
      if (keptQuestion) return false;
      keptQuestion = true;
      return true;
    })
    .reverse()
    .join(" ");
}

function splitSentences(text: string) {
  return (text.match(/[^.!؟?\n]+[.!؟?]?/gu) ?? [text])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeArabicSpacing(text: string) {
  return text
    .replace(/\s+([،.!؟?])/gu, "$1")
    .replace(/([،.!؟?])([^\s])/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[،.!؟?\s]+/g, " ")
    .trim();
}
