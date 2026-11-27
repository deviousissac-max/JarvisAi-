const KEY = "jarvis.v1";
export interface Persisted {
  settings: { speechEnabled: boolean; autoSpeak: boolean; volume: number; speed: number; model: string; memoryEnabled: boolean; sttMode: "auto" | "server" };
  sessions: { id: string; title: string; updatedAt: number; messages: { id: string; role: "user" | "assistant"; text: string; ts: number; error?: boolean }[] }[];
  activeSessionId: string | null;
}
const DEFAULT: Persisted = {
  settings: { speechEnabled: true, autoSpeak: true, volume: 1, speed: 1, model: "", memoryEnabled: true, sttMode: "auto" },
  sessions: [], activeSessionId: null,
};
export function load(): Persisted {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return structuredClone(DEFAULT); }
}
export function save(p: Persisted) {
  p.sessions = p.sessions.slice(0, 12).map((s) => ({ ...s, messages: s.messages.slice(-100) }));
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota */ }
}
export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
