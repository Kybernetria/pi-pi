import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function createProtocolError(stage, message, details) {
  const error = new Error(`${stage}: ${message}`);
  error.stage = stage;
  error.details = details;
  return error;
}

function protocolError(stage, message, details) {
  throw createProtocolError(stage, message, details);
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      files.push(fullPath);
    }
  }

  await walk(rootDir);
  return files;
}

function rewriteCompiledImports(source) {
  return source
    .replace(/from "([^"]+)\.ts"/g, 'from "$1.mjs"')
    .replace(/from '([^']+)\.ts'/g, "from '$1.mjs'")
    .replace(/import\("([^"]+)\.ts"\)/g, 'import("$1.mjs")')
    .replace(/import\('([^']+)\.ts'\)/g, "import('$1.mjs')");
}

async function compilePackage(packageDir, outDir) {
  const allFiles = await collectFiles(packageDir);

  for (const sourcePath of allFiles) {
    const relativePath = path.relative(packageDir, sourcePath);
    const targetPath = relativePath.endsWith(".ts")
      ? path.join(outDir, relativePath.replace(/\.ts$/, ".mjs"))
      : path.join(outDir, relativePath);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (relativePath.endsWith(".ts")) {
      const source = await fs.readFile(sourcePath, "utf8");
      const compiled = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          resolveJsonModule: true,
          verbatimModuleSyntax: true,
        },
        fileName: sourcePath,
        reportDiagnostics: false,
      });
      await fs.writeFile(targetPath, rewriteCompiledImports(compiled.outputText), "utf8");
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

function createPiRuntime() {
  const listeners = new Map();
  const tools = [];
  const renderers = [];

  return {
    appendEntry() {
      // no-op
    },
    on(event, handler) {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
    },
    async emit(event, payload = {}) {
      for (const handler of listeners.get(event) ?? []) {
        await handler(payload);
      }
    },
    registerTool(tool) {
      tools.push(tool);
    },
    registerMessageRenderer(name, renderer) {
      renderers.push({ name, renderer });
    },
    registerCommand() {
      // no-op
    },
    runBeforeAgentStart(_prompt, systemPrompt) {
      return Promise.resolve(systemPrompt);
    },
    getAllTools() {
      return [...tools];
    },
    getMessageRenderers() {
      return [...renderers];
    },
  };
}

function sampleScalar(schema, propertyName) {
  const type = schema?.type;
  if (propertyName === "url") {
    return "data:text/html,%3Ctitle%3ESmoke%3C/title%3E%3Cp%3EHello%20from%20pi-pi.%3C/p%3E";
  }
  if (propertyName === "targetPath") return ".";
  if (propertyName === "query") return "demo";
  if (propertyName === "question") return "What is the smoke test checking?";
  if (propertyName === "task") return "Perform a smoke test task.";
  if (propertyName === "text") return "Smoke test source text.";
  if (propertyName === "note") return "Smoke test note.";

  if (type === "string") return "demo";
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return false;
  if (type === "null") return null;
  return "demo";
}

function sampleValueFromSchema(schema, propertyName = "") {
  if (!isRecord(schema)) {
    return propertyName ? sampleScalar({}, propertyName) : {};
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return sampleValueFromSchema(schema.anyOf[0], propertyName);
  }

  if (schema.const !== undefined) {
    return schema.const;
  }

  if (schema.type === "object" || (schema.properties && typeof schema.properties === "object")) {
    const required = Array.isArray(schema.required) ? schema.required.filter((value) => typeof value === "string") : [];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const value = {};

    const keys = required.length > 0 ? required : Object.keys(properties).filter((key) => key !== "note").slice(0, 2);
    for (const key of keys) {
      value[key] = sampleValueFromSchema(properties[key], key);
    }

    return value;
  }

  if (schema.type === "array") {
    return [sampleValueFromSchema(schema.items, propertyName)];
  }

  return sampleScalar(schema, propertyName);
}

async function resolveSchemaObject(packageDir, schemaRef) {
  if (isRecord(schemaRef)) return schemaRef;
  if (typeof schemaRef !== "string") return { type: "object" };
  const schemaPath = path.join(packageDir, schemaRef);
  return JSON.parse(await fs.readFile(schemaPath, "utf8"));
}

async function runNpmPackDryRun(packageDir) {
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["pack", "--dry-run"], {
      cwd: packageDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(createProtocolError("install_failure", `npm pack --dry-run failed to start for ${packageDir}`, {
        cause: error.message,
      }));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(createProtocolError("install_failure", `npm pack --dry-run failed for ${packageDir}`, {
        exitCode: code,
        stderr: stderr || undefined,
      }));
    });
  });
}

async function loadManifest(packageDir) {
  const manifestPath = path.join(packageDir, "pi.protocol.json");
  if (!(await exists(manifestPath))) {
    protocolError("install_failure", `missing pi.protocol.json in ${packageDir}`);
  }
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function verifyRuntime(packageDirs) {
  const compileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-runtime-smoke-"));
  const runtime = createPiRuntime();
  const manifests = [];
  let sharedFabric = null;

  try {
    for (let index = 0; index < packageDirs.length; index += 1) {
      const packageDir = path.resolve(packageDirs[index]);
      const compiledDir = path.join(compileRoot, `pkg-${index}`);
      const manifest = await loadManifest(packageDir);
      manifests.push({ packageDir, manifest });
      await runNpmPackDryRun(packageDir);
      await compilePackage(packageDir, compiledDir);

      const extensionPath = path.join(compiledDir, "extensions", "index.mjs");
      if (!(await exists(extensionPath))) {
        protocolError("install_failure", `compiled extension entry missing for ${packageDir}`);
      }

      let extensionModule;
      try {
        extensionModule = await import(`${pathToFileURL(extensionPath).href}?t=${Date.now()}-${index}`);
      } catch (error) {
        protocolError("install_failure", `failed to import compiled extension for ${packageDir}`, {
          cause: error instanceof Error ? error.message : String(error),
        });
      }

      if (typeof extensionModule.default !== "function") {
        protocolError("install_failure", `extension entry for ${packageDir} does not export a default activate function`);
      }

      try {
        const fabric = extensionModule.default(runtime);
        if (!sharedFabric && fabric && typeof fabric.getRegistry === "function") {
          sharedFabric = fabric;
        }
      } catch (error) {
        protocolError("activation_failure", `activate() threw for ${packageDir}`, {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!sharedFabric) {
      protocolError("activation_failure", "no shared protocol fabric was returned by the compiled packages");
    }

    try {
      await runtime.emit("session_start", { reason: "pi-pi-runtime-smoke" });
    } catch (error) {
      protocolError("activation_failure", "session_start failed during runtime smoke verification", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    const registry = sharedFabric.getRegistry();
    const registeredNodeIds = [];
    const invokedProvides = [];

    for (const { packageDir, manifest } of manifests) {
      if (!sharedFabric.describe(manifest.nodeId)) {
        protocolError("registry_failure", `node ${manifest.nodeId} did not register during session_start`, {
          packageDir,
          registry,
        });
      }
      registeredNodeIds.push(manifest.nodeId);

      const publicProvide = (manifest.provides ?? []).find((provide) => (provide.visibility ?? "public") === "public");
      if (!publicProvide) continue;

      const inputSchema = await resolveSchemaObject(packageDir, publicProvide.inputSchema);
      const input = sampleValueFromSchema(inputSchema);
      const result = await sharedFabric.invoke({
        callerNodeId: "pi-pi-runtime-smoke",
        provide: publicProvide.name,
        target: { nodeId: manifest.nodeId },
        routing: "deterministic",
        input,
      });

      if (!result.ok) {
        protocolError("invocation_failure", `${manifest.nodeId}.${publicProvide.name} failed during runtime smoke verification`, {
          packageDir,
          input,
          error: result.error,
        });
      }

      invokedProvides.push(`${manifest.nodeId}.${publicProvide.name}`);
    }

    try {
      await runtime.emit("session_shutdown", { reason: "pi-pi-runtime-smoke-finished" });
    } catch {
      // best effort
    }

    return {
      packageCount: manifests.length,
      registeredNodeIds,
      invokedProvides,
    };
  } finally {
    await fs.rm(compileRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    protocolError("invalid_input", "missing runtime smoke input payload");
  }

  const input = JSON.parse(raw);
  if (!input || !Array.isArray(input.packageDirs) || input.packageDirs.length === 0) {
    protocolError("invalid_input", "packageDirs must be a non-empty array");
  }

  const result = await verifyRuntime(input.packageDirs);
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

main().catch((error) => {
  const payload = {
    ok: false,
    stage: error?.stage ?? "execution_failure",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  };
  process.stdout.write(JSON.stringify(payload));
  process.exitCode = 1;
});
