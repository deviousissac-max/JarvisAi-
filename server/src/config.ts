import "dotenv/config";
import { readFileSync } from "node:fs";

const env = (k: string, d = "") => process.env[k]?.trim() ?? d;

export const config = {
  port: Number(env("PORT", "8787")),
  groqKey: env("GROQ_API_KEY"),
  groqModel: env("GROQ_MODEL", "openai/gpt-oss-120b"),
  groqSttModel: env("GROQ_STT_MODEL", "whisper-large-v3-turbo"),
  fishKey: env("FISH_AUDIO_API_KEY"),
  fishModelId: env("FISH_AUDIO_MODEL_ID"),
  tavilyKey: env("TAVILY_API_KEY"),
  accessToken: env("APP_ACCESS_TOKEN"),
  memoryFile: env("MEMORY_FILE", "./data/memory.json"),
  memoryInjectLimit: Number(env("MEMORY_INJECT_LIMIT", "40")),
};

export const GROQ_BASE = "https://api.groq.com/openai/v1";
export const FISH_TTS_URL = "https://api.fish.audio/v1/tts";

export function configStatus() {
  return {
    groq: Boolean(config.groqKey),
    fish: Boolean(config.fishKey && config.fishModelId),
    search: Boolean(config.tavilyKey),
  };
}

export function readSystemPromptOverride(): string | null {
  try { return readFileSync("prompts/system.txt", "utf8"); } catch { return null; }
}
