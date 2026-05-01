import { Activity, AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getSystemHealth } from "@/lib/system/health";

export default async function SystemPage() {
  const user = await getCurrentUser();
  const health = user ? await getSystemHealth(user.companyId) : null;

  return (
    <AppShell>
      <PageHeader eyebrow="أدوات المطور" title="فحص حالة النظام" />

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <Metric label="قاعدة البيانات" value={health?.database.ok ? "متصلة" : "غير متصلة"} ok={Boolean(health?.database.ok)} icon={Database} />
        <Metric label="العملاء" value={String(health?.database.leadCount ?? 0)} ok icon={Activity} />
        <Metric label="متابعات مجدولة" value={String(health?.automation.scheduledFollowUps ?? 0)} ok icon={Activity} />
        <Metric label="متابعات فاشلة" value={String(health?.automation.failedFollowUps ?? 0)} ok={!health?.automation.failedFollowUps} icon={AlertTriangle} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Readiness checklist">
          <div className="space-y-2">
            {health?.readiness.items.map((item) => (
              <div key={item.key} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                {item.ok ? (
                  <CheckCircle2 size={17} className="mt-0.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle size={17} className="mt-0.5 text-amber-600" aria-hidden="true" />
                )}
                <div>
                  <div className="text-sm font-semibold text-slate-950">{item.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.action}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Environment">
          <div className="grid gap-2 sm:grid-cols-2">
            {health
              ? Object.entries(health.environment).map(([key, value]) => (
                  <EnvRow key={key} label={key} value={String(value)} ok={Boolean(value)} />
                ))
              : null}
          </div>
        </Panel>
      </section>

      <section className="app-card mt-4 p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck size={17} className="text-[var(--accent)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-950">Recent failed follow-ups</h3>
        </div>
        <div className="space-y-2">
          {health?.automation.recentFailures.length ? (
            health.automation.recentFailures.map((item) => (
              <div key={item.id} className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-rose-800">{item.leadName}</span>
                  <span className="text-xs text-rose-700">
                    {item.kind} | Step {item.stepNumber}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-6 text-rose-700">{item.message}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No failed follow-ups right now.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  ok,
  icon: Icon,
}: {
  label: string;
  value: string;
  ok: boolean;
  icon: typeof Activity;
}) {
  return (
    <div className="app-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon size={16} className={ok ? "text-emerald-600" : "text-amber-600"} aria-hidden="true" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function EnvRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{value}</span>
    </div>
  );
}
