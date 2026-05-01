"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";

export function RunAutomationButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  async function runAutomation() {
    if (pending) return;
    setMessage("");
    const res = await fetch("/api/automation/follow-ups/run", {
      method: "POST", headers: { "content-type": "application/json" },
    });
    if (!res.ok) { setMessage("تعذر تشغيل المتابعات الآن."); return; }
    const data = (await res.json()) as { processedCount?: number };
    const n = Number.isFinite(Number(data.processedCount)) ? Number(data.processedCount) : 0;
    setMessage(n ? `تم تنفيذ ${n} مهمة.` : "لا توجد مهام مستحقة الآن.");
    startTransition(() => router.refresh());
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={runAutomation} disabled={pending}
        className={`${compact ? "btn-secondary h-9 rounded-lg px-3 text-sm" : "btn-primary h-10 rounded-lg px-4 text-sm"} inline-flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        تشغيل المتابعات
      </button>
      {message && <p style={{ fontSize: 12, color: "var(--text-3)" }}>{message}</p>}
    </div>
  );
}