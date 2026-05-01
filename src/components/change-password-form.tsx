"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, Save } from "lucide-react";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "تعذر تغيير كلمة المرور");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("تم تغيير كلمة المرور بنجاح");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="app-card max-w-2xl p-5">
      <div className="flex items-center gap-2">
        <KeyRound size={19} className="text-teal-700" aria-hidden="true" />
        <h3 className="font-semibold">تغيير كلمة المرور</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        استخدم كلمة المرور الحالية ثم اكتب كلمة مرور جديدة قوية.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <PasswordField label="كلمة المرور الحالية" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField label="كلمة المرور الجديدة" value={newPassword} onChange={setNewPassword} />
        <PasswordField label="تأكيد كلمة المرور الجديدة" value={confirmPassword} onChange={setConfirmPassword} />

        {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {message ? <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-700">{message}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
          حفظ كلمة المرور
        </button>
      </form>
    </section>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        autoComplete="new-password"
        className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none"
        required
      />
    </label>
  );
}

