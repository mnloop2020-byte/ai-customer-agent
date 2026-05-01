const dimensions = 128;

export function buildEmbedding(text: string) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = tokenize(text);

  tokens.forEach((token) => {
    const index = hash(token) % dimensions;
    vector[index] += weight(token);
  });

  return normalizeVector(vector);
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || !right.length || left.length !== right.length) return 0;

  return left.reduce((total, value, index) => total + value * right[index], 0);
}

export function readEmbedding(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const vector = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return vector.length === dimensions ? vector : undefined;
}

function tokenize(text: string) {
  const normalized = normalize(text);
  const words = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word));

  return [...words, ...buildBigrams(words)].slice(0, 220);
}

function buildBigrams(words: string[]) {
  const bigrams: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    bigrams.push(`${words[index]}_${words[index + 1]}`);
  }
  return bigrams;
}

function weight(token: string) {
  if (token.includes("_")) return 1.4;
  if (token.length >= 7) return 1.2;
  return 1;
}

function hash(value: string) {
  let hashValue = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hashValue ^= value.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }

  return Math.abs(hashValue >>> 0);
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
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
