import type { Theme } from "../theme";
import { BODY, MONO } from "../shared";

interface ProLockProps {
  C: Theme;
  label: string;
  description: string;
  onUpgrade: () => void;
}

export function ProLock({ C, label, description, onUpgrade }: ProLockProps) {
  return (
    <div style={{
      marginTop: "24px", border: `1px solid ${C.border2}`, borderRadius: "12px",
      padding: "40px 20px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
    }}>
      <div style={{ fontSize: "22px", opacity: 0.5 }}>🔒</div>
      <div style={{ fontFamily: BODY, fontSize: "14px", fontWeight: 600, color: C.text }}>{label}</div>
      <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, maxWidth: "240px", lineHeight: 1.6 }}>{description}</div>
      <button onClick={onUpgrade} style={{
        background: C.live, color: "#0A0A0A", border: "none", borderRadius: "999px",
        padding: "10px 22px", fontFamily: MONO, fontSize: "11px", fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer",
      }}>Upgrade to Pro →</button>
    </div>
  );
}
