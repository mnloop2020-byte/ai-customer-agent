import { AppShell } from "@/components/app-shell";
import { AgentLab } from "@/components/agent-lab";
import { PageHeader } from "@/components/page-header";

export default function AgentLabPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="أدوات المطور" title="اختبار الذكاء الاصطناعي" />
      <AgentLab />
    </AppShell>
  );
}
