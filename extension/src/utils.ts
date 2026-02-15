/**
 * Extract ±10 lines of code context around a given line number.
 * Used by error listener, extension commands, and CodeLens handlers.
 *
 * @param text - Full file content
 * @param line - 1-indexed line number to center on
 * @returns Numbered code lines around the error
 */
export function extractCodeContext(text: string, line: number): string {
  const lines = text.split("\n");
  const start = Math.max(0, line - 11); // 10 lines before (1-indexed)
  const end = Math.min(lines.length, line + 10);
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1} | ${l}`)
    .join("\n");
}
