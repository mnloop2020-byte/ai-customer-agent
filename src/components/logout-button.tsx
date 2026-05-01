"use client";

import { LogOut } from "lucide-react";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      onClick={logout}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 7, width: "100%", height: 36,
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: 7,
        color: "var(--text-3)",
        fontSize: 13, fontWeight: 500,
        cursor: "pointer",
        transition: "background 130ms, color 130ms, border-color 130ms",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "#fef2f2";
        el.style.borderColor = "#fecaca";
        el.style.color = "#dc2626";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "transparent";
        el.style.borderColor = "var(--border)";
        el.style.color = "var(--text-3)";
      }}
    >
      <LogOut size={14} aria-hidden="true" />
      خروج
    </button>
  );
}