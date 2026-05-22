import React from "react";
import { MONO } from "../shared";
import type { Profile } from "../types";

export function ProGate({
  plan,
  children,
  C,
  onUpgrade,
  label = "Pro feature",
}: {
  plan: Profile["plan"];
  children: React.ReactNode;
  C: Record<string, string>;
  onUpgrade: () => void;
  label?: string;
}) {
  if (plan === "pro" || plan === "elite") return <>{children}</>;

  return (
    <div style={{ position: "relative", borderRadius: "inherit" }}>
      <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none", opacity: 0.35 }}>
        {children}
      </div>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: "8px",
      }}>
        <span style={{ fontSize: "20px", lineHeight: 1 }}>🔒</span>
        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted ?? "#65655F", letterSpacing: "0.08em" }}>
          {label}
        </span>
        <button
          type="button"
          onClick={onUpgrade}
          style={{
            padding: "8px 16px",
            background: (C as any).live ?? "#4ade80",
            border: "none", borderRadius: "10px",
            fontFamily: MONO, fontSize: "11px", fontWeight: 700,
            color: "#0A0A0A", cursor: "pointer",
            letterSpacing: "0.06em", textTransform: "uppercase" as const,
          }}
        >
          Upgrade →
        </button>
      </div>
    </div>
  );
}
