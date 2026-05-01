"use client";

import type React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, PhoneForwarded, RotateCcw, Send } from "lucide-react";

type ConversationAction = "close" | "escalate" | "reopen";

export function InboxReplyForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanBody = body.trim();
    if (!cleanBody || pending) return;

    setError("");
    setSuccess("");

    const response = await fetch("/api/inbox/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, body: cleanBody }),
    });

    if (!response.ok) {
      setError("تعذر إرسال الرد. حاول مرة أخرى.");
      return;
    }

    setBody("");
    setSuccess("تم إرسال الرد");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submitReply} className="space-y-2">
      <p className="text-xs leading-5 text-slate-500">
        هذا الرد يُرسل باسم المندوب للعميل. إذا أردت اختبار رد المساعد التلقائي استخدم صفحة محادثة الموقع.
      </p>
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="field-shell h-11 min-w-0 flex-1 rounded-md px-3 text-sm outline-none"
          placeholder="اكتب رد المندوب للعميل هنا"
        />
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send size={17} aria-hidden="true" />
          الرد على العميل
        </button>
      </div>
      {success ? <p className="text-xs font-medium text-emerald-600">{success}</p> : null}
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </form>
  );
}

export function ConversationActionButton({ action, conversationId }: { action: ConversationAction; conversationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const labels: Record<ConversationAction, string> = {
    close: "إغلاق المحادثة",
    escalate: "تحويل لمندوب",
    reopen: "إعادة فتح",
  };
  const icons: Record<ConversationAction, React.ReactNode> = {
    close: <CheckCheck size={17} aria-hidden="true" />,
    escalate: <PhoneForwarded size={17} aria-hidden="true" />,
    reopen: <RotateCcw size={17} aria-hidden="true" />,
  };

  async function runAction() {
    if (pending) return;

    const response = await fetch("/api/inbox/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, action }),
    });

    if (response.ok) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <button
      onClick={runAction}
      disabled={pending}
      className={`inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        action === "escalate" ? "btn-primary" : "btn-secondary"
      }`}
    >
      {icons[action]}
      {labels[action]}
    </button>
  );
}
