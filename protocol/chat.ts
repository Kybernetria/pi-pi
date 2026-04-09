import path from "node:path";
import { normalizeWhitespace } from "./planner-policy.ts";
import { classifyCertifiedBuildRepo } from "./builder-support.ts";
import { protocolError } from "./core-shared.ts";
import {
  closeChatPiPiConversation,
  getChatPiPiConversationToken,
  isChatPiPiOrchestrationUnavailable,
  maybeFallbackToDirectHelp,
  orchestrateChatPiPi,
} from "./chat-orchestrator.ts";
import { buildCertifiedExtension, findUnsupportedCertifiedBuilderReasons } from "./build.ts";
import type {
  ChatPiPiInput,
  ChatPiPiOutput,
  ContinuationState,
} from "./contracts.ts";
import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";

const GENERIC_MESSAGE_TOKENS = new Set([
  "a",
  "an",
  "and",
  "build",
  "builder",
  "capability",
  "capabilities",
  "certified",
  "command",
  "commands",
  "create",
  "extension",
  "extensions",
  "for",
  "give",
  "help",
  "local",
  "make",
  "me",
  "node",
  "offer",
  "offers",
  "package",
  "packages",
  "pi",
  "please",
  "project",
  "protocol",
  "provide",
  "provides",
  "should",
  "something",
  "stuff",
  "that",
  "the",
  "thing",
  "to",
  "want",
  "with",
]);

function tokenizeMessage(message: string): string[] {
  return message.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
}

function isTooVagueMessage(message: string): boolean {
  const normalized = normalizeWhitespace(message.toLowerCase());
  if (!normalized) return true;

  const informativeTokens = tokenizeMessage(normalized).filter((token) => !GENERIC_MESSAGE_TOKENS.has(token));
  if (informativeTokens.length === 0) {
    return true;
  }

  return [
    "build me an extension",
    "build an extension",
    "create an extension",
    "make an extension",
    "build me a package",
    "create a package",
    "make a package",
    "build something",
    "create something",
    "make something",
  ].includes(normalized);
}

function toUnsupportedReply(reasons: string[]): string {
  return `That request is outside pi-pi's current certified package scope: ${reasons.join(", ")}. I can help with typed Pi Protocol packages, but not that unsupported Pi runtime/UI behavior.`;
}

function toEmptyMessageClarification(input: ChatPiPiInput): ChatPiPiOutput {
  const questions = ["What should the package do?"];
  if (!input.repoDir?.trim()) {
    questions.push("Where should I build it?");
  }

  return {
    status: "clarification_needed",
    reply: "Tell me what kind of certified Pi package you want me to build.",
    questions,
    missingInformation: ["requested capability"],
    assumptionsOffered: input.repoDir?.trim() ? undefined : ["I can use the current working directory if you want me to."],
    canProceedWithAssumptions: !input.repoDir?.trim(),
  };
}

function toBrownfieldClarification(repoDir: string): ChatPiPiOutput {
  return {
    status: "clarification_needed",
    reply:
      "I found existing repository content in the target path. I can replace it with a certified package, but I need your confirmation first.",
    questions: [`Should I replace the existing repository contents in ${repoDir}?`],
    missingInformation: ["replacement confirmation"],
    canProceedWithAssumptions: false,
  };
}

function toBrownfieldPairClarification(repoDir: string): ChatPiPiOutput {
  return {
    status: "clarification_needed",
    reply:
      "This request points toward a collaborating pair, but brownfield replacement currently supports only a single certified package in-place.",
    questions: [
      `Should I build the pair in a fresh repo instead of replacing ${repoDir}?`,
      "Or should I simplify this to one certified package for the existing repo?",
    ],
    missingInformation: ["brownfield pair strategy"],
    canProceedWithAssumptions: false,
  };
}

function toGenericClarification(message: string): ChatPiPiOutput {
  return {
    status: "clarification_needed",
    reply: message,
    questions: ["Can you clarify the package behavior you want me to build?"],
    missingInformation: ["clarification"],
    canProceedWithAssumptions: false,
  };
}

function looksLikeConcreteBuildRequest(input: ChatPiPiInput, message: string): boolean {
  const lower = message.toLowerCase();
  const hasBuildVerb = /\b(build|create|make|generate|implement|scaffold)\b/.test(lower);
  const asksAboutPiPi = /\b(what can you|what do you do|how do i use you|who are you|help)\b/.test(lower);
  return hasBuildVerb && !asksAboutPiPi && (!!input.repoDir?.trim() || input.applyChanges !== undefined || input.replaceExisting !== undefined);
}

async function runDeterministicChatFallback(input: ChatPiPiInput, message: string): Promise<ChatPiPiOutput> {
  const unsupportedReasons = findUnsupportedCertifiedBuilderReasons(message);
  if (unsupportedReasons.length > 0) {
    return {
      status: "unsupported",
      reply: toUnsupportedReply(unsupportedReasons),
      reasons: unsupportedReasons,
    };
  }

  const repoDir = path.resolve(input.repoDir?.trim() || process.cwd());
  const repoState = await classifyCertifiedBuildRepo(repoDir);
  if (repoState.kind === "brownfield" && input.replaceExisting !== true) {
    return toBrownfieldClarification(repoDir);
  }

  try {
    const build = await buildCertifiedExtension({
      description: message,
      repoDir: input.repoDir,
      applyChanges: input.applyChanges,
      replaceExisting: input.replaceExisting,
    });

    return {
      status: "completed",
      reply: build.summary,
      build,
    };
  } catch (error) {
    const protocolLike = error as { code?: unknown; message?: string; details?: { unsupportedBriefReasons?: string[] } };
    const unsupportedBriefReasons = protocolLike.details?.unsupportedBriefReasons;

    if (Array.isArray(unsupportedBriefReasons) && unsupportedBriefReasons.length > 0) {
      return {
        status: "unsupported",
        reply: toUnsupportedReply(unsupportedBriefReasons),
        reasons: unsupportedBriefReasons,
      };
    }

    if (protocolLike.code === "INVALID_INPUT") {
      const errorMessage = protocolLike.message ?? "I need one clarification before I can continue.";
      if (errorMessage.includes("existing repository content")) {
        return toBrownfieldClarification(repoDir);
      }
      if (errorMessage.includes("fresh repo for pair mode")) {
        return toBrownfieldPairClarification(repoDir);
      }
      return toGenericClarification(errorMessage);
    }

    throw error;
  }
}

function withContinuation(
  output: ChatPiPiOutput,
  input: ChatPiPiInput,
  state: ContinuationState,
): ChatPiPiOutput {
  return {
    ...output,
    continuation: {
      token: getChatPiPiConversationToken(input),
      state,
      owner: {
        nodeId: "pi-pi",
        provide: "chat_pi_pi",
        label: "pi-pi",
      },
    },
  };
}

function inferContinuationState(output: ChatPiPiOutput): ContinuationState {
  const explicitState = output.continuation?.state;
  if (explicitState === "awaiting_user" || explicitState === "awaiting_caller" || explicitState === "closed") {
    return explicitState;
  }

  if (output.status === "clarification_needed") {
    return "awaiting_user";
  }

  if (output.status !== "completed" || output.build || (output.reasons?.length ?? 0) > 0) {
    return "closed";
  }

  if ((output.questions?.length ?? 0) > 0) {
    return "awaiting_user";
  }

  const normalizedReply = normalizeWhitespace(output.reply);
  if (/\?$/.test(normalizedReply)) {
    return "awaiting_user";
  }

  if (/^(?:next,?\s+)?(?:send|tell|describe|give|ask)\b/i.test(normalizedReply)) {
    return "awaiting_user";
  }

  if (/\b(?:just ask|let me know|reply directly|what would you like)\b/i.test(normalizedReply)) {
    return "awaiting_user";
  }

  return "closed";
}

function validateChatPiPiInput(input: ChatPiPiInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw protocolError("INVALID_INPUT", "chat_pi_pi requires an input object");
  }

  if (typeof input.message !== "string") {
    throw protocolError("INVALID_INPUT", "chat_pi_pi requires input.message:string; use message, not text, prompt, query, or content");
  }

  if (input.conversationToken !== undefined && typeof input.conversationToken !== "string") {
    throw protocolError("INVALID_INPUT", "chat_pi_pi requires conversationToken:string when provided");
  }

  if (input.repoDir !== undefined && typeof input.repoDir !== "string") {
    throw protocolError("INVALID_INPUT", "chat_pi_pi requires repoDir:string when provided");
  }

  if (input.applyChanges !== undefined && typeof input.applyChanges !== "boolean") {
    throw protocolError("INVALID_INPUT", "chat_pi_pi requires applyChanges:boolean when provided");
  }

  if (input.replaceExisting !== undefined && typeof input.replaceExisting !== "boolean") {
    throw protocolError("INVALID_INPUT", "chat_pi_pi requires replaceExisting:boolean when provided");
  }
}

export async function chatPiPi(input: ChatPiPiInput, runtimeHints?: unknown): Promise<ChatPiPiOutput> {
  validateChatPiPiInput(input);

  const message = normalizeWhitespace(input.message);
  const normalizedInput: ChatPiPiInput = {
    ...input,
    message,
    conversationToken: input.conversationToken?.trim() || getChatPiPiConversationToken(input),
  };

  let output: ChatPiPiOutput;

  if (!message || isTooVagueMessage(message)) {
    output = toEmptyMessageClarification(normalizedInput);
  } else {
    try {
      const orchestrated = await orchestrateChatPiPi(normalizedInput, runtimeHints);
      output =
        looksLikeConcreteBuildRequest(normalizedInput, message) && orchestrated.status === "completed" && !orchestrated.build
          ? await runDeterministicChatFallback(normalizedInput, message)
          : orchestrated;
    } catch (error) {
      if (!isChatPiPiOrchestrationUnavailable(error)) {
        throw error;
      }

      const fallbackHelp = maybeFallbackToDirectHelp(message);
      output = fallbackHelp ?? (await runDeterministicChatFallback(normalizedInput, message));
    }
  }

  const continuationState = inferContinuationState(output);
  const finalized = withContinuation(output, normalizedInput, continuationState);

  if (continuationState === "closed") {
    await closeChatPiPiConversation(finalized.continuation?.token, runtimeHints);
  }

  return finalized;
}

export function createChatPiPiHandler(runtimeHints?: unknown): ProtocolHandler {
  return async (ctx, input) =>
    ctx.handoff.run(async (handoffCtx) => {
      const chatInput = input as ChatPiPiInput;
      handoffCtx.record("chat_request", {
        hasRepoDir: typeof chatInput?.repoDir === "string" && chatInput.repoDir.trim().length > 0,
        hasConversationToken: typeof chatInput?.conversationToken === "string" && chatInput.conversationToken.trim().length > 0,
        applyChanges: typeof chatInput?.applyChanges === "boolean" ? chatInput.applyChanges : true,
        replaceExisting: typeof chatInput?.replaceExisting === "boolean" ? chatInput.replaceExisting : false,
        hasMessage: typeof chatInput?.message === "string",
        messagePreview:
          typeof chatInput?.message === "string"
            ? normalizeWhitespace(chatInput.message).slice(0, 160)
            : undefined,
      });

      const output = await chatPiPi(chatInput, {
        ...((runtimeHints && typeof runtimeHints === "object") ? runtimeHints as Record<string, unknown> : {}),
        protocolSessionPi: ctx.pi,
        protocolDelegate: ctx.delegate,
        protocolTraceId: ctx.traceId,
        protocolSpanId: ctx.spanId,
        protocolParentSpanId: ctx.parentSpanId,
        protocolDepth: ctx.depth,
      });
      handoffCtx.record("chat_outcome", {
        status: output.status,
        continuationState: output.continuation?.state,
        reasonCount: output.reasons?.length ?? 0,
        questionCount: output.questions?.length ?? 0,
        buildStatus: output.build?.status,
        packageCount: output.build?.packages.length ?? 0,
      });
      return output;
    }, {
      brief: "pi-pi chat-first certified builder",
      opaque: true,
    });
}

export const chat_pi_pi: ProtocolHandler = createChatPiPiHandler();
