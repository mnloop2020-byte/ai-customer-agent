"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, SendHorizonal, Wrench } from "lucide-react";
import { CompanyProfile, defaultCompanyProfile } from "@/domain/company";
import type { AgentToolCall } from "@/lib/agent/tools";

type AgentDecision = {
  intent: string;
  qualificationSignals: string[];
  scoreDelta: number;
  temperature: string;
  nextAction: string;
  response: string;
  matchedKnowledge: string[];
  aiProvider?: string;
  toolCalls?: AgentToolCall[];
};

const examples = [
  "كم سعر بناء أنظمة ذكاء اصطناعي؟",
  "نحتاج Demo لفريق من 20 شخص خلال أسبوعين",
  "السعر أعلى من المتوقع",
  "أريد أكلم مندوب",
  "أحتاج عرض سعر مخصص",
];

const toolLabels: Record<string, string> = {
  search_knowledge: "البحث في معرفة الشركة",
  save_customer_message: "حفظ رسالة العميل",
  save_ai_message: "حفظ رد AI",
  record_ai_run: "تسجيل قرار AI",
  update_lead_qualification: "تحديث تأهيل العميل",
  update_conversation_status: "تحديث حالة المحادثة",
  handoff_to_human: "تصعيد لمندوب",
};

export function AgentLab() {
  const [body, setBody] = useState(examples[1]);
  const [score, setScore] = useState(40);
  const [decision, setDecision] = useState<AgentDecision | null>(null);
  const [profile, setProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/company/profile")
      .then((response) => response.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      });
  }, []);

  async function analyze() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/agent/analyze", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          body,
          channel: "WEB_CHAT",
          leadSnapshot: {
            score,
            status: "WARM",
          },
        }),
      });

      if (!response.ok) {
        throw new Error("تعذر تحليل الرسالة");
      }

      const data = (await response.json()) as { decision: AgentDecision };
      setDecision(data.decision);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="app-card p-5">
        <div className="flex items-center gap-2">
          <Bot size={19} className="text-teal-700" aria-hidden="true" />
          <h3 className="font-semibold">رسالة العميل</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          هذا المختبر يستخدم معرفة شركة: <span className="font-semibold text-slate-800">{profile.name}</span>
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              onClick={() => setBody(example)}
              className="btn-secondary min-h-9 rounded-full px-3 text-sm"
            >
              {example}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium">نص الرسالة</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="field-shell mt-2 min-h-36 w-full resize-y rounded-xl p-3 text-sm leading-7 outline-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium">Score الحالي للعميل: {score}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={score}
            onChange={(event) => setScore(Number(event.target.value))}
            className="mt-3 w-full accent-teal-700"
          />
        </label>

        <button
          onClick={analyze}
          disabled={loading || !body.trim()}
          className="btn-primary mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <SendHorizonal size={17} aria-hidden="true" />}
          تحليل الرسالة
        </button>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="app-card p-5">
        <h3 className="font-semibold">قرار Agent</h3>

        {decision ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Intent" value={decision.intent} />
              <Info label="Temperature" value={decision.temperature} />
              <Info label="Score Delta" value={`+${decision.scoreDelta}`} />
              <Info label="Next Action" value={decision.nextAction} />
              <Info label="AI Provider" value={decision.aiProvider ?? "smart-fallback"} />
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <Wrench size={16} className="text-teal-700" aria-hidden="true" />
                <p className="text-sm font-semibold">Agent Tools</p>
              </div>
              <div className="mt-3 grid gap-2">
                {decision.toolCalls?.length ? (
                  decision.toolCalls.map((tool) => (
                    <div key={tool.name} className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                      <p className="text-sm font-medium">{toolLabels[tool.name] ?? tool.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{tool.reason}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">لا توجد أدوات مقترحة.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Qualification Signals</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {decision.qualificationSignals.length ? (
                  decision.qualificationSignals.map((signal) => (
                    <span key={signal} className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                      {signal}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">لا توجد إشارات قوية بعد</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Matched Company Knowledge</p>
              <div className="mt-2 space-y-2">
                {decision.matchedKnowledge.length ? (
                  decision.matchedKnowledge.map((item) => (
                    <p key={item} className="rounded-xl bg-white px-3 py-2 text-sm leading-6 text-slate-700">
                      {item}
                    </p>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">لا توجد معلومة مطابقة من إعدادات الشركة</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
              <p className="text-xs font-medium text-teal-700">الرد المقترح</p>
              <p className="mt-2 text-sm leading-7">{decision.response}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm leading-7 text-slate-500">
            اكتب رسالة أو اختر مثالًا، ثم اضغط تحليل الرسالة لرؤية قرار الـ Agent والأدوات التي سيستخدمها.
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}
