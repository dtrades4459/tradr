import { useState } from "react";
import type { Theme } from "../theme";
import { BODY, DISPLAY } from "../shared";

const PRIOR_TOOL_OPTIONS = [
  "TradesViz", "Edgewonk", "Excel / Google Sheets",
  "Notion / Obsidian", "Nothing (paper/memory)", "Other",
];

interface FirstSessionSurveyProps {
  C: Theme;
  onSave: (priorTool: string, almostStoppedReason: string) => Promise<void>;
}

export function FirstSessionSurvey({ C, onSave }: FirstSessionSurveyProps) {
  const [priorTool, setPriorTool] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!priorTool) return;
    setSaving(true);
    try {
      await onSave(priorTool, reason.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "clamp(0px,100%,min(560px,92vw))", padding: "10px 24px 40px" }}>
        <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 24px" }} />
        <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, marginBottom: "4px" }}>Quick question</div>
        <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, marginBottom: "24px" }}>Help us understand your background — takes 20 seconds.</div>

        <div style={{ fontFamily: BODY, fontSize: "12px", color: C.text2, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>What were you using before Kōda?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px" }}>
          {PRIOR_TOOL_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setPriorTool(opt)}
              style={{ fontFamily: BODY, fontSize: "13px", padding: "7px 14px", borderRadius: "999px", border: `1px solid ${priorTool === opt ? C.text : C.border2}`, background: priorTool === opt ? C.text : "transparent", color: priorTool === opt ? C.bg : C.text2, cursor: "pointer", transition: "all 0.15s" }}>
              {opt}
            </button>
          ))}
        </div>

        <div style={{ fontFamily: BODY, fontSize: "12px", color: C.text2, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>What almost stopped you signing up? <span style={{ color: C.muted }}>(optional)</span></div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Price, not sure if I'd use it, already have a system…"
          style={{ width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "12px", fontFamily: BODY, fontSize: "13px", color: C.text, resize: "none", outline: "none", marginBottom: "20px" }} />

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleSave} disabled={!priorTool || saving}
            style={{ flex: 1, padding: "13px", borderRadius: "12px", border: "none", background: priorTool ? C.text : C.border2, color: priorTool ? C.bg : C.muted, fontFamily: BODY, fontSize: "14px", fontWeight: 600, cursor: priorTool ? "pointer" : "default" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => onSave("skipped", "")}
            style={{ padding: "13px 20px", borderRadius: "12px", border: `1px solid ${C.border2}`, background: "transparent", color: C.text2, fontFamily: BODY, fontSize: "14px", cursor: "pointer" }}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
