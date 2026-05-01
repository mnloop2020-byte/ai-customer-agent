"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, ChevronDown, RotateCcw, SendHorizonal, Sparkles, UserRound } from "lucide-react";
import { ChatKnowledgeSource, ChatReply } from "@/domain/chat";
import { CompanyProfile, defaultCompanyProfile } from "@/domain/company";
import { statusLabel, uiLabel } from "@/lib/ui-labels";

/* ─── types ─── */
type Msg = { id: string; sender: "customer" | "agent"; body: string; sources?: ChatKnowledgeSource[]; ts: Date };
type Props = { endpoint?: string; profileEndpoint?: string; showInsights?: boolean; fullHeight?: boolean };
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

/* ─── helpers ─── */
const mkWelcome = (name: string): Msg => ({
  id: "welcome", sender: "agent", ts: new Date(),
  body: `أهلًا وسهلًا، معك مساعد ${name}. كيف أقدر أساعدك اليوم؟`,
});

const CARD: React.CSSProperties = {
  background: "var(--bg-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
};

const INFO_BOX: React.CSSProperties = {
  background: "var(--bg-3)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
};

/* ═══════════════════════════════════ */
export function WebChat({
  endpoint = "/api/chat/message",
  profileEndpoint = "/api/company/profile",
  showInsights = true,
  fullHeight = false,
}: Props) {
  const [profile, setProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [msgs, setMsgs]       = useState<Msg[]>([mkWelcome("MNtechnique")]);
  const [input, setInput]     = useState("");
  const [score, setScore]     = useState(0);
  const [reply, setReply]     = useState<ChatReply | null>(null);
  const [convId, setConvId]   = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const tailRef = useRef<HTMLDivElement>(null);
  const storageKey = useMemo(() => `ai-customer-agent:conversation:${endpoint}`, [endpoint]);
  const visitorStorageKey = useMemo(() => `ai-customer-agent:visitor:${endpoint}`, [endpoint]);

  const examples = useMemo(() => [
    "ما اسمك؟",
    `كم سعر ${profile.services[0]?.name ?? "الخدمة"}؟`,
    "أريد الاشتراك",
    "أحتاج عرض سعر",
    "وين موقعكم؟",
  ], [profile.services]);

  useEffect(() => {
    fetch(profileEndpoint)
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setProfile(d.profile);
          setMsgs((current) => current.length === 1 && current[0]?.id === "welcome" ? [mkWelcome(d.profile.name)] : current);
        }
      });
  }, [profileEndpoint]);

  useEffect(() => {
    const currentVisitorSessionId = getOrCreateVisitorSessionId(visitorStorageKey);
    const savedConversationId = window.localStorage.getItem(storageKey);
    if (!savedConversationId) return;

    let cancelled = false;

    const params = new URLSearchParams({
      conversationId: savedConversationId,
      visitorSessionId: currentVisitorSessionId,
    });

    fetch(`${endpoint}?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Conversation not found");
        return response.json() as Promise<{ conversation: StoredConversation }>;
      })
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
      .catch(() => {
        window.localStorage.removeItem(storageKey);
        if (!cancelled) setConvId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, profile.name, storageKey, visitorStorageKey]);

  useEffect(() => { tailRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMsgs((p) => [...p, { id: crypto.randomUUID(), sender: "customer", body: text, ts: new Date() }]);
    setInput(""); setBusy(true);
    try {
      const currentVisitorSessionId = getOrCreateVisitorSessionId(visitorStorageKey);

      const res  = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: text,
          conversationId: convId ?? undefined,
          visitorSessionId: currentVisitorSessionId,
          leadSnapshot: { score, status: reply?.temperature ?? "NEW" },
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reply: ChatReply };
      setReply(data.reply); setScore(data.reply.leadScore); setConvId(data.reply.conversationId);
      window.localStorage.setItem(storageKey, data.reply.conversationId);
      setMsgs((p) => [...p, { id: crypto.randomUUID(), sender: "agent", body: data.reply.message, sources: data.reply.knowledgeSourceDetails ?? [], ts: new Date() }]);
    } catch {
      setMsgs((p) => [...p, { id: crypto.randomUUID(), sender: "agent", body: "تعذر إرسال الرسالة الآن. جرّب مرة أخرى خلال لحظة.", ts: new Date() }]);
    } finally { setBusy(false); }
  }

  const reset = () => {
    window.localStorage.removeItem(storageKey);
    setMsgs([mkWelcome(profile.name)]);
    setInput("");
    setScore(0);
    setReply(null);
    setConvId(null);
  };

  /* score color */
  const sc = score >= 70 ? "var(--accent)" : score >= 40 ? "var(--warm)" : "var(--text-3)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: showInsights ? "1fr 272px" : "1fr",
      gap: 12,
      height: fullHeight ? "calc(100vh - 24px)" : "calc(100vh - 130px)",
      minHeight: fullHeight ? "calc(100vh - 24px)" : 480,
      maxHeight: fullHeight ? "calc(100vh - 24px)" : 820,
    }}>

      {/* ══ Chat panel ══ */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ─ header ─ */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", flexShrink: 0,
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bot size={17} color="#fff" strokeWidth={2.3} />
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>{profile.name}</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  color: "var(--accent)", fontSize: 10, padding: "2px 7px", borderRadius: 20,
                  fontFamily: "var(--font-mono)",
                }}>
                  <CheckCircle2 size={10} /> متصل الآن
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>مساعد مباشر لخدمة العملاء</p>
            </div>
          </div>
          <button onClick={reset} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--bg-3)", border: "1px solid var(--border)",
            color: "var(--text-2)", borderRadius: 8, padding: "6px 10px",
            fontSize: 11.5, cursor: "pointer", flexShrink: 0,
          }}>
            <RotateCcw size={12} /> إعادة
          </button>
        </div>

        {/* ─ messages ─ */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px",
          background: "var(--bg-1)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {msgs.map((m) => {
            const agent = m.sender === "agent";
            return (
              <div key={m.id} style={{ display: "flex", gap: 8, justifyContent: agent ? "flex-start" : "flex-end" }}>
                {agent && (
                  <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Bot size={13} color="#fff" />
                  </span>
                )}
                <div style={{ maxWidth: "74%", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{
                    background: agent ? "#f1f5f9" : "#eff6ff",
                    border: `1px solid ${agent ? "var(--border)" : "#bfdbfe"}`,
                    borderRadius: agent ? "3px 10px 10px 10px" : "10px 3px 10px 10px",
                    padding: "9px 12px", fontSize: 13, lineHeight: 1.7, color: "var(--text-1)",
                  }}>
                    {m.body}
                    <div style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {agent ? "المساعد" : "العميل"} · {m.ts.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {agent && m.sources?.length ? <SourcesChip sources={m.sources} /> : null}
                </div>
                {!agent && (
                  <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: "var(--bg-3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <UserRound size={13} style={{ color: "var(--text-2)" }} />
                  </span>
                )}
              </div>
            );
          })}

          {busy && (
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bot size={13} color="#fff" />
              </span>
              <div style={{
                background: "var(--bg-2)", border: "1px solid var(--border)",
                borderRadius: "3px 10px 10px 10px", padding: "10px 14px",
                display: "flex", gap: 5, alignItems: "center",
              }}>
                {[0, 0.18, 0.36].map((d, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", animation: `pulse-ring 1s ${d}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={tailRef} />
        </div>

        {/* ─ input ─ */}
        <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {examples.map((ex) => (
              <button key={ex} onClick={() => setInput(ex)} style={{
                background: "var(--bg-3)", border: "1px solid var(--border)",
                color: "var(--text-2)", fontSize: 11, padding: "4px 9px",
                borderRadius: 20, cursor: "pointer", fontFamily: "var(--font-main)", transition: "all 140ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-2)"; }}
              >{ex}</button>
            ))}
          </div>
          <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب رسالتك هنا..."
              className="field-shell"
              style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 10, padding: "0 12px", fontSize: 13, outline: "none" }}
            />
            <button
              type="submit" disabled={busy || !input.trim()} className="btn-primary"
              style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: busy || !input.trim() ? 0.4 : 1, cursor: busy || !input.trim() ? "not-allowed" : "pointer" }}
            >
              <SendHorizonal size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* ══ Insights sidebar ══ */}
      {showInsights && (
        <aside style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>

          {/* state card */}
          <div style={{ ...CARD, padding: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-1)" }}>ملخص العميل</span>
              </div>
              <span style={{
                background: `${sc}1a`, color: sc, border: `1px solid ${sc}40`,
                padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)",
              }}>
                {score}/100
              </span>
            </div>
            {/* bar */}
            <div style={{ background: "var(--bg-3)", borderRadius: 4, height: 3, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${score}%`, background: sc, borderRadius: 4, transition: "width 600ms cubic-bezier(0.34,1.56,0.64,1)", boxShadow: score >= 70 ? "0 0 8px var(--accent-glow)" : "none" }} />
            </div>

            {([
              ["الاحتياج", reply?.intent ?? "—"],
              ["الخطوة التالية", reply?.nextAction ?? "بدء المحادثة"],
            ] as [string,string][]).map(([l, v]) => (
              <div key={l} style={{ ...INFO_BOX, marginBottom: 5 }}>
                <div style={{ fontSize: 9.5, color: "var(--text-3)", marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", wordBreak: "break-word" }}>{uiLabel(v)}</div>
              </div>
            ))}

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--text-3)" }}>تفاصيل العميل</summary>
              <div style={{ marginTop: 6 }}>
                {([
                  ["الأولوية", statusLabel(reply?.temperature ?? "NEW")],
                  ["التأهيل", uiLabel(reply?.qualificationStatus ?? "—")],
                  ["المرحلة", uiLabel(reply?.buyingStage ?? "—")],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{ ...INFO_BOX, marginBottom: 5 }}>
                    <div style={{ fontSize: 9.5, color: "var(--text-3)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)" }}>{value}</div>
                  </div>
                ))}
                {reply?.missingFields?.length ? (
                  <div style={{ background: "rgba(255,170,51,0.07)", border: "1px solid rgba(255,170,51,0.2)", borderRadius: 7, padding: "6px 9px", fontSize: 10.5, color: "var(--warm)", lineHeight: 1.5, marginTop: 4 }}>
                    معلومات نحتاجها: {reply.missingFields.map(uiLabel).join("، ")}
                  </div>
                ) : null}
              </div>
            </details>
          </div>

          {/* knowledge */}
          <div style={{ ...CARD, padding: "12px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-1)", marginBottom: 8 }}>مصادر الإجابة</p>
            {reply?.matchedKnowledge.length ? (
              reply.matchedKnowledge.map((item) => (
                <div key={item} style={{ ...INFO_BOX, marginBottom: 5, fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55 }}>{item}</div>
              ))
            ) : (
              <p style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6 }}>ستظهر هنا المصادر التي اعتمد عليها الرد عند توفرها.</p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function toUiMessage(message: StoredConversation["messages"][number]): Msg {
  return {
    id: message.id,
    sender: message.sender === "CUSTOMER" ? "customer" : "agent",
    body: message.body,
    ts: new Date(message.createdAt),
  };
}

function getOrCreateVisitorSessionId(storageKey: string) {
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(storageKey, id);
  return id;
}

/* ─── sources expandable chip ─── */
function SourcesChip({ sources }: { sources: ChatKnowledgeSource[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid rgba(0,213,168,0.15)", borderRadius: "3px 8px 8px 8px", overflow: "hidden" }}>
      <button onClick={() => setOpen((p) => !p)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 10px", background: "transparent", border: "none",
        color: "var(--accent)", fontSize: 10.5, cursor: "pointer", fontFamily: "var(--font-mono)",
      }}>
        <span>مصادر الإجابة</span>
        <ChevronDown size={10} style={{ transform: open ? "rotate(180deg)" : "none", transition: "200ms" }} />
      </button>
      {open && (
        <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {sources.slice(0, 2).map((s) => (
            <div key={`${s.documentTitle}-${s.score}`} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 9px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-1)" }}>{s.documentTitle}</span>
              </div>
              <p style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
