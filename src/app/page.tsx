import Link from "next/link";
import {
  BookOpenText, CalendarCheck, CheckCircle2,
  MessageSquareText, Plus, Sparkles, Target, Users,
} from "lucide-react";
import { AppShell }    from "@/components/app-shell";
import { PageHeader }  from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma }      from "@/lib/db";
import { channelLabel, statusLabel, uiLabel } from "@/lib/ui-labels";

export default async function Home() {
  const user = await getCurrentUser();
  const data = user ? await getDashboardData(user.companyId) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="مساعد المبيعات الذكي"
        title="حوّل المحادثات إلى عملاء وصفقات تلقائيًا"
        actions={
          <>
            <Link href="/leads" className="btn-secondary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm">
              <Plus size={15} /> أضف عميل
            </Link>
            <Link href="/chat" className="btn-primary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm">
              <MessageSquareText size={15} /> جرّب المساعد
            </Link>
          </>
        }
      />

      {/* Onboarding banner */}
      <section
        className="animate-fade-up anim-d1"
        style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)",
          border: "1px solid #bfdbfe",
          borderRadius: "var(--r-lg)",
          padding: "18px 20px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>ابدأ من هنا</h3>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 3, margin: 0 }}>
              أكمل هذه الخطوات ليبدأ المساعد في تنظيم المحادثات وتحويلها إلى فرص بيع.
            </p>
          </div>
          <Link href="/settings" className="btn-primary inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium">
            ابدأ الإعداد
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }} className="grid-cols-2 md:grid-cols-4">
          <StartStep icon={Target}              title="إضافة خدمة"          href="/settings" />
          <StartStep icon={MessageSquareText}   title="ربط محادثة الموقع"   href="/chat" />
          <StartStep icon={BookOpenText}        title="إضافة مصدر معرفة"    href="/knowledge" />
          <StartStep icon={Sparkles}            title="تجربة المساعد"        href="/chat" />
        </div>
      </section>

      {/* KPI row */}
      <section
        className="animate-fade-up anim-d2"
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}
      >
        <KpiCard title="عملاء جدد"         value={String(data?.newLeadCount ?? 0)}          icon={Users}         color="var(--accent)" />
        <KpiCard title="عروض مرسلة"        value={String(data?.proposalCount ?? 0)}         icon={CheckCircle2}  color="#6366f1" />
        <KpiCard title="صفقات مفتوحة"      value={String(data?.openDealCount ?? 0)}         icon={Target}        color="#f59e0b" />
        <KpiCard title="مواعيد مجدولة"     value={String(data?.upcomingFollowUpCount ?? 0)} icon={CalendarCheck} color="#10b981" />
      </section>

      {/* Main grid */}
      <div
        className="animate-fade-up anim-d3"
        style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12, marginBottom: 16 }}
      >
        {/* Latest activity */}
        <div className="app-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>آخر نشاط مهم</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2, margin: 0 }}>
              أحدث العملاء والمحادثات التي تحتاج انتباه فريق المبيعات.
            </p>
          </div>
          <div>
            {data?.priorityLeads.length ? (
              data.priorityLeads.map((lead) => (
                <article
                  key={lead.id}
                  className="dashboard-activity-row"
                  style={{
                    display: "grid", gridTemplateColumns: "1.2fr 1fr 140px",
                    gap: 12, padding: "12px 18px",
                    borderBottom: "1px solid var(--border)",
                    alignItems: "center",
                    transition: "background 120ms",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>
                      {lead.fullName ?? lead.companyName ?? "زائر محادثة الموقع"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                      {lead.service?.name ?? uiLabel(lead.intent ?? "General Inquiry")}
                    </div>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 500, color: "var(--text-1)" }}>{nextAction(lead.status)}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{channelLabel(lead.channel)}</div>
                  </div>
                  <PriorityLabel status={lead.status} />
                </article>
              ))
            ) : (
              <EmptyState title="لا يوجد نشاط بعد" text="ابدأ بتجربة المساعد أو إضافة أول عميل." href="/chat" action="جرّب المساعد" />
            )}
          </div>
        </div>

        {/* Today tasks */}
        <div className="app-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>مهام اليوم</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2, margin: 0 }}>
              مواعيد ومتابعات تساعدك على عدم فقدان أي فرصة.
            </p>
          </div>
          <div>
            {data?.todayTasks.length ? (
              data.todayTasks.map((task) => (
                <article key={task.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>
                        {displayFollowUpKind(task.kind)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                        {task.lead.fullName ?? task.lead.companyName ?? "زائر محادثة الموقع"}
                      </div>
                    </div>
                    <span style={{
                      background: "#fffbeb", color: "#b45309",
                      border: "1px solid #fde68a",
                      padding: "2px 8px", borderRadius: 5,
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                    }}>
                      متابعة
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {task.message}
                  </p>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5 }}>{formatDate(task.dueAt)}</div>
                </article>
              ))
            ) : (
              <EmptyState title="لا توجد مهام اليوم" text="ستظهر المتابعات القادمة هنا تلقائيًا." href="/bookings" action="إضافة موعد" />
            )}
          </div>
        </div>
      </div>

      {/* Value cards */}
      <section
        className="animate-fade-up anim-d4"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}
      >
        <ValueCard title="وفّر وقت الرد"         text="المساعد يرد على الأسئلة المتكررة ويجمع معلومات العميل قبل تدخل الفريق." />
        <ValueCard title="نظّم المحادثات"         text="كل محادثة تتحول إلى سجل عميل واضح مع آخر إجراء ومتابعة مناسبة." />
        <ValueCard title="حوّل الاهتمام إلى صفقة" text="عند جاهزية العميل، يظهر العرض والمتابعة داخل مسار المبيعات." />
      </section>
    </AppShell>
  );
}

/* ── Sub-components ── */
function KpiCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="app-card" style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>{title}</span>
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `${color}14`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={15} style={{ color }} />
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5 }}>نتائج هذا الأسبوع</div>
    </div>
  );
}

function StartStep({ icon: Icon, title, href }: { icon: React.ElementType; title: string; href: string }) {
  return (
    <Link href={href} className="start-step-link" style={{
      display: "block",
      background: "#fff", border: "1px solid #bfdbfe",
      borderRadius: 8, padding: "12px 14px",
      transition: "border-color 130ms, box-shadow 130ms",
      textDecoration: "none",
    }}>
      <Icon size={16} style={{ color: "var(--accent)" }} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)", marginTop: 8 }}>{title}</div>
    </Link>
  );
}

function PriorityLabel({ status }: { status: string }) {
  const cfg =
    status === "HOT"  ? { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", label: "أولوية عالية" } :
    status === "WARM" ? { bg: "#fffbeb", color: "#b45309", border: "#fde68a", label: "يحتاج متابعة" } :
                        { bg: "#f8fafc", color: "#475569", border: "#e2e8f0", label: statusLabel(status) };
  return (
    <span style={{
      display: "inline-block",
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function EmptyState({ title, text, href, action }: { title: string; text: string; href: string; action: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px", textAlign: "center" }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{title}</h3>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6, maxWidth: 320 }}>{text}</p>
      <Link href={href} className="btn-primary inline-flex h-9 items-center rounded-lg px-4 text-sm" style={{ marginTop: 14 }}>
        {action}
      </Link>
    </div>
  );
}

function ValueCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="app-card" style={{ padding: "16px 18px" }}>
      <h3 style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{title}</h3>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6, lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

/* ── Data / helpers (unchanged logic) ── */
async function getDashboardData(companyId: string) {
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

  const [newLeadCount, proposalCount, openDealCount, upcomingFollowUpCount, priorityLeads, todayTasks] =
    await Promise.all([
      prisma.lead.count({ where: { companyId, createdAt: { gte: weekStart } } }),
      prisma.deal.count({ where: { lead: { companyId }, status: "PROPOSAL_SENT" } }),
      prisma.deal.count({ where: { lead: { companyId }, status: { in: ["OPEN", "PROPOSAL_SENT", "NEGOTIATION"] } } }),
      prisma.followUp.count({ where: { companyId, status: "SCHEDULED", dueAt: { gte: now } } }),
      prisma.lead.findMany({ where: { companyId }, include: { service: true }, orderBy: [{ updatedAt: "desc" }], take: 5 }),
      prisma.followUp.findMany({
        where: { companyId, status: "SCHEDULED", dueAt: { gte: now, lte: dayEnd } },
        include: { lead: true }, orderBy: { dueAt: "asc" }, take: 5,
      }),
    ]);

  return { newLeadCount, proposalCount, openDealCount, upcomingFollowUpCount, priorityLeads, todayTasks };
}

function nextAction(status: string) {
  if (status === "HOT")  return "جاهز لتواصل المبيعات";
  if (status === "WARM") return "يحتاج متابعة اليوم";
  if (status === "COLD") return "متابعة لاحقة";
  if (status === "LOST") return "إعادة تفعيل لاحقًا";
  return "تأهيل الاحتياج";
}

function displayFollowUpKind(kind: string) {
  if (kind === "BOOKING")                  return "موعد عرض توضيحي";
  if (kind === "CHECK_DECISION")           return "مراجعة قرار العميل";
  if (kind === "CONTINUE_QUALIFICATION")   return "استكمال التأهيل";
  if (kind === "RECOVER_OBJECTION")        return "معالجة اعتراض";
  if (kind === "REENGAGE_LOST")            return "إعادة تواصل";
  return uiLabel(kind);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
