"use client";

import { useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal, UserPlus } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { channelLabel, uiLabel } from "@/lib/ui-labels";

type LeadRow = {
  id: string;
  name: string;
  company?: string;
  channel: string;
  intent: string;
  score: number;
  status: "Hot" | "Warm" | "Cold" | "Unqualified" | "Lost";
  service: string;
  budget: string;
  timeline: string;
  route: string;
  qualification: string;
  stage: string;
  missing: string;
  recommendedOffer: string;
  followUpKind: string;
  lostReason: string;
  reEngagement: string;
  next: string;
};

const statuses: Array<"Hot" | "Warm" | "Cold" | "Unqualified" | "Lost"> = ["Hot", "Warm", "Cold", "Unqualified", "Lost"];

export function LeadsWorkspace({ initialLeads, services }: { initialLeads: LeadRow[]; services: string[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All" | LeadRow["status"]>("All");
  const [name, setName] = useState("");
  const [service, setService] = useState(services[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const searchable = [lead.name, lead.company ?? "", lead.service, lead.intent, lead.next].join(" ").toLowerCase();
      return searchable.includes(query.toLowerCase()) && (status === "All" || lead.status === status);
    });
  }, [leads, query, status]);

  async function createLead() {
    if (!name.trim() || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: name, serviceName: service }),
      });

      if (!response.ok) throw new Error("Failed to create lead");

      const data = await response.json();
      setLeads((current) => [
        {
          id: data.lead.id,
          name: data.lead.fullName ?? name,
          company: undefined,
          channel: "WEB_CHAT",
          intent: data.lead.intent ?? "Manual Lead",
          score: data.lead.score ?? 20,
          status: "Cold",
          service: service || "-",
          budget: "غير محدد",
          timeline: "غير محدد",
          route: "QUALIFY",
          qualification: "UNKNOWN",
          stage: "NEW",
          missing: "service, customer_type, timeline",
          recommendedOffer: "-",
          followUpKind: "-",
          lostReason: "-",
          reEngagement: "-",
          next: "تأهيل إضافي",
        },
        ...current,
      ]);
      setName("");
      setSuccess("تم إضافة العميل بنجاح");
    } catch {
      setError("تعذر إضافة العميل. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="app-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="field-shell flex min-h-11 flex-1 items-center gap-2 rounded-md px-3">
            <Search size={17} className="text-slate-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن عميل أو خدمة"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={17} className="text-slate-500" aria-hidden="true" />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "All" | LeadRow["status"])}
              className="field-shell h-11 rounded-md px-3 text-sm outline-none"
            >
              <option value="All">كل الحالات</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {uiLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredLeads.length ? (
          <div className="divide-y divide-slate-100">
            {filteredLeads.map((lead) => (
              <article key={lead.id} className="p-4 transition hover:bg-slate-50/70">
                <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_110px_130px_1fr] md:items-center">
                  <div>
                    <div className="font-semibold text-slate-950">{lead.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{lead.company ?? channelLabel(lead.channel)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{lead.service}</div>
                    <div className="mt-1 text-xs text-slate-500">{uiLabel(lead.intent)}</div>
                  </div>
                  <Score value={lead.score} />
                  <StatusBadge status={lead.status} />
                  <div className="text-sm font-medium text-teal-700">{lead.next}</div>
                </div>

                <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">تفاصيل العميل</summary>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                    <Info label="القناة" value={channelLabel(lead.channel)} />
                    <Info label="المرحلة" value={uiLabel(lead.stage)} />
                    <Info label="التأهيل" value={uiLabel(lead.qualification)} />
                    <Info label="الميزانية" value={lead.budget} />
                    <Info label="الجاهزية" value={lead.timeline} />
                    <Info label="العرض المناسب" value={lead.recommendedOffer} />
                    <Info label="سبب الخسارة" value={lead.lostReason} />
                    <Info label="المتابعة" value={lead.followUpKind} />
                    <Info label="معلومات ناقصة" value={lead.missing} />
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <UserPlus size={34} className="text-slate-400" aria-hidden="true" />
            <h3 className="mt-3 font-semibold text-slate-950">لا يوجد عملاء بعد</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">ابدأ بإضافة أول عميل أو جرّب محادثة الموقع ليتم إنشاء العميل تلقائيًا.</p>
          </div>
        )}
      </section>

      <aside className="app-card p-5">
        <h3 className="font-semibold">إضافة عميل سريع</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">أضف العميل يدويًا عندما يأتيك من اتصال أو رسالة خارج الموقع.</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium">اسم العميل</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none"
              placeholder="مثال: محمد سالم"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">الخدمة</span>
            <select
              value={service}
              onChange={(event) => setService(event.target.value)}
              className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none"
            >
              {services.length ? services.map((item) => <option key={item}>{item}</option>) : <option value="">لا توجد خدمات</option>}
            </select>
          </label>
          <button
            onClick={createLead}
            disabled={saving}
            className="btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={17} aria-hidden="true" />
            إضافة عميل
          </button>
          {success ? <p className="text-sm font-medium text-emerald-600">{success}</p> : null}
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        </div>
      </aside>
    </div>
  );
}

function Score({ value }: { value: number }) {
  return (
    <span className="inline-flex w-fit min-w-12 justify-center rounded-md bg-teal-50 px-2 py-1 text-sm font-semibold text-teal-700">
      {value}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-medium text-slate-800">{value === "-" ? "غير محدد" : uiLabel(value)}</div>
    </div>
  );
}
