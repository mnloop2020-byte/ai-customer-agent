"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, CheckCircle2, ChevronDown, RotateCcw, SendHorizonal,
  Sparkles, UserRound, Zap, ArrowRight, Package, HelpCircle, PhoneCall,
} from "lucide-react";
import { ChatKnowledgeSource, ChatReply } from "@/domain/chat";
import { CompanyProfile, defaultCompanyProfile } from "@/domain/company";
import { statusLabel, uiLabel } from "@/lib/ui-labels";

/* ─── types ─── */
type Msg = {
  id: string;
  sender: "customer" | "agent";
  body: string;
  sources?: ChatKnowledgeSource[];
  ts: Date;
  cta?: CtaButton[];
};

type CtaButton = {
  label: string;
  icon: "start" | "packages" | "order" | "info" | "agent";
  action: "send" | "link";
  value: string;
};

type Props = {
  endpoint?: string;
  profileEndpoint?: string;
  showInsights?: boolean;
  fullHeight?: boolean;
};

type StoredConversation = {
  conversationId: string;
  leadId: string;
  leadScore: number;
  leadStatus: string;
  intent?: string | null;
  qualificationStatus?: string | null;
  buyingStage?: string | null;
  route?: string | null;
  summary?: string | null;
  latestAiRun?: {
    intent?: string | null;
    nextAction: string;
    response: string;
  } | null;
  messages: Array<{
    id: string;
    sender: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
    body: string;
    createdAt: string;
  }>;
};

/* ─── CTA Engine ─── */
function buildCta(reply: ChatReply): CtaButton[] {
  const intent   = (reply.intent ?? "").toLowerCase();
  const stage    = (reply.buyingStage ?? "").toLowerCase();
  const score    = reply.leadScore ?? 0;
  const route    = (reply.route ?? "").toLowerCase();
  const temp     = (reply.temperature ?? "").toLowerCase();

  // جاهزية عالية أو hot
  if (temp === "hot" || stage === "won" || route === "booking") {
    return [{ label: "إتمام الطلب الآن", icon: "order", action: "send", value: "أريد إتمام الطلب الآن" }];
  }

  // سؤال عن السعر أو عرض
  if (intent.includes("price") || intent.includes("ask_price") || intent.includes("ask_quote")) {
    return [
      { label: "عرض الباقات", icon: "packages", action: "send", value: "أريد رؤية الباقات والأسعار" },
      { label: "ابدأ الآن", icon: "start", action: "send", value: "أريد البدء الآن" },
    ];
  }

  // اعتراض
  if (intent.includes("objection") || route === "qualify") {
    return [
      { label: "اعرف أكثر", icon: "info", action: "send", value: "أريد معرفة المزيد عن الخدمة" },
      { label: "تحدث مع مندوب", icon: "agent", action: "send", value: "أريد التحدث مع مندوب" },
    ];
  }

  // score مرتفع
  if (score >= 60) {
    return [{ label: "ابدأ الآن", icon: "start", action: "send", value: "كيف أبدأ مع الخدمة؟" }];
  }

  // استكشاف
  if (intent.includes("service") || intent.includes("greeting") || stage === "discovery") {
    return [
      { label: "ما خدماتكم؟", icon: "info", action: "send", value: "ما هي خدماتكم الرئيسية؟" },
      { label: "كم الأسعار؟", icon: "packages", action: "send", value: "ما هي الأسعار والباقات؟" },
    ];
  }

  return [];
}

const ICON_MAP = {
  start:    <Zap size={11} />,
  packages: <Package size={11} />,
  order:    <CheckCircle2 size={11} />,
  info:     <HelpCircle size={11} />,
  agent:    <PhoneCall size={11} />,
};

/* ─── helpers ─── */
const mkWelcome = (name: string): Msg => ({
  id: "welcome",
  sender: "agent",
  ts: new Date(),
  body: `أهلًا وسهلًا، معك مساعد ${name}. كيف أقدر أساعدك اليوم؟`,
  cta: [
    { label: "ما خدماتكم؟",   icon: "info",     action: "send", value: "ما هي خدماتكم الرئيسية؟" },
    { label: "كم الأسعار؟",   icon: "packages", action: "send", value: "ما هي الأسعار والباقات؟" },
    { label: "ابدأ الآن",     icon: "start",    action: "send", value: "أريد البدء الآن" },
  ],
});

function toUiMessage(m: StoredConversation["messages"][number]): Msg {
  return { id: m.id, sender: m.sender === "CUSTOMER" ? "customer" : "agent", body: m.body, ts: new Date(m.createdAt) };
}

function getOrCreateVisitorSessionId(key: string) {
  const e = window.localStorage.getItem(key);
  if (e) return e;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

/* ═══════════════════════════════════════════════════════ */
export function WebChat({
  endpoint        = "/api/chat/message",
  profileEndpoint = "/api/company/profile",
  showInsights    = true,
  fullHeight      = false,
}: Props) {
  const [profile, setProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [msgs, setMsgs]       = useState<Msg[]>([mkWelcome("MNtechnique")]);
  const [input, setInput]     = useState("");
  const [score, setScore]     = useState(0);
  const [reply, setReply]     = useState<ChatReply | null>(null);
  const [convId, setConvId]   = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const tailRef      = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const storageKey   = useMemo(() => `ai-customer-agent:conversation:${endpoint}`, [endpoint]);
  const visitorKey   = useMemo(() => `ai-customer-agent:visitor:${endpoint}`, [endpoint]);

  const examples = useMemo(() => [
    "ما اسمك؟",
    `كم سعر ${profile.services[0]?.name ?? "الخدمة"}؟`,
    "أريد الاشتراك",
    "أحتاج عرض سعر",
    "وين موقعكم؟",
  ], [profile.services]);

  /* load profile */
  useEffect(() => {
    fetch(profileEndpoint).then(r => r.json()).then(d => {
      if (d.profile) {
        setProfile(d.profile);
        setMsgs(cur => cur.length === 1 && cur[0]?.id === "welcome" ? [mkWelcome(d.profile.name)] : cur);
      }
    });
  }, [profileEndpoint]);

  /* restore conversation */
  useEffect(() => {
    const sid  = getOrCreateVisitorSessionId(visitorKey);
    const cid  = window.localStorage.getItem(storageKey);
    if (!cid) return;
    let cancelled = false;

    fetch(`${endpoint}?${new URLSearchParams({ conversationId: cid, visitorSessionId: sid })}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<{ conversation: StoredConversation }>; })
      .then(({ conversation }) => {
        if (cancelled) return;
        setConvId(conversation.conversationId);
        setScore(conversation.leadScore);
        setMsgs(conversation.messages.length ? conversation.messages.map(toUiMessage) : [mkWelcome(profile.name)]);
        setReply({
          message: conversation.latestAiRun?.response ?? "",
          leadScore: conversation.leadScore,
          intent: conversation.latestAiRun?.intent ?? conversation.intent ?? "General Inquiry",
          temperature: conversation.leadStatus,
          nextAction: conversation.latestAiRun?.nextAction ?? "استئناف المحادثة",
          route: conversation.route ?? "QUALIFY",
          qualificationStatus: conversation.qualificationStatus ?? "UNKNOWN",
          buyingStage: conversation.buyingStage ?? "NEW",
          missingFields: [],
          summary: conversation.summary ?? "",
          matchedKnowledge: [],
          aiProvider: "memory",
          conversationId: conversation.conversationId,
          leadId: conversation.leadId,
        });
      })
      .catch(() => { window.localStorage.removeItem(storageKey); if (!cancelled) setConvId(null); });

    return () => { cancelled = true; };
  }, [endpoint, profile.name, storageKey, visitorKey]);

  /* auto-scroll */
  useEffect(() => { tailRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  /* send message */
  async function send(text?: string, e?: FormEvent) {
    e?.preventDefault();
    const body = (text ?? input).trim();
    if (!body || busy) return;

    setMsgs(p => [...p, { id: crypto.randomUUID(), sender: "customer", body, ts: new Date() }]);
    setInput("");
    setBusy(true);
    inputRef.current?.focus();

    try {
      const sid = getOrCreateVisitorSessionId(visitorKey);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, conversationId: convId ?? undefined, visitorSessionId: sid, leadSnapshot: { score, status: reply?.temperature ?? "NEW" } }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reply: ChatReply };
      const r    = data.reply;

      setReply(r);
      setScore(r.leadScore);
      setConvId(r.conversationId);
      window.localStorage.setItem(storageKey, r.conversationId);

      const ctaButtons = buildCta(r);
      setMsgs(p => [...p, {
        id: crypto.randomUUID(), sender: "agent", body: r.message,
        sources: r.knowledgeSourceDetails ?? [], ts: new Date(),
        cta: ctaButtons,
      }]);
    } catch {
      setMsgs(p => [...p, { id: crypto.randomUUID(), sender: "agent", body: "تعذر إرسال الرسالة الآن. جرّب مرة أخرى.", ts: new Date() }]);
    } finally { setBusy(false); }
  }

  const reset = () => {
    window.localStorage.removeItem(storageKey);
    setMsgs([mkWelcome(profile.name)]);
    setInput(""); setScore(0); setReply(null); setConvId(null);
  };

  const sc = score >= 70 ? "var(--accent)" : score >= 40 ? "var(--warm)" : "var(--text-3)";

  /* ── styles ── */
  const CARD: React.CSSProperties = { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)" };
  const INFO_BOX: React.CSSProperties = { background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: showInsights ? "1fr 272px" : "1fr",
      gap: 12,
      height: fullHeight ? "calc(100vh - 24px)" : "calc(100vh - 130px)",
      minHeight: fullHeight ? "calc(100vh - 24px)" : 480,
      maxHeight: fullHeight ? "calc(100vh - 24px)" : 820,
    }}>

      {/* ══ Chat Panel ══ */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", flexShrink: 0,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: "linear-gradient(135deg, var(--accent), #0099ff)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,213,168,0.3)",
            }}>
              <Bot size={18} color="#fff" strokeWidth={2.2} />
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)" }}>{profile.name}</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "#ecfdf5", border: "1px solid #6ee7b7",
                  color: "#059669", fontSize: 10, padding: "2px 7px", borderRadius: 20,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  متصل الآن
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>مساعد مباشر لخدمة العملاء</p>
            </div>
          </div>
          <button onClick={reset} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--bg-3)", border: "1px solid var(--border)",
            color: "var(--text-2)", borderRadius: 8, padding: "6px 10px",
            fontSize: 11.5, cursor: "pointer",
          }}>
            <RotateCcw size={12} /> إعادة
          </button>
        </div>

        {/* messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 14px",
          background: "var(--bg-1)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {msgs.map((m) => {
            const isAgent = m.sender === "agent";
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isAgent ? "flex-start" : "flex-end", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: isAgent ? "row" : "row-reverse" }}>

                  {/* avatar */}
                  {isAgent ? (
                    <span style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: "linear-gradient(135deg, var(--accent), #0099ff)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,213,168,0.25)",
                    }}>
                      <Bot size={13} color="#fff" />
                    </span>
                  ) : (
                    <span style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: "var(--bg-3)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <UserRound size={13} style={{ color: "var(--text-2)" }} />
                    </span>
                  )}

                  {/* bubble */}
                  <div style={{
                    maxWidth: "72%",
                    background: isAgent
                      ? "var(--bg-2)"
                      : "linear-gradient(135deg, var(--accent) 0%, #0099ff 100%)",
                    border: isAgent ? "1px solid var(--border)" : "none",
                    borderRadius: isAgent ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                    padding: "10px 13px",
                    fontSize: 13,
                    lineHeight: 1.75,
                    color: isAgent ? "var(--text-1)" : "#fff",
                    boxShadow: isAgent ? "none" : "0 3px 10px rgba(0,213,168,0.3)",
                  }}>
                    {m.body}
                    <div style={{
                      fontSize: 9.5,
                      color: isAgent ? "var(--text-3)" : "rgba(255,255,255,0.65)",
                      marginTop: 5,
                      fontFamily: "var(--font-mono)",
                    }}>
                      {isAgent ? "المساعد" : "أنت"} · {m.ts.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>

                {/* CTA buttons */}
                {isAgent && m.cta && m.cta.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingRight: 36 }}>
                    {m.cta.map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => send(btn.value)}
                        disabled={busy}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: "var(--bg-2)",
                          border: "1px solid var(--border)",
                          borderRadius: 20,
                          padding: "5px 11px",
                          fontSize: 11.5,
                          color: "var(--accent)",
                          cursor: busy ? "not-allowed" : "pointer",
                          fontFamily: "var(--font-main)",
                          transition: "all 140ms",
                          opacity: busy ? 0.5 : 1,
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = "rgba(0,213,168,0.08)";
                          el.style.borderColor = "var(--accent)";
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = "var(--bg-2)";
                          el.style.borderColor = "var(--border)";
                        }}
                      >
                        {ICON_MAP[btn.icon]}
                        {btn.label}
                        <ArrowRight size={9} />
                      </button>
                    ))}
                  </div>
                )}

                {/* sources */}
                {isAgent && m.sources?.length ? <div style={{ paddingRight: 36 }}><SourcesChip sources={m.sources} /></div> : null}
              </div>
            );
          })}

          {/* typing indicator */}
          {busy && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg, var(--accent), #0099ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bot size={13} color="#fff" />
              </span>
              <div style={{
                background: "var(--bg-2)", border: "1px solid var(--border)",
                borderRadius: "4px 12px 12px 12px",
                padding: "12px 16px",
                display: "flex", gap: 5, alignItems: "center",
              }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "var(--accent)",
                    animation: `pulse-ring 1.1s ${d}s infinite`,
                    opacity: 0.7,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={tailRef} />
        </div>

        {/* input area */}
        <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          {/* quick replies */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => send(ex)}
                disabled={busy}
                style={{
                  background: "var(--bg-3)", border: "1px solid var(--border)",
                  color: "var(--text-2)", fontSize: 11, padding: "4px 9px",
                  borderRadius: 20, cursor: "pointer", fontFamily: "var(--font-main)",
                  transition: "all 140ms", opacity: busy ? 0.5 : 1,
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--accent)"; el.style.color = "var(--accent)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.color = "var(--text-2)"; }}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* text input */}
          <form onSubmit={(e) => send(undefined, e)} style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="اكتب رسالتك هنا..."
              className="field-shell"
              style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 12, padding: "0 14px", fontSize: 13, outline: "none" }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn-primary"
              style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: busy || !input.trim() ? 0.4 : 1,
                cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                background: "linear-gradient(135deg, var(--accent), #0099ff)",
                border: "none",
                boxShadow: !busy && input.trim() ? "0 2px 8px rgba(0,213,168,0.4)" : "none",
                transition: "all 200ms",
              }}
            >
              <SendHorizonal size={16} color="#fff" />
            </button>
          </form>
        </div>
      </div>

      {/* ══ Insights Sidebar ══ */}
      {showInsights && (
        <aside style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>

          {/* score card */}
          <div style={{ ...CARD, padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)" }}>ملخص العميل</span>
              </div>
              <span style={{
                background: `${sc}1a`, color: sc, border: `1px solid ${sc}40`,
                padding: "2px 9px", borderRadius: 6, fontSize: 12.5, fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}>
                {score}/100
              </span>
            </div>

            {/* score bar */}
            <div style={{ background: "var(--bg-3)", borderRadius: 4, height: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{
                height: "100%", width: `${score}%`,
                background: `linear-gradient(90deg, ${sc}, ${score >= 70 ? "#0099ff" : sc})`,
                borderRadius: 4,
                transition: "width 700ms cubic-bezier(0.34,1.56,0.64,1)",
                boxShadow: score >= 70 ? "0 0 8px var(--accent-glow)" : "none",
              }} />
            </div>

            {/* temperature badge */}
            {reply?.temperature && (
              <div style={{ marginBottom: 10 }}>
                <TempBadge temp={reply.temperature} />
              </div>
            )}

            {([
              ["الاحتياج",       reply?.intent     ?? "—"],
              ["الخطوة التالية", reply?.nextAction ?? "بدء المحادثة"],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ ...INFO_BOX, marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: "var(--text-3)", marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", wordBreak: "break-word" }}>{uiLabel(v)}</div>
              </div>
            ))}

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--text-3)", userSelect: "none" }}>تفاصيل العميل</summary>
              <div style={{ marginTop: 8 }}>
                {([
                  ["الأولوية",  statusLabel(reply?.temperature ?? "NEW")],
                  ["التأهيل",   uiLabel(reply?.qualificationStatus ?? "—")],
                  ["المرحلة",   uiLabel(reply?.buyingStage ?? "—")],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{ ...INFO_BOX, marginBottom: 6 }}>
                    <div style={{ fontSize: 9.5, color: "var(--text-3)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)" }}>{value}</div>
                  </div>
                ))}
                {reply?.missingFields?.length ? (
                  <div style={{
                    background: "rgba(255,170,51,0.07)", border: "1px solid rgba(255,170,51,0.2)",
                    borderRadius: 7, padding: "6px 9px",
                    fontSize: 10.5, color: "var(--warm)", lineHeight: 1.5, marginTop: 4,
                  }}>
                    معلومات نحتاجها: {reply.missingFields.map(uiLabel).join("، ")}
                  </div>
                ) : null}
              </div>
            </details>
          </div>

          {/* knowledge sources */}
          <div style={{ ...CARD, padding: "14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 10 }}>مصادر الإجابة</p>
            {reply?.matchedKnowledge?.length ? (
              reply.matchedKnowledge.map((item) => (
                <div key={item} style={{ ...INFO_BOX, marginBottom: 6, fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55 }}>{item}</div>
              ))
            ) : (
              <p style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6 }}>ستظهر هنا المصادر عند توفرها.</p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

/* ─── Temperature Badge ─── */
function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, { label: string; bg: string; color: string; dot: string }> = {
    Hot:         { label: "عميل ساخن 🔥",  bg: "rgba(239,68,68,0.08)",   color: "#dc2626", dot: "#ef4444" },
    Warm:        { label: "عميل دافئ ✨",   bg: "rgba(245,158,11,0.08)",  color: "#d97706", dot: "#f59e0b" },
    Cold:        { label: "عميل بارد ❄️",   bg: "rgba(59,130,246,0.08)",  color: "#2563eb", dot: "#3b82f6" },
    Unqualified: { label: "غير مؤهل",       bg: "var(--bg-3)",            color: "var(--text-3)", dot: "var(--text-3)" },
  };
  const t = map[temp] ?? map.Unqualified;
  return (
    <div style={{ background: t.bg, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.color }}>{t.label}</span>
    </div>
  );
}

/* ─── Sources Chip ─── */
function SourcesChip({ sources }: { sources: ChatKnowledgeSource[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid rgba(0,213,168,0.15)", borderRadius: "4px 10px 10px 10px", overflow: "hidden" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 10px", background: "transparent", border: "none",
        color: "var(--accent)", fontSize: 10.5, cursor: "pointer", fontFamily: "var(--font-mono)",
      }}>
        <span>مصادر الإجابة</span>
        <ChevronDown size={10} style={{ transform: open ? "rotate(180deg)" : "none", transition: "200ms" }} />
      </button>
      {open && (
        <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
          {sources.slice(0, 2).map((s) => (
            <div key={`${s.documentTitle}-${s.score}`} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", marginBottom: 3 }}>{s.documentTitle}</div>
              <p style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}