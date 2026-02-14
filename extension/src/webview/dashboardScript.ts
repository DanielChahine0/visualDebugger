import {
  Chart,
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: "ready" });

type BugCategory = "Syntax Error" | "Logic Error" | "Runtime Error";
type BugRecord = {
  id: string;
  category: BugCategory;
  file: string;
  errorMessage: string;
  timestamp: number;
};

let categoryChart: Chart | undefined;
let trendChart: Chart | undefined;

function setLiveStatus(message: string): void {
  const el = document.getElementById("status-live");
  if (el) el.textContent = message;
}

function createCategoryChart(data: number[]): void {
  const canvas = document.getElementById("category-chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  categoryChart?.destroy();
  categoryChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Syntax", "Logic", "Runtime"],
      datasets: [
        {
          label: "Count",
          data,
          backgroundColor: ["rgba(255,170,0,0.65)", "rgba(33,150,243,0.65)", "rgba(244,67,54,0.65)"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function createTrendChart(labels: string[], data: number[]): void {
  const canvas = document.getElementById("trend-chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  trendChart?.destroy();
  trendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Bugs",
          data,
          borderColor: "#4fc3f7",
          backgroundColor: "rgba(79,195,247,0.18)",
          tension: 0.25,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderDashboard(bugs: BugRecord[]): void {
  const counts = { "Syntax Error": 0, "Logic Error": 0, "Runtime Error": 0 };
  for (const bug of bugs) {
    if (bug.category in counts) counts[bug.category]++;
  }

  createCategoryChart([
    counts["Syntax Error"],
    counts["Logic Error"],
    counts["Runtime Error"],
  ]);

  const focus = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const focusEl = document.getElementById("focus-area");
  if (focusEl) {
    focusEl.textContent =
      focus[1] > 0
        ? `You struggle most with ${focus[0]}s. Focus on this category next.`
        : "Keep coding. We will suggest a focus area once enough data is collected.";
  }

  const dayLabels: string[] = [];
  const trendCounts: number[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dayStart = day.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    dayLabels.push(day.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    trendCounts.push(bugs.filter((b) => b.timestamp >= dayStart && b.timestamp < dayEnd).length);
  }
  createTrendChart(dayLabels, trendCounts);

  const recent = document.getElementById("recent-bugs");
  if (recent) {
    recent.innerHTML = bugs
      .slice(-10)
      .reverse()
      .map((b) => {
        const cls = b.category.toLowerCase().replace(/\s+/g, "-");
        return `<div class="bug-item"><span class="badge badge-${cls} badge-sm">${b.category}</span><span class="muted">${b.file.split(/[\\/]/).pop() ?? b.file}</span></div>`;
      })
      .join("");
  }
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type === "showDashboard") {
    document.getElementById("empty-state")!.style.display = "none";
    document.getElementById("dashboard-content")!.style.display = "block";
    renderDashboard(msg.data.bugs as BugRecord[]);
    setLiveStatus("Dashboard updated.");
  }
});
