"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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
      {
        name: "خدمة جديدة",
        price: "حسب الطلب",
        description: "اكتب وصف الخدمة هنا.",
      },
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
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="app-card p-5">
          <h3 className="font-semibold">بيانات الشركة</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="اسم الشركة" value={profile.name} onChange={(value) => update("name", value)} />
            <Field label="الصناعة" value={profile.industry} onChange={(value) => update("industry", value)} />
            <Field label="ساعات العمل" value={profile.workingHours} onChange={(value) => update("workingHours", value)} />
            <Field label="الموقع" value={profile.location} onChange={(value) => update("location", value)} />
          </div>
          <label className="mt-3 block">
            <span className="text-sm font-medium">وصف الشركة</span>
            <textarea
              value={profile.description}
              onChange={(event) => update("description", event.target.value)}
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
              onChange={(event) => update("tone", event.target.value)}
              className="field-shell mt-2 min-h-24 w-full resize-y rounded-md p-3 text-sm leading-7 outline-none"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-medium">قواعد التصعيد لمندوب</span>
            <textarea
              value={profile.handoffRule}
              onChange={(event) => update("handoffRule", event.target.value)}
              className="field-shell mt-2 min-h-24 w-full resize-y rounded-md p-3 text-sm leading-7 outline-none"
            />
          </label>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-semibold">الخدمات والأسعار</h3>
            <p className="mt-1 text-sm text-slate-500">
              هذه المعلومات يستخدمها المساعد عند الرد وتحليل رسائل العملاء.
            </p>
          </div>
          <button onClick={addService} className="btn-secondary inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm">
            <Plus size={16} aria-hidden="true" />
            إضافة خدمة
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {profile.services.length ? profile.services.map((service, index) => (
            <div key={index} className="grid gap-3 p-4 lg:grid-cols-[1fr_220px_1.4fr_44px]">
              <Field label="اسم الخدمة" value={service.name} onChange={(value) => updateService(index, "name", value)} />
              <Field label="السعر" value={service.price} onChange={(value) => updateService(index, "price", value)} />
              <Field
                label="الوصف"
                value={service.description}
                onChange={(value) => updateService(index, "description", value)}
              />
              <button
                onClick={() => removeService(index)}
                className="mt-7 inline-flex size-11 items-center justify-center rounded-md border border-rose-100 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                aria-label="حذف الخدمة"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          )) : (
            <div className="p-5 text-sm text-slate-500">
              لا توجد خدمات مضافة بعد. يمكن للمساعد الاعتماد على مصادر المعرفة، أو أضف خدمة وسعرها من الزر أعلاه.
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
          حفظ الإعدادات
        </button>
        {saved ? <span className="text-sm font-medium text-teal-700">تم الحفظ في قاعدة البيانات.</span> : null}
        {error ? <span className="text-sm font-medium text-rose-600">{error}</span> : null}
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
        onChange={(event) => onChange(event.target.value)}
        className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none"
      />
    </label>
  );
}
