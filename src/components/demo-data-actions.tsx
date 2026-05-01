// ── demo-data-actions.tsx ──────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, Trash2 } from "lucide-react";

export function DemoDataActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError]     = useState("");

  async function run(action: "seed" | "clear") {
    if (pending) return;
    if (action === "clear" && !window.confirm("سيتم حذف البيانات التجريبية فقط. هل تريد المتابعة؟")) return;
    setMessage(""); setError("");
    const res = await fetch("/api/demo-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) { setError("تعذر تنفيذ العملية. حاول مرة أخرى."); return; }
    setMessage(payload?.message ?? "تم تنفيذ العملية بنجاح.");
    startTransition(() => router.refresh());
  }

  return (
    <div style={{
      border: "1.5px dashed var(--border-strong)",
      borderRadius: "var(--r-lg)", background: "var(--bg-3)",
      padding: "16px 18px",
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Demo Mode</h3>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.6 }}>
        حمّل بيانات واقعية لتجربة رحلة العملاء والصفقات. يمكن مسحها لاحقًا بدون لمس بياناتك الحقيقية.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => run("seed")} disabled={pending}
          className="btn-secondary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
          تحميل بيانات تجريبية
        </button>
        <button
          onClick={() => run("clear")} disabled={pending}
          className="btn-danger inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          مسح البيانات التجريبية
        </button>
      </div>
      {message && <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "#16a34a" }}>{message}</p>}
      {error   && <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}