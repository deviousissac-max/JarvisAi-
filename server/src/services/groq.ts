import { config, GROQ_BASE } from "../config.js";
import { ApiError } from "../middleware.js";

export type Role = "system" | "user" | "assistant" | "tool";
export interface ChatMessage { role: Role; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }
export interface GroqTool { type: "function"; function: { name: string; description: string; parameters: any } }

const TIMEOUT_MS = 60_000;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function auth(): Record<string, string> {
  if (!config.groqKey) throw new ApiError(503, "The AI service is not configured (missing GROQ_API_KEY).");
  return { Authorization: `Bearer ${config.groqKey}`, "Content-Type": "application/json" };
}

export async function groqModels(): Promise<string[]> {
  const r = await fetch(`${GROQ_BASE}/models`, { headers: auth() });
  if (!r.ok) throw new ApiError(502, "Could not reach the AI provider.");
  const data: any = await r.json();
  return (data.data ?? [])
    .map((m: any) => m.id as string)
    .filter((id: string) => !/whisper|guard|embed|tts|vision|safety/i.test(id));
}

export async function groqChat(body: any, stream: boolean, attempt = 0): Promise<Response> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const r = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST", headers: auth(), body: JSON.stringify({ ...body, stream }), signal: ac.signal,
    });
    clearTimeout(timer);
    if (r.status === 429 || r.status >= 500) {
      if (attempt < 2 && !stream) { await sleep(600 * 2 ** attempt); return groqChat(body, stream, attempt + 1); }
      throw new ApiError(r.status === 429 ? 429 : 502, "The AI service is busy. Please try again in a moment.");
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[groq]", r.status, t.slice(0, 300));
      throw new ApiError(502, "The AI service rejected the request.");
    }
    return r;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    if (attempt < 2 && !stream) { await sleep(600 * 2 ** attempt); return groqChat(body, stream, attempt + 1); }
    throw new ApiError(504, "The AI service did not respond in time.");
  }
}

export async function* streamChat(body: any): AsyncGenerator<string, ChatMessage, void> {
  const res = await groqChat(body, true);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", content = "";
  const toolCalls: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") {
        return { role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
      }
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta;
        if (delta?.content) { content += delta.content; yield delta.content; }
        for (const tc of delta?.tool_calls ?? []) {
          const i = tc.index ?? 0;
          toolCalls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
          if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        }
      } catch { /* partial line */ }
    }
  }
  return { role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
}

export async function groqTranscribe(file: Blob, filename: string): Promise<string> {
  if (!config.groqKey) throw new ApiError(503, "Speech recognition is not configured.");
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("model", config.groqSttModel);
  fd.append("temperature", "0");
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 30_000);
  const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST", headers: { Authorization: `Bearer ${config.groqKey}` }, body: fd, signal: ac.signal,
  });
  if (!r.ok) throw new ApiError(502, "Speech recognition failed.");
  return (await r.json()).text ?? "";
}
