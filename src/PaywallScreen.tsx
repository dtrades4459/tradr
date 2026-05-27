// Paywall shown after onboarding. Standalone — does not import from Koda.tsx.
import { useState } from "react";
import { supabase } from "./lib/supabase";

const MONO = "'IBM Plex Mono', 'Geist Mono', ui-monospace, monospace";
const BODY = "'Geist', 'Inter', system-ui, sans-serif";
const ACCENT = "#89CFF0";

// Client-side known promo codes for instant feedback.
// Server validates independently before applying the Stripe discount.
const VALID_PROMO_CODES = new Set(["K0DA", "FOUNDERS", "BETA"]);

const FEATURES = [
  { label: "Prop Firm Mode", detail: "eval dashboard & risk tracker" },
  { label: "Live Trade Cards", detail: "stream your journal to circles in real time" },
  { label: "Trading Circles", detail: "community, leaderboards & accountability" },
  { label: "Discipline Score", detail: "weekly pattern detection & self-assessment" },
  { label: "Weekly Email Digest", detail: "your edge, summarised" },
];

type Billing = "monthly" | "annual";
type PromoState = "idle" | "valid" | "invalid";

export function PaywallScreen({
  C,
  userId,
  userEmail,
  stripeCustomerId,
  cancelledFromStripe = false,
  isOnboarding = false,
  onSuccess,
  onSkip,
}: {
  C: Record<string, string>;
  userId: string;
  userEmail: string;
  stripeCustomerId?: string;
  cancelledFromStripe?: boolean;
  isOnboarding?: boolean;
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [promoInput, setPromoInput] = useState("");
  const [promoState, setPromoState] = useState<PromoState>("idle");
  const [promoApplied, setPromoApplied] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(cancelledFromStripe ? "Payment didn't complete — try again or use a promo code." : "");

  function handlePromoChange(val: string) {
    setPromoInput(val);
    setPromoState("idle");
  }

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (VALID_PROMO_CODES.has(code)) {
      setPromoState("valid");
      setPromoApplied(code);
      setError("");
    } else {
      setPromoState("invalid");
      setPromoApplied("");
    }
  }

  async function handleCheckout() {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in — please refresh and try again.");

      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId,
          email: userEmail,
          billing,
          stripeCustomerId,
          ...(promoState === "valid" ? { promoCode: promoApplied } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const panel = C.panel ?? "#131317";
  const border = C.border2 ?? "rgba(255,255,255,0.08)";
  const text = C.text ?? "#F2F2EE";
  const text2 = C.text2 ?? "#A6A6A2";
  const muted = C.muted ?? "#65655F";
  const bg = C.bg ?? "#0A0A0E";

  return (
    <div style={{
      minHeight: "100dvh",
      background: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 16px 40px",
      fontFamily: BODY,
    }}>
      <div style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Badge + headline */}
        <div style={{ textAlign: "center", paddingTop: "8px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: `${ACCENT}18`, color: ACCENT,
            borderRadius: "6px", padding: "4px 12px", marginBottom: "18px",
            fontFamily: MONO, fontSize: "10px", fontWeight: 600,
            letterSpacing: "0.14em", textTransform: "uppercase",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
            {isOnboarding ? "Step 3 of 3 — Choose your plan" : "Kōda OS · Beta Launch"}
          </div>
          <div style={{
            fontFamily: BODY, fontWeight: 700, fontSize: "26px",
            letterSpacing: "-0.03em", color: text, lineHeight: 1.15,
          }}>
            Trade with a real<br />
            <span style={{ color: ACCENT, fontStyle: "italic" }}>edge.</span>
          </div>
          <div style={{ marginTop: "10px", fontFamily: BODY, fontSize: "13px", color: muted, lineHeight: 1.6 }}>
            Everything serious futures traders need, in one place.
          </div>
        </div>

        {/* Billing toggle */}
        <div style={{
          display: "flex", gap: "4px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "12px", padding: "4px",
          border: `1px solid ${border}`,
        }}>
          {(["monthly", "annual"] as Billing[]).map(b => {
            const active = billing === b;
            return (
              <button
                key={b}
                onClick={() => setBilling(b)}
                style={{
                  flex: 1, padding: "9px 0",
                  background: active ? ACCENT : "transparent",
                  color: active ? "#0A0A0E" : muted,
                  border: "none", borderRadius: "9px",
                  fontFamily: MONO, fontSize: "11px", fontWeight: 600,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: "pointer", transition: "all 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                }}
              >
                {b === "annual" ? (
                  <>
                    Annual
                    <span style={{
                      background: active ? "rgba(0,0,0,0.15)" : `${ACCENT}22`,
                      color: active ? "#0A0A0E" : ACCENT,
                      borderRadius: "4px", padding: "1px 5px",
                      fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
                    }}>
                      –33%
                    </span>
                  </>
                ) : "Monthly"}
              </button>
            );
          })}
        </div>

        {/* Price card */}
        <div style={{
          background: panel,
          border: `1px solid ${border}`,
          borderRadius: "18px", padding: "22px",
        }}>
          {/* Price */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
            <span style={{
              fontFamily: BODY, fontWeight: 700, fontSize: "36px",
              letterSpacing: "-0.03em", color: text, lineHeight: 1,
            }}>
              {billing === "monthly" ? "£24.99" : "£199"}
            </span>
            <span style={{ fontFamily: MONO, fontSize: "12px", color: muted }}>
              {billing === "monthly" ? "/month" : "/year"}
            </span>
          </div>
          <div style={{
            fontFamily: MONO, fontSize: "11px", marginBottom: "18px",
            color: billing === "annual" ? ACCENT : muted,
          }}>
            {billing === "annual" ? "£16.58/mo · save £100 vs monthly" : "cancel any time"}
          </div>

          {/* Features */}
          <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span style={{
                  color: ACCENT, fontFamily: MONO, fontSize: "11px",
                  lineHeight: "20px", flexShrink: 0,
                }}>
                  ✓
                </span>
                <div>
                  <span style={{ fontFamily: BODY, fontSize: "13px", color: text, fontWeight: 500 }}>
                    {f.label}
                  </span>
                  <span style={{ fontFamily: BODY, fontSize: "12px", color: text2, marginLeft: "6px" }}>
                    — {f.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Promo code */}
        <div>
          <div style={{
            fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em",
            textTransform: "uppercase", color: muted, marginBottom: "8px",
          }}>
            Beta promo code
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={promoInput}
              onChange={e => handlePromoChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyPromo()}
              placeholder="e.g. K0DA"
              maxLength={20}
              style={{
                flex: 1, background: panel,
                border: `1px solid ${
                  promoState === "valid" ? "#22c55e"
                  : promoState === "invalid" ? "#ef4444"
                  : border
                }`,
                borderRadius: "10px", padding: "10px 14px",
                fontFamily: MONO, fontSize: "13px", color: text,
                outline: "none", textTransform: "uppercase", letterSpacing: "0.1em",
                transition: "border-color 0.15s",
              }}
            />
            <button
              onClick={applyPromo}
              disabled={!promoInput.trim()}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${border}`,
                borderRadius: "10px", padding: "10px 16px",
                fontFamily: MONO, fontSize: "11px", color: text,
                cursor: promoInput.trim() ? "pointer" : "default",
                letterSpacing: "0.06em", textTransform: "uppercase",
                opacity: promoInput.trim() ? 1 : 0.5,
                transition: "opacity 0.15s",
              }}
            >
              Apply
            </button>
          </div>
          {promoState === "valid" && (
            <div style={{
              marginTop: "8px", fontFamily: MONO, fontSize: "11px",
              color: "#22c55e", display: "flex", alignItems: "center", gap: "6px",
            }}>
              <span>✓</span> Beta access applied — 100% off, forever.
            </div>
          )}
          {promoState === "invalid" && (
            <div style={{ marginTop: "8px", fontFamily: MONO, fontSize: "11px", color: "#ef4444" }}>
              Code not recognised. Try again or continue without one.
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.09)",
            border: "1px solid rgba(239,68,68,0.22)",
            borderRadius: "10px", padding: "10px 14px",
            fontFamily: MONO, fontSize: "11px", color: "#ef4444",
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: loading ? muted : ACCENT,
              color: "#0A0A0E", border: "none", borderRadius: "14px",
              padding: "6px 6px 6px 22px",
              fontSize: "14px", fontWeight: 600, fontFamily: BODY,
              cursor: loading ? "default" : "pointer",
              width: "100%", opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
            }}
          >
            <span>
              {loading
                ? "Opening Stripe…"
                : promoState === "valid"
                  ? "Claim Beta Access — Free"
                  : "Start Trading Smarter"}
            </span>
            {!loading && (
              <span style={{
                width: "40px", height: "40px", borderRadius: "50%",
                background: "#0A0A0E",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>

          <button
            onClick={onSkip}
            style={{
              background: "none", border: "none", color: muted,
              cursor: "pointer", fontFamily: MONO, fontSize: "10px",
              letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "6px", textAlign: "center",
            }}
          >
            Skip for now — start free
          </button>
        </div>
      </div>
    </div>
  );
}
