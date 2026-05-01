// page-header.tsx
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <header
      className="animate-fade-up"
      style={{
        display: "flex", flexWrap: "wrap",
        alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 18,
      }}
    >
      <div>
        <div style={{
          fontSize: 11.5, fontWeight: 500,
          color: "var(--text-3)",
          letterSpacing: "0.02em",
          marginBottom: 3,
        }}>
          {eyebrow}
        </div>
        <h1 style={{
          fontSize: "clamp(1.25rem, 2.5vw, 1.6rem)",
          fontWeight: 700,
          color: "var(--text-1)",
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          margin: 0,
        }}>
          {title}
        </h1>
      </div>
      {actions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {actions}
        </div>
      )}
    </header>
  );
}