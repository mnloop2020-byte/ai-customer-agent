import { MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { WebChat } from "@/components/web-chat";

export default function ChatPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="تجربة العميل"
        title="محادثة الموقع"
        actions={
          <a href="/knowledge" className="btn-secondary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium">
            <MessageCircle size={17} aria-hidden="true" />
            تعديل مصادر المعرفة
          </a>
        }
      />
      <WebChat />
    </AppShell>
  );
}
