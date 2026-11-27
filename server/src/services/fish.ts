import { config, FISH_TTS_URL } from "../config.js";
import { ApiError } from "../middleware.js";

export interface TtsOptions { speed?: number; volume?: number }

export async function fishTts(text: string, opts: TtsOptions = {}): Promise<Response> {
  if (!config.fishKey || !config.fishModelId)
    throw new ApiError(503, "Voice output is not configured (missing FISH_AUDIO_API_KEY or FISH_AUDIO_MODEL_ID).");
  const speed = Math.min(1.5, Math.max(0.5, opts.speed ?? 1));
  const volume = Math.min(20, Math.max(-100, opts.volume ?? 0));
  let lastErr: ApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 90_000);
      const r = await fetch(FISH_TTS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.fishKey}`, "Content-Type": "application/json", "model": "s1" },
        body: JSON.stringify({
          text, reference_id: config.fishModelId,
          format: "mp3", mp3_bitrate: 128, sample_rate: 44100,
          chunk_length: 200, normalize: true, latency: "normal",
          prosody: { speed, volume, normalize_loudness: true },
        }),
        signal: ac.signal,
      });
      if (r.status === 429 || r.status >= 500) {
        lastErr = new ApiError(502, "The voice service is busy.");
        await new Promise((s) => setTimeout(s, 500 * 2 ** attempt));
        continue;
      }
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("[fish]", r.status, t.slice(0, 300));
        throw new ApiError(502, "The voice service rejected the request.");
      }
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) throw e;
      lastErr = new ApiError(504, "The voice service did not respond in time.");
    }
  }
  throw lastErr ?? new ApiError(502, "Voice synthesis failed.");
}
