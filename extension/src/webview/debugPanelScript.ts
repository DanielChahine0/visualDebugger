declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

// ── VS Code API ──
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: "ready" });

// ── Interfaces ──

interface ErrorRaw {
  file?: string;
  line?: number;
  message?: string;
}

interface QuizData {
  question: string;
  options: string[];
  correct: number | "A" | "B" | "C" | "D";
  explanation: string;
}

interface ErrorData {
  category: string;
  location?: string;
  errorMessage?: string;
  raw?: ErrorRaw;
  tldr?: string;
  explanation?: string;
  howToFix?: string | string[];
  howToPrevent?: string;
  bestPractices?: string;
  suggestedPrompt?: string;
  quiz?: QuizData;
}

interface DiffData {
  fileName?: string;
  diff?: { file?: string };
  quickSummary?: string;
  whyItWorks?: string;
  whatToDoNext?: string[];
  keyTakeaway?: string;
  checkQuestion?: string;
}

interface ActionsData {
  count: number;
  fileName?: string;
  firstError?: { message: string } | null;
}

interface PlayAudioData {
  mimeType: string;
  base64Audio: string;
}

interface TtsErrorData {
  message: string;
}

type ViewState = "actions" | "error" | "diff";

// ── State ──
let quizAnswered = false;
let currentErrorData: ErrorData | null = null;
let currentDiffData: DiffData | null = null;
let ttsAudio: HTMLAudioElement | null = null;
let isSpeaking = false;
let selectedVoice: "female" | "male" = "female";
let activeView: ViewState = "actions";

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

function quizCorrectIndex(val: number | string): number {
  if (typeof val === "number") return val;
  const map: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  return map[val] != null ? map[val] : 0;
}

// ── Reduced motion check ──
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Typewriter effect ──
function typeWriter(element: HTMLElement, text: string, speed: number, callback?: () => void): void {
  if (prefersReducedMotion) {
    element.innerHTML = text;
    element.classList.remove("ff-typing");
    if (callback) callback();
    return;
  }
  element.innerHTML = "";
  element.classList.add("ff-typing");
  let i = 0;
  let inTag = false;
  let tagBuffer = "";

  function tick(): void {
    if (i >= text.length) {
      element.classList.remove("ff-typing");
      if (callback) callback();
      return;
    }
    const ch = text[i];
    if (ch === "<") {
      inTag = true;
      tagBuffer = "<";
      i++;
      tick();
      return;
    }
    if (inTag) {
      tagBuffer += ch;
      if (ch === ">") {
        inTag = false;
        element.innerHTML += tagBuffer;
        tagBuffer = "";
      }
      i++;
      tick();
      return;
    }
    element.innerHTML += ch;
    i++;
    setTimeout(tick, speed);
  }
  tick();
}

// ── Confetti ──
function launchConfetti(): void {
  if (prefersReducedMotion) return;
  const container = document.createElement("div");
  container.className = "ff-confetti-container";
  document.body.appendChild(container);
  const colors = ["#eebb00", "#3794ff", "#f14c4c", "#89d185", "#06b6d4", "#c084fc"];
  for (let c = 0; c < 30; c++) {
    const piece = document.createElement("div");
    piece.className = "ff-confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.backgroundColor = colors[c % colors.length];
    piece.style.animationDelay = Math.random() * 0.5 + "s";
    piece.style.animationDuration = 1 + Math.random() * 1 + "s";
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    piece.style.width = 5 + Math.random() * 6 + "px";
    piece.style.height = 5 + Math.random() * 6 + "px";
    container.appendChild(piece);
  }
  setTimeout(function () {
    container.remove();
  }, 2500);
}

// ── Toast ──
function showToast(message: string, type?: string): void {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "ff-toast" + (type ? " ff-toast--" + type : "");
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function () {
    toast.classList.add("ff-toast--out");
    setTimeout(function () {
      toast.remove();
    }, 300);
  }, 3000);
}

function cleanTextForTTS(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Panel visibility (smooth transitions) ──
function showPanelSection(name: ViewState): void {
  activeView = name;
  const ids = ["section-actions", "section-error-explanation", "section-diff-review", "section-tts"];
  const map: Record<ViewState, string> = {
    actions: "section-actions",
    error: "section-error-explanation",
    diff: "section-diff-review",
  };

  // Slide out current panels
  ids.forEach(function (id) {
    const el = $(id);
    if (!el) return;
    if (el.classList.contains("visible")) {
      el.classList.add("slide-out-left");
      el.classList.remove("visible");
    }
  });

  // After brief delay, show new panels
  setTimeout(function () {
    ids.forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.classList.remove("slide-out-left");
    });
    const showActions = name === "actions";
    const showError = name === "error";
    const showDiff = name === "diff";
    const showTts = showError || showDiff;

    if (showActions) $("section-actions")?.classList.add("visible");
    if (showError) $("section-error-explanation")?.classList.add("visible");
    if (showDiff) $("section-diff-review")?.classList.add("visible");
    if (showTts) $("section-tts")?.classList.add("visible");
  }, 50);
}

// ── Disclosure hint toggle ──
document.querySelectorAll<HTMLDetailsElement>(".ff-disclosure").forEach(function (details) {
  details.addEventListener("toggle", function () {
    const hint = details.querySelector(".ff-disclosure-hint");
    if (!hint) return;
    const isPrevent = details.closest("#error-section-prevent");
    const isQuestion = details.closest("#diff-section-question");
    const showText = isPrevent ? "Show tip" : isQuestion ? "Show question" : "Show details";
    const hideText = isPrevent ? "Hide tip" : isQuestion ? "Hide question" : "Hide details";
    hint.textContent = details.open ? hideText : showText;
  });
});

// ── Actions: update errors state ──
function updateActionsState(data: ActionsData): void {
  if (data.count > 0 && data.firstError) {
    $("errors-state")!.style.display = "";
    $("empty-state")!.style.display = "none";

    const badge = $("error-count")!;
    const prevCount = badge.getAttribute("data-prev");
    badge.textContent = String(data.count);
    // Pulse if count changed
    if (prevCount !== null && prevCount !== String(data.count)) {
      badge.classList.remove("ff-pulse");
      void (badge as HTMLElement).offsetWidth; // reflow to restart animation
      badge.classList.add("ff-pulse");
    }
    badge.setAttribute("data-prev", String(data.count));
    const fileName = data.fileName || "this file";
    const label =
      data.count === 1 ? "1 error in " + fileName : data.count + " errors in " + fileName;
    $("error-file-label")!.textContent = label;
    $("error-preview")!.textContent = data.firstError.message;

    // Keep current context when user is reading an error explanation.
    // But if we're on the diff view ("No more errors") and new errors
    // appear, switch back to actions so the user sees them.
    if (activeView !== "error") {
      showPanelSection("actions");
    }
    announce(label);
  } else {
    $("errors-state")!.style.display = "none";
    $("empty-state")!.style.display = "";
    // Don't switch away from error/diff views when errors clear.
    // The diff engine's 500ms debounce hasn't fired yet, so switching
    // to actions now would cause a flicker. Let the back button handle navigation.
    if (activeView !== "error" && activeView !== "diff") {
      showPanelSection("actions");
    }
    announce("No errors found.");
  }
}

// ── Error Explanation: populate and show ──
function updateErrorPanel(data: ErrorData): void {
  // Hide skeleton when data arrives
  $("loading-skeleton")!.style.display = "none";
  currentErrorData = data;
  quizAnswered = false;

  // 1. Error Location & Badge
  const badge = $("category-badge")!;
  badge.textContent = data.category;
  badge.className = "badge";
  badge.setAttribute("data-type", data.category.split(" ")[0]);

  const type = data.category.split(" ")[0];
  if (type === "Syntax") {
    badge.style.color = "var(--ff-syntax)";
    badge.style.borderColor = "var(--ff-syntax)";
  } else if (type === "Logic") {
    badge.style.color = "var(--ff-logic)";
    badge.style.borderColor = "var(--ff-logic)";
  } else if (type === "Runtime") {
    badge.style.color = "var(--ff-runtime)";
    badge.style.borderColor = "var(--ff-runtime)";
  }

  $("error-location")!.textContent =
    data.location || (data.raw && data.raw.file + ":" + data.raw.line) || "";
  const errorMsg = data.errorMessage || (data.raw && data.raw.message) || "";
  $("error-message")!.textContent = errorMsg;

  // TL;DR
  const tldr = $("tldr-text")!;
  if (data.tldr) {
    tldr.textContent = data.tldr;
    tldr.style.display = "";
  } else {
    tldr.style.display = "none";
  }

  // 2. What Happened (with typewriter effect)
  const hasExplanation = !!data.explanation;
  showSection("error-section-explanation", hasExplanation);
  if (hasExplanation) {
    typeWriter($("explanation-text")!, data.explanation!, 12);
  }

  // 3. How to Fix
  const hasFixData = !!(
    data.howToFix &&
    (Array.isArray(data.howToFix) ? data.howToFix.length > 0 : data.howToFix)
  );
  showSection("error-section-fix", hasFixData);
  if (hasFixData) {
    if (Array.isArray(data.howToFix)) {
      const fixList = data.howToFix
        .map(function (step) {
          return "<li>" + step + "</li>";
        })
        .join("");
      $("fix-text")!.innerHTML =
        '<ol style="padding-left: 18px; margin: 0;">' + fixList + "</ol>";
    } else {
      $("fix-text")!.innerHTML = data.howToFix!;
    }
  }

  // 4. How to Prevent
  const hasPrevent = !!data.howToPrevent;
  showSection("error-section-prevent", hasPrevent);
  if (hasPrevent) $("prevent-text")!.innerHTML = data.howToPrevent!;

  // 5. Best Practices
  const hasPractices = !!data.bestPractices;
  showSection("error-section-practices", hasPractices);
  if (hasPractices) $("practices-text")!.innerHTML = data.bestPractices!;

  // 6. Suggested Prompt
  const hasPrompt = !!data.suggestedPrompt;
  showSection("error-section-prompt", hasPrompt);
  if (hasPrompt) $("prompt-text")!.textContent = data.suggestedPrompt!;

  // 7. Quiz
  const hasQuiz = !!data.quiz;
  showSection("error-section-quiz", hasQuiz);
  if (hasQuiz) {
    const correctIdx = quizCorrectIndex(data.quiz!.correct);
    $("quiz-question")!.innerHTML = data.quiz!.question;
    const quizOptions = $("quiz-options")!;
    quizOptions.innerHTML = "";
    $("quiz-feedback")!.style.display = "none";

    data.quiz!.options.forEach(function (option: string, index: number) {
      const optionEl = document.createElement("div");
      optionEl.className = "quiz-option";
      optionEl.textContent = option;
      optionEl.style.animationDelay = index * 0.05 + "s";
      optionEl.style.minHeight = "36px";
      optionEl.classList.add("slide-in");

      optionEl.addEventListener("click", function () {
        if (quizAnswered) return;
        quizAnswered = true;

        document.querySelectorAll(".quiz-option").forEach(function (el, i) {
          el.setAttribute("data-answered", "true");
          (el as HTMLElement).style.cursor = "default";
          if (i === correctIdx) {
            el.classList.add("correct");
          } else if (i === index && i !== correctIdx) {
            el.classList.add("incorrect");
          } else {
            (el as HTMLElement).style.opacity = "0.6";
          }
        });

        const isCorrect = index === correctIdx;
        const fb = $("quiz-feedback")!;
        fb.textContent = isCorrect
          ? "Correct! " + data.quiz!.explanation
          : "Not quite. " + data.quiz!.explanation;
        fb.style.display = "block";
        fb.className = "quiz-feedback";
        if (isCorrect) {
          fb.style.borderLeftColor = "var(--ff-success)";
          launchConfetti();
          showToast("Correct!", "success");
        } else {
          fb.style.borderLeftColor = "var(--ff-runtime)";
        }

        vscode.postMessage({ type: "quizAnswer", correct: isCorrect });
      });
      quizOptions.appendChild(optionEl);
    });
  }

  showPanelSection("error");
  updateTtsStatus("");
  announce("Error explanation updated.");
}

// ── Diff Review: populate and show ──
function updateDiffPanel(data: DiffData): void {
  currentDiffData = data;

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
  showSection("diff-section-summary", hasSummary);
  if (hasSummary) $("quick-summary")!.textContent = data.quickSummary!;

  // 2. Why This Works
  const hasWhy = !!data.whyItWorks;
  showSection("diff-section-why", hasWhy);
  if (hasWhy) $("why-it-works")!.textContent = data.whyItWorks!;

  // 3. What To Do Next (interactive checklist)
  const hasTodo = Array.isArray(data.whatToDoNext) && data.whatToDoNext.length > 0;
  showSection("diff-section-todo", hasTodo);
  const todoList = $("what-to-do-next")!;
  todoList.innerHTML = "";
  $("check-done")!.style.display = "none";
  if (hasTodo) {
    data.whatToDoNext!.forEach(function (step: string, i: number) {
      const li = document.createElement("li");
      li.className = "ff-check-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "todo-" + i;
      cb.className = "ff-checkbox";
      cb.setAttribute("aria-label", step);
      cb.addEventListener("change", onChecklistChange);

      const label = document.createElement("label");
      label.htmlFor = "todo-" + i;
      label.className = "ff-check-label";
      label.textContent = step;

      li.appendChild(cb);
      li.appendChild(label);
      todoList.appendChild(li);
    });
  }

  // 4. Key Takeaway
  const hasTakeaway = !!data.keyTakeaway;
  showSection("diff-section-takeaway", hasTakeaway);
  if (hasTakeaway) $("key-takeaway")!.textContent = data.keyTakeaway!;

  // 5. Think About It
  const hasQuestion = !!data.checkQuestion;
  showSection("diff-section-question", hasQuestion);
  if (hasQuestion) $("check-question")!.textContent = data.checkQuestion!;

  showPanelSection("diff");
  updateTtsStatus("");
  announce("Fix explanation updated.");
}

// ── Checklist logic ──
function onChecklistChange(): void {
  const boxes = document.querySelectorAll<HTMLInputElement>(".ff-checkbox");
  const allChecked = Array.from(boxes).every(function (cb) {
    return cb.checked;
  });
  $("check-done")!.style.display = allChecked ? "" : "none";
  if (allChecked) {
    announce("All steps complete. Nice work!");
    launchConfetti();
    showToast("All steps done!", "success");
  }
}

// ── TTS helpers ──
function getReadableText(): string {
  if (activeView === "error" && currentErrorData) {
    const data = currentErrorData;
    const fixText = Array.isArray(data.howToFix)
      ? data.howToFix.join(". ")
      : data.howToFix || "";
    return cleanTextForTTS(
      [
        data.explanation,
        "Here is how to fix it. " + fixText,
        "To prevent this in the future: " + (data.howToPrevent || ""),
      ].join(". ")
    );
  } else if (activeView === "diff" && currentDiffData) {
    const parts: string[] = [];
    if (currentDiffData.quickSummary) parts.push(currentDiffData.quickSummary);
    if (currentDiffData.whyItWorks) parts.push(currentDiffData.whyItWorks);
    if (currentDiffData.keyTakeaway)
      parts.push("Key takeaway: " + currentDiffData.keyTakeaway);
    return cleanTextForTTS(parts.join(". "));
  }
  return "";
}

function stopAudio(): void {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  isSpeaking = false;
  updateTtsStatus("");
}

function speakWithWebSpeech(text: string): void {
  if (!("speechSynthesis" in window) || !text) {
    announce("Text-to-speech is not available.");
    updateTtsStatus("");
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  isSpeaking = true;
  $("tts-btn")!.textContent = "Stop";
  $("tts-btn")!.classList.add("ff-btn--playing");
  updateTtsStatus("Playing...");
  u.onend = function () {
    isSpeaking = false;
    $("tts-btn")!.textContent = "Read Aloud";
    $("tts-btn")!.classList.remove("ff-btn--playing");
    updateTtsStatus("");
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// ── Initialization guard ──
let _debugPanelInitialized = false;

function initDebugPanelListeners(): void {
  if (_debugPanelInitialized) return;
  _debugPanelInitialized = true;

  // ── Back buttons ──
  $("back-btn-error")?.addEventListener("click", function () {
    showPanelSection("actions");
  });
  $("back-btn-diff")?.addEventListener("click", function () {
    vscode.postMessage({ type: "diffReviewClosed" });
    showPanelSection("actions");
  });

  // ── Explain button ──
  $("explain-btn")?.addEventListener("click", function () {
    // Show loading skeleton
    $("loading-skeleton")!.style.display = "";
    $("errors-state")!.style.display = "none";
    vscode.postMessage({ type: "explainError" });
  });

  // ── Voice toggle ──
  $("voice-female")?.addEventListener("click", function () {
    selectedVoice = "female";
    $("voice-female")!.classList.add("active");
    $("voice-female")!.setAttribute("aria-checked", "true");
    $("voice-male")!.classList.remove("active");
    $("voice-male")!.setAttribute("aria-checked", "false");
  });

  $("voice-male")?.addEventListener("click", function () {
    selectedVoice = "male";
    $("voice-male")!.classList.add("active");
    $("voice-male")!.setAttribute("aria-checked", "true");
    $("voice-female")!.classList.remove("active");
    $("voice-female")!.setAttribute("aria-checked", "false");
  });

  // ── TTS button ──
  $("tts-btn")?.addEventListener("click", function () {
    if (isSpeaking) {
      stopAudio();
      $("tts-btn")!.textContent = "Read Aloud";
      $("tts-btn")!.classList.remove("ff-btn--playing");
      updateTtsStatus("");
      return;
    }
    const text = getReadableText();
    if (!text) {
      announce("No explanation to read yet.");
      return;
    }

    vscode.postMessage({ type: "requestTts", text: text });
    $("tts-btn")!.textContent = "Loading...";
    updateTtsStatus("Loading...");
  });

  // ── Copy Prompt Button ──
  $("copy-prompt-btn")?.addEventListener("click", async function () {
    const promptText = $("prompt-text")?.textContent || "";
    try {
      await navigator.clipboard.writeText(promptText);
      $("copy-prompt-btn")!.textContent = "Copied!";
      $("copy-prompt-btn")!.classList.add("btn--success");
      showToast("Copied!", "success");
      setTimeout(function () {
        $("copy-prompt-btn")!.textContent = "Copy Prompt";
        $("copy-prompt-btn")!.classList.remove("btn--success");
      }, 2000);
    } catch (_e) {
      // Fallback for webview where clipboard API may not work
      const textArea = document.createElement("textarea");
      textArea.value = promptText;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      $("copy-prompt-btn")!.textContent = "Copied!";
      $("copy-prompt-btn")!.classList.add("btn--success");
      setTimeout(function () {
        $("copy-prompt-btn")!.textContent = "Copy Prompt";
        $("copy-prompt-btn")!.classList.remove("btn--success");
      }, 2000);
    }
  });

  // ── Listen for messages from extension host ──
  window.addEventListener("message", function (event: MessageEvent) {
    const msg = event.data;

    if (msg.type === "updateErrors") {
      updateActionsState(msg.data as ActionsData);
    } else if (msg.type === "showError") {
      updateErrorPanel(msg.data as ErrorData);
    } else if (msg.type === "showDiff") {
      stopAudio();
      updateDiffPanel(msg.data as DiffData);
    } else if (msg.type === "playAudio") {
      stopAudio();
      const audioData = msg.data as PlayAudioData;
      const audio = new Audio(
        "data:" + audioData.mimeType + ";base64," + audioData.base64Audio
      );
      ttsAudio = audio;
      isSpeaking = true;
      $("tts-btn")!.textContent = "Stop";
      $("tts-btn")!.classList.add("ff-btn--playing");
      updateTtsStatus("Playing...");
      audio.onended = function () {
        ttsAudio = null;
        isSpeaking = false;
        $("tts-btn")!.textContent = "Read Aloud";
        $("tts-btn")!.classList.remove("ff-btn--playing");
        updateTtsStatus("");
        announce("Audio finished.");
      };
      audio.onerror = function () {
        ttsAudio = null;
        isSpeaking = false;
        $("tts-btn")!.textContent = "Read Aloud";
        $("tts-btn")!.classList.remove("ff-btn--playing");
        updateTtsStatus("");
        announce("Audio playback failed.");
      };
      audio.play().catch(function () {
        ttsAudio = null;
        isSpeaking = false;
        $("tts-btn")!.textContent = "Read Aloud";
        updateTtsStatus("");
        announce("Could not play audio.");
      });
    } else if (msg.type === "ttsError") {
      const ttsErr = msg.data as TtsErrorData;
      announce(ttsErr.message);
      updateTtsStatus("Using browser voice...");
      speakWithWebSpeech(getReadableText());
    } else if (msg.type === "clear") {
      stopAudio();
      currentErrorData = null;
      currentDiffData = null;
      updateActionsState({ count: 0, fileName: "", firstError: null });
    }
  });
}

initDebugPanelListeners();
