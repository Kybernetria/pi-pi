import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROTOCOL_VERSION = "0.1.0";
export const GENERATED_SDK_DISTRIBUTION = "vendored-shim";
export const GENERATED_SDK_FILE = "vendor/pi-protocol-sdk.ts";
export const PI_CODING_AGENT_VERSION = "^0.65.2";
export const NODE_TYPES_VERSION = "^24.5.2";
export const TYPESCRIPT_VERSION = "^5.9.3";
export const VALIDATION_MODE = "ast-assisted-source";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const INTERNAL_INSTRUCTIONS_DIR = path.join(PACKAGE_ROOT, "protocol", "instructions");
export const VENDORED_SDK_SOURCE_PATH = path.join(PACKAGE_ROOT, GENERATED_SDK_FILE);
export const RUNTIME_SMOKE_RUNNER_PATH = path.join(PACKAGE_ROOT, "protocol", "runtime-smoke-runner.mjs");
