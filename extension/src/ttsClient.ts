
// ElevenLabs voice IDs — warm, natural audiobook-style voices
const VOICES: Record<string, string> = {
  female: "XB0fDUnXU5powFXDhCwa", // Charlotte — soft, warm, gentle teacher tone
  male:   "onwK4e9ZLuTAKqWW03F9", // Daniel — calm, patient, warm male teacher
};

const TTS_MODEL_ID = "eleven_turbo_v2_5";
const TTS_OUTPUT_FORMAT = "mp3_22050_32";
const TTS_REQUEST_TIMEOUT_MS = 12000;
const MAX_TTS_RETRIES = 2;

function shouldRetry(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTtsAudio(
  text: string,
  apiKey: string,
  voice: "female" | "male" = "female"
): Promise<string> {
  const voiceId = VOICES[voice] ?? VOICES.female;

  let lastError = "Unknown TTS error";

  for (let attempt = 0; attempt <= MAX_TTS_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${TTS_OUTPUT_FORMAT}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            text,
            model_id: TTS_MODEL_ID,
            voice_settings: {
              stability: 0.58,
              similarity_boost: 0.78,
              style: 0.18,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `ElevenLabs API error: ${response.status} ${errorText}`;

        if (attempt < MAX_TTS_RETRIES && shouldRetry(response.status)) {
          await delay(300 * (attempt + 1));
          continue;
        }

        throw new Error(lastError);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString("base64");
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = isAbort
        ? `ElevenLabs request timed out after ${TTS_REQUEST_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : "Unknown TTS fetch error";

      if (attempt < MAX_TTS_RETRIES) {
        await delay(300 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError);
}
