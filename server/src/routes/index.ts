import { Router, raw } from "express";
import { z } from "zod";
import { config, configStatus } from "../config.js";
import { buildSystemPrompt } from "../prompts/systemPrompt.js";
import * as groq from "../services/groq.js";
import { fishTts } from "../services/fish.js";
import * as memory from "../services/memory.js";
import { toolSchemas, executeTool, confirmAction } from "../tools/registry.js";
import { ApiError, rateLimit } from "../middleware.js";

export const router = Router();
const MAX_TOOL_ROUNDS = 4;

router.get("/status", async (_req, res) => {
  let models: string[] = [];
  try { if (config.groqKey) models = await groq.groqModels(); } catch { /* keep empty */ }
  res.json({ ok: true, configured: configStatus(), model: config.groqModel, models });
});

const ChatBody = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(20_000),
  })).min(1).max(60),
  model: z.string().max(100).optional(),
  memoryEnabled: z.boolean().optional().default(true),
});

router.post("/chat", rateLimit(20, 60_000), async (req, res, next) => {
  try {
    const body = ChatBody.parse(req.body);
    const model = body.model || config.groqModel;
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const memories = body.memoryEnabled ? await memory.relevantMemories(lastUser) : [];

    const msgs: groq.ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(memories, true) },
      ...body.messages,
    ];

    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
      Connection: "keep-alive", "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      const tools = toolSchemas();
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const gen = groq.streamChat({ model, messages: msgs, tools, tool_choice: "auto", temperature: 0.6, max_tokens: 4096 });
        let final: groq.ChatMessage | undefined;
        while (true) {
          const { value, done } = await gen.next();
          if (done) { final = value; break; }
          send("delta", { text: value });
        }
        if (!final?.tool_calls?.length) break;
        msgs.push({ role: "assistant", content: final.content ?? null, tool_calls: final.tool_calls });
        for (const tc of final.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
          const result = await executeTool(tc.function.name, args);
          send("tool", { name: tc.function.name });
          if (result.confirm) send("confirm", { actionId: result.confirm.actionId });
          msgs.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result.output });
        }
      }
      send("done", {});
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.publicMessage : "I'm having trouble reaching my systems, sir.";
      if (!(e instanceof ApiError)) console.error("[chat]", e);
      if (!res.writableEnded) send("error", { message: msg });
    }
    res.end();
  } catch (e) { next(e); }
});

router.post("/chat/confirm", rateLimit(20, 60_000), async (req, res, next) => {
  try {
    const { actionId } = z.object({ actionId: z.string().min(1) }).parse(req.body);
    const result = await confirmAction(actionId);
    res.json({ ok: !result.output.startsWith("ERROR:"), output: result.output });
  } catch (e) { next(e); }
});

router.post("/tts", rateLimit(30, 60_000), async (req, res, next) => {
  try {
    const { text, speed, volume } = z.object({
      text: z.string().min(1).max(4000),
      speed: z.number().min(0.5).max(1.5).optional(),
      volume: z.number().min(-100).max(20).optional(),
    }).parse(req.body);
    const audio = await fishTts(text, { speed, volume });
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
    const reader = audio.body!.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    res.end();
  } catch (e) { next(e); }
});

router.post("/stt", rateLimit(30, 60_000), async (req, res, next) => {
  try {
    await new Promise<void>((resolve, reject) => {
      raw({ type: "*/*", limit: "25mb" })(req, res, (err: unknown) =>
        err ? reject(new ApiError(400, "Audio payload too large or malformed.")) : resolve());
    });
    if (!req.body?.length) throw new ApiError(400, "No audio received.");
    const ct = req.headers["content-type"] ?? "";
    const ext = ct.includes("webm") ? "webm" : ct.includes("wav") ? "wav" : "m4a";
    const text = await groq.groqTranscribe(new Blob([req.body]), `speech.${ext}`);
    res.json({ text: text.trim() });
  } catch (e) { next(e); }
});

router.get("/memory", async (_req, res) => res.json({ memories: await memory.listMemories() }));
router.post("/memory", rateLimit(60, 60_000), async (req, res, next) => {
  try {
    const { text } = z.object({ text: z.string().min(2).max(500) }).parse(req.body);
    res.json(await memory.addMemory(text));
  } catch (e) { next(e); }
});
router.delete("/memory/:id", async (req, res) => res.json({ ok: await memory.deleteMemory(req.params.id) }));
router.delete("/memory", async (_req, res) => { await memory.clearMemories(); res.json({ ok: true }); });
