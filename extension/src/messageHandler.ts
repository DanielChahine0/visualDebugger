import { WebviewToExtMessage } from "./types";
import { fetchTtsAudio } from "./ttsClient";

const LOG = "[FlowFixer]";
const TTS_MIME_TYPE = "audio/mpeg";
const TTS_CACHE_TTL_MS = 10 * 60 * 1000;
const TTS_CACHE_MAX_ENTRIES = 50;

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
  const ttsCache = new Map<string, { base64Audio: string; createdAt: number }>();

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
        const voice = message.voice ?? "female";
        const cacheKey = `${voice}::${text}`;

        const cached = ttsCache.get(cacheKey);
        if (cached && Date.now() - cached.createdAt < TTS_CACHE_TTL_MS) {
          target.postMessage({
            type: "playAudio",
            data: { base64Audio: cached.base64Audio, mimeType: TTS_MIME_TYPE },
          });
          return;
        }
        if (cached) {
          ttsCache.delete(cacheKey);
        }

        const elevenLabsKey = await mergedSecrets.get("visualdebugger.elevenLabsKey");
        if (!elevenLabsKey) {
          target.postMessage({
            type: "ttsError",
            data: { message: "ElevenLabs key not set. Check .env file." },
          });
          return;
        }

        try {
          const base64Audio = await fetchTtsAudio(text, elevenLabsKey, voice);
          ttsCache.set(cacheKey, { base64Audio, createdAt: Date.now() });
          if (ttsCache.size > TTS_CACHE_MAX_ENTRIES) {
            const oldestKey = ttsCache.keys().next().value as string | undefined;
            if (oldestKey) {
              ttsCache.delete(oldestKey);
            }
          }

          target.postMessage({
            type: "playAudio",
            data: { base64Audio, mimeType: TTS_MIME_TYPE },
          });
        } catch (err) {
          console.error(`${LOG} TTS request failed:`, err);
          target.postMessage({
            type: "ttsError",
            data: { message: "TTS is temporarily unavailable. Using browser voice fallback." },
          });
        }
        return;
      }
    }
  };
}
