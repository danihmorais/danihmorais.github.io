import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const LICITA_DIR = path.resolve(TESTS_DIR, "../..");

export function loadTsModule(relativePath, { env = {}, globals = {}, replacements = [] } = {}) {
  const filename = path.resolve(LICITA_DIR, relativePath);
  let source = fs.readFileSync(filename, "utf8");

  for (const [search, replacement] of replacements) {
    source = source.replace(search, replacement);
  }

  source = source.replace(/import\.meta\.env\.VITE_API_URL/g, JSON.stringify(env.VITE_API_URL ?? ""));
  source = source.replace(/import\.meta\.env\.VITE_API_UNSLOTH_KEY/g, JSON.stringify(env.VITE_API_UNSLOTH_KEY ?? ""));
  source = source.replace(/import\.meta\.env\.VITE_API_OPENROUTER_KEY/g, JSON.stringify(env.VITE_API_OPENROUTER_KEY ?? ""));

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console,
    ...globals,
  };

  vm.runInNewContext(transpiled, sandbox, { filename });
  return module.exports;
}

export function licitaPath(relativePath) {
  return path.resolve(LICITA_DIR, relativePath);
}
