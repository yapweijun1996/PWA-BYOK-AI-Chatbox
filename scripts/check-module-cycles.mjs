import ts from "typescript";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve("src");
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = resolve(dir, item.name);
    return item.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(path) && !path.endsWith(".d.ts") ? [path] : [];
  });
}
function importsValue(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return true;
    if (clause.isTypeOnly) return false;
    if (clause.name) return true;
    const bindings = clause.namedBindings;
    return !bindings || ts.isNamespaceImport(bindings) || bindings.elements.some((item) => !item.isTypeOnly);
  }
  if (ts.isExportDeclaration(node)) return !node.isTypeOnly && (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.some((item) => !item.isTypeOnly));
  return false;
}
const graph = new Map();
for (const path of sourceFiles(root)) {
  const ast = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const deps = [];
  for (const node of ast.statements) {
    if (!importsValue(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const base = resolve(dirname(path), specifier);
    const target = [base + ".ts", base + ".tsx", resolve(base, "index.ts"), resolve(base, "index.tsx")].find(existsSync);
    if (target) deps.push(target);
  }
  graph.set(path, deps);
}
const state = new Map(), stack = [];
function visit(path) {
  state.set(path, 1); stack.push(path);
  for (const next of graph.get(path) ?? []) {
    if (state.get(next) === 1) {
      const cycle = [...stack.slice(stack.indexOf(next)), next].map((p) => p.slice(root.length + 1));
      throw new Error(`Runtime module cycle: ${cycle.join(" -> ")}`);
    }
    if (!state.has(next)) visit(next);
  }
  stack.pop(); state.set(path, 2);
}
for (const path of graph.keys()) if (!state.has(path)) visit(path);
console.log(`No runtime module cycles in ${graph.size} source modules.`);
