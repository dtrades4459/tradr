// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · NotificationsDrawer
//
// Bell-anchored notifications panel. Opens on bell button tap; closes on
// outside click or Escape. Renders a list of notification cards aggregated
// from app state.
//
// v1 sources: draft trades waiting in the Review Inbox.
// Future sources (architected for, not yet wired): new followers, circle
// activity, challenge completions.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import type { Theme } from "./theme";
import { MONO, BODY, DISPLAY, Kicker } from "./shared";

interface Props {
  open: boolean;
  onClose: () => void;
  draftCount: number;
  onOpenInbox: () => void;
  C: Theme;
}

export default function NotificationsDrawer({ open, onClose, draftCount, onOpenInbox, C }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Defer attaching the outside-click listener by one tick so the very tap
    // that opened the drawer doesn't immediately close it again on mobile,
    // where pointerdown on the trigger fires before this effect runs.
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", onDoc);
    }, 0);
    document.addEventListener("keydown", onEsc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const total = draftCount;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      style={{
        position: "fixed",
        top: "calc(64px + env(safe-area-inset-top))",
        right: "clamp(12px, 4vw, 48px)",
        width: 340,
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100dvh - 100px)",
        overflowY: "auto",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        boxShadow: `0 24px 56px ${C.shadow}`,
        zIndex: 101,
        padding: 16,
        animation: "rise 0.18s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Kicker C={C}>Notifications</Kicker>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: "none",
            color: C.muted,
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {total === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 12px" }}>
          <div style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>
            You're all caught up.
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.06em", lineHeight: 1.5 }}>
            New broker syncs, follows, and circle activity will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {draftCount > 0 && (
            <NotificationCard
              C={C}
              accent={C.green ?? "#22c55e"}
              kicker="Review Inbox"
              title={`${draftCount} trade${draftCount !== 1 ? "s" : ""} ready to review`}
              body="Auto-synced from your broker. Publish them to your journal."
              ctaLabel="Review →"
              onCta={() => {
                onClose();
                onOpenInbox();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  C, accent, kicker, title, body, ctaLabel, onCta,
}: {
  C: Theme;
  accent: string;
  kicker: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: `color-mix(in oklch, ${accent} 8%, ${C.panel})`,
        border: `1px solid color-mix(in oklch, ${accent} 25%, transparent)`,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9,
          color: accent,
          letterSpacing: "0.14em",
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 5,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 15,
          color: C.text,
          fontWeight: 500,
          marginBottom: 4,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: BODY,
          fontSize: 12,
          color: C.text2 ?? C.muted,
          lineHeight: 1.45,
          marginBottom: 10,
        }}
      >
        {body}
      </div>
      <button
        onClick={onCta}
        style={{
          background: accent,
          color: "#0A0A0A",
          border: "none",
          borderRadius: 999,
          padding: "7px 14px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
