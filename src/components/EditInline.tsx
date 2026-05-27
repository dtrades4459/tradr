import { useState } from "react";
import type { Theme } from "../theme";
import { BODY, MONO } from "../shared";

interface EditInlineProps {
  val: string;
  onSave: (t: string) => void;
  onCancel: () => void;
  C: Theme;
}

export function EditInline({ val, onSave, onCancel, C }: EditInlineProps) {
  const [text, setText] = useState(val);
  return (
    <div style={{ display: "flex", gap: "8px", flex: 1, alignItems: "center" }}>
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(text); if (e.key === "Escape") onCancel(); }}
        style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${C.border2}`, color: C.text, fontFamily: BODY, fontSize: "14px", padding: "6px 0", outline: "none" }}
      />
      <button onClick={() => onSave(text)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.text, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>save</button>
      <button onClick={onCancel} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>×</button>
    </div>
  );
}
