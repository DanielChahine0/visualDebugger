import { useState } from "react";
import BrokenLogic from "./components/BrokenLogic";
import BrokenRuntime from "./components/BrokenRuntime";

// NOTE: BrokenSyntax is intentionally NOT imported here.
// It has a syntax error that prevents compilation.
// To demo it: open BrokenSyntax.tsx in VS Code and the
// diagnostics API will flag the error for FlowFixer.

type Tab = "logic" | "runtime";

export default function App() {
  const [tab, setTab] = useState<Tab>("logic");

  return (
    <div className="app">
      <h1>FlowFixer Demo</h1>
      <p className="subtitle">
        A small React app with planted bugs for the FlowFixer live demo.
      </p>

      <div className="info-box">
        <strong>Syntax Bug:</strong> Open{" "}
        <code>src/components/BrokenSyntax.tsx</code> in VS Code. The editor
        will show a red squiggly — FlowFixer will explain it.
      </div>

      <nav className="tabs">
        <button
          className={tab === "logic" ? "active" : ""}
          onClick={() => setTab("logic")}
        >
          Logic Bug
        </button>
        <button
          className={tab === "runtime" ? "active" : ""}
          onClick={() => setTab("runtime")}
        >
          Runtime Bug
        </button>
      </nav>

      <div className="panel">
        {tab === "logic" && <BrokenLogic />}
        {tab === "runtime" && <BrokenRuntime />}
      </div>
    </div>
  );
}
