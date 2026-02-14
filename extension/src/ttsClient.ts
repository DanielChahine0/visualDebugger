/**
 * ttsClient.ts — ElevenLabs TTS Integration (Node.js / Extension Host)
 *
 * Fetches TTS audio from ElevenLabs and returns base64-encoded audio data.
 * Runs in the extension host (Node.js), NOT in the webview.
 *
 * Flow:
 *   1. Webview sends `requestTts` message to extension host
 *   2. Extension host calls fetchTtsAudio() (this module)
 *   3. Extension host sends base64 audio back to webview via `playAudio` message
 *   4. Webview plays audio using the browser Audio API
 *
 * API KEY:
 *   Stored via VS Code context.secrets API under 'flowfixer.elevenLabsKey'.
 *   Set via the "FlowFixer: Set ElevenLabs Key" command.
 */

// ElevenLabs voices — natural, clear, educational-sounding
const VOICES = {
    female: '21m00Tcm4TlvDq8ikWAM', // Rachel
    male: 'TxGEqnHWrfWFTfGW9XjX',   // Josh
};
const DEFAULT_VOICE_ID = VOICES.female;
const API_BASE = 'https://api.elevenlabs.io/v1';

export interface TTSOptions {
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
}

/**
 * Fetches TTS audio from ElevenLabs and returns base64-encoded audio data.
 * Runs in the extension host (Node.js).
 */
export async function fetchTtsAudio(
    text: string,
    apiKey: string,
    options: TTSOptions = {}
): Promise<string> {
    const voiceId = options.voiceId || DEFAULT_VOICE_ID;
    const url = `${API_BASE}/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
        },
        body: JSON.stringify({
            text,
            model_id: options.modelId || 'eleven_multilingual_v2',
            voice_settings: {
                stability: options.stability ?? 0.65,
                similarity_boost: options.similarityBoost ?? 0.80,
                style: 0.35,
                use_speaker_boost: true,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorBody}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
}
