import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT, RUNTIME_SMOKE_RUNNER_PATH } from "./constants.ts";
import { exists, protocolError } from "./core-shared.ts";

export interface RuntimeVerificationSummaryLike {
  packageCount: number;
  registeredNodeIds: string[];
  invokedProvides: string[];
}

export interface CertifiedBuildRepoState {
  kind: "greenfield" | "brownfield";
  entries: string[];
}

export async function classifyCertifiedBuildRepo(repoDir: string): Promise<CertifiedBuildRepoState> {
  if (!(await exists(repoDir))) {
    return { kind: "greenfield", entries: [] };
  }

  const harmlessRootEntries = new Set([
    ".gitignore",
    ".npmignore",
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "README",
    "README.md",
    "CHANGELOG.md",
  ]);

  const entries = await fs.readdir(repoDir, { withFileTypes: true }).catch(() => []);
  const visibleEntries = entries.filter((entry) => entry.name !== ".git");
  const brownfieldSignals = visibleEntries.filter((entry) => {
    if (entry.isDirectory()) {
      return ![".github"].includes(entry.name);
    }

    return !harmlessRootEntries.has(entry.name);
  });

  return {
    kind: brownfieldSignals.length > 0 ? "brownfield" : "greenfield",
    entries: visibleEntries.map((entry) => entry.name),
  };
}

export function ensureCertifiedPackageName(value: string): string {
  const safe = sanitizeCertifiedName(value);
  return safe.startsWith("pi-") ? safe : `pi-${safe}`;
}

export function ensureCertifiedNodeId(value: string): string {
  return ensureCertifiedPackageName(value);
}

export async function writeGeneratedFiles(rootDir: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }
}

export async function runRuntimeSmokeVerification(
  packageDirs: string[],
  stageLabel: "staging" | "target",
): Promise<RuntimeVerificationSummaryLike> {
  const payload = JSON.stringify({ packageDirs });

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNTIME_SMOKE_RUNNER_PATH, payload], {
      cwd: PACKAGE_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(
        protocolError("EXECUTION_FAILED", `runtime verification process failed to start for ${stageLabel}`, {
          stage: `${stageLabel}_install`,
          cause: error.message,
        }),
      );
    });

    child.on("close", () => {
      try {
        const result = stdout
          ? (JSON.parse(stdout) as {
              ok?: boolean;
              result?: RuntimeVerificationSummaryLike;
              stage?: string;
              message?: string;
              details?: unknown;
            })
          : null;
        if (!result?.ok || !result.result) {
          reject(
            protocolError(
              "EXECUTION_FAILED",
              `runtime verification failed for ${stageLabel}: ${result?.message ?? stderr ?? "unknown failure"}`,
              {
                stage: result?.stage ?? `${stageLabel}_runtime`,
                details: result?.details,
                stderr: stderr || undefined,
              },
            ),
          );
          return;
        }
        resolve(result.result);
      } catch (error) {
        reject(
          protocolError("EXECUTION_FAILED", `runtime verification returned invalid output for ${stageLabel}`, {
            stage: `${stageLabel}_runtime`,
            stdout,
            stderr: stderr || undefined,
            cause: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
  });
}

export async function clearDirectoryPreservingGit(rootDir: string): Promise<void> {
  await fs.mkdir(rootDir, { recursive: true });
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git") continue;
    await fs.rm(path.join(rootDir, entry.name), { recursive: true, force: true });
  }
}

function sanitizeCertifiedName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safe = normalized || "certified-extension";
  return /^[a-z]/.test(safe) ? safe : `pi-${safe}`;
}
