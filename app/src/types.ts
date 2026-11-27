export type AssistantState = "idle" | "listening" | "processing" | "thinking" | "speaking" | "error" | "offline";
export interface Msg { id: string; role: "user" | "assistant"; text: string; ts: number; error?: boolean }
export interface Memory { id: string; text: string; createdAt: number; updatedAt: number }
export interface Settings {
  speechEnabled: boolean; autoSpeak: boolean; volume: number; speed: number;
  model: string; memoryEnabled: boolean; sttMode: "auto" | "server";
}
export interface Status { ok: boolean; configured: { groq: boolean; fish: boolean; search: boolean }; model: string; models: string[] }
