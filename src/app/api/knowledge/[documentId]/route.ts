import { NextResponse } from "next/server";
import { updateKnowledgeDocumentSchema } from "@/domain/knowledge";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";
import { canManageKnowledge } from "@/lib/auth/roles";

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageKnowledge(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { documentId } = await context.params;
  const deleted = await prisma.knowledgeDocument.deleteMany({
    where: {
      id: documentId,
      companyId: user.companyId,
    },
  });

  if (!deleted.count) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "knowledge.delete",
      entity: "KnowledgeDocument",
      entityId: documentId,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageKnowledge(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateKnowledgeDocumentSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid knowledge document update", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { documentId } = await context.params;
  const updated = await prisma.knowledgeDocument.updateMany({
    where: {
      id: documentId,
      companyId: user.companyId,
    },
    data: {
      status: parsed.data.status,
    },
  });

  if (!updated.count) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "knowledge.status.update",
      entity: "KnowledgeDocument",
      entityId: documentId,
      metadata: { status: parsed.data.status },
    },
  });

  return NextResponse.json({ ok: true });
}
