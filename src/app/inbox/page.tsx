import Link from "next/link";
import { Bot, FileText, MessageSquareText, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConversationActionButton, InboxReplyForm } from "@/components/inbox-controls";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { channelLabel, statusLabel, uiLabel } from "@/lib/ui-labels";

type InboxPageProps = { searchParams?: Promise<{ conversationId?: string }> };

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const selectedId = params?.conversationId;

  const conversations = user
    ? await prisma.conversation.findMany({
        where: { companyId: user.companyId },
        include: {
          lead: true,
          messages: { orderBy: { createdAt: "asc" } },
          aiRuns: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      })
    : [];

  const active = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const latestRun = active?.aiRuns[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="محادثات العملاء"
        title="المحادثات"
        actions={
          active ? (
            <>
              <ConversationActionButton action="escalate" conversationId={active.id} />
              <ConversationActionButton action="close" conversationId={active.id} />
            </>
          ) : null
        }
      />

      {!active ? (
        <section className="app-card flex flex-col items-center px-6 py-14 text-center">
          <MessageSquareText size={38} className="text-slate-400" />
          <h3 className="mt-3 font-bold text-slate-950">لا توجد محادثات بعد</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">جرّب محادثة الموقع أو اربطها بموقعك لتبدأ المحادثات بالظهور هنا.</p>
          <Link href="/chat" className="btn-primary mt-4 inline-flex h-10 items-center rounded-md px-4 text-sm">
            تجربة محادثة الموقع
          </Link>
        </section>
      ) : (
        <div className="grid min-h-[620px] gap-4 xl:grid-cols-[310px_1fr]">
          <aside className="app-card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-bold text-slate-950">قائمة المحادثات</h3>
              <p className="mt-1 text-sm text-slate-500">اختر محادثة للرد أو المتابعة.</p>
            </div>
            <div className="max-h-[720px] overflow-y-auto">
              {conversations.map((conversation) => {
                const isActive = conversation.id === active.id;
                const last = conversation.messages.at(-1);
                return (
                  <Link
                    key={conversation.id}
                    href={`/inbox?conversationId=${conversation.id}`}
                    className={`block border-b border-slate-100 px-4 py-3 transition ${isActive ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{conversation.lead.fullName ?? conversation.lead.companyName ?? "زائر محادثة الموقع"}</div>
                        <div className="mt-1 text-xs text-slate-500">{channelLabel(conversation.channel)} · {conversationStatus(conversation.status)}</div>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{formatShortDate(conversation.updatedAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{last?.body ?? "لا توجد رسائل"}</p>
                  </Link>
                );
              })}
            </div>
          </aside>

          <section className="app-card flex min-h-[620px] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-bold text-slate-950">{active.lead.fullName ?? active.lead.companyName ?? "زائر محادثة الموقع"}</h3>
                <p className="mt-1 text-sm text-slate-500">{channelLabel(active.channel)} · {conversationStatus(active.status)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ConversationActionButton action="escalate" conversationId={active.id} />
                <Link href="/chat" className="btn-secondary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium">
                  <Bot size={16} />
                  تجربة رد المساعد
                </Link>
                <Link href="/deals" className="btn-secondary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium">
                  <FileText size={16} />
                  إرسال عرض
                </Link>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-5 py-5">
              {active.messages.map((message) => {
                const fromCustomer = message.sender === "CUSTOMER";
                return (
                  <div key={message.id} className={`flex gap-3 ${fromCustomer ? "justify-end" : "justify-start"}`}>
                    {!fromCustomer ? <Avatar sender={message.sender} /> : null}
                    <div className={`max-w-[76%] rounded-2xl border px-4 py-3 text-sm leading-7 text-slate-950 ${fromCustomer ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
                      <p>{message.body}</p>
                      <div className="mt-2 text-xs text-slate-400">{senderLabel(message.sender)} · {formatShortDate(message.createdAt)}</div>
                    </div>
                    {fromCustomer ? <Avatar sender={message.sender} /> : null}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-3">
              <InboxReplyForm conversationId={active.id} />
            </div>
          </section>

          <details className="app-card xl:col-start-2">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">عرض تفاصيل العميل وتحليل المساعد</summary>
            <div className="grid gap-3 border-t border-slate-200 p-5 md:grid-cols-3">
              <Info label="الاحتياج" value={uiLabel(active.lead.intent ?? latestRun?.intent ?? "General Inquiry")} />
              <Info label="حالة العميل" value={statusLabel(active.lead.status)} />
              <Info label="الخطوة التالية" value={uiLabel(latestRun?.nextAction ?? "متابعة العميل")} />
              <Info label="الخدمة" value={active.lead.serviceId ? "خدمة محددة" : "غير محدد"} />
              <Info label="الميزانية" value={active.lead.budget ?? "غير محدد"} />
              <Info label="موعد البدء" value={active.lead.timeline ?? "غير محدد"} />
            </div>
          </details>
        </div>
      )}
    </AppShell>
  );
}

function Avatar({ sender }: { sender: string }) {
  const assistant = sender === "AI" || sender === "SYSTEM";
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${assistant ? "bg-blue-600 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
      {assistant ? <Bot size={16} /> : <UserRound size={16} />}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function conversationStatus(status: string) {
  return (
    {
      OPEN: "نشطة",
      WAITING_CUSTOMER: "بانتظار العميل",
      WAITING_AGENT: "بانتظار المندوب",
      ESCALATED: "محولة لمندوب",
      CLOSED: "مغلقة",
    }[status] ?? status
  );
}

function senderLabel(sender: string) {
  return (
    {
      CUSTOMER: "العميل",
      AI: "المساعد",
      HUMAN: "المندوب",
      SYSTEM: "النظام",
    }[sender] ?? sender
  );
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(date);
}
