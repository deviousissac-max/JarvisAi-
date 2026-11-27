import { api } from "./api";

class SpeechController {
  private audio: HTMLAudioElement | null = null;
  private abort: AbortController | null = null;
  private token = 0;
  volume = 1;

  async speak(text: string, speed: number, volumeDb: number): Promise<void> {
    this.stop();
    const my = ++this.token;
    const chunks = chunkText(text, 320);
    for (const chunk of chunks) {
      if (my !== this.token) return;
      const ac = this.abort = new AbortController();
      try {
        const r = await api.tts(chunk, speed, volumeDb, ac.signal);
        if (!r.ok) throw new Error();
        const blob = await r.blob();
        if (my !== this.token) return;
        await this.playBlob(blob, ac, my);
      } catch {
        return;
      }
    }
  }

  private playBlob(blob: Blob, ac: AbortController, my: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const a = this.audio = new Audio(url);
      a.volume = this.volume;
      const done = () => { URL.revokeObjectURL(url); a.onended = a.onerror = null; resolve(); };
      a.onended = done;
      a.onerror = () => { URL.revokeObjectURL(url); reject(new Error("playback")); };
      ac.signal.addEventListener("abort", () => { a.pause(); done(); }, { once: true });
      if (my !== this.token) return resolve();
      a.play().catch(() => reject(new Error("autoplay blocked")));
    });
  }

  stop() {
    this.token++;
    this.abort?.abort();
    if (this.audio) { this.audio.pause(); this.audio.src = ""; }
  }
  get playing() { return !!this.audio && !this.audio.paused; }
}

function chunkText(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [text];
  const out: string[] = []; let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = s; } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export const speech = new SpeechController();
