export type BuildStatus = "completed" | "clarification_needed" | "unsupported" | "failed";

export interface BuildPackageInput {
  request: string;
  targetDir?: string;
}

export interface BuildPackageOutput {
  status: BuildStatus;
  summary: string;
  targetDir?: string;
  filesWritten?: string[];
  nextSteps?: string[];
  diagnostics?: string[];
}
