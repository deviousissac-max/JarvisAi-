export interface Recognizer {
  start: (onPartial: (t: string) => void, onFinal: (t: string) => void, onErr: (m: string) => void, onEnd: () => void) => void;
  stop: () => void;
  abort: () => void;
}

export function hasWebSpeech(): boolean {
  return typeof (window as any).webkitSpeechRecognition === "function" || typeof (window as any).SpeechRecognition === "function";
}

export function createRecognizer(mode: "auto" | "server"): Recognizer {
  if (mode === "auto" && hasWebSpeech()) return webSpeechRecognizer();
  return recorderRecognizer();
}

function webSpeechRecognizer(): Recognizer {
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  let rec: any = null;
  return {
    start(onPartial, onFinal, onErr, onEnd) {
      rec = new SR();
      rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
      rec.onresult = (e: any) => {
        let interim = "", final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t; else interim += t;
        }
        if (interim) onPartial(interim);
        if (final) onFinal(final.trim());
      };
      rec.onerror = (e: any) => {
        const map: Record<string, string> = {
          "not-allowed": "Microphone permission denied. Enable it in Settings > Safari > Microphone.",
          "service-not-allowed": "Speech recognition is not permitted on this device.",
          "no-speech": "I did not catch that, sir.",
        };
        onErr(map[e.error] ?? "Voice input failed.");
      };
      rec.onend = () => onEnd();
      try { rec.start(); } catch { onErr("Could not start listening."); }
    },
    stop() { try { rec?.stop(); } catch {} },
    abort() { try { rec?.abort(); } catch {} },
  };
}

function recorderRecognizer(): Recognizer {
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let ac: AbortController | null = null;
  let stopped = false;
  let errCb: ((m: string) => void) | null = null;
  let endCb: (() => void) | null = null;

  async function finish(onFinal: (t: string) => void) {
    if (stopped || !chunks.length) { endCb?.(); return; }
    stopped = true;
    try {
      const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/mp4" });
      ac = new AbortController();
      const r = await fetch("/api/stt", {
        method: "POST", body: blob,
        headers: token() ? { Authorization: `Bearer ${token()}` } : undefined,
        signal: ac.signal,
      });
      if (!r.ok) throw new Error();
      const { text } = await r.json();
      if (text) onFinal(text); else errCb?.("I did not catch that, sir.");
    } catch {
      if (!ac?.signal.aborted) errCb?.("Transcription failed. Please type instead.");
    }
    endCb?.();
  }

  return {
    start(_onPartial, onFinal, onErr, onEnd) {
      stopped = false; chunks = []; errCb = onErr; endCb = onEnd;
      navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then((stream) => {
          const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
            : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
          recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); finish(onFinal); };
          recorder.start(250);
        })
        .catch((e) => {
          if (e?.name === "NotAllowedError") onErr("Microphone permission denied. Enable it in Settings > Safari > Microphone.");
          else onErr("Microphone unavailable. Please type instead.");
          onEnd();
        });
    },
    stop() { if (recorder?.state === "recording") recorder.stop(); },
    abort() { stopped = true; try { recorder?.stream.getTracks().forEach((t) => t.stop()); recorder?.stop(); } catch {} endCb?.(); },
  };
}

const token = () => localStorage.getItem("jarvis.token") ?? "";
