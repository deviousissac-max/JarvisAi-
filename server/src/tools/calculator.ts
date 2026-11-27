export function evaluate(expr: string): number {
  const tokens = expr.match(/(\d+\.?\d*|[+\-*/%^()])/g);
  if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) throw new Error("unsupported expression");
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + parseTerm() : v - parseTerm();
    return v;
  }
  function parseTerm(): number {
    let v = parsePower();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next(); const r = parsePower();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function parsePower(): number {
    const base = parseUnary();
    if (peek() === "^") { next(); return Math.pow(base, parsePower()); }
    return base;
  }
  function parseUnary(): number {
    if (peek() === "-") { next(); return -parseUnary(); }
    return parseAtom();
  }
  function parseAtom(): number {
    if (peek() === "(") { next(); const v = parseExpr(); if (next() !== ")") throw new Error("unbalanced"); return v; }
    const t = next();
    if (!t || !/^\d/.test(t)) throw new Error("bad token");
    return parseFloat(t);
  }
  const result = parseExpr();
  if (i !== tokens.length) throw new Error("trailing input");
  if (!isFinite(result)) throw new Error("non-finite result");
  return result;
}
