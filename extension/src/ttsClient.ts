/**
 * ttsClient.ts — ElevenLabs TTS Integration
 * Owner: Engineer 2 (UI/Webview Lead)
 *
 * Provides text-to-speech "read aloud" functionality for bug explanations.
 * Uses ElevenLabs API for natural-sounding speech.
 *
 * USAGE (from panels/ErrorPanel.ts or panels/DiffPanel.ts):
 *   import { speakText, stopSpeaking } from './ttsClient';
 *   await speakText("Your explanation text here");
 *
 * API KEY:
 *   Stored via VS Code context.secrets API (Engineer 1 handles this).
 *   For development, set ELEVENLABS_API_KEY environment variable.
 */

// ElevenLabs voices — "Rachel" is clear and educational-sounding
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const API_BASE = 'https://api.elevenlabs.io/v1';

export interface TTSOptions {
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
}

let currentAudio: HTMLAudioElement | null = null;

/**
 * Speaks the given text using ElevenLabs TTS.
 * Returns a promise that resolves when the audio finishes (or rejects on error).
 */
export async function speakText(
    text: string,
    apiKey: string,
    options: TTSOptions = {}
): Promise<void> {
    // Stop any currently playing audio
    stopSpeaking();

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
            model_id: options.modelId || 'eleven_monolingual_v1',
            voice_settings: {
                stability: options.stability ?? 0.5,
                similarity_boost: options.similarityBoost ?? 0.75,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorBody}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise((resolve, reject) => {
        currentAudio = new Audio(audioUrl);
        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            resolve();
        };
        currentAudio.onerror = (err) => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            reject(new Error('Audio playback failed'));
        };
        currentAudio.play().catch(reject);
    });
}

/**
 * Stops any currently playing TTS audio.
 */
export function stopSpeaking(): void {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

/**
 * Returns true if TTS audio is currently playing.
 */
export function isSpeaking(): boolean {
    return currentAudio !== null && !currentAudio.paused;
}
