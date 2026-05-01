import { CircleDollarSign, HandCoins, TrendingUp } from "lucide-react";
import { AppShell }          from "@/components/app-shell";
import { DealStatusActions } from "@/components/deal-status-actions";
import { PageHeader }        from "@/components/page-header";
import { getCurrentUser }    from "@/lib/auth/session";
import { prisma }            from "@/lib/db";
import { channelLabel, statusLabel } from "@/lib/ui-labels";

export default async function DealsPage() {
  const user = await getCurrentUser();
  const data = user ? await getDealsData(user.companyId) : null;

  return (
    <AppShell>
      <PageHeader eyebrow="مسار المبيعات" title="الصفقات" />

      {/* Metrics */}
      <section
        className="animate-fade-up anim-d1"
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}
      >
        <MetricCard label="قيمة الصفقات المفتوحة" value={formatMoney(data?.openValue ?? 0)}    icon={CircleDollarSign} color="var(--accent)" />
        <MetricCard label="الإيراد المكتسب"         value={formatMoney(data?.wonValue ?? 0)}     icon={HandCoins}        color="#10b981" />
        <MetricCard label="صفقات مفتوحة"            value={String(data?.openCount ?? 0)}         icon={TrendingUp}       color="#f59e0b" />
        <MetricCard label="صفقات رابحة"             value={String(data?.wonCount ?? 0)}          icon={HandCoins}        color="#6366f1" />
      </section>

      {/* Table */}
      <div className="app-card animate-fade-up anim-d2" style={{ overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>الصفقة</th>
              <th>العميل</th>
              <th>القيمة</th>
              <th>الحالة</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {data?.deals.length ? (
              data.deals.map((deal) => (
                <tr key={deal.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{deal.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{formatDate(deal.createdAt)}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: "var(--text-1)" }}>
                      {deal.lead.fullName ?? "زائر محادثة الموقع"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                      {deal.lead.email ?? deal.lead.phone ?? channelLabel(deal.lead.channel)}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--text-1)" }}>
                    {formatMoney(Number(deal.value ?? 0), deal.currency)}
                  </td>
                  <td><DealPill status={deal.status} /></td>
                  <td><DealStatusActions dealId={deal.id} status={deal.status} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>
                  لا توجد صفقات بعد. ستظهر الصفقات تلقائيًا عندما يقدم المساعد عرضًا مناسبًا أو يسجل حجزًا.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="app-card" style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 500 }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} style={{ color }} />
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function DealPill({ status }: { status: string }) {
  const cfg =
    status === "WON"  ? { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" } :
    status === "LOST" ? { bg: "#fff1f2", color: "#be123c", border: "#fecdd3" } :
                        { bg: "#fffbeb", color: "#b45309", border: "#fde68a" };
  return (
    <span style={{
      display: "inline-block", background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`, padding: "3px 9px",
      borderRadius: 5, fontSize: 11.5, fontWeight: 600,
    }}>
      {statusLabel(status)}
    </span>
  );
}

async function getDealsData(companyId: string) {
  const deals = await prisma.deal.findMany({
    where: { lead: { companyId } },
    include: { lead: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const open = deals.filter((d) => ["OPEN","PROPOSAL_SENT","NEGOTIATION"].includes(d.status));
  const won  = deals.filter((d) => d.status === "WON");
  return { deals, openCount: open.length, wonCount: won.length, openValue: sum(open), wonValue: sum(won) };
}

function sum(deals: Array<{ value: { toString(): string } | null }>) {
  return deals.reduce((t, d) => t + Number(d.value?.toString() ?? 0), 0);
}

function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(date);
}