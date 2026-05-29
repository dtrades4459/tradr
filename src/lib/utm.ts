// Kōda · UTM capture
// Call captureUtm() on page load (before auth redirect) — persists to
// sessionStorage so params survive the OAuth redirect round-trip.
// Call readUtm() after auth to attach params to the PostHog identity.

const SESSION_KEY = "koda_utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type UtmProps = Partial<Record<typeof UTM_PARAMS[number], string>>;

export function captureUtm(): void {
  const params = new URLSearchParams(window.location.search);
  const found: UtmProps = {};
  for (const key of UTM_PARAMS) {
    const val = params.get(key);
    if (val) found[key] = val;
  }
  if (Object.keys(found).length === 0) return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(found)); } catch {}
}

export function readUtm(): UtmProps {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UtmProps) : {};
  } catch {
    return {};
  }
}
