import { NextResponse } from "next/server";
import { createKnowledgeDocumentSchema } from "@/domain/knowledge";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { extractKnowledgeContentFromFile } from "@/lib/knowledge-file";
import { createKnowledgeDocument } from "@/lib/knowledge";
import { readJsonBody } from "@/lib/http/read-json";
import { canManageKnowledge } from "@/lib/auth/roles";

export const runtime = "nodejs";
const maxUploadSizeBytes = 10 * 1024 * 1024;

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await prisma.knowledgeDocument.findMany({
    where: { companyId: user.companyId },
    include: { _count: { select: { chunks: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageKnowledge(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return createDocumentFromUpload(request, user);
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createKnowledgeDocumentSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid knowledge document", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const document = await createKnowledgeDocument({
    companyId: user.companyId,
    title: parsed.data.title,
    content: parsed.data.content,
    sourceName: parsed.data.sourceName,
    status: parsed.data.status,
  });

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "knowledge.create",
      entity: "KnowledgeDocument",
      entityId: document.id,
      metadata: { chunkCount: document.chunkCount },
    },
  });

  return NextResponse.json({ document });
}

async function createDocumentFromUpload(
  request: Request,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxUploadSizeBytes + 200_000) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const titleValue = String(formData.get("title") ?? "").trim();
  const sourceNameValue = String(formData.get("sourceName") ?? "").trim();
  const statusValue = String(formData.get("status") ?? "CURRENT").trim() || "CURRENT";
  const modeValue = String(formData.get("mode") ?? "save").trim().toLowerCase();

  try {
    const extracted = await extractKnowledgeContentFromFile(file);
    const parsed = createKnowledgeDocumentSchema.safeParse({
      title: titleValue || filenameWithoutExtension(file.name) || "Uploaded document",
      sourceName: sourceNameValue || file.name,
      content: extracted.content,
      status: statusValue,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid uploaded knowledge document", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (modeValue === "preview") {
      return NextResponse.json({
        preview: {
          title: parsed.data.title,
          sourceName: parsed.data.sourceName ?? null,
          content: parsed.data.content,
          status: parsed.data.status,
          sourceType: extracted.sourceType,
          originalFilename: file.name,
        },
      });
    }

    const document = await createKnowledgeDocument({
      companyId: user.companyId,
      title: parsed.data.title,
      content: parsed.data.content,
      sourceName: parsed.data.sourceName,
      status: parsed.data.status,
      sourceType: extracted.sourceType,
    });

    await prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "knowledge.upload",
        entity: "KnowledgeDocument",
        entityId: document.id,
        metadata: {
          chunkCount: document.chunkCount,
          sourceType: extracted.sourceType,
          originalFilename: file.name,
        },
      },
    });

    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
    const status = message === "UNSUPPORTED_FILE_TYPE" || message === "FILE_TOO_LARGE" || message === "EMPTY_FILE" ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

function filenameWithoutExtension(filename: string) {
  const trimmed = filename.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
}
