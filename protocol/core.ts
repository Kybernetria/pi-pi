import type { DescribeCertifiedTemplateOutput, TemplateDescribeInput } from "./contracts.ts";
import { GENERATED_SDK_DISTRIBUTION, GENERATED_SDK_FILE, PROTOCOL_VERSION, VALIDATION_MODE } from "./constants.ts";
import { CERTIFICATION_CHECKLIST, REQUIRED_FILES, RECOMMENDED_FILES } from "./template-renderer.ts";

export {
  GENERATED_SDK_DISTRIBUTION,
  GENERATED_SDK_FILE,
  NODE_TYPES_VERSION,
  PI_CODING_AGENT_VERSION,
  PROTOCOL_VERSION,
  TYPESCRIPT_VERSION,
  VALIDATION_MODE,
} from "./constants.ts";

export * from "./contracts.ts";

export async function describeCertifiedTemplate(
  input: TemplateDescribeInput = {},
): Promise<DescribeCertifiedTemplateOutput> {
  return {
    templateKind: "pi-protocol-certified-node",
    language: "TypeScript",
    protocolVersion: PROTOCOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    recommendedFiles: RECOMMENDED_FILES,
    requiredDirectories: ["extensions", "protocol", "protocol/schemas", "vendor"],
    requiredRuntimeBehaviors: [
      "call ensureProtocolFabric(pi) during extension activation",
      "call ensureProtocolAgentProjection(pi, fabric) during session_start or equivalent runtime startup",
      "register with the shared fabric on session_start",
      "unregister from the shared fabric on session_shutdown",
      "prefer ctx.delegate.invoke() for recursive cross-node delegation",
      "use node-local handoff with opaque result boundaries by default when embedded subagent orchestration is needed",
      "ship pi.protocol.json as the canonical protocol contract",
    ],
    toolingProvides: ["chat_pi_pi"],
    generatedPackageDefaults: {
      sdkDistribution: GENERATED_SDK_DISTRIBUTION,
      sdkSourceOfTruth: GENERATED_SDK_FILE,
      useInlineSchemasDefault: false,
      generateDebugCommandsDefault: false,
      strictTypesDefault: true,
      validationMode: VALIDATION_MODE,
    },
    checklist: CERTIFICATION_CHECKLIST,
    commandExamples: input.includeCommandExamples
      ? [
          "/chat-pi-pi build me a certified extension that summarizes markdown notes and also offers a local command",
        ]
      : [],
    notes: [
      "chat_pi_pi is the only public provide and accepts a natural-language message plus optional execution hints.",
      "Low-level planning, migration, pair, scaffold, and alias stages are plain local code inside pi-pi.",
      `Generated packages vendor ${GENERATED_SDK_FILE} directly; there is no default unpublished SDK dependency.`,
      "Certified package bootstrap should ensure both the shared fabric and the standard protocol projection.",
      "ctx.delegate is the preferred bound delegation surface for recursive cross-node calls because trace, caller, and budget context stay attached automatically.",
      "Node-local handoff is available natively in the runtime and keeps cross-node result boundaries opaque by default.",
      "Commands and tools are projections over the protocol, not the protocol itself.",
      `Source validation still uses ${VALIDATION_MODE}; runtime claims now come from a separate smoke verification pass.`,
      "The worker may implement its provide deterministically or with an internal agent-backed-ready pattern while keeping the same protocol contract.",
    ],
  };
}

export { planCertifiedNodeFromDescription, planBrownfieldMigration } from "./planning.ts";
export { scaffoldCertifiedNode, scaffoldCollaboratingNodes } from "./scaffolding.ts";
export { chatPiPi, chat_pi_pi } from "./chat.ts";
export { buildCertifiedExtension } from "./build.ts";
export { validateCertifiedNode, validateCertifiedExtension } from "./validation.ts";

