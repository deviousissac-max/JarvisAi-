import React, { useEffect, useState } from "react";
import { useApp } from "../state";
import { api } from "../api";
import type { Memory, Status } from "../types";

export function SettingsPanel({ status, onClose }: { status: Status | null; onClose: () => void }) {
  const { persist, setSettings } = useApp();
  const [memories, setMemories] = useState<Memory[]>([]);
  const s = persist.settings;

  useEffect(() => { api.listMemories().then((r) => setMemories(r.memories)).catch(() => {}); }, []);

  return (
    <div className="sheet"><div className="sheet-inner">
      <h2>Settings</h2>
      <label className="row"><span>Spoken responses</span>
        <input type="checkbox" checked={s.speechEnabled} onChange={(e) => setSettings({ speechEnabled: e.target.checked })} /></label>
      <label className="row"><span>Automatic speech</span>
        <input type="checkbox" checked={s.autoSpeak} onChange={(e) => setSettings({ autoSpeak: e.target.checked })} /></label>
      <label className="row"><span>Long-term memory</span>
        <input type="checkbox" checked={s.memoryEnabled} onChange={(e) => setSettings({ memoryEnabled: e.target.checked })} /></label>
      <label className="row"><span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={s.volume}
          onChange={(e) => setSettings({ volume: Number(e.target.value) })} /></label>
      <label className="row"><span>Speech speed</span>
        <input type="range" min="0.7" max="1.3" step="0.05" value={s.speed}
          onChange={(e) => setSettings({ speed: Number(e.target.value) })} /></label>

      <label className="col">
        <span>AI model {status && !status.configured.groq ? "(Groq key missing)" : ""}</span>
        <select value={s.model || status?.model || ""} onChange={(e) => setSettings({ model: e.target.value })}>
          {(status?.models?.length ? status.models : [status?.model ?? "—"]).map((m) =>
            <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="col">
        <span>Voice input method</span>
        <select value={s.sttMode} onChange={(e) => setSettings({ sttMode: e.target.value as "auto" | "server" })}>
          <option value="auto">Auto (on-device if available)</option>
          <option value="server">Server transcription (most reliable on iOS)</option>
        </select>
      </label>

      <div className="col"><span>Connection status</span>
        <ul className="status-list">
          <li>Groq AI: {status?.configured.groq ? "✓ connected" : "✗ not configured"}</li>
          <li>Fish Audio voice: {status?.configured.fish ? "✓ connected" : "✗ not configured"}</li>
          <li>Web search: {status?.configured.search ? "✓ available" : "— disabled"}</li>
        </ul>
      </div>

      <h3>Memories ({memories.length})</h3>
      <ul className="memory-list">
        {memories.map((m) => (
          <li key={m.id}>
            <span>{m.text}</span>
            <button className="ghost sm" onClick={async () => {
              await api.deleteMemory(m.id);
              setMemories((ms) => ms.filter((x) => x.id !== m.id));
            }}>Forget</button>
          </li>
        ))}
        {memories.length === 0 && <li className="dim">No stored memories.</li>}
      </ul>
      {memories.length > 0 && (
        <button className="ghost" onClick={async () => { await api.clearMemories(); setMemories([]); }}>
          Clear all memories
        </button>
      )}

      <h3>Conversation history</h3>
      <p className="dim">Sessions are stored on this device (last 12). Clear them from the History drawer.</p>

      <h3>About</h3>
      <p className="dim">JARVIS — Personal AI Assistant v1.0.0. React + Vite PWA · Node/TypeScript backend · Groq AI · Fish Audio voice.</p>
      <button className="primary" onClick={onClose}>Done</button>
    </div></div>
  );
}

export function AppsPanel({ status, onClose }: { status: Status | null; onClose: () => void }) {
  return (
    <div className="sheet"><div className="sheet-inner">
      <h2>Systems</h2>
      <ul className="status-list">
        <li>AI core (Groq): {status?.configured.groq ? "ONLINE" : "NOT CONFIGURED"}</li>
        <li>Voice synthesis (Fish Audio): {status?.configured.fish ? "ONLINE" : "NOT CONFIGURED"}</li>
        <li>Speech recognition (Whisper): ONLINE</li>
        <li>Long-term memory: ONLINE</li>
        <li>Calculator tool: ONLINE</li>
        <li>Web search: {status?.configured.search ? "ONLINE" : "NOT CONFIGURED"}</li>
        <li>Email integration: NOT CONNECTED (future module)</li>
        <li>Calendar integration: NOT CONNECTED (future module)</li>
      </ul>
      <p className="dim">Simply ask JARVIS to use any online system directly, sir.</p>
      <button className="primary" onClick={onClose}>Done</button>
    </div></div>
  );
}

export function CalendarPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet"><div className="sheet-inner">
      <h2>Calendar</h2>
      <p className="dim">No calendar integration is connected, sir. Google Calendar (OAuth) is a planned module — JARVIS will not pretend to read or create events until it is.</p>
      <button className="primary" onClick={onClose}>Done</button>
    </div></div>
  );
}

export function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const { persist, selectSession, deleteSession, newSession } = useApp();
  return (
    <div className="sheet left"><div className="sheet-inner">
      <h2>History</h2>
      <button className="primary" onClick={() => { newSession(); onClose(); }}>New conversation</button>
      {persist.sessions.map((s) => (
        <div key={s.id} className={`session ${s.id === persist.activeSessionId ? "active" : ""}`}>
          <button onClick={() => { selectSession(s.id); onClose(); }}>
            <strong>{s.title || "Conversation"}</strong>
            <span className="dim">{new Date(s.updatedAt).toLocaleString()} · {s.messages.length} msgs</span>
          </button>
          <button className="ghost sm" onClick={() => deleteSession(s.id)}>Delete</button>
        </div>
      ))}
      {persist.sessions.length === 0 && <p className="dim">No saved conversations yet.</p>}
      <button className="primary" onClick={onClose}>Close</button>
    </div></div>
  );
}
