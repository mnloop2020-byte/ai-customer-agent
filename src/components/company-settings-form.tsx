"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { CompanyProfile, defaultCompanyProfile } from "@/domain/company";

export function CompanySettingsForm() {
  const [profile, setProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/company/profile")
      .then((response) => response.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => setError("تعذر تحميل إعدادات الشركة."))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError("");
  }

  function updateService(index: number, key: "name" | "price" | "description", value: string) {
    const services = profile.services.map((service, serviceIndex) =>
      serviceIndex === index ? { ...service, [key]: value } : service,
    );
    update("services", services);
  }

  function addService() {
    update("services", [
      ...profile.services,
      { name: "خدمة جديدة", price: "حسب الطلب", description: "اكتب وصف الخدمة هنا." },
    ]);
  }

  function removeService(index: number) {
    update(
      "services",
      profile.services.filter((_, serviceIndex) => serviceIndex !== index),
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");

    const response = await fetch("/api/company/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });

    if (response.ok) {
      const data = await response.json();
      setProfile(data.profile);
      setSaved(true);
    } else {
      setError("تعذر حفظ الإعدادات. تأكد أن كل الحقول الأساسية مكتملة.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="app-card flex min-h-40 items-center justify-center p-5 text-sm text-slate-500">
        <Loader2 size={18} className="ml-2 animate-spin" aria-hidden="true" />
        تحميل إعدادات الشركة...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── بيانات الشركة + شخصية المساعد ── */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="app-card p-5">
          <h3 className="font-semibold">بيانات الشركة</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="اسم الشركة"   value={profile.name}         onChange={(v) => update("name", v)} />
            <Field label="الصناعة"       value={profile.industry}     onChange={(v) => update("industry", v)} />
            <Field label="ساعات العمل"  value={profile.workingHours} onChange={(v) => update("workingHours", v)} />
            <Field label="الموقع"        value={profile.location}     onChange={(v) => update("location", v)} />
          </div>
          <label className="mt-3 block">
            <span className="text-sm font-medium">وصف الشركة</span>
            <textarea
              value={profile.description}
              onChange={(e) => update("description", e.target.value)}
              className="field-shell mt-2 min-h-24 w-full resize-y rounded-md p-3 text-sm leading-7 outline-none"
            />
          </label>
        </div>

        <div className="app-card p-5">
          <h3 className="font-semibold">شخصية وقواعد المساعد</h3>
          <label className="mt-4 block">
            <span className="text-sm font-medium">أسلوب الرد</span>
            <textarea
              value={profile.tone}
              onChange={(e) => update("tone", e.target.value)}
              className="field-shell mt-2 min-h-24 w-full resize-y rounded-md p-3 text-sm leading-7 outline-none"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-medium">قواعد التصعيد لمندوب</span>
            <textarea
              value={profile.handoffRule}
              onChange={(e) => update("handoffRule", e.target.value)}
              className="field-shell mt-2 min-h-24 w-full resize-y rounded-md p-3 text-sm leading-7 outline-none"
            />
          </label>
        </div>
      </section>

      {/* ── الأوامر الإلزامية ── */}
      <section className="app-card p-5">
        {/* رأس القسم */}
        <div className="mb-3 flex items-start gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: "rgba(239,68,68,.12)", color: "#ef4444" }}
            aria-hidden="true"
          >
            <AlertTriangle size={14} />
          </span>
          <div>
            <h3 className="font-semibold" style={{ color: "var(--text-1)" }}>
              الأوامر الإلزامية
            </h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-3)", lineHeight: 1.6 }}>
              قواعد عليا تُحقن في <strong>أول</strong> الـ system prompt وتأخذ أولوية على كل الأقسام الأخرى.
              إذا تُركت <strong>فارغة</strong>، يُستخدم تلقائيًا النص الافتراضي المدمج في الكود.
            </p>
          </div>
        </div>

        {/* شريط تحذير */}
        <div
          className="mb-3 rounded-md px-3 py-2 text-sm"
          style={{
            background: "rgba(239,68,68,.06)",
            border: "1px solid rgba(239,68,68,.2)",
            color: "#b91c1c",
            lineHeight: 1.6,
          }}
        >
          ⚠️ هذا القسم يتحكم في سلوك الموديل بشكل مباشر. تأكد من صياغة القواعد بدقة قبل الحفظ.
        </div>

        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            نص الأوامر الإلزامية
          </span>
          <textarea
            value={profile.executionRules}
            onChange={(e) => update("executionRules", e.target.value)}
            placeholder={`مثال:
- يمنع استخدام أي رد جاهز أو عام.
- يمنع البدء بسؤال.
- كل رد يجب أن يبدأ بجملة فائدة أو إقناع ملموس.
- إذا سأل العميل عن السعر → اذكر السعر مباشرة قبل أي إقناع.
- يمنع اختراع معلومات غير موجودة في مصادر المعرفة.`}
            className="field-shell mt-2 w-full resize-y rounded-md p-3 font-mono text-sm leading-7 outline-none"
            style={{ minHeight: 180, direction: "rtl" }}
          />
        </label>

        <p className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
          اتركها فارغة للاعتماد على القواعد الافتراضية المدمجة · كل سطر = قاعدة مستقلة
        </p>
      </section>

      {/* ── الخدمات والأسعار ── */}
      <section className="app-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-semibold">الخدمات والأسعار</h3>
            <p className="mt-1 text-sm text-slate-500">
              هذه المعلومات يستخدمها المساعد عند الرد وتحليل رسائل العملاء.
            </p>
          </div>
          <button
            onClick={addService}
            className="btn-secondary inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm"
          >
            <Plus size={16} aria-hidden="true" />
            إضافة خدمة
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {profile.services.length ? (
            profile.services.map((service, index) => (
              <div key={index} className="grid gap-3 p-4 lg:grid-cols-[1fr_220px_1.4fr_44px]">
                <Field label="اسم الخدمة" value={service.name}        onChange={(v) => updateService(index, "name", v)} />
                <Field label="السعر"       value={service.price}       onChange={(v) => updateService(index, "price", v)} />
                <Field label="الوصف"       value={service.description} onChange={(v) => updateService(index, "description", v)} />
                <button
                  onClick={() => removeService(index)}
                  className="mt-7 inline-flex size-11 items-center justify-center rounded-md border border-rose-100 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                  aria-label="حذف الخدمة"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <div className="p-5 text-sm text-slate-500">
              لا توجد خدمات مضافة بعد. يمكن للمساعد الاعتماد على مصادر المعرفة، أو أضف خدمة وسعرها من الزر أعلاه.
            </div>
          )}
        </div>
      </section>

      {/* ── حفظ ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <Save size={17} aria-hidden="true" />
          )}
          حفظ الإعدادات
        </button>
        {saved  ? <span className="text-sm font-medium text-teal-700">تم الحفظ في قاعدة البيانات.</span> : null}
        {error  ? <span className="text-sm font-medium text-rose-600">{error}</span>                        : null}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none"
      />
    </label>
  );
}