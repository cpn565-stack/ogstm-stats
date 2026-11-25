import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SRC_DIR = path.join(ROOT_DIR, "src");
const MOCK_NEXT_HEADERS_URL = "data:text/javascript,export%20async%20function%20cookies()%7Bconst%20jar%3DglobalThis.__OGSTM_MOCK_COOKIES%3Bif(!jar)throw%20new%20Error(%22cookies()%20called%20without%20__OGSTM_MOCK_COOKIES%22)%3Breturn%7Bget(name)%7Bconst%20entry%3Djar.get(name)%3Breturn%20entry%3F%7Bname%2Cvalue%3Aentry.value%7D%3Aundefined%3B%7D%2Cset(name%2Cvalue%2Coptions)%7Bif(options%26%26options.maxAge%3D%3D%3D0)%7Bjar.delete(name)%3B%7Delse%7Bjar.set(name%2C%7Bvalue%2Coptions%7D)%3B%7Djar.lastSetHistory%3Djar.lastSetHistory%7C%7C%5B%5D%3Bjar.lastSetHistory.push(%7Bname%2Cvalue%2Coptions%7D)%3B%7D%2Cdelete(name)%7Bjar.delete(name)%3B%7D%7D%3B%7D";

function tryResolveFile(basePath) {
  for (const candidate of [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.json`,
    path.join(basePath, "index.ts"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return { shortCircuit: true, url: MOCK_NEXT_HEADERS_URL };
  }
  if (specifier === "next/server") {
    const serverJs = path.join(ROOT_DIR, "node_modules/next/server.js");
    if (existsSync(serverJs)) {
      return { shortCircuit: true, url: pathToFileURL(serverJs).href };
    }
  }
  if (specifier === "next/navigation") {
    const navJs = path.join(ROOT_DIR, "node_modules/next/navigation.js");
    if (existsSync(navJs)) {
      return { shortCircuit: true, url: pathToFileURL(navJs).href };
    }
  }
  if (specifier.startsWith("@/")) {
    const resolved = tryResolveFile(path.join(SRC_DIR, specifier.slice(2)));
    if (resolved) {
      return { shortCircuit: true, url: pathToFileURL(resolved).href };
    }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolved = tryResolveFile(path.resolve(parentDir, specifier));
    if (resolved) {
      return { shortCircuit: true, url: pathToFileURL(resolved).href };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const raw = readFileSync(fileURLToPath(url), "utf-8");
    return {
      shortCircuit: true,
      format: "module",
      source: `export default ${raw};`,
    };
  }
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const raw = readFileSync(fileURLToPath(url), "utf-8");
    const { outputText } = ts.transpileModule(raw, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    return { shortCircuit: true, format: "module", source: outputText };
  }
  return nextLoad(url, context);
}

if (!process.env.__OGSTM_TS_LOADER_REGISTERED) {
  process.env.__OGSTM_TS_LOADER_REGISTERED = "1";
  register(import.meta.url, pathToFileURL("./"));
}
