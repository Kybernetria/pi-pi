import type { BuildPackageInput, BuildPackageOutput } from "./schemas.ts";

/**
 * Optional future adapter boundary for Pi SDK AgentSession-backed generation.
 *
 * This package is intentionally conservative: unless a host injects a trusted
 * agent executor here, deterministic code must not claim success for arbitrary
 * package requests. That preserves the honesty rule while keeping the public
 * provide handler-backed.
 */
export async function tryAgentBackedBuild(_input: BuildPackageInput): Promise<BuildPackageOutput | undefined> {
  return undefined;
}
