import Link from "next/link";
import { Clock3, FlaskConical, KeyRound, PlayCircle, Settings2, ShieldCheck } from "lucide-react";
import { AppShell }           from "@/components/app-shell";
import { CompanySettingsForm } from "@/components/company-settings-form";
import { DemoDataActions }    from "@/components/demo-data-actions";
import { PageHeader }         from "@/components/page-header";
import { RunAutomationButton } from "@/components/run-automation-button";
import { getCurrentUser }     from "@/lib/auth/session";
import { prisma }             from "@/lib/db";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const automationData = user ? await getAutomationData(user.companyId) : { slug: "", dueCount: 0, latestRunAt: null as Date | null };

  const automationSecretConfigured = Boolean(process.env.AUTOMATION_SECRET?.trim());
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim() &&
    process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim() &&
    process.env.SMTP_FROM_EMAIL?.trim(),
  );
  const endpoint = "http://localhost:3000/api/automation/follow-ups/run";
  const payload  = JSON.stringify({ companySlug: automationData.slug });

  return (
    <AppShell>
      <PageHeader eyebrow="إعدادات الحساب وتجربة العملاء" title="الإعدادات" />

      {/* Company settings */}
      <section className="animate-fade-up anim-d1 mb-4">
        <CompanySettingsForm />
      </section>

      {/* Demo data */}
      <section className="animate-fade-up anim-d2 mb-4">
        <DemoDataActions />
      </section>

      {/* Integrations */}
      <section className="app-card animate-fade-up anim-d3 mb-4" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Settings2 size={16} style={{ color: "var(--accent)" }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>الربط والتكاملات</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <IntegrationCard name="إرسال البريد"    status={smtpConfigured ? "جاهز لإرسال رسائل المتابعة" : "يحتاج إعداد بيانات البريد من لوحة المطور"} ready={smtpConfigured} />
          <IntegrationCard name="واتساب"          status="جاهز للتوصيل عند توفير بيانات Meta" />
          <IntegrationCard name="تقويم Google"    status="يحتاج ربط حساب Google" />
          <IntegrationCard name="الدفع الإلكتروني" status="يحتاج اختيار مزود دفع" />
        </div>
      </section>

      {/* Developer tools */}
      <details className="app-card animate-fade-up anim-d4" style={{ padding: "18px 20px" }}>
        <summary style={{ cursor: "pointer", listStyle: "none" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>أدوات المطور والإدارة المتقدمة</h3>
                <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2, margin: 0 }}>إعدادات تقنية مخفية عن المستخدم العادي.</p>
              </div>
            </div>
            <span style={{
              background: "var(--bg-3)", border: "1px solid var(--border)",
              padding: "4px 12px", borderRadius: 20,
              fontSize: 12, color: "var(--text-3)", fontWeight: 500,
            }}>
              عرض الأدوات المتقدمة
            </span>
          </div>
        </summary>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <DevLink href="/system"    label="فحص حالة النظام" />
          <DevLink href="/agent-lab" label="اختبار الذكاء الاصطناعي" icon={<FlaskConical size={14} />} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, padding: "14px 16px", background: "var(--bg-3)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
            <div>
              <h3 style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>جدولة المتابعات التلقائية</h3>
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, margin: 0 }}>تشغيل المتابعات تلقائيًا باستخدام مفتاح آمن وجدولة خارجية.</p>
            </div>
          </div>
          <RunAutomationButton compact />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          <MetricBox title="المهام المستحقة الآن" value={String(automationData.dueCount)}                                      icon={Clock3} />
          <MetricBox title="آخر تنفيذ"            value={automationData.latestRunAt ? formatDate(automationData.latestRunAt) : "لا يوجد بعد"} icon={PlayCircle} />
          <MetricBox title="حالة السر"            value={automationSecretConfigured ? "جاهز" : "غير مكتمل"}                   icon={KeyRound} />
          <MetricBox title="حالة SMTP"            value={smtpConfigured ? "جاهز" : "غير مكتمل"}                              icon={KeyRound} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <CodeBlock title="رابط التشغيل الآلي"              body={`${endpoint}\n\nPayload:\n${payload}`} />
          <CodeBlock title="جدولة Cron"                      body={`curl -X POST "${endpoint}" \\\n  -H "Authorization: Bearer YOUR_AUTOMATION_SECRET" \\\n  -H "Content-Type: application/json" \\\n  -d '${payload}'`} />
        </div>
      </details>
    </AppShell>
  );
}

/* ── sub-components ── */
function IntegrationCard({ name, status, ready = false }: { name: string; status: string; ready?: boolean }) {
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{name}</span>
        <KeyRound size={14} style={{ color: ready ? "#10b981" : "var(--text-3)", flexShrink: 0 }} />
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, margin: 0 }}>{status}</p>
    </div>
  );
}

function MetricBox({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon size={13} style={{ color: "var(--text-3)" }} />
        <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>{value}</div>
    </div>
  );
}

function DevLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link href={href} className="developer-link" style={{
      display: "flex", alignItems: "center", gap: 7,
      background: "var(--bg-3)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "11px 14px",
      fontSize: 13, fontWeight: 600, color: "var(--text-1)",
      textDecoration: "none", transition: "background 130ms",
    }}>
      {icon} {label}
    </Link>
  );
}

function CodeBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>{title}</div>
      <pre style={{
        background: "#0d1117", color: "#e6edf3",
        borderRadius: 6, padding: "10px 12px",
        fontSize: 11.5, lineHeight: 1.7,
        overflowX: "auto", whiteSpace: "pre-wrap",
        margin: 0,
      }}>
        {body}
      </pre>
    </div>
  );
}

async function getAutomationData(companyId: string) {
  const [company, dueCount, latestRun] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }),
    prisma.followUp.count({ where: { companyId, status: "SCHEDULED", dueAt: { lte: new Date() } } }),
    prisma.auditLog.findFirst({ where: { companyId, action: "follow_up.run" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return { slug: company?.slug ?? "", dueCount, latestRunAt: latestRun?.createdAt ?? null };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
