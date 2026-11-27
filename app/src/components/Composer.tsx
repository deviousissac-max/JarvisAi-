import React, { useRef, useState } from "react";
import type { AssistantState } from "../types";

export function Composer({ state, onSend, onMicTap, onCancel, onInterrupt }: {
  state: AssistantState;
  busy: React.MutableRefObject<boolean>;
  onSend: (t: string) => void;
  onMicTap: () => void;
  onCancel: () => void;
  onInterrupt: () => void;
}) {
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    const t = text.trim(); if (!t) return;
    setText(""); if (ta.current) ta.current.style.height = "auto";
    onSend(t);
  };
  const listening = state === "listening";
  return (
    <footer className="bar">
      {state === "speaking" ? (
        <button className="pill-action" onClick={onInterrupt}>■ STOP SPEAKING</button>
      ) : state === "processing" || state === "thinking" ? (
        <button className="pill-action" onClick={onCancel}>■ CANCEL</button>
      ) : (
        <div className="capsule">
          <button className={`mic ${listening ? "live" : ""}`} onClick={onMicTap} aria-label="Microphone">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
          <i className="divider" />
          <textarea ref={ta} rows={1} placeholder="Speak or type a command..."
            value={text}
            onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="send" onClick={send} disabled={!text.trim()} aria-label="Send">→</button>
        </div>
      )}
    </footer>
  );
}
