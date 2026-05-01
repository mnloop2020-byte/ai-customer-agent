import { AppShell } from "@/components/app-shell";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  const documents = user
    ? await prisma.knowledgeDocument.findMany({
        where: { companyId: user.companyId },
        include: { _count: { select: { chunks: true } } },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return (
    <AppShell>
      <PageHeader eyebrow="معلومات الشركة التي يستخدمها المساعد" title="مصادر المعرفة المعتمدة" />
      <KnowledgeWorkspace
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title,
          status: document.status,
          sourceName: document.sourceName,
          content: document.content,
          sourceType: document.sourceType === "PDF" ? "PDF" : "TEXT",
          chunkCount: document._count.chunks,
          updatedAt: formatDate(document.updatedAt),
        }))}
      />
    </AppShell>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
