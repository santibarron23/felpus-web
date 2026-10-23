import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Claves secretas (service_role de Supabase, tokens de IA, etc.) solo
// pueden vivir en el servidor: rutas de src/app/api y variables SIN el
// prefijo NEXT_PUBLIC_ (Next.js mete en el JS público toda variable que lo
// tenga). Este test corre en el CI de cada PR.
const ROOT = path.join(__dirname, "..", "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

const files = walk(path.join(ROOT, "src")).map((f) => ({
  rel: path.relative(ROOT, f).split(path.sep).join("/"),
  text: fs.readFileSync(f, "utf8"),
}));

describe("claves secretas", () => {
  it("ningún archivo del navegador ('use client') lee variables de entorno secretas", () => {
    const offenders = files
      .filter((f) => /^\s*["']use client["']/.test(f.text))
      .filter((f) => /process\.env\.(?!NEXT_PUBLIC_)[A-Z_]+/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  // Permitido: rutas de src/app/api y módulos src/lib/server*.js (ej.
  // serverAuth.js) — y esos módulos, a su vez, solo importados desde api/.
  const isServerFile = (rel) => rel.startsWith("src/app/api/") || /^src\/lib\/server[A-Za-z]*\.js$/.test(rel);

  it("SUPABASE_SERVICE_ROLE_KEY solo se usa en código de servidor", () => {
    const offenders = files
      .filter((f) => f.text.includes("SUPABASE_SERVICE_ROLE_KEY"))
      .filter((f) => !isServerFile(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("los módulos src/lib/server*.js solo se importan desde rutas de servidor", () => {
    const offenders = files
      .filter((f) => /from\s+["'][^"']*\/server[A-Za-z]*["']/.test(f.text))
      .filter((f) => !isServerFile(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("ninguna variable secreta tiene el prefijo NEXT_PUBLIC_", () => {
    const names = new Set(files.flatMap((f) => [...f.text.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)].map((m) => m[0])));
    expect([...names].filter((n) => /SECRET|SERVICE_ROLE|PRIVATE|TOKEN|ANTHROPIC|HUGGINGFACE/.test(n))).toEqual([]);
  });

  it("no hay claves reales escritas en el código", () => {
    const pattern = /sb_secret_[A-Za-z0-9_-]{10,}|sk-ant-[A-Za-z0-9_-]{10,}|hf_[A-Za-z0-9]{30,}|"role"\s*:\s*"service_role"/;
    expect(files.filter((f) => pattern.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it(".env.local no está en git", () => {
    let tracked = "";
    try {
      tracked = execSync("git ls-files .env .env.local .env.production", { cwd: ROOT }).toString().trim();
    } catch {
      return; // sin git (ej. un zip): nada que verificar
    }
    expect(tracked).toBe("");
  });
});
