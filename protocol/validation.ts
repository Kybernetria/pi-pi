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

interface ManifestAgent {
  description?: unknown;
  systemPrompt?: unknown;
  modelHint?: unknown;
}

export async function validateProtocolPackage(packageDir: string): Promise<ValidationResult> {
  const root = path.resolve(packageDir);
  const issues: ValidationIssue[] = [];
  const detectedFiles: string[] = [];
  const packageJsonPath = path.join(root, "package.json");
  const manifestPath = path.join(root, "pi.protocol.json");
  const extensionPath = path.join(root, "extension.ts");
  const handlersPath = path.join(root, "protocol", "handlers.ts");
  const readmePath = path.join(root, "README.md");

  for (const rel of ["package.json", "pi.protocol.json", "extension.ts", "protocol/handlers.ts", "README.md"]) {
    if (await exists(path.join(root, rel))) detectedFiles.push(rel);
  }

  const packageJson = await readJson(packageJsonPath, issues, "package-json.parse");
  const manifest = await readJson(manifestPath, issues, "manifest.parse") as {
    protocolVersion?: unknown; nodeId?: unknown; purpose?: unknown;
    agents?: Record<string, ManifestAgent>; provides?: ManifestProvide[];
  } | null;
  const extensionSource = await readText(extensionPath);
  const handlersSource = await readText(handlersPath);
  const readmeSource = await readText(readmePath);

  // --- Required files ---
  if (!packageJson) issue(issues, "required-file.package-json", "Missing package.json", "Add package.json at the package root.");
  if (!manifest) issue(issues, "required-file.pi-protocol-json", "Missing pi.protocol.json", "Add a root pi.protocol.json manifest.");
  if (extensionSource === null) issue(issues, "required-file.extension", "Missing extension.ts", "Add a root extension.ts Pi adapter.");

  // --- package.json checks ---
  if (packageJson) {
    const pkg = packageJson as Record<string, unknown>;
    const extensions = (pkg.pi as { extensions?: unknown } | undefined)?.extensions;
    if (!Array.isArray(extensions) || !extensions.includes("./extension.ts")) {
      issue(issues, "package-json.pi.extensions", "package.json#pi.extensions must include ./extension.ts", "Set pi.extensions to [\"./extension.ts\"].");
    }
    if (pkg.keywords && Array.isArray(pkg.keywords) && !pkg.keywords.includes("pi-package") && !pkg.keywords.includes("pi-protocol")) {
      issue(issues, "package-json.keywords", "package.json keywords should include 'pi-package' or 'pi-protocol'", "Add 'pi-package' or 'pi-protocol' to keywords.");
    }

    // Check for stale/legacy package names
    checkDependency(issues, pkg.dependencies, "@mariozechner/pi-coding-agent", "Uses legacy @mariozechner/pi-coding-agent dependency", "Use @earendil-works/pi-coding-agent.");
    checkDependency(issues, pkg.devDependencies, "@mariozechner/pi-coding-agent", "Uses legacy @mariozechner/pi-coding-agent devDependency", "Use @earendil-works/pi-coding-agent.");
    checkDependency(issues, pkg.dependencies, "@kyvernitria/pi-protocol-minimal", "Uses deprecated split package @kyvernitria/pi-protocol-minimal", "Use the unified @kybernetria/pi-protocol package.");
    checkDependency(issues, pkg.dependencies, "@kyvernitria/pi-protocol-pi-sdk", "Uses deprecated split package @kyvernitria/pi-protocol-pi-sdk", "Use the unified @kybernetria/pi-protocol/sdk entry.");
    checkDependency(issues, pkg.devDependencies, "@kyvernitria/pi-protocol-minimal", "Uses deprecated split package @kyvernitria/pi-protocol-minimal", "Use the unified @kybernetria/pi-protocol package.");
    checkDependency(issues, pkg.devDependencies, "@kyvernitria/pi-protocol-pi-sdk", "Uses deprecated split package @kyvernitria/pi-protocol-pi-sdk", "Use the unified @kybernetria/pi-protocol/sdk entry.");

    // Check for absolute file: dependencies in production packages
    const allDeps = {
      ...(pkg.dependencies as Record<string, string> || {}),
      ...(pkg.devDependencies as Record<string, string> || {}),
    };
    for (const [depName, depVersion] of Object.entries(allDeps)) {
      if (typeof depVersion === "string" && depVersion.startsWith("file:/")) {
        issue(issues, `dependency.absolute-path.${depName}`, `Dependency ${depName} uses absolute file: path ${depVersion}`, "Use a relative file: path, published semver range, or workspace protocol.");
      }
    }

    // Check for @kybernetria/pi-protocol peer dependency
    const peerDeps = pkg.peerDependencies as Record<string, string> | undefined;
    if (!peerDeps || !("@kybernetria/pi-protocol" in peerDeps)) {
      // Not all packages need it as peerDep, but if they have it as dep, they should peerDep it
    }
  }

  // --- Extension source checks ---
  if (extensionSource !== null) {
    if (!extensionSource.includes("ensureProtocolFabric")) issue(issues, "bootstrap.ensure-fabric", "extension.ts does not use ensureProtocolFabric", "Import and call ensureProtocolFabric().");
    if (!extensionSource.includes("registerProtocolManifest")) issue(issues, "bootstrap.register-manifest", "extension.ts does not use registerProtocolManifest", "Register the manifest with registerProtocolManifest().");
    if (!/\.unregister\s*\(/.test(extensionSource)) issue(issues, "bootstrap.unregister", "extension.ts does not unregister before registering", "Call fabric.unregister(nodeId) before registerProtocolManifest().");
  }

  // --- Manifest checks ---
  const expectedHandlers = new Set<string>();
  if (manifest) {
    if (manifest.protocolVersion !== "0.2.0") issue(issues, "manifest.protocol-version", "protocolVersion must be 0.2.0", "Set protocolVersion to \"0.2.0\".");
    if (!isNonEmptyString(manifest.nodeId)) issue(issues, "manifest.node-id", "nodeId is missing or empty", "Add a stable non-empty nodeId.");
    if (!isNonEmptyString(manifest.purpose)) issue(issues, "manifest.purpose", "purpose is missing or empty", "Add a concise package purpose.");
    if (!Array.isArray(manifest.provides) || manifest.provides.length === 0) {
      issue(issues, "manifest.provides", "provides must be a non-empty array", "Declare at least one public provide.");
    }

    // Agent checks
    const agents = manifest.agents ?? {};
    for (const [agentName, agent] of Object.entries(agents)) {
      if (!isNonEmptyString(agent.description)) {
        issue(issues, `agent.description.${agentName}`, `Agent ${agentName} is missing description`, "Add a description for the agent.");
      }
      if (agent.systemPrompt !== undefined) {
        if (typeof agent.systemPrompt !== "object" || agent.systemPrompt === null) {
          issue(issues, `agent.systemPrompt.${agentName}`, `Agent ${agentName} systemPrompt should be an object with { text, mode }`, "Use systemPrompt: { text: \"...\", mode: \"append\" | \"replace\" }.");
        } else {
          const sp = agent.systemPrompt as Record<string, unknown>;
          if (!isNonEmptyString(sp.text)) {
            issue(issues, `agent.systemPrompt.text.${agentName}`, `Agent ${agentName} systemPrompt.text is missing or empty`, "Add systemPrompt.text with the agent's system prompt text.");
          }
          if (sp.mode !== undefined && sp.mode !== "append" && sp.mode !== "replace") {
            issue(issues, `agent.systemPrompt.mode.${agentName}`, `Agent ${agentName} systemPrompt.mode must be "append" or "replace"`, "Set systemPrompt.mode to \"append\" or \"replace\".");
          }
        }
      }
      if (agent.modelHint !== undefined) {
        const hint = agent.modelHint as Record<string, unknown>;
        if (hint.specific !== undefined) {
          if (typeof hint.specific !== "string") {
            issue(issues, `agent.modelHint.specific.${agentName}`, `Agent ${agentName} modelHint.specific must be a string`, "Use \"provider/model-id\" format.");
          } else if (hint.specific && !hint.specific.includes("/")) {
            issue(issues, `agent.modelHint.specific.format.${agentName}`, `Agent ${agentName} modelHint.specific "${hint.specific}" should use "provider/model-id" format`, "Add provider prefix like \"provider/model-id\".");
          }
        }
        if (hint.thinkingLevel !== undefined && !["none", "low", "medium", "high"].includes(hint.thinkingLevel as string)) {
          issue(issues, `agent.modelHint.thinkingLevel.${agentName}`, `Agent ${agentName} modelHint.thinkingLevel must be one of: none, low, medium, high`, "Fix thinkingLevel value.");
        }
        if (hint.tier !== undefined) {
          issue(issues, `agent.modelHint.tier.${agentName}`, `Agent ${agentName} uses modelHint.tier which is advisory only`, "modelHint.tier does not affect model selection; use specific or omit.");
        }
      }
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
        if (!isNonEmptyString(provide.execution.agent)) {
          issue(issues, `provide.execution.agent.${name}`, `Agent-backed provide ${name} is missing execution.agent`, "Set execution.agent and declare manifest.agents.");
        } else if (!agents || typeof agents !== "object" || !(provide.execution.agent in agents)) {
          issue(issues, `provide.execution.agent-declared.${name}`, `Agent-backed provide ${name} references undeclared agent ${provide.execution.agent}`, "Declare the agent under manifest.agents with a useful description/systemPrompt.");
        }
      } else {
        issue(issues, `provide.execution.type.${name}`, `Provide ${name} has invalid execution.type`, "Use handler or agent execution.");
      }
    }
  }

  // --- Handlers source checks ---
  if (handlersSource !== null) {
    for (const handlerName of expectedHandlers) {
      if (!new RegExp(`\\b${escapeRegExp(handlerName)}\\s*:`).test(handlersSource) && !new RegExp(`function\\s+${escapeRegExp(handlerName)}\\b`).test(handlersSource)) {
        issue(issues, `handler.missing.${handlerName}`, `Handler ${handlerName} is not registered in protocol/handlers.ts`, "Return the handler key from createHandlers().");
      }
    }
  } else if (expectedHandlers.size > 0) {
    issue(issues, "required-file.handlers", "Missing protocol/handlers.ts for handler-backed provides", "Add protocol/handlers.ts with createHandlers().");
  }

  // --- README checks ---
  if (readmeSource !== null) {
    if (!readmeSource.includes("fabric.invoke") && !readmeSource.includes("nodeId") && !readmeSource.includes("provide")) {
      issue(issues, "readme.invoke-examples", "README.md should document protocol invoke examples", "Add JSON examples showing fabric.invoke() usage.");
    }
    if (!readmeSource.includes("protocolVersion") && !readmeSource.includes("0.2.0")) {
      issue(issues, "readme.protocol-version", "README.md should mention protocol version", "Document that the package uses protocolVersion 0.2.0.");
    }
  }

  // --- Source-level scans ---
  for (const rel of await collectTsFiles(root)) {
    const source = await fs.readFile(path.join(root, rel), "utf8");

    // Legacy import checks
    if (source.includes("@mariozechner/pi-coding-agent")) issue(issues, `imports.legacy.${rel}`, `${rel} imports legacy Pi package @mariozechner/pi-coding-agent`, "Use @earendil-works/pi-coding-agent.");
    if (source.includes("@kyvernitria/pi-protocol-minimal")) issue(issues, `imports.split.minimal.${rel}`, `${rel} imports deprecated split package @kyvernitria/pi-protocol-minimal`, "Use @kybernetria/pi-protocol.");
    if (source.includes("@kyvernitria/pi-protocol-pi-sdk")) issue(issues, `imports.split.sdk.${rel}`, `${rel} imports deprecated split package @kyvernitria/pi-protocol-pi-sdk`, "Use @kybernetria/pi-protocol/sdk.");
    if (source.includes("@kyvernitria/pi-protocol-pi-tool")) issue(issues, `imports.split.tool.${rel}`, `${rel} imports deprecated split package @kyvernitria/pi-protocol-pi-tool`, "Use @kybernetria/pi-protocol/tool.");

    // Cross-node direct sibling imports check
    for (const specifier of extractImportSpecifiers(source)) {
      if (isForbiddenProtocolNodeImport(specifier, (packageJson as { name?: string } | null)?.name)) {
        issue(issues, `imports.sibling.${rel}`, `${rel} directly imports possible sibling protocol package ${specifier}`, "Use fabric.invoke() for cross-node calls.");
      }
    }
  }

  return { packageDir: root, pass: issues.length === 0, issues, detectedFiles: detectedFiles.sort() };
}

// --- helpers ---

async function exists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function readText(filePath: string): Promise<string | null> { try { return await fs.readFile(filePath, "utf8"); } catch { return null; } }
async function readJson(filePath: string, issues: ValidationIssue[], rule: string): Promise<unknown | null> {
  const text = await readText(filePath);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { issue(issues, rule, `${path.basename(filePath)} is not valid JSON`, "Fix JSON syntax."); return null; }
}
function issue(issues: ValidationIssue[], rule: string, message: string, suggestedFix: string): void { issues.push({ rule, message, suggestedFix }); }
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function checkDependency(issues: ValidationIssue[], deps: unknown, depName: string, message: string, suggestedFix: string): void {
  if (deps && typeof deps === "object" && depName in (deps as Record<string, unknown>)) {
    issue(issues, `dependency.${depName}`, message, suggestedFix);
  }
}

async function collectTsFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) await walk(full);
      else if (/\.[cm]?tsx?$/.test(entry.name)) out.push(rel);
    }
  }
  await walk(root);
  return out.sort();
}

function extractImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/import(?:\s+type)?[\s\S]*?from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
}

function isForbiddenProtocolNodeImport(specifier: string, ownPackageName?: string): boolean {
  if (specifier === ownPackageName) return false;
  if (specifier === "@earendil-works/pi-coding-agent") return false;
  // Allow the unified @kybernetria/pi-protocol and its subpath exports
  if (specifier === "@kybernetria/pi-protocol") return false;
  if (specifier.startsWith("@kybernetria/pi-protocol/")) return false;
  // Block sibling pi-* packages that would be cross-node imports
  return /^(pi-[a-z0-9-]+|@[a-z0-9_-]+\/pi-[a-z0-9-]+)$/.test(specifier);
}
