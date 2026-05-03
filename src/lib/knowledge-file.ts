const maxUploadSizeBytes = 10 * 1024 * 1024;

export async function extractKnowledgeContentFromFile(file: File) {
  if (file.size <= 0) {
    throw new Error("EMPTY_FILE");
  }

  if (file.size > maxUploadSizeBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (file.type === "application/pdf" || extension === "pdf") {
    return {
      content: await extractPdfText(file),
      sourceType: "PDF",
    };
  }

  if (file.type.startsWith("text/") || extension === "txt" || extension === "md") {
    return {
      content: normalizeExtractedText(await file.text()),
      sourceType: "TEXT",
    };
  }

  throw new Error("UNSUPPORTED_FILE_TYPE");
}

async function extractPdfText(file: File): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    return normalizeExtractedText(data.text);
  } catch {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = extractTextFromPdfBuffer(buffer);
    if (text.length > 10) return normalizeExtractedText(text);
    throw new Error("PDF_PARSE_FAILED");
  }
}

function extractTextFromPdfBuffer(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const textMatches = content.match(/\(([^)]{2,})\)/g) ?? [];
  return textMatches
    .map((match) => match.slice(1, -1))
    .filter((text) => /[\u0020-\u007E\u0600-\u06FF]/.test(text))
    .join(" ");
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}