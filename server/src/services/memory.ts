import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export interface Memory { id: string; text: string; createdAt: number; updatedAt: number }

interface Store { memories: Memory[] }
const FILE = path.resolve(config.memoryFile);
let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try { cache = JSON.parse(await fs.readFile(FILE, "utf8")); }
  catch { cache = { memories: [] }; }
  return cache!;
}

async function save(s: Store) {
  cache = s;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE + ".tmp", JSON.stringify(s));
  await fs.rename(FILE + ".tmp", FILE);
}

export async function listMemories(): Promise<Memory[]> {
  const s = await load();
  return [...s.memories].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function addMemory(text: string): Promise<Memory> {
  const s = await load();
  const trimmed = text.trim().slice(0, 500);
  const existing = s.memories.find((m) => m.text.toLowerCase() === trimmed.toLowerCase());
  if (existing) { existing.updatedAt = Date.now(); await save(s); return existing; }
  const m: Memory = { id: randomUUID(), text: trimmed, createdAt: Date.now(), updatedAt: Date.now() };
  s.memories.push(m);
  if (s.memories.length > 200) s.memories = s.memories.slice(-200);
  await save(s);
  return m;
}

export async function updateMemory(id: string, text: string): Promise<Memory | null> {
  const s = await load();
  const m = s.memories.find((x) => x.id === id);
  if (!m) return null;
  m.text = text.trim().slice(0, 500); m.updatedAt = Date.now();
  await save(s);
  return m;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const s = await load();
  const n = s.memories.length;
  s.memories = s.memories.filter((x) => x.id !== id);
  const changed = s.memories.length < n;
  if (changed) await save(s);
  return changed;
}

export async function clearMemories() { await save({ memories: [] }); }

export async function relevantMemories(query: string): Promise<string[]> {
  const all = await listMemories();
  const terms = query.toLowerCase().match(/[a-z0-9']{3,}/g) ?? [];
  return all
    .map((m) => ({ m, score: terms.filter((t) => m.text.toLowerCase().includes(t)).length + m.updatedAt / 1e12 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.memoryInjectLimit)
    .map((x) => x.m.text);
}
