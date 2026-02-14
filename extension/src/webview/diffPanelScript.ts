import { html as diff2htmlHtml } from "diff2html";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: "ready" });

let activeData:
  | { whatChanged: string; whyItFixes: string; keyTakeaway: string }
  | undefined;

let currentAudio: HTMLAudioElement | undefined;

function stopAudio(): void {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio = undefined;
}

function getReadableText(): string {
  if (!activeData) return "";
  return `${activeData.whatChanged}. ${activeData.whyItFixes}. Key takeaway: ${activeData.keyTakeaway}`;
}

function setStatus(message: string): void {
  const status = document.getElementById("status-live");
  if (status) {
    status.textContent = message;
  }
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type === "showDiff") {
    stopAudio();
    document.getElementById("empty-state")!.style.display = "none";
    document.getElementById("diff-content")!.style.display = "block";
    const d = msg.data;
    activeData = {
      whatChanged: d.whatChanged,
      whyItFixes: d.whyItFixes,
      keyTakeaway: d.keyTakeaway,
    };

    const diffOutput = diff2htmlHtml(d.diff.unifiedDiff, {
      drawFileList: false,
      matching: "lines",
      outputFormat: "side-by-side",
      renderNothingWhenEmpty: false,
    });
    document.getElementById("diff-view")!.innerHTML = diffOutput;
    document.getElementById("what-changed")!.textContent = d.whatChanged;
    document.getElementById("why-it-fixes")!.textContent = d.whyItFixes;
    document.getElementById("key-takeaway")!.textContent = d.keyTakeaway;
    setStatus("Diff explanation updated.");
  } else if (msg.type === "playAudio") {
    stopAudio();
    const audio = new Audio(`data:${msg.data.mimeType};base64,${msg.data.base64Audio}`);
    currentAudio = audio;
    audio.onended = () => {
      currentAudio = undefined;
      setStatus("Audio playback finished.");
    };
    void audio.play().then(
      () => setStatus("Playing TTS audio."),
      () => {
        currentAudio = undefined;
        setStatus("Audio playback failed.");
      }
    );
  } else if (msg.type === "ttsError") {
    setStatus(msg.data.message);
    const text = getReadableText();
    if ("speechSynthesis" in window && text) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  } else if (msg.type === "clear") {
    stopAudio();
    document.getElementById("empty-state")!.style.display = "block";
    document.getElementById("diff-content")!.style.display = "none";
  }
});

const ttsBtn = document.getElementById("read-aloud-btn");
ttsBtn?.addEventListener("click", () => {
  const text = getReadableText();
  if (!text) {
    setStatus("No explanation available yet.");
    return;
  }
  vscode.postMessage({ type: "requestTts", text });
});
