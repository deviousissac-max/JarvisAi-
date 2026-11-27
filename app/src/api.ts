const token = localStorage.getItem("jarvis.token") ?? "";
const headers = (json = true): HeadersInit => ({ ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) });

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: headers() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: "Request failed" }))).error);
  return r.json();
}

export const api = {
  status: () => json<import("./types").Status>("/api/status"),
  tts: (text: string, speed: number, volume: number, signal: AbortSignal) =>
    fetch("/api/tts", { method: "POST", headers: headers(), body: JSON.stringify({ text, speed, volume }), signal }),
  stt: (audio: Blob, signal?: AbortSignal) =>
    fetch("/api/stt", { method: "POST", headers: headers(false), body: audio, signal }),
  confirm: (actionId: string) => json<{ ok: boolean; output: string }>("/api/chat/confirm", { method: "POST", body: JSON.stringify({ actionId }) }),
  listMemories: () => json<{ memories: import("./types").Memory[] }>("/api/memory"),
  addMemory: (text: string) => json<import("./types").Memory>("/api/memory", { method: "POST", body: JSON.stringify({ text }) }),
  deleteMemory: (id: string) => json<{ ok: boolean }>(`/api/memory/${id}`, { method: "DELETE" }),
  clearMemories: () => json<{ ok: boolean }>("/api/memory", { method: "DELETE" }),
};

export interface ChatEvents {
  onDelta: (t: string) => void;
  onConfirm?: (actionId: string) => void;
  onError: (m: string) => void;
  onDone: () => void;
}

export async function streamChat(
  messages: { role: "user" | "assistant"; content: string }[],
  model: string, memoryEnabled: boolean, signal: AbortSignal, ev: ChatEvents
) {
  const res = await fetch("/api/chat", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ messages, model, memoryEnabled }), signal,
  });
  if (!res.ok || !res.body) { ev.onError("Cannot reach JARVIS."); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
    for (const part of parts) {
      let event = "message", data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === "delta") ev.onDelta(payload.text);
      else if (event === "confirm") ev.onConfirm?.(payload.actionId);
      else if (event === "error") ev.onError(payload.message);
      else if (event === "done") ev.onDone();
    }
  }
  ev.onDone();
}
