import * as vscode from "vscode";
import * as Diff from "diff";
import { CapturedDiff } from "./types";

const LOG = "[FlowFixer:DiffEngine]";

export class DiffEngine implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private onDiffDetectedEmitter = new vscode.EventEmitter<CapturedDiff>();

  /** Fires when a meaningful diff is detected on save */
  readonly onDiffDetected = this.onDiffDetectedEmitter.event;

  /** Stores document content before save (uri -> content) */
  private beforeSaveContent = new Map<string, string>();

  /** Whether we're actively tracking (only after an error is detected) */
  private tracking = false;

  /** URI of the file that had the error */
  private trackedUri: string | undefined;

  /** Debounce timer for diagnostics-based detection */
  private diagDebounceTimer: NodeJS.Timeout | undefined;

  /** Debounce timer for content-change-based detection */
  private contentChangeTimer: NodeJS.Timeout | undefined;

  /** Error count when tracking started (to detect when errors decrease) */
  private initialErrorCount: number | undefined;

  constructor() {
    // Capture content just before save
    this.disposables.push(
      vscode.workspace.onWillSaveTextDocument((e) => {
        if (this.tracking) {
          this.captureBeforeSave(e.document);
        }
      })
    );

    // Compute diff after save
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.tracking) {
          this.computeDiff(doc);
        }
      })
    );

    // Detect fix applied: when errors clear on the tracked file, compute diff.
    // This works even without saving (e.g. AI tool applies fix in editor).
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) => {
        if (!this.tracking || !this.trackedUri) {
          return;
        }

        // Check if the tracked file is in the changed URIs
        const trackedChanged = e.uris.some(
          (uri) => uri.fsPath === this.trackedUri
        );
        if (!trackedChanged) {
          return;
        }

        // Check if errors have cleared on the tracked file
        const trackedUriObj = e.uris.find(
          (uri) => uri.fsPath === this.trackedUri
        );
        if (!trackedUriObj) {
          return;
        }

        const diagnostics = vscode.languages.getDiagnostics(trackedUriObj);
        const errors = diagnostics.filter(
          (d) => d.severity === vscode.DiagnosticSeverity.Error
        );
        console.log(`${LOG} tracked file diagnostics: ${errors.length} errors (initial: ${this.initialErrorCount ?? "?"})`);

        if (errors.length === 0) {
          // Errors cleared — a fix was applied. Debounce briefly so content settles.
          console.log(`${LOG} errors cleared on ${trackedUriObj.fsPath}, starting 500ms debounce`);
          this.scheduleDiffComputation(this.trackedUri);
        } else if (
          this.initialErrorCount !== undefined &&
          errors.length < this.initialErrorCount
        ) {
          // Error count decreased — the tracked error was likely fixed even if
          // other errors remain in the file.  Trigger diff detection.
          console.log(`${LOG} error count decreased (${this.initialErrorCount} -> ${errors.length}), starting 500ms debounce`);
          this.scheduleDiffComputation(this.trackedUri);
        }
      })
    );

    // Detect content changes in the tracked file (handles AI tools that
    // modify the buffer without saving and without immediately clearing
    // diagnostics).
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.tracking || !this.trackedUri) {
          return;
        }
        if (e.document.uri.fsPath !== this.trackedUri) {
          return;
        }
        if (e.contentChanges.length === 0) {
          return;
        }

        // Content changed on the tracked file. The diagnostics path may
        // still fire (e.g. after the language server revalidates), but if
        // the fix doesn't clear ALL diagnostics, this path ensures we
        // still capture the diff after a longer debounce (1.5s) to let
        // the language server settle.
        if (this.contentChangeTimer) {
          clearTimeout(this.contentChangeTimer);
        }
        const uri = this.trackedUri;
        this.contentChangeTimer = setTimeout(() => {
          this.contentChangeTimer = undefined;
          // Only fire if the diagnostics path hasn't already handled it
          if (this.tracking && this.trackedUri === uri) {
            console.log(`${LOG} content change debounce fired for ${uri}`);
            void this.computeDiffForTrackedFile(uri);
          }
        }, 1500);
      })
    );

    console.log(`${LOG} initialized`);
  }

  /** Schedule a debounced diff computation, cancelling any pending timers. */
  private scheduleDiffComputation(fileUri: string): void {
    const clearedUri = fileUri;
    if (this.diagDebounceTimer) {
      clearTimeout(this.diagDebounceTimer);
    }
    // Also cancel the content-change timer since diagnostics already triggered
    if (this.contentChangeTimer) {
      clearTimeout(this.contentChangeTimer);
      this.contentChangeTimer = undefined;
    }
    this.diagDebounceTimer = setTimeout(() => {
      this.diagDebounceTimer = undefined;
      void this.computeDiffForTrackedFile(clearedUri);
    }, 500);
  }

  /** Start tracking changes to a specific file after an error is detected.
   *  Captures a snapshot of the file NOW so we have the true "before" state,
   *  even if an AI tool edits the document before the next save. */
  startTracking(fileUri: string): void {
    // Keep one active tracking target at a time so we don't lose the original
    // file before its fix diff is computed.
    if (this.tracking && this.trackedUri && this.trackedUri !== fileUri) {
      console.log(`${LOG} ignoring startTracking(${fileUri}) — currently tracking ${this.trackedUri}`);
      return;
    }

    // If a debounce timer is pending (fix about to be detected), don't overwrite
    if (this.diagDebounceTimer && this.trackedUri !== fileUri) {
      console.log(`${LOG} ignoring startTracking(${fileUri}) — pending detection for ${this.trackedUri}`);
      return;
    }

    this.tracking = true;
    this.trackedUri = fileUri;

    // Capture the current error count so we can detect when it decreases
    const uri = vscode.Uri.file(fileUri);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    this.initialErrorCount = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    ).length;
    console.log(`${LOG} initial error count: ${this.initialErrorCount}`);

    // Snapshot current content immediately
    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === fileUri
    );
    if (doc) {
      const key = doc.uri.toString();
      if (!this.beforeSaveContent.has(key)) {
        this.beforeSaveContent.set(key, doc.getText());
        console.log(`${LOG} captured initial snapshot for ${doc.fileName}`);
      }
    } else {
      // If the file isn't currently in textDocuments, load it so we still have
      // a reliable baseline when diagnostics clear.
      const trackedAtStart = this.trackedUri;
      void vscode.workspace
        .openTextDocument(vscode.Uri.file(fileUri))
        .then((opened) => {
          if (!this.tracking || this.trackedUri !== trackedAtStart) {
            return;
          }
          const key = opened.uri.toString();
          if (!this.beforeSaveContent.has(key)) {
            this.beforeSaveContent.set(key, opened.getText());
            console.log(`${LOG} captured initial snapshot for ${opened.fileName}`);
          }
        }, (err: unknown) => {
          console.warn(`${LOG} failed to open ${fileUri} for snapshot`, err);
        });
    }

    console.log(`${LOG} now tracking changes to: ${fileUri}`);
  }

  /** Stop tracking */
  stopTracking(): void {
    this.tracking = false;
    this.trackedUri = undefined;
    this.initialErrorCount = undefined;
    this.beforeSaveContent.clear();
    if (this.diagDebounceTimer) {
      clearTimeout(this.diagDebounceTimer);
      this.diagDebounceTimer = undefined;
    }
    if (this.contentChangeTimer) {
      clearTimeout(this.contentChangeTimer);
      this.contentChangeTimer = undefined;
    }
    console.log(`${LOG} stopped tracking`);
  }

  private captureBeforeSave(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    // Only capture for the tracked file
    if (this.trackedUri && doc.uri.fsPath !== this.trackedUri) {
      return;
    }
    // Don't overwrite the initial snapshot — it has the true "before" content
    if (!this.beforeSaveContent.has(key)) {
      this.beforeSaveContent.set(key, doc.getText());
      console.log(`${LOG} captured before-save state for ${doc.fileName}`);
    }
  }

  private computeDiff(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const before = this.beforeSaveContent.get(key);

    if (before === undefined) {
      console.log(`${LOG} no baseline snapshot for ${doc.fileName}; skipping diff`);
      return;
    }

    const after = doc.getText();

    // Skip if content hasn't actually changed
    if (before === after) {
      console.log(`${LOG} before === after for ${doc.fileName}, skipping diff`);
      // Keep the baseline snapshot; saves can happen before AI applies the fix.
      return;
    }

    // Compute unified diff
    const patch = Diff.createPatch(doc.fileName, before, after, "before", "after");

    const captured: CapturedDiff = {
      file: doc.fileName,
      language: doc.languageId,
      beforeContent: before,
      afterContent: after,
      unifiedDiff: patch,
      timestamp: Date.now(),
    };

    this.beforeSaveContent.delete(key);
    this.onDiffDetectedEmitter.fire(captured);
    console.log(`${LOG} diff detected in ${doc.fileName}`);

    // Stop tracking after first diff capture
    this.stopTracking();
  }

  private async computeDiffForTrackedFile(filePath: string): Promise<void> {
    let doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === filePath);
    if (!doc) {
      try {
        doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      } catch (err) {
        console.warn(`${LOG} failed to open ${filePath} to compute diff`, err);
        return;
      }
    }

    console.log(`${LOG} errors cleared on ${doc.fileName} — computing diff`);
    this.computeDiff(doc);
  }

  dispose(): void {
    this.stopTracking();
    this.disposables.forEach((d) => d.dispose());
    this.onDiffDetectedEmitter.dispose();
  }
}
