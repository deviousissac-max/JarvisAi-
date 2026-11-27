import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export function auth(req: Request, res: Response, next: NextFunction) {
  if (!config.accessToken) return next();
  const header = req.headers.authorization ?? "";
  if (header === `Bearer ${config.accessToken}`) return next();
  res.status(401).json({ error: "unauthorized" });
}

const buckets = new Map<string, { n: number; t: number }>();
export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const b = buckets.get(ip);
    if (!b || now - b.t > windowMs) { buckets.set(ip, { n: 1, t: now }); return next(); }
    if (++b.n > max) { res.status(429).json({ error: "Too many requests." }); return; }
    next();
  };
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = typeof err?.status === "number" ? err.status : err?.name === "ZodError" ? 400 : 500;
  const msg = status < 500 && err?.publicMessage ? err.publicMessage
    : err?.name === "ZodError" ? "Invalid request." : "Something went wrong on my end.";
  if (status >= 500) console.error("[jarvis]", err);
  res.status(status).json({ error: msg });
}

export class ApiError extends Error {
  status: number; publicMessage: string;
  constructor(status: number, publicMessage: string) {
    super(publicMessage); this.status = status; this.publicMessage = publicMessage;
  }
}
