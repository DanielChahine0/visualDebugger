/**
 * dashboardScript.ts — Dynamic Bug Dashboard renderer
 *
 * All rendering is driven by BugRecord[] data received via showDashboard
 * messages from the extension host. Nothing is hardcoded.
 */

/* Chart.js is loaded from CDN as a global — declare it */
declare const Chart: any;
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();
vscode.postMessage({ type: "ready" });

// ── Types ──

type BugCategory = "Syntax Error" | "Logic Error" | "Runtime Error";
type BugRecord = {
  id: string;
  category: BugCategory;
  file: string;
  errorMessage: string;
  timestamp: number;
  explanation?: {
    quiz?: { question: string; options: string[]; correct: string; explanation: string };
  };
  diffExplanation?: unknown;
};

// ── State ──

let latestBugs: BugRecord[] = [];
let categoryChart: any;
let trendChart: any;
let currentRange = "7d";

// ── Helpers ──

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Map BugRecord.category to short display label */
function shortCategory(cat: BugCategory): string {
  switch (cat) {
    case "Syntax Error": return "Syntax";
    case "Logic Error": return "Logic";
    case "Runtime Error": return "Runtime";
    default: return String(cat);
  }
}

function getThemeColors() {
  const style = getComputedStyle(document.body);
  return {
    syntax: style.getPropertyValue("--vd-syntax").trim() || "#FBBF24",
    logic: style.getPropertyValue("--vd-logic").trim() || "#C084FC",
    runtime: style.getPropertyValue("--vd-runtime").trim() || "#FB7185",
    grid: "rgba(255, 255, 255, 0.04)",
    text: style.getPropertyValue("--vscode-descriptionForeground").trim() || "#888",
    total: "#60A5FA",
  };
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function animateCounter(el: HTMLElement | null, target: number, duration: number): void {
  if (!el) return;
  if (prefersReducedMotion || target === 0) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  function tick(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el!.textContent = String(Math.round(eased * target));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── Chart.js Defaults ──

const tooltipConfig = {
  backgroundColor: "rgba(20, 20, 30, 0.95)",
  borderColor: "rgba(96, 165, 250, 0.2)",
  borderWidth: 1,
  cornerRadius: 8,
  padding: 12,
  titleFont: { weight: "700" },
  bodyFont: { size: 12 },
};

// ── Renderers ──

function renderStats(bugs: BugRecord[]): void {
  const counts = { "Syntax Error": 0, "Logic Error": 0, "Runtime Error": 0 };
  for (const bug of bugs) {
    if (bug.category in counts) counts[bug.category]++;
  }
  animateCounter(document.getElementById("total-bugs"), bugs.length, 800);
  animateCounter(document.getElementById("syntax-count"), counts["Syntax Error"], 800);
  animateCounter(document.getElementById("logic-count"), counts["Logic Error"], 800);
  animateCounter(document.getElementById("runtime-count"), counts["Runtime Error"], 800);
}

function renderCategoryChart(bugs: BugRecord[]): void {
  const counts = { "Syntax Error": 0, "Logic Error": 0, "Runtime Error": 0 };
  for (const bug of bugs) {
    if (bug.category in counts) counts[bug.category]++;
  }

  const colors = getThemeColors();
  const canvas = document.getElementById("category-chart") as HTMLCanvasElement | null;
  if (!canvas) return;

  if (categoryChart) categoryChart.destroy();

  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

  categoryChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ["Syntax Errors", "Logic Errors", "Runtime Errors"],
      datasets: [{
        label: "Count",
        data: [counts["Syntax Error"], counts["Logic Error"], counts["Runtime Error"]],
        backgroundColor: ["rgba(251,191,36,0.25)", "rgba(192,132,252,0.25)", "rgba(251,113,133,0.25)"],
        borderColor: [colors.syntax, colors.logic, colors.runtime],
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipConfig },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: colors.text }, grid: { color: colors.grid } },
        x: { ticks: { color: colors.text }, grid: { display: false } },
      },
    },
  });
}

function renderTrendChart(bugs: BugRecord[], range: string): void {
  const colors = getThemeColors();
  const canvas = document.getElementById("trend-chart") as HTMLCanvasElement | null;
  if (!canvas || typeof Chart === "undefined") return;

  const now = new Date();
  const buckets: { start: number; end: number }[] = [];
  const labels: string[] = [];

  if (range === "1h") {
    const startTime = now.getTime() - HOUR;
    for (let i = 0; i < 6; i++) {
      const tStart = startTime + i * 10 * MIN;
      const tEnd = tStart + 10 * MIN;
      labels.push(new Date(tEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      buckets.push({ start: tStart, end: tEnd });
    }
  } else if (range === "24h") {
    const startTime = now.getTime() - 24 * HOUR;
    for (let i = 0; i < 6; i++) {
      const tStart = startTime + i * 4 * HOUR;
      const tEnd = tStart + 4 * HOUR;
      labels.push(new Date(tEnd).toLocaleTimeString([], { hour: "2-digit" }));
      buckets.push({ start: tStart, end: tEnd });
    }
  } else if (range === "7d") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString([], { month: "short", day: "numeric" }));
      const tStart = new Date(d).setHours(0, 0, 0, 0);
      const tEnd = new Date(d).setHours(23, 59, 59, 999);
      buckets.push({ start: tStart, end: tEnd });
    }
  } else {
    // 30d — 6 buckets of 5 days
    const startTime = now.getTime() - 30 * DAY;
    for (let i = 0; i < 6; i++) {
      const tStart = startTime + i * 5 * DAY;
      const tEnd = tStart + 5 * DAY;
      labels.push(new Date(tEnd).toLocaleDateString([], { month: "short", day: "numeric" }));
      buckets.push({ start: tStart, end: tEnd });
    }
  }

  const data = buckets.map((b) =>
    bugs.filter((bug) => bug.timestamp >= b.start && bug.timestamp <= b.end).length,
  );

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Total Bugs",
        data,
        borderColor: colors.total,
        backgroundColor: "rgba(96, 165, 250, 0.08)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: colors.total,
        pointBorderColor: "rgba(96, 165, 250, 0.3)",
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipConfig },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: colors.text }, grid: { color: colors.grid } },
        x: { ticks: { color: colors.text }, grid: { display: false } },
      },
    },
  });

  // Highlight active toggle button
  document.querySelectorAll(".btn-toggle").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.btn-toggle[data-range="${range}"]`)?.classList.add("active");

  const labelMap: Record<string, string> = {
    "1h": "Last 1 Hour", "24h": "Last 24 Hours", "7d": "Last 7 Days", "30d": "Last 30 Days",
  };
  const labelEl = document.getElementById("trend-label");
  if (labelEl) labelEl.textContent = `(${labelMap[range]})`;
}

function renderProgressRing(bugs: BugRecord[]): void {
  // Count how many bugs have quizzes, and how many quizzes were completed
  // (A quiz is "completed" if the bug has a diffExplanation, meaning the user fixed it)
  const withQuiz = bugs.filter((b) => b.explanation?.quiz);
  const completed = withQuiz.filter((b) => b.diffExplanation);

  const total = withQuiz.length;
  const done = completed.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (pct / 100) * circumference;

  const circle = document.getElementById("progress-ring-circle") as HTMLElement | null;
  const pctEl = document.getElementById("progress-ring-pct");
  const labelEl = document.getElementById("progress-ring-label");

  if (pctEl) pctEl.textContent = pct + "%";
  if (labelEl) labelEl.textContent = done + " / " + total + " quizzes";
  if (circle) setTimeout(() => { (circle as any).style.strokeDashoffset = offset; }, 100);
}

function renderHeatmap(bugs: BugRecord[]): void {
  const grid = document.getElementById("heatmap-grid");
  const monthsRow = document.getElementById("heatmap-months");
  const tooltip = document.getElementById("heatmap-tooltip");
  const titleEl = document.getElementById("heatmap-title");
  const summaryEl = document.getElementById("heatmap-summary");
  if (!grid || !monthsRow || !tooltip || !titleEl || !summaryEl) return;

  grid.innerHTML = "";
  monthsRow.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const NUM_WEEKS = 16;
  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (NUM_WEEKS * 7 - 1) - startDate.getDay());

  // Build day-to-count map
  const dayCounts: Record<string, number> = {};
  let totalBugs = 0;
  bugs.forEach((bug) => {
    const d = new Date(bug.timestamp);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().split("T")[0];
    dayCounts[key] = (dayCounts[key] || 0) + 1;
    totalBugs++;
  });

  titleEl.textContent = totalBugs + " bugs tracked";
  summaryEl.textContent = "Last " + NUM_WEEKS + " weeks";

  // Build weeks (columns)
  const weeks: Date[][] = [];
  const current = new Date(startDate);
  let currentWeek: Date[] = [];

  while (current <= endDate) {
    currentWeek.push(new Date(current));
    if (current.getDay() === 6 || current.getTime() === endDate.getTime()) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    current.setDate(current.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  // Month labels
  let lastMonth = -1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  monthsRow.style.gridTemplateColumns = "repeat(" + weeks.length + ", 13px)";
  weeks.forEach((week) => {
    const firstDay = week[0];
    const month = firstDay.getMonth();
    const span = document.createElement("span");
    if (month !== lastMonth && firstDay.getDate() <= 7) {
      span.textContent = monthNames[month];
      lastMonth = month;
    }
    span.className = "vd-heatmap-month-label";
    monthsRow.appendChild(span);
  });

  // Cells
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    weeks.forEach((week) => {
      const dayEntry = week.find((d) => d.getDay() === dayOfWeek);
      const cell = document.createElement("div");
      cell.className = "vd-heatmap-cell";

      if (dayEntry && dayEntry <= today) {
        const key = dayEntry.toISOString().split("T")[0];
        const count = dayCounts[key] || 0;

        let level = 0;
        if (count === 1) level = 1;
        else if (count === 2) level = 2;
        else if (count === 3) level = 3;
        else if (count >= 4) level = 4;

        cell.setAttribute("data-level", String(level));
        cell.setAttribute("data-count", String(count));
        cell.setAttribute("data-date", dayEntry.toLocaleDateString("en-US", { month: "long", day: "numeric" }));

        cell.addEventListener("mouseenter", function (this: HTMLElement) {
          const c = this.getAttribute("data-count");
          const d = this.getAttribute("data-date");
          const label = c + " bug" + (c !== "1" ? "s" : "") + " on " + d;
          tooltip.textContent = label;
          tooltip.classList.add("visible");
          tooltip.setAttribute("aria-hidden", "false");

          const rect = this.getBoundingClientRect();
          const parentRect = this.closest(".vd-heatmap-card")!.getBoundingClientRect();
          tooltip.style.left = rect.left - parentRect.left + rect.width / 2 + "px";
          tooltip.style.top = rect.top - parentRect.top - 8 + "px";
        });
        cell.addEventListener("mouseleave", () => {
          tooltip.classList.remove("visible");
          tooltip.setAttribute("aria-hidden", "true");
        });
      } else {
        cell.setAttribute("data-level", "-1");
      }

      grid.appendChild(cell);
    });
  }
}

function renderAchievements(bugs: BugRecord[]): void {
  const grid = document.getElementById("achievements-grid");
  if (!grid) return;

  const now = Date.now();
  const total = bugs.length;
  const categories = new Set(bugs.map((b) => shortCategory(b.category)));
  const hasAllTypes = categories.size >= 3;
  const hasQuickFix = bugs.some((b) => now - b.timestamp < 60 * 60 * 1000);

  const achievements = [
    { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>', name: "First Bug", desc: "Found your first bug", check: total >= 1 },
    { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>', name: "5 Bugs", desc: "Found 5 bugs", check: total >= 5 },
    { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>', name: "10 Bugs", desc: "Found 10 bugs", check: total >= 10 },
    { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>', name: "All Types", desc: "Syntax + Logic + Runtime", check: hasAllTypes },
    { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>', name: "Quick Fix", desc: "Fixed within 1 hour", check: hasQuickFix },
    { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>', name: "Power User", desc: "Found 15+ bugs", check: total >= 15 },
  ];

  grid.innerHTML = "";
  achievements.forEach((a) => {
    const el = document.createElement("div");
    el.className = "vd-achievement " + (a.check ? "unlocked" : "locked");
    el.setAttribute("aria-label", a.name + (a.check ? " - Unlocked" : " - Locked"));
    el.innerHTML =
      '<span class="vd-achievement-icon" aria-hidden="true">' + a.icon + "</span>" +
      '<span class="vd-achievement-name">' + a.name + "</span>" +
      '<span class="vd-achievement-desc">' + a.desc + "</span>";
    grid.appendChild(el);
  });
}

function renderBugHistory(bugs: BugRecord[]): void {
  const historyEl = document.getElementById("bug-history");
  if (!historyEl) return;

  const sorted = [...bugs].sort((a, b) => b.timestamp - a.timestamp);
  historyEl.innerHTML = "";

  sorted.forEach((bug) => {
    const cat = shortCategory(bug.category);
    let colorVar = "--vd-runtime";
    let dimVar = "--vd-runtime-dim";
    if (cat === "Logic") { colorVar = "--vd-logic"; dimVar = "--vd-logic-dim"; }
    if (cat === "Syntax") { colorVar = "--vd-syntax"; dimVar = "--vd-syntax-dim"; }

    const dateStr = new Date(bug.timestamp).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const fileName = bug.file.split(/[\\/]/).pop() ?? bug.file;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;gap:12px;padding:12px 8px;border-bottom:1px solid var(--vd-border-subtle,rgba(255,255,255,0.06));border-radius:6px;transition:background .15s ease;";
    row.addEventListener("mouseenter", function () { this.style.background = "var(--vd-surface, rgba(255,255,255,0.03))"; });
    row.addEventListener("mouseleave", function () { this.style.background = "transparent"; });
    row.innerHTML =
      `<span class="badge" style="color:var(${colorVar});background:var(${dimVar});border-color:transparent;margin-top:2px;width:75px;text-align:center;flex-shrink:0;font-size:0.72rem;">${cat}</span>` +
      `<div style="flex:1;min-width:0;">` +
      `<div style="font-size:0.88em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;" title="${bug.errorMessage}">${bug.errorMessage}</div>` +
      `<div class="text-muted text-sm" style="font-size:0.75em;margin-top:2px;">${fileName} &middot; ${dateStr}</div>` +
      `</div>`;
    historyEl.appendChild(row);
  });
}

// ── Main Render ──

function renderDashboard(bugs: BugRecord[]): void {
  latestBugs = bugs;
  renderStats(bugs);
  renderCategoryChart(bugs);
  renderTrendChart(bugs, currentRange);
  renderProgressRing(bugs);
  renderHeatmap(bugs);
  renderAchievements(bugs);
  renderBugHistory(bugs);
}

// ── Event Listeners ──

let _initialized = false;

function init(): void {
  if (_initialized) return;
  _initialized = true;

  // Trend range toggle buttons
  document.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const range = (e.currentTarget as HTMLElement).getAttribute("data-range");
      if (range) {
        currentRange = range;
        renderTrendChart(latestBugs, range);
      }
    });
  });

  // Listen for data from extension
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "showDashboard") {
      renderDashboard(msg.data.bugs as BugRecord[]);
    }
  });
}

init();
