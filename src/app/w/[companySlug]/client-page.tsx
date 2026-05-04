"use client";

/**
 * صفحة العميل العامة — /w/[companySlug]
 *
 * استبدل هذا الملف بـ:
 *   src/app/w/[companySlug]/page.tsx
 *
 * يمكنك إبقاء المنطق الحالي (getCompanyProfileBySlug, notFound)
 * وتغيير فقط هيكل الـ JSX بهذا الملف.
 *
 * ملاحظة: هذا ملف client component مستقل للعرض.
 * في مشروعك الفعلي احتفظ بـ `use server` في الـ wrapper
 * وأرسل profile كـ props لهذا المكون.
 */

import { useState, useRef, useEffect } from "react";

/* ══════════════════════════════════════════════
   Types
══════════════════════════════════════════════ */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

/* ══════════════════════════════════════════════
   Main Page Component
══════════════════════════════════════════════ */
export default function ClientPublicPage() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div style={{ fontFamily: "'Tajawal', 'Inter', system-ui, sans-serif", direction: "rtl" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --accent: #2563eb;
          --accent-mid: #1d4ed8;
          --accent-dim: #eff6ff;
          --accent-glow: rgba(37,99,235,0.15);
          --text-1: #0d1117;
          --text-2: #3d4451;
          --text-3: #7c8494;
          --border: #e4e7ed;
          --surface: #ffffff;
          --bg: #f0f2f5;
          --hot: #ef4444;
          --warm: #f59e0b;
          --success: #10b981;
        }

        html { scroll-behavior: smooth; }

        body {
          background: var(--bg);
          color: var(--text-2);
          font-size: 15px;
          line-height: 1.7;
          overflow-x: hidden;
        }

        .btn-primary {
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: background 140ms, transform 100ms, box-shadow 140ms;
          font-family: inherit;
        }
        .btn-primary:hover {
          background: var(--accent-mid);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px var(--accent-glow);
        }
        .btn-primary:active { transform: translateY(0); }

        .btn-outline {
          background: transparent;
          color: var(--accent);
          border: 2px solid var(--accent);
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: background 140ms, transform 100ms;
          font-family: inherit;
        }
        .btn-outline:hover {
          background: var(--accent-dim);
          transform: translateY(-2px);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes floatBadge {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-6px); }
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }

        .hero-animate { animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both; }
        .d1 { animation-delay: 0.05s; }
        .d2 { animation-delay: 0.12s; }
        .d3 { animation-delay: 0.19s; }
        .d4 { animation-delay: 0.26s; }
        .d5 { animation-delay: 0.33s; }

        .section-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03);
        }

        .plan-card {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 16px;
          padding: 28px 24px;
          transition: border-color 160ms, box-shadow 160ms, transform 160ms;
          position: relative;
          overflow: hidden;
        }
        .plan-card:hover {
          border-color: var(--accent);
          box-shadow: 0 8px 32px var(--accent-glow);
          transform: translateY(-4px);
        }
        .plan-card.featured {
          border-color: var(--accent);
          box-shadow: 0 4px 24px var(--accent-glow);
        }

        .problem-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px 20px;
          border-radius: 12px;
          background: #fff8f8;
          border: 1px solid #fecaca;
          transition: border-color 140ms;
        }
        .problem-item:hover { border-color: #f87171; }

        .solution-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px 20px;
          border-radius: 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          transition: border-color 140ms;
        }
        .solution-item:hover { border-color: #4ade80; }

        /* Chat widget */
        .chat-widget {
          position: fixed;
          bottom: 24px;
          left: 24px;
          z-index: 999;
        }

        .chat-bubble-btn {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--accent);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px var(--accent-glow), 0 2px 8px rgba(0,0,0,0.12);
          transition: transform 160ms, box-shadow 160ms;
          font-family: inherit;
        }
        .chat-bubble-btn:hover {
          transform: scale(1.08);
          box-shadow: 0 8px 28px var(--accent-glow);
        }

        .chat-panel {
          position: fixed;
          bottom: 90px;
          left: 24px;
          width: 360px;
          height: 540px;
          background: var(--surface);
          border-radius: 18px;
          border: 1px solid var(--border);
          box-shadow: 0 16px 48px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
          z-index: 998;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }

        .msg-assistant {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 14px 14px 14px 4px;
          padding: 10px 14px;
          font-size: 13.5px;
          color: var(--text-1);
          max-width: 85%;
          align-self: flex-start;
          line-height: 1.55;
        }

        .msg-user {
          background: var(--accent);
          color: #fff;
          border-radius: 14px 14px 4px 14px;
          padding: 10px 14px;
          font-size: 13.5px;
          max-width: 85%;
          align-self: flex-end;
          line-height: 1.55;
        }

        .cta-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        .cta-btn {
          background: var(--accent-dim);
          color: var(--accent);
          border: 1px solid #bfdbfe;
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 120ms;
        }
        .cta-btn:hover { background: #dbeafe; }

        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 10px 14px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 14px 14px 14px 4px;
          align-self: flex-start;
          width: fit-content;
        }
        .typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--text-3);
          animation: typingDot 1.2s ease infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @media (max-width: 768px) {
          .chat-panel {
            left: 12px;
            right: 12px;
            width: auto;
            bottom: 80px;
            height: 70vh;
            max-height: 520px;
          }
          .chat-widget { bottom: 16px; left: 16px; }
        }
      `}</style>

      {/* ── Navbar ── */}
      <Navbar onChatOpen={() => { setChatOpen(true); setTimeout(() => scrollToChat(), 100); }} />

      {/* ── Hero ── */}
      <HeroSection onChatOpen={() => setChatOpen(true)} />

      {/* ── Problems ── */}
      <ProblemSection />

      {/* ── Solution ── */}
      <SolutionSection />

      {/* ── Pricing ── */}
      <PricingSection onChatOpen={() => setChatOpen(true)} />

      {/* ── Chat CTA Banner ── */}
      <ChatCTASection onChatOpen={() => setChatOpen(true)} />

      {/* ── Footer ── */}
      <Footer />

      {/* ── Floating Chat Widget ── */}
      <FloatingChat open={chatOpen} onToggle={() => setChatOpen((v) => !v)} />
    </div>
  );
}

/* ══════════════════════════════════════════════
   Navbar
══════════════════════════════════════════════ */
function Navbar({ onChatOpen }: { onChatOpen: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: scrolled ? "rgba(255,255,255,0.95)" : "transparent",
      backdropFilter: scrolled ? "blur(16px)" : "none",
      borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
      transition: "all 200ms",
    }}>
      <div style={{
        maxWidth: 1140,
        margin: "0 auto",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 10px var(--accent-glow)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"/>
              <path d="M8 12h8M12 8v8"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.2 }}>نوفا تك</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>مساعد مبيعات ذكي</div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ display: "flex", gap: 4, alignItems: "center" }} className="hidden-mobile">
          {[
            { label: "المشكلة", href: "#problem" },
            { label: "الحل", href: "#solution" },
            { label: "الباقات", href: "#pricing" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 500,
                color: "var(--text-2)",
                transition: "color 130ms, background 130ms",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-2)"; }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <button
          className="btn-primary"
          onClick={onChatOpen}
          style={{ padding: "8px 20px", fontSize: 13.5 }}
        >
          ابدأ المحادثة
        </button>
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════════
   Hero
══════════════════════════════════════════════ */
function HeroSection({ onChatOpen }: { onChatOpen: () => void }) {
  return (
    <section style={{
      background: "linear-gradient(160deg, #f0f6ff 0%, #f0f2f5 50%, #f5f0ff 100%)",
      padding: "80px 24px 90px",
      textAlign: "center",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Background circles */}
      <div style={{
        position: "absolute", top: -80, right: -80,
        width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(37,99,235,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -60, left: -60,
        width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
        {/* Badge */}
        <div className="hero-animate d1" style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "#fff", border: "1px solid #bfdbfe",
          borderRadius: 20, padding: "5px 14px",
          fontSize: 12.5, fontWeight: 600, color: "var(--accent)",
          marginBottom: 20,
          animation: "floatBadge 4s ease-in-out infinite",
          boxShadow: "0 2px 10px var(--accent-glow)",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--success)", flexShrink: 0,
            animation: "pulse-dot 2s infinite",
          }} />
          يرد على عملائك الآن · 24/7
        </div>

        {/* H1 */}
        <h1 className="hero-animate d2" style={{
          fontSize: "clamp(30px, 5vw, 52px)",
          fontWeight: 900,
          color: "var(--text-1)",
          lineHeight: 1.2,
          letterSpacing: "-0.03em",
          marginBottom: 18,
        }}>
          حوّل كل محادثة
          <br />
          <span style={{ color: "var(--accent)" }}>إلى فرصة بيع حقيقية</span>
        </h1>

        {/* Subtitle */}
        <p className="hero-animate d3" style={{
          fontSize: "clamp(15px, 2.2vw, 18px)",
          color: "var(--text-3)",
          maxWidth: 560,
          margin: "0 auto 32px",
          lineHeight: 1.75,
        }}>
          مساعد ذكي يرد على عملائك فور تواصلهم،
          يفهم احتياجاتهم، ويرسل لك العملاء الجاهزين للشراء مباشرة.
        </p>

        {/* CTAs */}
        <div className="hero-animate d4" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="btn-primary"
            onClick={onChatOpen}
            style={{ padding: "13px 30px", fontSize: 15 }}
          >
            ابدأ المحادثة مجاناً ←
          </button>
          <a
            href="#pricing"
            className="btn-outline"
            style={{ padding: "13px 30px", fontSize: 15, textDecoration: "none" }}
          >
            شاهد الباقات
          </a>
        </div>

        {/* Trust badges */}
        <div className="hero-animate d5" style={{
          display: "flex", gap: 24, justifyContent: "center",
          marginTop: 36, flexWrap: "wrap",
        }}>
          {[
            { icon: "⚡", label: "رد فوري أقل من ثانية" },
            { icon: "🎯", label: "دقة عالية في تأهيل العملاء" },
            { icon: "🔒", label: "بيانات آمنة ومحمية" },
          ].map((badge) => (
            <div key={badge.label} style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 12.5, color: "var(--text-3)", fontWeight: 500,
            }}>
              <span style={{ fontSize: 14 }}>{badge.icon}</span>
              {badge.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Problem Section
══════════════════════════════════════════════ */
function ProblemSection() {
  const problems = [
    {
      icon: "📩",
      title: "رسائل بدون رد",
      desc: "العملاء يرسلون ويختفون لأن الرد يأخذ وقتاً طويلاً وينتهي اهتمامهم قبل أن تتواصل.",
    },
    {
      icon: "💸",
      title: "فرص بيع ضائعة",
      desc: "كل ساعة تأخير تعني احتمال ذهاب العميل للمنافس. الفرصة تضيع في الصمت.",
    },
    {
      icon: "😓",
      title: "ضغط على الفريق",
      desc: "فريقك يكرر نفس الإجابات يومياً ووقته يُهدر بدلاً من التركيز على صفقات حقيقية.",
    },
    {
      icon: "🌙",
      title: "لا غطاء خارج أوقات العمل",
      desc: "العميل الذي يتواصل ليلاً أو في العطلة يذهب بدون رد، وتخسر صفقة لم تعرف بها.",
    },
  ];

  return (
    <section id="problem" style={{ padding: "72px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          display: "inline-block",
          background: "#fef2f2", color: "#b91c1c",
          border: "1px solid #fecaca",
          borderRadius: 20, padding: "4px 14px",
          fontSize: 12, fontWeight: 700, marginBottom: 14,
          letterSpacing: "0.04em",
        }}>
          المشكلة الحالية
        </div>
        <h2 style={{
          fontSize: "clamp(24px, 3.5vw, 36px)",
          fontWeight: 800, color: "var(--text-1)",
          letterSpacing: "-0.02em", marginBottom: 12,
        }}>
          لماذا تخسر عملاء كل يوم؟
        </h2>
        <p style={{ fontSize: 15, color: "var(--text-3)", maxWidth: 480, margin: "0 auto" }}>
          معظم الشركات تفقد 60٪ من عملائها المحتملين بسبب التأخر في الرد.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 14,
      }}>
        {problems.map((p) => (
          <div key={p.title} className="problem-item">
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: "#fff", border: "1px solid #fecaca",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              {p.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.55 }}>{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Solution Section
══════════════════════════════════════════════ */
function SolutionSection() {
  const solutions = [
    {
      icon: "🤖",
      title: "يرد فوراً على كل عميل",
      desc: "في أقل من ثانية، المساعد يرحب بالعميل، يفهم ما يريد، ويبدأ المحادثة الصحيحة.",
    },
    {
      icon: "🎯",
      title: "يؤهّل العملاء تلقائياً",
      desc: "يسأل الأسئلة الصحيحة ويحدد من هو جاهز للشراء ومن يحتاج وقتاً، بدون تدخل منك.",
    },
    {
      icon: "📊",
      title: "يرسل لك العملاء الساخنين",
      desc: "كل عميل مهتم يصل إليك مع ملخص كامل عن احتياجه وجاهزيته، وأنت تكمل الصفقة.",
    },
    {
      icon: "🌐",
      title: "يعمل طوال اليوم",
      desc: "ليلاً أو نهاراً، في الإجازات، لا يتعب ولا يخطئ. كل عميل يجد من يرد عليه.",
    },
  ];

  return (
    <section id="solution" style={{
      padding: "72px 24px",
      background: "linear-gradient(160deg, #f0fdf4 0%, #f0f2f5 100%)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-block",
            background: "#f0fdf4", color: "#15803d",
            border: "1px solid #bbf7d0",
            borderRadius: 20, padding: "4px 14px",
            fontSize: 12, fontWeight: 700, marginBottom: 14,
            letterSpacing: "0.04em",
          }}>
            الحل
          </div>
          <h2 style={{
            fontSize: "clamp(24px, 3.5vw, 36px)",
            fontWeight: 800, color: "var(--text-1)",
            letterSpacing: "-0.02em", marginBottom: 12,
          }}>
            مساعد يعمل بدلاً عنك على مدار الساعة
          </h2>
          <p style={{ fontSize: 15, color: "var(--text-3)", maxWidth: 480, margin: "0 auto" }}>
            ركّز على إغلاق الصفقات، والمساعد يتولى الاستقبال والتأهيل لك.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}>
          {solutions.map((s) => (
            <div key={s.title} className="solution-item">
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: "#fff", border: "1px solid #bbf7d0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14532d", marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "#15803d", lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Pricing Section
══════════════════════════════════════════════ */
function PricingSection({ onChatOpen }: { onChatOpen: () => void }) {
  const plans = [
    {
      name: "الأساسية",
      price: "299",
      period: "/ شهر",
      desc: "مثالية للشركات الصغيرة التي تبدأ.",
      featured: false,
      features: [
        "حتى 300 محادثة شهرياً",
        "تأهيل تلقائي للعملاء",
        "تقرير أسبوعي",
        "دعم عبر البريد",
      ],
    },
    {
      name: "الاحترافية",
      price: "699",
      period: "/ شهر",
      desc: "للشركات التي تريد نمواً حقيقياً وسريعاً.",
      featured: true,
      features: [
        "محادثات غير محدودة",
        "تأهيل متقدم + scoring",
        "لوحة تحكم كاملة",
        "تقارير يومية",
        "دعم أولوية 24/7",
        "تخصيص كامل للمساعد",
      ],
    },
  ];

  return (
    <section id="pricing" style={{ padding: "72px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          display: "inline-block",
          background: "var(--accent-dim)", color: "var(--accent)",
          border: "1px solid #bfdbfe",
          borderRadius: 20, padding: "4px 14px",
          fontSize: 12, fontWeight: 700, marginBottom: 14,
        }}>
          الباقات والأسعار
        </div>
        <h2 style={{
          fontSize: "clamp(24px, 3.5vw, 36px)",
          fontWeight: 800, color: "var(--text-1)",
          letterSpacing: "-0.02em", marginBottom: 12,
        }}>
          اختر الباقة المناسبة
        </h2>
        <p style={{ fontSize: 15, color: "var(--text-3)" }}>
          ابدأ اليوم وشاهد الفرق خلال أسبوع.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 20,
        alignItems: "start",
      }}>
        {plans.map((plan) => (
          <div key={plan.name} className={`plan-card ${plan.featured ? "featured" : ""}`}>
            {plan.featured && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0,
                background: "var(--accent)",
                color: "#fff", textAlign: "center",
                fontSize: 12, fontWeight: 700, padding: "5px 0",
                letterSpacing: "0.05em",
              }}>
                ⭐ الأكثر طلباً · موصى بها
              </div>
            )}

            <div style={{ marginTop: plan.featured ? 28 : 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>
                {plan.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.04em" }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-3)" }}>ر.س {plan.period}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20, lineHeight: 1.55 }}>
                {plan.desc}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 24 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={plan.featured ? "var(--accent)" : "var(--success)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span style={{ color: "var(--text-2)" }}>{f}</span>
                  </div>
                ))}
              </div>

              <button
                className={plan.featured ? "btn-primary" : "btn-outline"}
                onClick={onChatOpen}
                style={{ width: "100%", padding: "11px 0", fontSize: 14 }}
              >
                {plan.featured ? "ابدأ الآن ←" : "اختر هذه الباقة"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Chat CTA Section
══════════════════════════════════════════════ */
function ChatCTASection({ onChatOpen }: { onChatOpen: () => void }) {
  return (
    <section style={{
      background: "linear-gradient(135deg, #1e40af 0%, #2563eb 100%)",
      padding: "64px 24px",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h2 style={{
          fontSize: "clamp(22px, 3vw, 34px)",
          fontWeight: 800, color: "#fff",
          letterSpacing: "-0.02em", marginBottom: 14,
        }}>
          جرّب المساعد الآن مجاناً
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", marginBottom: 28, lineHeight: 1.7 }}>
          لا حاجة لتسجيل. افتح المحادثة وشاهد كيف يرد المساعد على عملائك.
        </p>
        <button
          onClick={onChatOpen}
          style={{
            background: "#fff", color: "var(--accent)",
            border: "none", borderRadius: 12,
            padding: "14px 36px", fontSize: 15, fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
            transition: "transform 130ms, box-shadow 130ms",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 36px rgba(0,0,0,0.2)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 28px rgba(0,0,0,0.15)"; }}
        >
          💬 ابدأ المحادثة الآن
        </button>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Footer
══════════════════════════════════════════════ */
function Footer() {
  return (
    <footer style={{
      background: "var(--text-1)",
      color: "rgba(255,255,255,0.5)",
      textAlign: "center",
      padding: "28px 24px",
      fontSize: 13,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
        </div>
        <span style={{ color: "#fff", fontWeight: 700 }}>نوفا تك</span>
      </div>
      <p>© {new Date().getFullYear()} نوفا تك — جميع الحقوق محفوظة</p>
    </footer>
  );
}

/* ══════════════════════════════════════════════
   Floating Chat Widget
══════════════════════════════════════════════ */
function FloatingChat({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "مرحباً! 👋 أنا مساعد نوفا تك الذكي. كيف يمكنني مساعدتك اليوم؟",
      time: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", content, time: now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Simulate AI response (replace with real API call)
    await new Promise((r) => setTimeout(r, 1200));
    const reply = getAutoReply(content);
    setMessages((prev) => [...prev, { id: Date.now().toString() + "r", role: "assistant", content: reply.text, time: now() }]);
    setLoading(false);
  };

  return (
    <div className="chat-widget">
      {/* Panel */}
      {open && (
        <div className="chat-panel">
          {/* Header */}
          <div style={{
            padding: "14px 16px",
            background: "var(--accent)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"/>
                <path d="M8 12h8M12 8v8"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>مساعد نوفا تك</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                متاح الآن
              </div>
            </div>
            <button
              onClick={onToggle}
              style={{
                background: "rgba(255,255,255,0.15)", border: "none",
                borderRadius: 8, padding: "4px 8px", cursor: "pointer",
                color: "#fff", fontSize: 16, lineHeight: 1,
                fontFamily: "inherit",
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={msg.role === "user" ? "msg-user" : "msg-assistant"}>
                {msg.content}
                {msg.role === "assistant" && msg.id === "1" && (
                  <div className="cta-btns">
                    {["أريد معرفة الأسعار", "كيف يعمل المساعد؟", "أريد تجربة مجانية"].map((cta) => (
                      <button key={cta} className="cta-btn" onClick={() => send(cta)}>{cta}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "10px 12px",
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="اكتب رسالتك..."
              style={{
                flex: 1, border: "1.5px solid var(--border)",
                borderRadius: 10, padding: "8px 12px",
                fontSize: 13.5, color: "var(--text-1)",
                background: "var(--bg)", outline: "none",
                fontFamily: "inherit",
                transition: "border-color 140ms",
              }}
              onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: input.trim() ? "var(--accent)" : "var(--border)",
                border: "none", cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 130ms",
                fontFamily: "inherit",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button className="chat-bubble-btn" onClick={onToggle} aria-label="افتح المحادثة">
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        {/* Unread dot */}
        {!open && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            width: 14, height: 14, borderRadius: "50%",
            background: "#ef4444", border: "2px solid #fff",
            fontSize: 8, color: "#fff", fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>1</span>
        )}
      </button>
    </div>
  );
}

/* ── Helpers ── */
function now() {
  return new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function scrollToChat() {
  const el = document.querySelector(".chat-panel");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function getAutoReply(text: string): { text: string } {
  const t = text.toLowerCase();
  if (t.includes("سعر") || t.includes("تكلفة") || t.includes("باقة") || t.includes("أسعار")) {
    return { text: "لدينا باقتان: الأساسية بـ 299 ر.س شهرياً، والاحترافية بـ 699 ر.س وتشمل محادثات غير محدودة ودعم أولوية. أي باقة يناسبك أكثر؟" };
  }
  if (t.includes("كيف") || t.includes("يعمل") || t.includes("طريقة")) {
    return { text: "المساعد يعمل بثلاث خطوات: أولاً يستقبل العميل ويفهم احتياجه، ثانياً يؤهله ويحدد جاهزيته للشراء، أخيراً يرسل لك ملخصاً كاملاً عن العميل الجاهز. كل هذا تلقائياً 24/7." };
  }
  if (t.includes("تجربة") || t.includes("مجاناً") || t.includes("مجانية")) {
    return { text: "بالطبع! يمكنك تجربة المساعد الآن مجاناً بدون أي التزام. فقط أخبرني عن طبيعة عملك وسأريك كيف يمكن للمساعد أن يساعدك." };
  }
  return { text: "شكراً على تواصلك! يسعدني مساعدتك. هل يمكنك إخباري أكثر عن احتياجك حتى أقدم لك المعلومات المناسبة؟" };
}