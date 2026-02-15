
import * as fs from "fs";
import * as path from "path";
import { fetchTtsAudio } from "../ttsClient";

// Function to manually parse .env without external dependencies or vscode module
function loadEnvManual(filePath: string): Map<string, string> {
  const env = new Map<string, string>();
  if (!fs.existsSync(filePath)) return env;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip quotes
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);

    if (key && value) env.set(key, value);
  }
  return env;
}

async function verifyTts() {
  console.log("🔍 Verifying ElevenLabs TTS Integration...");
  
  // 1. Load keys manually
  const envPath = path.resolve(__dirname, "../../.env");
  const env = loadEnvManual(envPath);
  const apiKey = env.get("ELEVENLABS_API_KEY");

  if (!apiKey) {
    console.error("❌ No ELEVENLABS_API_KEY found in extension/.env");
    process.exit(1);
  }
  console.log("✅ Found API Key");

  // 2. Test both voices
  const voices = ["female", "male"] as const;
  
  for (const voice of voices) {
    console.log(`\n🎙️ Testing '${voice}' voice...`);
    try {
      const text = `This is a test of the ${voice} voice for Visual Debugger. It should sound warm, natural, and like an audiobook narrator.`;
      const base64Audio = await fetchTtsAudio(text, apiKey, voice);
      
      const buffer = Buffer.from(base64Audio, "base64");
      const outputPath = path.resolve(__dirname, `test_output_${voice}.mp3`);
      fs.writeFileSync(outputPath, buffer);
      
      console.log(`✅ Success! Audio saved to: ${outputPath}`);
      console.log(`   (File size: ${(buffer.length / 1024).toFixed(2)} KB)`);
    } catch (error) {
      console.error(`❌ Failed to generate audio for ${voice}:`, error);
    }
  }

  console.log("\n✨ Verification Complete. You can play the .mp3 files to check the voice quality.");
}

verifyTts();
