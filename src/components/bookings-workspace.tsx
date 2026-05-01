"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Clock3, Plus } from "lucide-react";

type BookingRow = {
  id: string;
  lead: string;
  kind: string;
  stepNumber: number;
  message: string;
  dueAt: string;
  status: string;
};

type LeadOption = {
  id: string;
  name: string;
};

export function BookingsWorkspace({ bookings, leads }: { bookings: BookingRow[]; leads: LeadOption[] }) {
  const router = useRouter();
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [message, setMessage] = useState("متابعة عرض السعر");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  async function createBooking() {
    if (!leadId || !message.trim() || !dueAt || pending) return;

    setError("");
    setSuccess("");

    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId, message, dueAt }),
    });

    if (!response.ok) {
      setError("تعذر إنشاء الموعد. تأكد من اختيار العميل والوقت.");
      return;
    }

    setMessage("متابعة عرض السعر");
    setDueAt("");
    setSuccess("تم حفظ الموعد بنجاح");
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-bold text-slate-950">المواعيد والمتابعات</h3>
          <p className="mt-1 text-sm text-slate-500">كل موعد يظهر بعنوان واضح وعميل ووقت المتابعة.</p>
        </div>

        {bookings.length ? (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {bookings.map((booking) => (
              <article key={booking.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-950">{displayKind(booking.kind, booking.message)}</h4>
                    <p className="mt-1 text-sm text-slate-500">{booking.lead}</p>
                  </div>
                  <StatusPill status={booking.status} />
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                  <Clock3 size={16} className="text-slate-400" />
                  {booking.dueAt}
                </div>
                <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">عرض التفاصيل</summary>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{booking.message}</p>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <CalendarCheck size={34} className="text-slate-400" />
            <h3 className="mt-3 font-bold text-slate-950">لا توجد مواعيد اليوم</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">أضف موعد متابعة حتى لا تضيع فرصة مع عميل مهتم.</p>
          </div>
        )}
      </section>

      <aside className="app-card p-5">
        <div className="flex items-center gap-2">
          <CalendarCheck size={19} className="text-blue-600" aria-hidden="true" />
          <h3 className="font-bold">إضافة موعد</h3>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium">العميل</span>
            <select value={leadId} onChange={(event) => setLeadId(event.target.value)} className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none">
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">عنوان الموعد</span>
            <input value={message} onChange={(event) => setMessage(event.target.value)} className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">التاريخ والوقت</span>
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none" />
          </label>
          <button onClick={createBooking} disabled={pending || !leadId || !dueAt} className="btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={17} aria-hidden="true" />
            حفظ الموعد
          </button>
          {success ? <p className="text-sm font-medium text-emerald-600">{success}</p> : null}
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          {!leads.length ? <p className="text-sm leading-6 text-slate-500">أضف عميلًا أولًا حتى تستطيع جدولة موعد.</p> : null}
        </div>
      </aside>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "SENT") return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">مكتمل</span>;
  if (status === "FAILED") return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">متأخر</span>;
  if (status === "CANCELLED") return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">ملغي</span>;
  return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">متابعة</span>;
}

function displayKind(kind: string, message: string) {
  if (message?.trim()) return message;
  if (kind === "BOOKING") return "موعد عرض توضيحي";
  if (kind === "CHECK_DECISION") return "مراجعة قرار العميل";
  if (kind === "CONTINUE_QUALIFICATION") return "استكمال التأهيل";
  if (kind === "RECOVER_OBJECTION") return "معالجة اعتراض";
  if (kind === "REENGAGE_LOST") return "إعادة تواصل";
  return "متابعة العميل";
}
