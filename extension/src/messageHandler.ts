import { WebviewToExtMessage } from "./types";
import { fetchTtsAudio } from "./ttsClient";

const LOG = "[FlowFixer]";
const TTS_MIME_TYPE = "audio/mpeg";

export interface MessageTarget {
  postMessage(message: unknown): void;
}

export interface SecretsProvider {
  get(key: string): Promise<string | undefined>;
}

export interface MessageHandlerDeps {
  mergedSecrets: SecretsProvider;
}

/**
 * Creates a webview message handler that routes messages from webview panels.
 * Returns a function that handles incoming messages and dispatches TTS, quiz, etc.
 */
export function createMessageHandler(deps: MessageHandlerDeps) {
  const { mergedSecrets } = deps;

  return async function handleWebviewMessage(
    source: "error" | "diff" | "dashboard",
    target: MessageTarget,
    message: WebviewToExtMessage
  ): Promise<void> {
    switch (message.type) {
      case "ready":
        console.log(`${LOG} ${source} panel ready`);
        return;
      case "diffReviewClosed":
        // Note: holdDiffReview is managed by the phase1Handler via the caller
        console.log(`${LOG} diff review unpinned by user`);
        return;
      case "quizAnswer":
        console.log(`${LOG} quiz answered from ${source} panel: ${message.answer}`);
        return;
      case "requestTts": {
        const text = message.text.trim();
        if (!text) return;

        const elevenLabsKey = await mergedSecrets.get("visualdebugger.elevenLabsKey");
        if (!elevenLabsKey) {
          target.postMessage({
            type: "ttsError",
            data: { message: "ElevenLabs key not set. Using browser voice fallback." },
          });
          return;
        }

        try {
          const base64Audio = await fetchTtsAudio(text, elevenLabsKey);
          target.postMessage({
            type: "playAudio",
            data: { base64Audio, mimeType: TTS_MIME_TYPE },
          });
        } catch (err) {
          console.error(`${LOG} TTS request failed:`, err);
          target.postMessage({
            type: "ttsError",
            data: { message: "TTS request failed. Using browser voice fallback." },
          });
        }
        return;
      }
    }
  };
}
