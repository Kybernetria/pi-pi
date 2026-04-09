import { promises as fs } from "node:fs";
import path from "node:path";
import { GENERATED_SDK_FILE, PROTOCOL_VERSION, VALIDATION_MODE } from "./constants.ts";
import { REQUIRED_FILES } from "./template-renderer.ts";
import { collectSourceFiles, dedupe, exists, protocolError, readJsonIfExists, renderJson, toPascalCase } from "./core-shared.ts";
import { analyzeExtensionBootstrap, analyzeSourceAst, getPackageName, isForbiddenCertifiedNodeImport, type SourceAstAnalysis } from "./source-analysis.ts";
import type { JSONSchemaLite, PiProtocolManifest } from "../vendor/pi-protocol-sdk.ts";
import type { PlanBrownfieldMigrationInput, PlanCertifiedNodeFromDescriptionInput, ScaffoldCertifiedNodeInput, ScaffoldCollaboratingNodesInput, ValidateCertifiedNodeInput, ValidateCertifiedNodeOutput, ValidationRuleResult } from "./contracts.ts";

async function resolveSchemaObject(
  packageDir: string,
  schema: string | JSONSchemaLite | undefined,
): Promise<JSONSchemaLite | null> {
  if (!schema) return null;
  if (typeof schema === "object") return schema;

  const schemaPath = path.resolve(packageDir, schema);
  if (!(await exists(schemaPath))) return null;

  try {
    return JSON.parse(await fs.readFile(schemaPath, "utf8")) as JSONSchemaLite;
  } catch {
    return null;
  }
}

function schemaRequiresProperty(schema: JSONSchemaLite | null, propertyName: string): boolean {
  return Array.isArray(schema?.required) && schema.required.includes(propertyName);
}

function schemaHasProperty(schema: JSONSchemaLite | null, propertyName: string): boolean {
  return !!schema?.properties && propertyName in schema.properties;
}

function schemaLooksLikePingContract(
  inputSchema: JSONSchemaLite | null,
  outputSchema: JSONSchemaLite | null,
): boolean {
  return (
    !schemaRequiresProperty(inputSchema, "targetPath") &&
    !schemaHasProperty(outputSchema, "pass") &&
    !schemaHasProperty(outputSchema, "findings") &&
    schemaHasProperty(outputSchema, "response")
  );
}

export async function validateCertifiedNode(
  input: ValidateCertifiedNodeInput,
): Promise<ValidateCertifiedNodeOutput> {
  if (!input || typeof input !== "object" || !input.packageDir?.trim()) {
    throw protocolError("INVALID_INPUT", "validate_extension requires a non-empty packageDir");
  }

  const packageDir = path.resolve(input.packageDir);
  const violations: ValidationRuleResult[] = [];
  const detectedRelevantFiles: string[] = [];

  const packageJsonPath = path.join(packageDir, "package.json");
  const manifestPath = path.join(packageDir, "pi.protocol.json");
  const vendoredSdkPath = path.join(packageDir, GENERATED_SDK_FILE);
  const extensionTsPath = path.join(packageDir, "extensions", "index.ts");
  const extensionJsPath = path.join(packageDir, "extensions", "index.js");
  const handlersTsPath = path.join(packageDir, "protocol", "handlers.ts");
  const handlersJsPath = path.join(packageDir, "protocol", "handlers.js");

  const packageJsonExists = await exists(packageJsonPath);
  const manifestExists = await exists(manifestPath);
  const vendoredSdkExists = await exists(vendoredSdkPath);
  const extensionPath = (await exists(extensionTsPath)) ? extensionTsPath : extensionJsPath;
  const handlersPath = (await exists(handlersTsPath)) ? handlersTsPath : handlersJsPath;

  for (const requiredFile of REQUIRED_FILES) {
    const resolved = path.join(packageDir, requiredFile);
    if (await exists(resolved)) {
      detectedRelevantFiles.push(requiredFile);
    }
  }

  if (!packageJsonExists) {
    violations.push({
      rule: "required-file.package-json",
      message: "Missing package.json",
      suggestedFix: "Add a package.json file with native Pi metadata under package.json#pi.",
    });
  }

  if (!manifestExists) {
    violations.push({
      rule: "required-file.pi-protocol-json",
      message: "Missing pi.protocol.json",
      suggestedFix: "Add a root pi.protocol.json sidecar manifest.",
    });
  }

  if (!vendoredSdkExists) {
    violations.push({
      rule: "required-file.vendored-sdk",
      message: `Missing ${GENERATED_SDK_FILE}`,
      suggestedFix: `Copy the vendored SDK shim into ${GENERATED_SDK_FILE}.`,
    });
  }

  if (!(await exists(extensionPath))) {
    violations.push({
      rule: "required-file.extension",
      message: "Missing extensions/index.ts or extensions/index.js",
      suggestedFix: "Add the standard bootstrap extension entrypoint under extensions/index.ts.",
    });
  }

  if (!(await exists(handlersPath))) {
    violations.push({
      rule: "required-file.handlers",
      message: "Missing protocol/handlers.ts or protocol/handlers.js",
      suggestedFix: "Add local protocol handlers under protocol/handlers.ts.",
    });
  }

  let packageJson: any = null;
  if (packageJsonExists) {
    try {
      packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    } catch {
      violations.push({
        rule: "package-json.parse",
        message: "package.json is not valid JSON",
        suggestedFix: "Fix package.json so it parses as valid JSON.",
      });
    }
  }

  let manifest: PiProtocolManifest | null = null;
  if (manifestExists) {
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      violations.push({
        rule: "manifest.parse",
        message: "pi.protocol.json is not valid JSON",
        suggestedFix: "Fix pi.protocol.json so it parses as valid JSON.",
      });
    }
  }

  if (packageJson) {
    if (!packageJson.pi || !Array.isArray(packageJson.pi.extensions) || packageJson.pi.extensions.length === 0) {
      violations.push({
        rule: "package-json.pi",
        message: "package.json#pi.extensions is missing or empty",
        suggestedFix: "Declare the extension directory in package.json#pi.extensions.",
      });
    }

    for (const violation of findLocalDependencyViolations(packageJson)) {
      violations.push(violation);
    }
  }

  let exportedHandlerNames = new Set<string>();
  let handlersSource = "";
  let handlerAstAnalysis: SourceAstAnalysis | null = null;
  if (await exists(handlersPath)) {
    handlersSource = await fs.readFile(handlersPath, "utf8");
    handlerAstAnalysis = analyzeSourceAst(handlersPath, handlersSource);
    if (handlerAstAnalysis.parseErrors.length > 0) {
      violations.push({
        rule: "handlers.parse",
        message: `protocol handlers source contains parse errors: ${handlerAstAnalysis.parseErrors[0]}`,
        suggestedFix: "Fix protocol/handlers.ts so it parses as valid TypeScript or JavaScript.",
      });
    }
    exportedHandlerNames = handlerAstAnalysis.exportedNames;
  }

  let extensionSource = "";
  let extensionAstAnalysis: SourceAstAnalysis | null = null;
  if (await exists(extensionPath)) {
    extensionSource = await fs.readFile(extensionPath, "utf8");
    extensionAstAnalysis = analyzeSourceAst(extensionPath, extensionSource);
    if (extensionAstAnalysis.parseErrors.length > 0) {
      violations.push({
        rule: "extension.parse",
        message: `extension source contains parse errors: ${extensionAstAnalysis.parseErrors[0]}`,
        suggestedFix: "Fix extensions/index.ts so it parses as valid TypeScript or JavaScript.",
      });
    }
  }

  if (manifest) {
    if (manifest.protocolVersion !== PROTOCOL_VERSION) {
      violations.push({
        rule: "manifest.protocol-version",
        message: `Unsupported protocolVersion ${String(manifest.protocolVersion)}`,
        suggestedFix: `Set protocolVersion to ${PROTOCOL_VERSION}.`,
      });
    }

    if (!manifest.nodeId || typeof manifest.nodeId !== "string") {
      violations.push({
        rule: "manifest.node-id",
        message: "Manifest nodeId is missing or empty",
        suggestedFix: "Provide a stable non-empty nodeId in pi.protocol.json.",
      });
    }

    if (!manifest.purpose || typeof manifest.purpose !== "string") {
      violations.push({
        rule: "manifest.purpose",
        message: "Manifest purpose is missing or empty",
        suggestedFix: "Provide a concise non-empty purpose in pi.protocol.json.",
      });
    }

    const seenProvides = new Set<string>();
    for (const provide of manifest.provides ?? []) {
      if (!provide.name) {
        violations.push({
          rule: "provide.name",
          message: "A provide is missing its name",
          suggestedFix: "Give every provide a non-empty local name.",
        });
        continue;
      }

      if (seenProvides.has(provide.name)) {
        violations.push({
          rule: "provide.duplicate",
          message: `Duplicate provide name ${provide.name}`,
          suggestedFix: "Use unique local provide names within one node.",
        });
      }
      seenProvides.add(provide.name);

      if (!provide.description) {
        violations.push({
          rule: `provide.description.${provide.name}`,
          message: `Provide ${provide.name} is missing a description`,
          suggestedFix: "Add a human-readable description for each provide.",
        });
      }

      if (!provide.handler) {
        violations.push({
          rule: `provide.handler.${provide.name}`,
          message: `Provide ${provide.name} is missing a handler reference`,
          suggestedFix: "Set the handler field to a local exported handler name.",
        });
      } else if (!exportedHandlerNames.has(provide.handler)) {
        violations.push({
          rule: `provide.handler-missing.${provide.name}`,
          message: `Handler ${provide.handler} was not found in protocol/handlers`,
          suggestedFix: `Export ${provide.handler} from protocol/handlers.ts or update the manifest handler reference.`,
        });
      }

      for (const [schemaLabel, schemaValue] of [
        ["inputSchema", provide.inputSchema],
        ["outputSchema", provide.outputSchema],
      ] as const) {
        if (!schemaValue) {
          violations.push({
            rule: `${provide.name}.${schemaLabel}`,
            message: `Provide ${provide.name} is missing ${schemaLabel}`,
            suggestedFix: `Add ${schemaLabel} for ${provide.name}.`,
          });
          continue;
        }

        if (typeof schemaValue === "string") {
          const schemaPath = path.resolve(packageDir, schemaValue);
          if (!(await exists(schemaPath))) {
            violations.push({
              rule: `${provide.name}.${schemaLabel}.path`,
              message: `${schemaLabel} path ${schemaValue} does not exist`,
              suggestedFix: `Create ${schemaValue} or replace it with an inline schema object.`,
            });
          }
        } else if (typeof schemaValue !== "object") {
          violations.push({
            rule: `${provide.name}.${schemaLabel}.shape`,
            message: `${schemaLabel} for ${provide.name} must be a schema object or relative path string`,
            suggestedFix: `Use a JSON schema object or a relative schema file path for ${schemaLabel}.`,
          });
        }
      }

      const inputSchemaObject = await resolveSchemaObject(packageDir, provide.inputSchema);
      const outputSchemaObject = await resolveSchemaObject(packageDir, provide.outputSchema);

      // Tiny semantic guardrail: a package may be structurally valid yet still obviously wrong,
      // e.g. a provide named "ping" with validation-style targetPath/pass/findings fields.
      if (provide.name === "ping" && !schemaLooksLikePingContract(inputSchemaObject, outputSchemaObject)) {
        violations.push({
          rule: "provide.semantic.ping",
          message: "Provide ping does not look like a ping/pong contract",
          suggestedFix: "Use a lightweight ping schema, e.g. optional note input and output containing response: \"pong\" instead of validation-style fields such as targetPath, pass, or findings.",
        });
      }
    }
  }

  if (extensionAstAnalysis) {
    const bootstrapAnalysis = analyzeExtensionBootstrap(extensionAstAnalysis.sourceFile);

    if (!bootstrapAnalysis.hasEnsureProtocolFabricCall) {
      violations.push({
        rule: "bootstrap.ensure-fabric",
        message: "Extension bootstrap does not call ensureProtocolFabric",
        suggestedFix: "Call ensureProtocolFabric(pi) during activation.",
      });
    }

    if (!bootstrapAnalysis.hasEnsureProtocolAgentProjectionCall) {
      violations.push({
        rule: "bootstrap.ensure-protocol-projection",
        message: "Extension bootstrap does not call ensureProtocolAgentProjection",
        suggestedFix: "Call ensureProtocolAgentProjection(pi, fabric) during session_start or equivalent runtime startup.",
      });
    }

    if (!bootstrapAnalysis.hasEnsureProtocolAgentProjectionOnSessionStart) {
      violations.push({
        rule: "bootstrap.ensure-protocol-projection.session-start",
        message: "Extension bootstrap does not ensure the protocol projection inside session_start",
        suggestedFix: "Call ensureProtocolAgentProjection(pi, fabric) inside a session_start handler so the protocol tool is available on runtime startup.",
      });
    }

    if (!bootstrapAnalysis.hasRegisterProtocolNodeCall) {
      violations.push({
        rule: "bootstrap.register-node",
        message: "Extension bootstrap does not call registerProtocolNode",
        suggestedFix: "Register the node during session_start using registerProtocolNode(...).",
      });
    }

    if (!bootstrapAnalysis.hasSessionStartRegistration) {
      violations.push({
        rule: "bootstrap.session-start",
        message: "Extension bootstrap does not register on session_start",
        suggestedFix: "Move registration into a session_start handler.",
      });
    }

    if (!bootstrapAnalysis.hasSessionShutdownUnregister) {
      violations.push({
        rule: "bootstrap.session-shutdown",
        message: "Extension bootstrap does not unregister on session_shutdown",
        suggestedFix: "Unregister the node in a session_shutdown handler.",
      });
    }
  }

  const sourceFiles = await collectSourceFiles(packageDir);
  for (const filePath of sourceFiles) {
    const source = await fs.readFile(filePath, "utf8");
    const sourceAstAnalysis = analyzeSourceAst(filePath, source);

    if (sourceAstAnalysis.parseErrors.length > 0) {
      violations.push({
        rule: `source.parse.${path.relative(packageDir, filePath).replaceAll(path.sep, ".")}`,
        message: `Source file ${path.relative(packageDir, filePath)} contains parse errors: ${sourceAstAnalysis.parseErrors[0]}`,
        suggestedFix: "Fix the source file so it parses as valid TypeScript or JavaScript.",
      });
    }

    for (const specifier of sourceAstAnalysis.importSpecifiers) {
      if (isForbiddenCertifiedNodeImport(specifier, getPackageName(packageJson))) {
        violations.push({
          rule: "imports.forbidden-certified-node",
          message: `Forbidden certified-node import detected in ${path.relative(packageDir, filePath)}: ${specifier}`,
          suggestedFix: "Remove direct sibling node imports and use protocol-native delegation surfaces such as ctx.delegate.invoke() for cross-node calls.",
        });
      }
    }
  }

  const provides = manifest?.provides?.map((provide) => ({
    name: provide.name,
    handler: provide.handler,
    visibility: provide.visibility ?? "public",
  })) ?? [];

  return {
    packageDir,
    pass: violations.length === 0,
    violatedRules: violations,
    suggestedFixes: violations.map((violation) => violation.suggestedFix),
    normalizedSummary: {
      packageName: packageJson?.name ?? null,
      nodeId: manifest?.nodeId ?? null,
      protocolVersion: manifest?.protocolVersion ?? null,
      provides,
    },
    validationMode: VALIDATION_MODE,
    detectedRelevantFiles: dedupe([
      ...detectedRelevantFiles,
      ...sourceFiles.map((filePath) => path.relative(packageDir, filePath)),
    ]).sort(),
  };
}

export function validatePlanningInput(input: PlanCertifiedNodeFromDescriptionInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "plan_extension_from_brief requires an input object");
  }

  if (!input.description?.trim()) {
    throw protocolError("INVALID_INPUT", "description is required");
  }

  if (input.preferCollaboration !== undefined && typeof input.preferCollaboration !== "boolean") {
    throw protocolError("INVALID_INPUT", "preferCollaboration must be boolean when provided");
  }

  if (input.includeInstructionDebug !== undefined && typeof input.includeInstructionDebug !== "boolean") {
    throw protocolError("INVALID_INPUT", "includeInstructionDebug must be boolean when provided");
  }
}

export function validateBrownfieldPlanningInput(input: PlanBrownfieldMigrationInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "plan_existing_repo_migration requires an input object");
  }

  if (!input.repoDir?.trim()) {
    throw protocolError("INVALID_INPUT", "repoDir is required");
  }

  if (input.includeFileHints !== undefined && typeof input.includeFileHints !== "boolean") {
    throw protocolError("INVALID_INPUT", "includeFileHints must be boolean when provided");
  }

  if (input.preferCollaboration !== undefined && typeof input.preferCollaboration !== "boolean") {
    throw protocolError("INVALID_INPUT", "preferCollaboration must be boolean when provided");
  }

  if (input.includeInstructionDebug !== undefined && typeof input.includeInstructionDebug !== "boolean") {
    throw protocolError("INVALID_INPUT", "includeInstructionDebug must be boolean when provided");
  }
}

export function validateScaffoldInput(input: ScaffoldCertifiedNodeInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "scaffold_extension requires an input object");
  }

  if (!input.packageName?.trim()) {
    throw protocolError("INVALID_INPUT", "packageName is required");
  }

  if (!input.nodeId?.trim()) {
    throw protocolError("INVALID_INPUT", "nodeId is required");
  }

  if (!/^[a-z][a-z0-9-]*$/.test(input.packageName)) {
    throw protocolError(
      "INVALID_INPUT",
      "packageName must match /^[a-z][a-z0-9-]*$/ for the starter template",
    );
  }

  if (!/^[a-z][a-z0-9-]*$/.test(input.nodeId)) {
    throw protocolError(
      "INVALID_INPUT",
      "nodeId must match /^[a-z][a-z0-9-]*$/ for the starter template",
    );
  }

  if (!input.purpose?.trim()) {
    throw protocolError("INVALID_INPUT", "purpose is required");
  }

  if (input.strictTypes !== undefined && typeof input.strictTypes !== "boolean") {
    throw protocolError("INVALID_INPUT", "strictTypes must be boolean when provided");
  }

  if (!Array.isArray(input.provides) || input.provides.length === 0) {
    throw protocolError("INVALID_INPUT", "provides must be a non-empty array");
  }

  const seen = new Set<string>();
  for (const provide of input.provides) {
    if (!provide?.name || !provide?.description) {
      throw protocolError("INVALID_INPUT", "each provide requires name and description");
    }

    if (!/^[a-z][a-z0-9_]*$/.test(provide.name)) {
      throw protocolError(
        "INVALID_INPUT",
        `provide name ${provide.name} must match /^[a-z][a-z0-9_]*$/ so it is a valid handler export`,
      );
    }

    if (seen.has(provide.name)) {
      throw protocolError("INVALID_INPUT", `duplicate provide name ${provide.name}`);
    }
    seen.add(provide.name);
  }
}

export function validateCollaboratingNodesInput(input: ScaffoldCollaboratingNodesInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "scaffold_extension_pair requires an input object");
  }

  const packageFields = [
    ["managerPackageName", input.managerPackageName],
    ["managerNodeId", input.managerNodeId],
    ["workerPackageName", input.workerPackageName],
    ["workerNodeId", input.workerNodeId],
  ] as const;

  for (const [label, value] of packageFields) {
    if (!value?.trim()) {
      throw protocolError("INVALID_INPUT", `${label} is required`);
    }

    if (!/^[a-z][a-z0-9-]*$/.test(value)) {
      throw protocolError("INVALID_INPUT", `${label} must match /^[a-z][a-z0-9-]*$/`);
    }
  }

  const provideFields = [
    ["managerProvideName", input.managerProvideName],
    ["workerProvideName", input.workerProvideName],
  ] as const;

  for (const [label, value] of provideFields) {
    if (!value?.trim()) {
      throw protocolError("INVALID_INPUT", `${label} is required`);
    }

    if (!/^[a-z][a-z0-9_]*$/.test(value)) {
      throw protocolError("INVALID_INPUT", `${label} must match /^[a-z][a-z0-9_]*$/`);
    }
  }

  if (input.workerMode !== "deterministic" && input.workerMode !== "agent-backed") {
    throw protocolError("INVALID_INPUT", "workerMode must be 'deterministic' or 'agent-backed'");
  }

  if (input.strictTypes !== undefined && typeof input.strictTypes !== "boolean") {
    throw protocolError("INVALID_INPUT", "strictTypes must be boolean when provided");
  }

  if (
    input.generateInternalPromptFiles !== undefined &&
    typeof input.generateInternalPromptFiles !== "boolean"
  ) {
    throw protocolError("INVALID_INPUT", "generateInternalPromptFiles must be boolean when provided");
  }
}


function findLocalDependencyViolations(packageJson: Record<string, unknown>): ValidationRuleResult[] {
  const violations: ValidationRuleResult[] = [];
  const dependencySections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const;

  for (const section of dependencySections) {
    const dependencies = packageJson[section];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      continue;
    }

    for (const [name, version] of Object.entries(dependencies as Record<string, unknown>)) {
      if (typeof version !== "string") continue;
      if (!isNonStandaloneDependencyVersion(version)) continue;
      violations.push({
        rule: `package-json.${section}.non-standalone.${name}`,
        message: `${section}.${name} uses non-standalone version ${version}`,
        suggestedFix:
          "Replace repo-local file/link/workspace dependencies with a published semver dependency or vendor an equivalent shim for standalone installability.",
      });
    }
  }

  return violations;
}

function isNonStandaloneDependencyVersion(version: string): boolean {
  return /^(file:|link:|workspace:)/.test(version);
}

export async function validateCertifiedExtension(
  input: ValidateCertifiedNodeInput,
): Promise<ValidateCertifiedNodeOutput> {
  return validateCertifiedNode(input);
}
