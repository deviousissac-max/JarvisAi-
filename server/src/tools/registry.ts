import { z } from "zod";
import * as memory from "../services/memory.js";
import { config } from "../config.js";
import { evaluate } from "./calculator.js";

export interface ToolResult { output: string; confirm?: { actionId: string } }
export interface ToolDef {
  name: string; description: string; parameters: any; requiresConfirmation?: boolean;
  handler: (args: any) => Promise<ToolResult>;
}

const pending = new Map<string, { tool: ToolDef; args: any; expires: number }>();
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (v.expires < now) pending.delete(k); }, 60_000);

function ok(output: string): ToolResult { return { output } }
function fail(msg: string): ToolResult { return { output: `ERROR: ${msg}` } }

const defs: ToolDef[] = [
  {
    name: "save_memory",
    description: "Persist a durable fact, preference, or instruction about the user. Only confirm success if the tool reports success.",
    parameters: { type: "object", properties: { text: { type: "string", description: "The fact to remember, phrased concisely." } }, required: ["text"] },
    handler: async (a) => { const t = z.string().min(2).parse(a.text); const m = await memory.addMemory(t); return ok(`Saved (id=${m.id}).`); },
  },
  {
    name: "update_memory",
    description: "Update an existing memory by its id with new text.",
    parameters: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] },
    handler: async (a) => { const m = await memory.updateMemory(z.string().parse(a.id), z.string().min(2).parse(a.text)); return m ? ok("Updated.") : fail("No memory with that id."); },
  },
  {
    name: "delete_memory",
    description: "Delete a stored memory by id. CONSEQUENTIAL: requires the user's confirmation first.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    requiresConfirmation: true,
    handler: async (a) => { const done = await memory.deleteMemory(z.string().parse(a.id)); return done ? ok("Deleted.") : fail("No memory with that id."); },
  },
  {
    name: "list_memories",
    description: "List currently stored memories with their ids.",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const list = await memory.listMemories();
      return ok(list.length ? list.map((m) => `${m.id}: ${m.text}`).join("\n") : "No memories stored.");
    },
  },
  {
    name: "get_time",
    description: "Get the current UTC date and time.",
    parameters: { type: "object", properties: {} },
    handler: async () => ok(new Date().toUTCString()),
  },
  {
    name: "calculator",
    description: "Evaluate an arithmetic expression (supports + - * / % ^ and parentheses).",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    handler: async (a) => {
      try { const expr = z.string().min(1).max(300).parse(a.expression); return ok(`${evaluate(expr)}`); }
      catch { return fail("Invalid or unsupported expression."); }
    },
  },
  {
    name: "web_search",
    description: "Search the web for current information. Returns results with snippets and source URLs.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: async (a) => {
      if (!config.tavilyKey) return fail("Web search is unavailable (no search API configured). Tell the user plainly; do not fabricate results.");
      const q = z.string().min(2).max(400).parse(a.query);
      try {
        const r = await fetch("https://api.tavily.com/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: config.tavilyKey, query: q, max_results: 5, include_answer: true }),
        });
        if (!r.ok) return fail("Search provider error.");
        const d: any = await r.json();
        const lines = (d.results ?? []).map((x: any) => `${x.title}\n${x.url}\n${x.content?.slice(0, 400)}`);
        return ok([d.answer, ...lines].filter(Boolean).join("\n\n") || "No results found.");
      } catch { return fail("Search request failed."); }
    },
  },
];

export function toolSchemas() {
  return defs.map((d) => ({ type: "function" as const, function: { name: d.name, description: d.description, parameters: d.parameters } }));
}

export async function executeTool(name: string, args: any): Promise<ToolResult> {
  const def = defs.find((d) => d.name === name);
  if (!def) return fail("Unknown tool.");
  if (def.requiresConfirmation) {
    const actionId = Math.random().toString(36).slice(2);
    pending.set(actionId, { tool: def, args, expires: Date.now() + 5 * 60_000 });
    const desc = name === "delete_memory" ? `Delete the stored memory (id: ${String(args?.id ?? "").slice(0, 24)})` : `Run ${name}`;
    return { output: `CONFIRMATION_REQUIRED: ask the user to confirm this action — "${desc}" — via the Confirm button in the app. Do not claim it is done yet.`, confirm: { actionId } };
  }
  try { return await def.handler(args); } catch (e: any) {
    return fail(e?.issues ? "Invalid tool arguments." : "Tool execution failed.");
  }
}

export function confirmAction(actionId: string): ToolResult {
  const p = pending.get(actionId);
  if (!p) return fail("Confirmation expired or unknown. Ask the user to restate the request.");
  pending.delete(actionId);
  return p.tool.handler(p.args);
}
