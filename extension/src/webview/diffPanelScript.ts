declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: "ready" });

interface DiffData {
  quickSummary?: string;
  whyItWorks?: string;
  whatToDoNext?: string[];
  keyTakeaway?: string;
  checkQuestion?: string;
  fileName?: string;
  diff?: { file?: string };
}

let activeData: DiffData | undefined;
let currentAudio: HTMLAudioElement | undefined;
let isSpeaking = false;
let selectedVoice: "female" | "male" = "female";

// ── Helpers ──

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function announce(msg: string): void {
  const el = $("status-live");
  if (el) el.textContent = msg;
}

function showSection(id: string, hasData: boolean): void {
  const el = $(id);
  if (el) el.style.display = hasData ? "" : "none";
}

function updateTtsStatus(text: string): void {
  const el = $("tts-status");
  if (el) el.textContent = text;
}

function stripHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getReadableText(): string {
  if (!activeData) return "";
  const parts: string[] = [];
  if (activeData.quickSummary) parts.push(activeData.quickSummary);
  if (activeData.whyItWorks) parts.push(activeData.whyItWorks);
  if (activeData.keyTakeaway) parts.push("Key takeaway: " + activeData.keyTakeaway);
  return stripHtml(parts.join(". "));
}

function stopAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = undefined;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  updateTtsStatus("");
}

function speakWithWebSpeech(text: string): void {
  if (!("speechSynthesis" in window) || !text) {
    announce("Text-to-speech is not available.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;      // slightly slower — calm, unhurried audiobook pace
  utterance.pitch = 1.0;     // natural pitch, no distortion
  utterance.volume = 0.85;   // slightly softer — gentle, not blaring
  isSpeaking = true;
  const btn = $("tts-btn");
  if (btn) {
    btn.textContent = "⏹️ Stop";
    btn.classList.add("ff-btn--playing");
  }
  utterance.onend = () => {
    isSpeaking = false;
    if (btn) {
      btn.textContent = "🔊 Read Aloud";
      btn.classList.remove("ff-btn--playing");
    }
    updateTtsStatus("");
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// ── Checklist logic ──

function onChecklistChange(): void {
  const boxes = document.querySelectorAll<HTMLInputElement>(".ff-checkbox");
  const allChecked = Array.from(boxes).every((cb) => cb.checked);
  const doneEl = $("check-done");
  if (doneEl) doneEl.style.display = allChecked ? "" : "none";
  if (allChecked) announce("All steps complete. Nice work!");
}

// ── Update panel ──

function updatePanel(data: DiffData): void {
  activeData = data;

  // File bar
  const fileName = data.fileName || (data.diff && data.diff.file) || "";
  if (fileName) {
    $("diff-file")!.textContent = fileName;
    $("file-bar")!.style.display = "";
  } else {
    $("file-bar")!.style.display = "none";
  }

  // 1. Quick Summary
  const hasSummary = !!data.quickSummary;
  showSection("section-summary", hasSummary);
  if (hasSummary) $("quick-summary")!.textContent = data.quickSummary!;

  // 2. Why It Works
  const hasWhy = !!data.whyItWorks;
  showSection("section-why", hasWhy);
  if (hasWhy) $("why-it-works")!.textContent = data.whyItWorks!;

  // 3. What To Do Next (interactive checklist)
  const hasTodo = Array.isArray(data.whatToDoNext) && data.whatToDoNext.length > 0;
  showSection("section-todo", hasTodo);
  const todoList = $("what-to-do-next")!;
  todoList.innerHTML = "";
  $("check-done")!.style.display = "none";
  if (hasTodo) {
    data.whatToDoNext!.forEach((step, i) => {
      const li = document.createElement("li");
      li.className = "ff-check-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `todo-${i}`;
      cb.className = "ff-checkbox";
      cb.setAttribute("aria-label", step);
      cb.addEventListener("change", onChecklistChange);

      const label = document.createElement("label");
      label.htmlFor = `todo-${i}`;
      label.className = "ff-check-label";
      label.textContent = step;

      li.appendChild(cb);
      li.appendChild(label);
      todoList.appendChild(li);
    });
  }

  // 4. Key Takeaway
  const hasTakeaway = !!data.keyTakeaway;
  showSection("section-takeaway", hasTakeaway);
  if (hasTakeaway) $("key-takeaway")!.textContent = data.keyTakeaway!;

  // 5. Check Question
  const hasQuestion = !!data.checkQuestion;
  showSection("section-question", hasQuestion);
  if (hasQuestion) $("check-question")!.textContent = data.checkQuestion!;

  // Show content, hide empty state
  $("empty-state")!.style.display = "none";
  $("diff-content")!.style.display = "";
  $("tts-controls")!.style.display = "";

  announce("Fix explanation updated.");
}

// ── Listener initialization guard ──

let _diffPanelInitialized = false;

function initDiffPanelListeners(): void {
  if (_diffPanelInitialized) return;
  _diffPanelInitialized = true;

  // ── Message handler ──

  window.addEventListener("message", (event) => {
    const msg = event.data;

    if (msg.type === "showDiff") {
      stopAudio();
      updatePanel(msg.data);
    } else if (msg.type === "playAudio") {
      stopAudio();
      // Convert base64 to blob URL (CSP blocks data: URIs for media)
      const raw = atob(msg.data.base64Audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: msg.data.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      currentAudio = audio;
      isSpeaking = true;
      updateTtsStatus("Playing...");
      const btn = $("tts-btn");
      if (btn) {
        btn.textContent = "⏹️ Stop";
        btn.classList.add("ff-btn--playing");
      }
      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        currentAudio = undefined;
        isSpeaking = false;
        if (btn) {
          btn.textContent = "🔊 Read Aloud";
          btn.classList.remove("ff-btn--playing");
        }
        updateTtsStatus("");
        announce("Audio finished.");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        currentAudio = undefined;
        isSpeaking = false;
        if (btn) {
          btn.textContent = "🔊 Read Aloud";
          btn.classList.remove("ff-btn--playing");
        }
        updateTtsStatus("Playback failed");
        announce("Audio playback failed.");
      };
      void audio.play().catch(() => {
        URL.revokeObjectURL(blobUrl);
        currentAudio = undefined;
        isSpeaking = false;
        if (btn) btn.textContent = "🔊 Read Aloud";
        updateTtsStatus("Could not play");
        announce("Could not play audio.");
      });
    } else if (msg.type === "ttsError") {
      announce(msg.data.message);
      updateTtsStatus("Using browser voice...");
      speakWithWebSpeech(getReadableText());
    } else if (msg.type === "clear") {
      stopAudio();
      updateTtsStatus("");
      $("empty-state")!.style.display = "";
      $("diff-content")!.style.display = "none";
    }
  });

  // ── Voice toggle ──

  $("voice-female")?.addEventListener("click", () => {
    selectedVoice = "female";
    $("voice-female")!.classList.add("active");
    $("voice-female")!.setAttribute("aria-checked", "true");
    $("voice-male")!.classList.remove("active");
    $("voice-male")!.setAttribute("aria-checked", "false");
  });

  $("voice-male")?.addEventListener("click", () => {
    selectedVoice = "male";
    $("voice-male")!.classList.add("active");
    $("voice-male")!.setAttribute("aria-checked", "true");
    $("voice-female")!.classList.remove("active");
    $("voice-female")!.setAttribute("aria-checked", "false");
  });

  // ── TTS button ──

  const ttsBtn = $("tts-btn");
  ttsBtn?.addEventListener("click", () => {
    if (isSpeaking) {
      stopAudio();
      ttsBtn.textContent = "🔊 Read Aloud";
      ttsBtn.classList.remove("ff-btn--playing");
      return;
    }
    const text = getReadableText();
    if (!text) {
      announce("No explanation to read yet.");
      return;
    }
    vscode.postMessage({ type: "requestTts", text, voice: selectedVoice });
    ttsBtn.textContent = "⏳ Loading...";
    updateTtsStatus("Loading audio...");
  });

  // ── Disclosure hint toggles ──

  document.querySelectorAll<HTMLDetailsElement>(".ff-disclosure").forEach((details) => {
    const hint = details.querySelector(".ff-disclosure-hint");
    if (!hint) return;
    const showText = hint.textContent || "Show details";
    const hideText = showText.replace("Show", "Hide");
    details.addEventListener("toggle", () => {
      hint.textContent = details.open ? hideText : showText;
    });
  });
}

initDiffPanelListeners();
