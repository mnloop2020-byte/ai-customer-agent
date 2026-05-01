import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

const maxUploadSizeBytes = 10 * 1024 * 1024;
let pdfWorkerConfigured = false;

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

async function extractPdfText(file: File) {
  configurePdfWorker();
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return normalizeExtractedText(result.text);
  } finally {
    await parser.destroy();
  }
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function configurePdfWorker() {
  if (pdfWorkerConfigured) return;

  const workerPath = path.resolve(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  pdfWorkerConfigured = true;
}
