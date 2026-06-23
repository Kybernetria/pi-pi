export type RequestFamily =
  | "markdown_summarizer"
  | "terminal_notification"
  | "project_review_agent"
  | "simple_handler"
  | "unknown";

export interface RequestAnalysis {
  family: RequestFamily;
  packageName: string;
  nodeId: string;
  provideName: string;
  reason: string;
}

export function analyzeRequest(request: string): RequestAnalysis {
  const lower = request.toLowerCase();
  const explicitPackage = lower.match(/(?:package\s+(?:named|called)|extension\s+(?:named|called)|named|called)\s+([a-z][a-z0-9-]+)/)?.[1];

  if (/markdown|\.md|md files?/.test(lower) && /summari[sz]/.test(lower)) {
    return analysis("markdown_summarizer", explicitPackage ?? "pi-markdown-summarizer", "summarize_markdown", "markdown summarization request");
  }

  if (/lightning|flash|terminal|notify|notification/.test(lower) && /(agent|request|complete|end|done|flash)/.test(lower)) {
    return analysis("terminal_notification", explicitPackage ?? "pi-terminal-notifier", "flash", "terminal/Pi hook notification request");
  }

  if (/project|task/.test(lower) && /review/.test(lower)) {
    return analysis("project_review_agent", explicitPackage ?? "pi-project-review", "review_task", "project review agent request");
  }

  if (/handler-backed|handler backed|simple handler|protocol package/.test(lower) && /provide/.test(lower)) {
    const provide = lower.match(/provide(?: named| called)?\s+([a-z][a-z0-9_]*)/)?.[1] ?? "run";
    return analysis("simple_handler", explicitPackage ?? "pi-handler-package", provide, "explicit simple handler-backed package request");
  }

  return analysis("unknown", explicitPackage ?? "pi-protocol-package", "run", "no deterministic package family matched");
}

function analysis(family: RequestFamily, packageName: string, provideName: string, reason: string): RequestAnalysis {
  const normalizedPackage = packageName.startsWith("pi-") ? packageName : `pi-${packageName}`;
  const nodeId = normalizedPackage.replace(/^pi-/, "pi_").replaceAll("-", "_");
  return { family, packageName: normalizedPackage, nodeId, provideName, reason };
}
