"use client";

import { FormEvent, useState } from "react";
import { Bot, Loader2, LogIn, UserPlus } from "lucide-react";

export function LoginForm({ initialNeedsSetup }: { initialNeedsSetup: boolean }) {
  const [needsSetup] = useState(initialNeedsSetup);
  const [name, setName] = useState("Mohammed");
  const [email, setEmail] = useState("admin@mntechnique.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const endpoint = needsSetup ? "/api/auth/setup" : "/api/auth/login";
    const payload = needsSetup ? { name, email, password } : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? (needsSetup ? "تعذر إنشاء الحساب" : "بيانات الدخول غير صحيحة"));
      }

      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  const setupMode = needsSetup === true;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="app-card w-full max-w-md p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-md bg-blue-600 text-white">
            <Bot size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm text-slate-500">مساعد المبيعات الذكي</p>
            <h1 className="text-xl font-bold text-slate-950">{setupMode ? "إعداد أول حساب" : "تسجيل الدخول"}</h1>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          {setupMode
            ? "سيتم إنشاء حساب الشركة وأول مستخدم لإدارة العملاء والمبيعات."
            : "ادخل باستخدام البريد وكلمة المرور الخاصة بحسابك."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {setupMode ? <Field label="الاسم" value={name} onChange={setName} autoComplete="name" /> : null}
          <Field label="البريد الإلكتروني" value={email} onChange={setEmail} autoComplete="email" type="email" />
          <Field
            label="كلمة المرور"
            value={password}
            onChange={setPassword}
            autoComplete={setupMode ? "new-password" : "current-password"}
            type="password"
          />

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button type="submit" disabled={loading || needsSetup === null} className="btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : setupMode ? <UserPlus size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
            {setupMode ? "إنشاء الحساب" : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} autoComplete={autoComplete} className="field-shell mt-2 h-11 w-full rounded-md px-3 text-sm outline-none" required />
    </label>
  );
}
