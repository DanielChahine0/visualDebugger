const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: [path.resolve(__dirname, "src/extension.ts")],
  bundle: true,
  outfile: path.resolve(__dirname, "dist/extension.js"),
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: !isWatch,
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: [
    path.resolve(__dirname, "src/webview/diffPanelScript.ts"),
    path.resolve(__dirname, "src/webview/dashboardScript.ts"),
  ],
  bundle: true,
  outdir: path.resolve(__dirname, "dist/webview"),
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: false,
  minify: !isWatch,
  logLevel: "info",
};

function copyStaticWebviewFiles() {
  const srcDir = path.resolve(__dirname, "src/webview");
  const distDir = path.resolve(__dirname, "dist/webview");
  fs.mkdirSync(distDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (file.endsWith(".html") || file.endsWith(".css") || file.endsWith(".js")) {
      fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
    }
  }
  console.log("[esbuild] copied static webview files to dist/webview");
}

async function build() {
  if (isWatch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("[esbuild] watching for changes...");
    copyStaticWebviewFiles();
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    copyStaticWebviewFiles();
    console.log("[esbuild] build complete");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
