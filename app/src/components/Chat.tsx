import React, { useEffect, useRef } from "react";
import type { AssistantState, Msg } from "../types";

export function ChatView({ messages, partial, state, onReplay, onInterrupt }: {
  messages: Msg[]; partial: string; state: AssistantState; onReplay: () => void; onInterrupt: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, partial, state]);

  const thinking = state === "processing" || state === "thinking";
  return (
    <main className="chat">
      {messages.length === 0 && <p className="empty">Good day, sir. How may I assist you?</p>}
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.role} ${m.error ? "err" : ""}`}>
          <span className="who">{m.role === "user" ? "You" : "JARVIS"}</span>
          <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
          {m.role === "assistant" && !m.error && m.text && (
            <div className="msg-actions">
              <button className="ghost sm" onClick={onReplay}>Replay</button>
              {state === "speaking" && <button className="ghost sm" onClick={onInterrupt}>Stop</button>}
            </div>
          )}
        </div>
      ))}
      {thinking && (
        <div className="msg assistant"><span className="who">JARVIS</span>
          <div className="typing"><i /><i /><i /></div>
          {partial && <p className="dim">{partial}…</p>}
        </div>
      )}
      <div ref={end} />
    </main>
  );
}
