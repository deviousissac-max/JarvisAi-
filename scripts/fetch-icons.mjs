// Downloads the JARVIS app icons into app/public/ at build time.
// Failures are non-fatal (PWA still works; icons just fall back to defaults).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ICONS = [
  ["https://d1qqeunc9izjbf.cloudfront.net/file-interaction/67435825-apple-touch-icon.png", "apple-touch-icon.png"],
  ["https://d1qqeunc9izjbf.cloudfront.net/file-interaction/9be47684-icon-192.png", "icon-192.png"],
  ["https://d1qqeunc9izjbf.cloudfront.net/file-interaction/6e954f52-icon-512.png", "icon-512.png"],
];

const dir = path.resolve("app", "public");
await mkdir(dir, { recursive: true });

for (const [url, name] of ICONS) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) throw new Error("empty");
    await writeFile(path.join(dir, name), buf);
    console.log(`[icons] ok: ${name} (${buf.length} bytes)`);
  } catch (e) {
    console.warn(`[icons] skipped: ${name} (${e?.message ?? e}) — using no icon`);
  }
}
