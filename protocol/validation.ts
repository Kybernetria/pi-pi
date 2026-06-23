import { promises as fs } from "node:fs";
import path from "node:path";

export interface ValidationIssue {
  rule: string;
  message: string;
  suggestedFix: string;
}

export interface ValidationResult {
  packageDir: string;
  pass: boolean;
  issues: ValidationIssue[];
  detectedFiles: string[];
}

interface ManifestProvide {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  execution?: { type?: unknown; handler?: unknown; agent?: unknown };
  handler?: unknown;
  agent?: unknown;
}

export async function validateProtocolPackage(packageDir: string): Promise<ValidationResult> {
  const root = path.resolve(packageDir);
  const issues: ValidationIssue[] = [];
  const detectedFiles: string[] = [];
  const packageJsonPath = path.join(root, "package.json");
  const manifestPath = path.join(root, "pi.protocol.json");
  const extensionPath = path.join(root, "extension.ts");
  const handlersPath = path.join(root, "protocol", "handlers.ts");

  for (const rel of ["package.json", "pi.protocol.json", "extension.ts", "protocol/handlers.ts", "README.md"]) {
    if (await exists(path.join(root, rel))) detectedFiles.push(rel);
  }

  const packageJson = await readJson(packageJsonPath, issues, "package-json.parse");
  const manifest = await readJson(manifestPath, issues, "manifest.parse") as { protocolVersion?: unknown; nodeId?: unknown; purpose?: unknown; provides?: ManifestProvide[] } | null;
  const extensionSource = await readText(extensionPath);
  const handlersSource = await readText(handlersPath);

  if (!packageJson) issue(issues, "required-file.package-json", "Missing package.json", "Add package.json at the package root.");
  if (!manifest) issue(issues, "required-file.pi-protocol-json", "Missing pi.protocol.json", "Add a root pi.protocol.json manifest.");
  if (extensionSource === null) issue(issues, "required-file.extension", "Missing extension.ts", "Add a root extension.ts Pi adapter.");

  if (packageJson) {
    const extensions = (packageJson as { pi?: { extensions?: unknown } }).pi?.extensions;
    if (!Array.isArray(extensions) || !extensions.includes("./extension.ts")) {
      issue(issues, "package-json.pi.extensions", "package.json#pi.extensions must include ./extension.ts", "Set pi.extensions to [\"./extension.ts\"].");
    }
    const allDeps = JSON.stringify({
      dependencies: (packageJson as Record<string, unknown>).dependencies,
      devDependencies: (packageJson as Record<string, unknown>).devDependencies,
      peerDependencies: (packageJson as Record<string, unknown>).peerDependencies,
    });
    if (allDeps.includes("@mariozechner/pi-coding-agent")) {
      issue(issues, "imports.legacy-pi-package", "Uses legacy @mariozechner/pi-coding-agent package", "Use @earendil-works/pi-coding-agent.");
    }
  }

  const expectedHandlers = new Set<string>();
  if (manifest) {
    if (manifest.protocolVersion !== "0.2.0") issue(issues, "manifest.protocol-version", "protocolVersion must be 0.2.0", "Set protocolVersion to \"0.2.0\".");
    if (!isNonEmptyString(manifest.nodeId)) issue(issues, "manifest.node-id", "nodeId is missing or empty", "Add a stable non-empty nodeId.");
    if (!isNonEmptyString(manifest.purpose)) issue(issues, "manifest.purpose", "purpose is missing or empty", "Add a concise package purpose.");
    if (!Array.isArray(manifest.provides) || manifest.provides.length === 0) {
      issue(issues, "manifest.provides", "provides must be a non-empty array", "Declare at least one public provide.");
    }

    for (const provide of manifest.provides ?? []) {
      const name = isNonEmptyString(provide.name) ? provide.name : "<unnamed>";
      if (!isNonEmptyString(provide.name)) issue(issues, "provide.name", "A provide is missing name", "Give every provide a non-empty name.");
      if (!isNonEmptyString(provide.description)) issue(issues, `provide.description.${name}`, `Provide ${name} is missing description`, "Add a concise description.");
      if (!provide.inputSchema || typeof provide.inputSchema !== "object") issue(issues, `provide.inputSchema.${name}`, `Provide ${name} is missing inputSchema`, "Add an inline JSON schema object.");
      if (!provide.outputSchema || typeof provide.outputSchema !== "object") issue(issues, `provide.outputSchema.${name}`, `Provide ${name} is missing outputSchema`, "Add an inline JSON schema object.");
      if (provide.handler !== undefined || provide.agent !== undefined) {
        issue(issues, `provide.legacy-execution.${name}`, `Provide ${name} uses legacy top-level handler/agent shorthand`, "Replace with execution: { type: \"handler\", handler: \"...\" } or { type: \"agent\", agent: \"...\" }.");
      }
      if (!provide.execution || typeof provide.execution !== "object") {
        issue(issues, `provide.execution.${name}`, `Provide ${name} is missing canonical execution`, "Add canonical execution.");
      } else if (provide.execution.type === "handler") {
        if (!isNonEmptyString(provide.execution.handler)) issue(issues, `provide.execution.handler.${name}`, `Handler-backed provide ${name} is missing execution.handler`, "Set execution.handler.");
        else expectedHandlers.add(provide.execution.handler);
      } else if (provide.execution.type === "agent") {
        if (!isNonEmptyString(provide.execution.agent)) issue(issues, `provide.execution.agent.${name}`, `Agent-backed provide ${name} is missing execution.agent`, "Set execution.agent and declare manifest.agents.");
      } else {
        issue(issues, `provide.execution.type.${name}`, `Provide ${name} has invalid execution.type`, "Use handler or agent execution.");
      }
    }
  }

  if (extensionSource !== null) {
    if (!extensionSource.includes("ensureProtocolFabric")) issue(issues, "bootstrap.ensure-fabric", "extension.ts does not use ensureProtocolFabric", "Import and call ensureProtocolFabric().");
    if (!extensionSource.includes("registerProtocolManifest")) issue(issues, "bootstrap.register-manifest", "extension.ts does not use registerProtocolManifest", "Register the manifest with registerProtocolManifest().");
    if (!/\.unregister\s*\(/.test(extensionSource)) issue(issues, "bootstrap.unregister", "extension.ts does not unregister before registering", "Call fabric.unregister(nodeId) before registerProtocolManifest().");
  }

  if (handlersSource !== null) {
    for (const handlerName of expectedHandlers) {
      if (!new RegExp(`\\b${escapeRegExp(handlerName)}\\s*:`).test(handlersSource) && !new RegExp(`function\\s+${escapeRegExp(handlerName)}\\b`).test(handlersSource)) {
        issue(issues, `handler.missing.${handlerName}`, `Handler ${handlerName} is not registered in protocol/handlers.ts`, "Return the handler key from createHandlers().");
      }
    }
  } else if (expectedHandlers.size > 0) {
    issue(issues, "required-file.handlers", "Missing protocol/handlers.ts for handler-backed provides", "Add protocol/handlers.ts with createHandlers().");
  }

  for (const rel of await collectTsFiles(root)) {
    const source = await fs.readFile(path.join(root, rel), "utf8");
    if (source.includes("@mariozechner/pi-coding-agent")) issue(issues, `imports.legacy.${rel}`, `${rel} imports legacy Pi package`, "Use @earendil-works/pi-coding-agent.");
    for (const specifier of extractImportSpecifiers(source)) {
      if (isForbiddenProtocolNodeImport(specifier, (packageJson as { name?: string } | null)?.name)) {
        issue(issues, `imports.sibling.${rel}`, `${rel} directly imports possible sibling protocol package ${specifier}`, "Use fabric.invoke() for cross-node calls.");
      }
    }
  }

  return { packageDir: root, pass: issues.length === 0, issues, detectedFiles: detectedFiles.sort() };
}

async function exists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function readText(filePath: string): Promise<string | null> { try { return await fs.readFile(filePath, "utf8"); } catch { return null; } }
async function readJson(filePath: string, issues: ValidationIssue[], rule: string): Promise<unknown | null> { const text = await readText(filePath); if (text === null) return null; try { return JSON.parse(text); } catch { issue(issues, rule, `${path.basename(filePath)} is not valid JSON`, "Fix JSON syntax."); return null; } }
function issue(issues: ValidationIssue[], rule: string, message: string, suggestedFix: string): void { issues.push({ rule, message, suggestedFix }); }
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
async function collectTsFiles(root: string): Promise<string[]> { const out: string[] = []; async function walk(dir: string): Promise<void> { let entries: import("node:fs").Dirent[]; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; } for (const entry of entries) { if (["node_modules", ".git", "dist"].includes(entry.name)) continue; const full = path.join(dir, entry.name); const rel = path.relative(root, full); if (entry.isDirectory()) await walk(full); else if (/\.[cm]?tsx?$/.test(entry.name)) out.push(rel); } } await walk(root); return out.sort(); }
function extractImportSpecifiers(source: string): string[] { return [...source.matchAll(/import(?:\s+type)?[\s\S]*?from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? ""); }
function isForbiddenProtocolNodeImport(specifier: string, ownPackageName?: string): boolean { if (specifier === ownPackageName) return false; if (specifier === "@earendil-works/pi-coding-agent") return false; if (specifier.startsWith("@kyvernitria/pi-protocol-")) return false; return /^(pi-[a-z0-9-]+|@[a-z0-9_-]+\/pi-[a-z0-9-]+)$/.test(specifier); }
