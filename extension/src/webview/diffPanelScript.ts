import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: "ready" });

const LANG_MAP: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  javascriptreact: "jsx",
  typescriptreact: "tsx",
};

function highlightLine(code: string, lang: string): string {
  const grammar = Prism.languages[LANG_MAP[lang] ?? "javascript"];
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, LANG_MAP[lang] ?? "javascript");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderDiff(unified: string, lang: string): string {
  return unified
    .split("\n")
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) {
        return `<span class="diff-meta">${escapeHtml(line)}</span>`;
      }
      if (line.startsWith("@@")) {
        return `<span class="diff-hunk">${escapeHtml(line)}</span>`;
      }

      let prefix = "";
      let cls = "";
      let code = line;

      if (line.startsWith("+")) {
        prefix = "+";
        cls = "diff-add";
        code = line.slice(1);
      } else if (line.startsWith("-")) {
        prefix = "-";
        cls = "diff-del";
        code = line.slice(1);
      }

      const highlighted = highlightLine(code, lang);
      return `<span class="${cls}">${escapeHtml(prefix)}${highlighted}</span>`;
    })
    .join("\n");
}

// --- TTS State ---
let ttsAudio: HTMLAudioElement | null = null;
let ttsSpeech: SpeechSynthesisUtterance | null = null;
const ttsBtn = document.getElementById("tts-btn")!;

function stopTts(): void {
  if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
  if (ttsSpeech) { speechSynthesis.cancel(); ttsSpeech = null; }
  ttsBtn.textContent = "Read Aloud";
}

function getDiffExplanationText(): string {
  const parts = [
    document.getElementById("what-changed")?.textContent,
    document.getElementById("why-it-fixes")?.textContent,
    document.getElementById("key-takeaway")?.textContent,
  ];
  return parts.filter(Boolean).join(". ");
}

ttsBtn.addEventListener("click", () => {
  if (ttsBtn.textContent === "Stop") {
    stopTts();
    return;
  }
  const text = getDiffExplanationText();
  if (!text) return;
  ttsBtn.textContent = "Stop";
  vscode.postMessage({ type: "requestTts", text });
});

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type === "showDiff") {
    stopTts();
    document.getElementById("empty-state")!.style.display = "none";
    document.getElementById("diff-content")!.style.display = "block";
    const d = msg.data;

    const lang = d.diff?.language ?? "javascript";
    document.getElementById("diff-view")!.innerHTML = renderDiff(
      d.diff.unifiedDiff,
      lang
    );

    document.getElementById("what-changed")!.textContent = d.whatChanged;
    document.getElementById("why-it-fixes")!.textContent = d.whyItFixes;
    document.getElementById("key-takeaway")!.textContent = d.keyTakeaway;
  } else if (msg.type === "playAudio") {
    ttsAudio = new Audio("data:audio/mpeg;base64," + msg.data.audio);
    ttsAudio.play();
    ttsAudio.addEventListener("ended", () => stopTts());
    ttsAudio.addEventListener("error", () => {
      stopTts();
      const text = getDiffExplanationText();
      if (text) {
        ttsSpeech = new SpeechSynthesisUtterance(text);
        ttsSpeech.onend = () => stopTts();
        speechSynthesis.speak(ttsSpeech);
        ttsBtn.textContent = "Stop";
      }
    });
  } else if (msg.type === "ttsError") {
    const text = getDiffExplanationText();
    if (text) {
      ttsSpeech = new SpeechSynthesisUtterance(text);
      ttsSpeech.onend = () => stopTts();
      speechSynthesis.speak(ttsSpeech);
      ttsBtn.textContent = "Stop";
    } else {
      stopTts();
    }
  } else if (msg.type === "clear") {
    stopTts();
    document.getElementById("empty-state")!.style.display = "block";
    document.getElementById("diff-content")!.style.display = "none";
  }
});
