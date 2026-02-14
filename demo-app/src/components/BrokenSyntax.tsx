// BrokenSyntax.tsx — Planted Bug #1 (Syntax Error)
// Bug: Missing closing parenthesis on the return statement.
// Expected error: SyntaxError: Unexpected token, expected ","
// Fix: Add the missing `)` after the closing JSX tag.

export default function BrokenSyntax() {
  const message = "Hello from FlowFixer!";

  return (
    <div>
      <h2>Syntax Demo</h2>
      <p>{message}</p>
    </div>
  // ← missing `)` here — this is the planted bug
}
