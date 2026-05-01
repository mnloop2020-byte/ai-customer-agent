"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot, CalendarCheck, Database,
  Gauge, HandCoins, Inbox,
  Settings2, Users,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

const NAV_ITEMS = [
  { label: "الرئيسية",   href: "/",          icon: Gauge },
  { label: "المحادثات",  href: "/inbox",      icon: Inbox },
  { label: "العملاء",    href: "/leads",      icon: Users },
  { label: "الصفقات",    href: "/deals",      icon: HandCoins },
  { label: "المواعيد",   href: "/bookings",   icon: CalendarCheck },
  { label: "المعرفة",    href: "/knowledge",  icon: Database },
  { label: "الإعدادات",  href: "/settings",   icon: Settings2 },
];

const SB: React.CSSProperties = {
  width: "var(--sidebar-w)",
  minWidth: "var(--sidebar-w)",
  background: "#fff",
  borderLeft: "1px solid var(--border)",
  position: "sticky",
  top: 0,
  height: "100vh",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Desktop sidebar ── */}
      <aside style={SB} className="hidden lg:flex">

        {/* Brand */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px var(--accent-glow)",
            }}>
              <Bot size={16} color="#fff" strokeWidth={2.4} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.3 }}>
                مساعد المبيعات
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                حوّل المحادثات إلى صفقات
              </div>
            </div>
          </div>

          {/* Status pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginTop: 10, padding: "5px 10px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: "#22c55e",
              animation: "pulse-ring 2.5s infinite",
            }} />
            <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 500 }}>
              جاهز لاستقبال العملاء
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: "var(--text-3)",
            letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "0 8px", marginBottom: 4, marginTop: 4,
          }}>
            القائمة الرئيسية
          </div>

          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "8px 10px", borderRadius: 7,
                  color: active ? "var(--accent)" : "var(--text-2)",
                  background: active ? "var(--accent-dim)" : "transparent",
                  fontSize: 13.5, fontWeight: active ? 600 : 400,
                  textDecoration: "none",
                  transition: "background 130ms, color 130ms",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-3)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {/* active indicator */}
                {active && (
                  <span style={{
                    position: "absolute", right: 0, top: "50%",
                    transform: "translateY(-50%)",
                    width: 3, height: "60%", minHeight: 16,
                    background: "var(--accent)",
                    borderRadius: "2px 0 0 2px",
                  }} />
                )}
                <item.icon
                  size={15}
                  strokeWidth={active ? 2.3 : 1.8}
                  style={{ flexShrink: 0, color: active ? "var(--accent)" : "var(--text-3)" }}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px 10px 16px", borderTop: "1px solid var(--border)" }}>
          <LogoutButton />
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div
        className="lg:hidden"
        style={{
          position: "fixed", top: 0, right: 0, left: 0, zIndex: 50,
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 7, background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Bot size={14} color="#fff" />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>مساعد المبيعات</span>
        <div style={{
          display: "flex", overflowX: "auto", gap: 3,
          marginRight: "auto", scrollbarWidth: "none",
        }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 6,
                whiteSpace: "nowrap", fontSize: 11.5, flexShrink: 0,
                color: active ? "var(--accent)" : "var(--text-3)",
                background: active ? "var(--accent-dim)" : "transparent",
                fontWeight: active ? 600 : 400,
              }}>
                <item.icon size={12} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Main content ── */}
      <main
        className="pt-14 lg:pt-0"
        style={{
          flex: 1, minWidth: 0,
          padding: "clamp(14px, 2vw, 22px)",
          paddingTop: "clamp(14px, 2vw, 22px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}