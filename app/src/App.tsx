import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ctx, type AppState } from "./state";
import * as store from "./storage";
import { api, streamChat } from "./api";
import { speech } from "./audio";
import { createRecognizer } from "./speech";
import { Orb } from "./components/Orb";
import { ChatView } from "./components/Chat";
import { Composer } from "./components/Composer";
import { SettingsPanel, AppsPanel, CalendarPanel, HistoryDrawer } from "./components/Panels";
import type { AssistantState, Msg, Status } from "./types";

const STATE_LABEL: Record<AssistantState, string> = {
  idle: "How may I assist you today?",
  listening: "Listening…",
  processing: "Receiving transmission…",
  thinking: "Processing…",
  speaking: "Speaking…",
  error: "Anomaly detected. Please try again.",
  offline: "Connection lost. Standing by.",
};

const STATUS_PILL: Record<AssistantState, { t: string; cls: string }> = {
  idle: { t: "SYSTEM ONLINE", cls: "ok" },
  listening: { t: "LISTENING", cls: "cy" },
  processing: { t: "RECEIVING", cls: "cy" },
  thinking: { t: "PROCESSING", cls: "cy" },
  speaking: { t: "SPEAKING", cls: "cy" },
  error: { t: "SYSTEM ALERT", cls: "bad" },
  offline: { t: "OFFLINE", cls: "bad" },
};

export function App() {
  const [persist, setPersist] = useState(store.load);
  const [state, setState] = useState<AssistantState>(navigator.onLine ? "idle" : "offline");
  const [status, setStatus] = useState<Status | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "apps" | "calendar" | "settings">("home");
  const [showSettings, setShowSettings] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const chatAbort = useRef<AbortController | null>(null);
  const mic = useRef<ReturnType<typeof createRecognizer> | null>(null);
  const busy = useRef(false);

  useEffect(() => store.save(persist), [persist]);
  useEffect(() => { api.status().then(setStatus).catch(() => setNotice("Cannot reach server.")); }, []);
  useEffect(() => {
    const on = () => setState((s) => (s === "offline" ? "idle" : s));
    const off = () => { speech.stop(); setState("offline"); };
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const session = useMemo(
    () => persist.sessions.find((s) => s.id === persist.activeSessionId) ?? null,
    [persist]
  );

  const app = useMemo<AppState>(() => ({
    persist,
    setSettings: (patch) => setPersist((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    newSession: () => setPersist((p) => ({ ...p, activeSessionId: null })),
    selectSession: (id) => setPersist((p) => ({ ...p, activeSessionId: id })),
    deleteSession: (id) => setPersist((p) => ({
      ...p,
      sessions: p.sessions.filter((s) => s.id !== id),
      activeSessionId: p.activeSessionId === id ? null : p.activeSessionId,
    })),
    addMessage: (role, text, error) => {
      const id = store.uid();
      setPersist((p) => {
        const sessions = [...p.sessions];
        let idx = sessions.findIndex((s) => s.id === p.activeSessionId);
        if (idx === -1) {
          sessions.unshift({ id: store.uid(), title: text.slice(0, 40), updatedAt: Date.now(), messages: [] });
          idx = 0;
        }
        const msg: Msg = { id, role, text, ts: Date.now(), error };
        sessions[idx] = { ...sessions[idx], updatedAt: Date.now(), messages: [...sessions[idx].messages, msg] };
        return { ...p, sessions, activeSessionId: sessions[idx].id };
      });
      return id;
    },
    updateMessage: (id, text, error) => setPersist((p) => ({
      ...p,
      sessions: p.sessions.map((s) =>
        s.id === p.activeSessionId
          ? { ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, text, error } : m)) }
          : s
      ),
    })),
    activeSession: () => persist.sessions.find((s) => s.id === persist.activeSessionId) ?? null,
  }), [persist]);

  const converse = useCallback(async (userText: string) => {
    if (busy.current) return;
    busy.current = true;
    setPendingConfirm(null);
    setNotice(null);
    speech.stop();

    const history = (session?.messages ?? [])
      .filter((m) => !m.error && m.text)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.text }));

    app.addMessage("user", userText);
    setState("processing");

    const replyId = app.addMessage("assistant", "");
    let acc = "";
    let errored = false;

    chatAbort.current = new AbortController();
    try {
      await streamChat(
        [...history, { role: "user", content: userText }],
        persist.settings.model || status?.model || "",
        persist.settings.memoryEnabled,
        chatAbort.current.signal,
        {
          onDelta: (t) => { acc += t; setState("thinking"); app.updateMessage(replyId, acc); setPartial(acc); },
          onConfirm: (actionId) => setPendingConfirm(actionId),
          onError: (m) => { errored = true; setNotice(m); app.updateMessage(replyId, acc || m, true); },
          onDone: () => {},
        }
      );
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        errored = true;
        setNotice("Connection interrupted.");
        app.updateMessage(replyId, acc || "Connection interrupted.", true);
      }
    }
    chatAbort.current = null;
    busy.current = false;
    setPartial("");
    if (errored) { setState("error"); return; }
    if (!acc.trim()) { setState("idle"); return; }

    if (persist.settings.speechEnabled && persist.settings.autoSpeak) {
      speech.volume = persist.settings.volume;
      setState("speaking");
      await speech.speak(acc, persist.settings.speed, 0);
    }
    setState("idle");
  }, [session, persist.settings, status?.model, app]);

  const startListening = useCallback(() => {
    if (busy.current) return;
    speech.stop();
    setNotice(null);
    setPartial("");
    setState("listening");
    const rec = createRecognizer(persist.settings.sttMode);
    mic.current = rec;
    let finalText = "";
    rec.start(
      (t) => setPartial(t),
      (t) => { finalText = t; rec.stop(); },
      (m) => { setNotice(m); setState("error"); },
      () => {
        mic.current = null;
        setPartial("");
        if (finalText) converse(finalText);
        else setState((s) => (s === "listening" ? "idle" : s));
      }
    );
  }, [converse, persist.settings.sttMode]);

  const interruptSpeech = useCallback(() => { speech.stop(); setState("idle"); }, []);
  const cancelGeneration = useCallback(() => {
    chatAbort.current?.abort();
    busy.current = false;
    speech.stop();
    setState("idle");
  }, []);
  const replay = useCallback(() => {
    const last = session?.messages.filter((m) => m.role === "assistant" && !m.error && m.text).pop();
    if (!last) return;
    speech.volume = persist.settings.volume;
    setState("speaking");
    speech.speak(last.text, persist.settings.speed, 0).finally(() => setState("idle"));
  }, [session, persist.settings]);
  const confirmAction = useCallback(async () => {
    if (!pendingConfirm) return;
    const id = pendingConfirm;
    setPendingConfirm(null);
    const r = await api.confirm(id).catch(() => ({ ok: false, output: "Confirmation failed." }));
    converse(r.ok ? "The user confirmed. Proceed and report the result."
                  : "The user declined the confirmation.");
  }, [pendingConfirm, converse]);

  const openTab = (t: typeof activeTab) => {
    setActiveTab(t);
    setShowApps(t === "apps");
    setShowCalendar(t === "calendar");
    setShowSettings(t === "settings");
  };
  const closeSheet = () => {
    setShowSettings(false); setShowApps(false); setShowCalendar(false);
    setActiveTab("home");
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning, Sir." : hour < 18 ? "Good afternoon, Sir." : "Good evening, Sir.";
  const pill = STATUS_PILL[state];

  return (
    <Ctx.Provider value={app}>
      <div className="app" data-state={state}>
        <header className="hud-top">
          <div>
            <span className="logo">J.A.R.V.I.S.</span>
            <span className="logo-sub">PERSONAL AI ASSISTANT</span>
          </div>
          <div className="hud-right">
            <button className="ghost sm" onClick={() => setShowHistory(true)}>HISTORY</button>
            <span className={`pill ${pill.cls}`}><i />{pill.t}</span>
          </div>
        </header>

        <div className="corner tl" /><div className="corner tr" /><div className="corner bl" /><div className="corner br" />

        <Orb state={state} />

        <div className="greeting">
          <h1>{greeting}</h1>
          <p>{STATE_LABEL[state]}</p>
          {notice && <p className="notice">{notice}</p>}
        </div>

        {pendingConfirm && (
          <div className="confirmrow">
            <span>Action requires your confirmation.</span>
            <button className="primary" onClick={confirmAction}>Confirm</button>
            <button className="ghost" onClick={() => setPendingConfirm(null)}>Decline</button>
          </div>
        )}

        <ChatView messages={session?.messages ?? []} partial={partial} state={state}
                  onReplay={replay} onInterrupt={interruptSpeech} />

        <Composer state={state} busy={busy} onSend={converse} onMicTap={startListening}
                  onCancel={cancelGeneration} onInterrupt={interruptSpeech} />

        <nav className="tabbar">
          {([["home", "Home"], ["apps", "Apps"], ["calendar", "Calendar"], ["settings", "Settings"]] as const)
            .map(([id, lbl]) => (
              <button key={id} className={`tab ${activeTab === id ? "active" : ""}`} onClick={() => openTab(id)}>
                {lbl}
              </button>
            ))}
        </nav>

        {showSettings && <SettingsPanel status={status} onClose={closeSheet} />}
        {showApps && <AppsPanel status={status} onClose={closeSheet} />}
        {showCalendar && <CalendarPanel onClose={closeSheet} />}
        {showHistory && <HistoryDrawer onClose={() => setShowHistory(false)} />}
      </div>
    </Ctx.Provider>
  );
}
