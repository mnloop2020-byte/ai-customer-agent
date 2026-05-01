import { statusLabel } from "@/lib/ui-labels";

const CFG: Record<string, { bg: string; color: string; border: string; dot: string }> = {
  Hot:         { bg: "#fef2f2", color: "#dc2626", border: "#fecaca", dot: "#ef4444" },
  Warm:        { bg: "#fffbeb", color: "#b45309", border: "#fde68a", dot: "#f59e0b" },
  Cold:        { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1", dot: "#94a3b8" },
  Unqualified: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0", dot: "#94a3b8" },
  Lost:        { bg: "#fff1f2", color: "#be123c", border: "#fecdd3", dot: "#f43f5e" },
};

export function StatusBadge({ status }: { status: string }) {
  const c = CFG[status] ?? CFG.Unqualified;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      borderRadius: 5, padding: "3px 8px",
      fontSize: 11.5, fontWeight: 600,
      whiteSpace: "nowrap",
      letterSpacing: "-0.01em",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: c.dot, flexShrink: 0,
      }} />
      {statusLabel(status)}
    </span>
  );
}