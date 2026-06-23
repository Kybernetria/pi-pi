import type { JsonSchemaLite } from "@kyvernitria/pi-protocol-minimal";

export type BuildMode = "new" | "adapt" | "repair" | "explain";
export type BuildStatus = "completed" | "clarification_needed" | "unsupported" | "failed";

export interface BuildPackageInput {
  request: string;
  targetDir?: string;
  applyChanges?: boolean;
  mode?: BuildMode;
}

export interface BuildPackageOutput {
  status: BuildStatus;
  summary: string;
  targetDir?: string;
  filesWritten?: string[];
  nextSteps?: string[];
  diagnostics?: string[];
}

export interface GeneratedPackageSpec {
  packageName: string;
  nodeId: string;
  purpose: string;
  provideName: string;
  provideDescription: string;
  handlerName: string;
  slashCommandName?: string;
}

export const genericRequestSchema: JsonSchemaLite = {
  type: "object",
  required: ["request"],
  properties: {
    request: { type: "string" },
  },
};

export const genericResponseSchema: JsonSchemaLite = {
  type: "object",
  required: ["status", "summary"],
  properties: {
    status: { type: "string" },
    summary: { type: "string" },
  },
};
