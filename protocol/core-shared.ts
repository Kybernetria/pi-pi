import { promises as fs } from "node:fs";
import path from "node:path";
import { GENERATED_SDK_FILE } from "./constants.ts";

export function describeGeneratedFile(filePath: string): string {
  if (filePath === "package.json") return "Native Pi package metadata";
  if (filePath === "pi.protocol.json") return "Canonical Pi Protocol manifest";
  if (filePath === "extensions/index.ts") return "Runtime bootstrap that joins the shared protocol fabric and ensures the standard protocol projection";
  if (filePath === GENERATED_SDK_FILE) return "Vendored protocol SDK shim copied from pi-pi";
  if (filePath === "protocol/handlers.ts") return "Local TypeScript handler implementations";
  if (filePath.startsWith("protocol/schemas/")) return "JSON schema for a public provide";
  if (filePath.startsWith("protocol/prompts/")) return "Internal non-discoverable prompt for an agent-backed worker provide";
  if (filePath === "README.md") return "Starter package documentation";
  if (filePath === "tsconfig.json") return "TypeScript configuration for JSON imports and TS entrypoints";
  return "Generated file";
}

export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function commandBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function protocolError(code: string, message: string, details?: unknown) {
  const error = new Error(message) as Error & { code?: string; details?: unknown };
  error.code = code;
  error.details = details;
  return error;
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  if (!(await exists(filePath))) return null;
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

export async function collectSourceFiles(packageDir: string): Promise<string[]> {
  const results: string[] = [];
  await walk(packageDir, results);
  return results.filter((filePath) => /\.(ts|js|mjs|cjs)$/.test(filePath));
}

export async function walk(currentDir: string, results: string[]): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
