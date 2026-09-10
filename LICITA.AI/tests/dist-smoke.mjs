import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const indexPath = path.join(DIST, "index.html");

assert.equal(fs.existsSync(indexPath), true, "dist/index.html não foi gerado");

const html = fs.readFileSync(indexPath, "utf8");
assert.match(html, /Licita\.AI/);
assert.doesNotMatch(html, /\/src\/main\.tsx/);
assert.doesNotMatch(html, /__PAGES_VERSION__|__API_URL_JSON__/);

const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
const localRefs = refs.filter((ref) => !/^(?:[a-z]+:)?\/\//i.test(ref) && !ref.startsWith("data:") && !ref.startsWith("#"));

assert.ok(localRefs.length > 0, "Nenhum asset local encontrado no index.html publicado");
for (const ref of localRefs) {
  assert.equal(ref.startsWith("/"), false, `Asset absoluto encontrado no build: ${ref}`);
  const cleanRef = ref.split("?", 1)[0].split("#", 1)[0];
  const target = path.resolve(DIST, cleanRef);
  assert.equal(target.startsWith(DIST), true, `Referência de asset escapa de dist: ${ref}`);
  assert.equal(fs.existsSync(target), true, `Asset referenciado não existe: ${ref}`);
}

const jsFiles = fs.readdirSync(path.join(DIST, "assets"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => path.join(DIST, "assets", entry.name));

assert.ok(jsFiles.length > 0, "Nenhum bundle JavaScript foi gerado");
const bundles = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert.match(bundles, /Licita\.AI/);
assert.doesNotMatch(bundles, /\/src\/main\.tsx/);
