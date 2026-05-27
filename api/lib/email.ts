// api/lib/email.ts
// Resend-based email helper for Kōda transactional emails.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = "Kōda <noreply@tradrjournal.xyz>";

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json();
}

export function weeklyRecapHtml({
  name, netR, winRate, bestSetup, tradeCount, weekLabel,
}: { name: string; netR: number; winRate: number; bestSetup: string; tradeCount: number; weekLabel: string }) {
  const positive = netR >= 0;
  const color = positive ? "oklch(0.78 0.18 152)" : "oklch(0.70 0.21 25)";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kōda Weekly Recap</title></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:system-ui,sans-serif;color:#F2F2EE">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 8px">${weekLabel} · Weekly Recap</p>
      <p style="font-size:28px;font-weight:600;letter-spacing:-0.02em;margin:0 0 32px">Your week in review, ${name}.</p>
      <table width="100%" cellpadding="16" style="background:#131317;border-radius:16px;border:1px solid rgba(255,255,255,0.07);margin-bottom:24px">
        <tr>
          <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.07)">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Net R</p>
            <p style="font-size:32px;font-weight:600;color:${color};margin:0">${positive ? "+" : ""}${netR.toFixed(1)}R</p>
          </td>
          <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.07)">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Win Rate</p>
            <p style="font-size:32px;font-weight:600;color:#F2F2EE;margin:0">${winRate}%</p>
          </td>
          <td style="text-align:center">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Trades</p>
            <p style="font-size:32px;font-weight:600;color:#F2F2EE;margin:0">${tradeCount}</p>
          </td>
        </tr>
      </table>
      ${bestSetup ? `<p style="font-size:13px;color:#A6A6A2;margin:0 0 32px">Best setup this week: <strong style="color:#F2F2EE">${bestSetup}</strong></p>` : ""}
      <a href="https://tradrjournal.xyz" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none">Open Kōda →</a>
      <p style="font-size:11px;color:#45453F;margin-top:40px">You're receiving this because weekly recaps are on in your settings. <a href="https://tradrjournal.xyz" style="color:#65655F">Unsubscribe</a></p>
    </td></tr>
  </table>
</body></html>`;
}

export function receiptHtml({ name, plan, amount, date }: { name: string; plan: string; amount: string; date: string }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Receipt · Kōda</title></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:system-ui,sans-serif;color:#F2F2EE">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 8px">Payment receipt</p>
      <p style="font-size:26px;font-weight:600;letter-spacing:-0.02em;margin:0 0 32px">Thanks, ${name}.</p>
      <table width="100%" cellpadding="14" style="background:#131317;border-radius:14px;border:1px solid rgba(255,255,255,0.07);margin-bottom:24px">
        <tr><td style="font-size:13px;color:#A6A6A2;border-bottom:1px solid rgba(255,255,255,0.07)">Plan</td><td style="font-size:13px;color:#F2F2EE;text-align:right;border-bottom:1px solid rgba(255,255,255,0.07)">Kōda ${plan}</td></tr>
        <tr><td style="font-size:13px;color:#A6A6A2;border-bottom:1px solid rgba(255,255,255,0.07)">Amount</td><td style="font-size:13px;color:#F2F2EE;text-align:right;border-bottom:1px solid rgba(255,255,255,0.07)">${amount}</td></tr>
        <tr><td style="font-size:13px;color:#A6A6A2">Date</td><td style="font-size:13px;color:#F2F2EE;text-align:right">${date}</td></tr>
      </table>
      <a href="https://tradrjournal.xyz" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none">Open Kōda →</a>
    </td></tr>
  </table>
</body></html>`;
}
