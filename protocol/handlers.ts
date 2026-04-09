import { createChatPiPiHandler, chat_pi_pi } from "./chat.ts";

export { chat_pi_pi };

export function createProtocolHandlers(runtimeHints?: unknown) {
  return {
    chat_pi_pi: createChatPiPiHandler(runtimeHints),
  };
}
