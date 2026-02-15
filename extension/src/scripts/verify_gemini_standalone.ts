
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

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

    // Remove quotes
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }

    env.set(key, value);
  }
  return env;
}

async function main() {
  console.log("🚀 Starting Standalone Gemini Verification...");

  // Try to find .env in a few places
  const possiblePaths = [
    path.resolve(__dirname, "../../.env"), // extension/.env
    path.resolve(__dirname, "../../../.env"), // workspace/.env
    path.resolve(process.cwd(), ".env")
  ];

  let apiKey: string | undefined;

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`📄 Found .env at: ${p}`);
      const env = loadEnvManual(p);
      const key = env.get("GEMINI_API_KEY");
      if (key) {
        apiKey = key;
        console.log("🔑 Found GEMINI_API_KEY in this file.");
        break;
      }
    }
  }

  if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY not found in any .env file.");
    process.exit(1);
  }

  console.log(`✅ Using API Key (length: ${apiKey.length})`);

  try {
    const genai = new GoogleGenAI({ apiKey });
    const model = "gemini-2.0-flash";
    
    console.log(`📡 Connecting to model: ${model}...`);
    
    const response = await genai.models.generateContent({
      model: model,
      contents: {
          parts: [{ text: "Reply with 'Connection Successful!' if you receive this." }]
      }
    });

    const text = response.text;
    console.log(`\n🎉 Gemini Response: ${text}`);
    console.log("\n✅ API Connection Verified Successfully!");
    
  } catch (error: any) {
    console.error("\n❌ Connection Failed:", error.message);
    if (error.cause) {
        console.error("Cause details:", JSON.stringify(error.cause, null, 2));
    }
    process.exit(1);
  }
}

main();
