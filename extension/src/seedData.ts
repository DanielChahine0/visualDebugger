/**
 * seedData.ts — Pre-loaded demo bug history
 * Owner: Engineer 2 (UI/Webview Lead)
 *
 * Provides 18 realistic bug entries simulating a week of student coding.
 * Used by the Dashboard panel (dashboard.html) and storage.ts.
 *
 * DATA CONTRACT:
 *   - Each entry follows the BugEntry interface (see types.ts once Engineer 3 defines it).
 *   - Engineer 1's storage.ts will import this as a fallback when MongoDB is unavailable.
 *   - The Dashboard webview expects this shape via postMessage.
 */

export interface BugEntry {
    id: number;
    category: 'Syntax' | 'Logic' | 'Runtime';
    error: string;
    file: string;
    line: number;
    timestamp: string; // ISO 8601
    explanation?: string;
    fix?: string;
}

export const SEED_BUGS: BugEntry[] = [
    { id: 1, category: 'Runtime', error: "TypeError: Cannot read properties of undefined (reading 'map')", file: 'App.tsx', line: 15, timestamp: '2026-02-07T09:15:00Z' },
    { id: 2, category: 'Syntax', error: "SyntaxError: Unexpected token '}'", file: 'Header.tsx', line: 23, timestamp: '2026-02-07T10:30:00Z' },
    { id: 3, category: 'Logic', error: 'Off-by-one: renders extra undefined item in list', file: 'List.tsx', line: 8, timestamp: '2026-02-07T14:45:00Z' },
    { id: 4, category: 'Runtime', error: 'ReferenceError: data is not defined', file: 'Dashboard.tsx', line: 42, timestamp: '2026-02-08T08:20:00Z' },
    { id: 5, category: 'Syntax', error: "SyntaxError: Unexpected token, expected ','", file: 'Form.tsx', line: 31, timestamp: '2026-02-08T11:10:00Z' },
    { id: 6, category: 'Runtime', error: 'TypeError: setItems is not a function', file: 'App.tsx', line: 20, timestamp: '2026-02-08T15:00:00Z' },
    { id: 7, category: 'Logic', error: 'Counter increments by 2 instead of 1', file: 'Counter.tsx', line: 12, timestamp: '2026-02-09T09:30:00Z' },
    { id: 8, category: 'Runtime', error: "TypeError: Cannot destructure property 'name' of undefined", file: 'Profile.tsx', line: 7, timestamp: '2026-02-09T13:15:00Z' },
    { id: 9, category: 'Syntax', error: 'SyntaxError: Missing semicolon', file: 'utils.ts', line: 45, timestamp: '2026-02-09T16:40:00Z' },
    { id: 10, category: 'Runtime', error: 'TypeError: fetch is not a function', file: 'api.ts', line: 3, timestamp: '2026-02-10T10:00:00Z' },
    { id: 11, category: 'Logic', error: 'Form submits even when validation fails', file: 'Form.tsx', line: 55, timestamp: '2026-02-10T11:25:00Z' },
    { id: 12, category: 'Runtime', error: 'RangeError: Maximum call stack size exceeded', file: 'Tree.tsx', line: 18, timestamp: '2026-02-10T14:50:00Z' },
    { id: 13, category: 'Logic', error: 'Search filter returns wrong results', file: 'Search.tsx', line: 22, timestamp: '2026-02-11T09:10:00Z' },
    { id: 14, category: 'Runtime', error: "TypeError: Cannot read properties of null (reading 'value')", file: 'Input.tsx', line: 9, timestamp: '2026-02-11T12:30:00Z' },
    { id: 15, category: 'Syntax', error: 'SyntaxError: Unterminated string literal', file: 'config.ts', line: 15, timestamp: '2026-02-12T08:45:00Z' },
    { id: 16, category: 'Runtime', error: "TypeError: Cannot read properties of undefined (reading 'length')", file: 'Table.tsx', line: 30, timestamp: '2026-02-12T13:20:00Z' },
    { id: 17, category: 'Logic', error: 'Pagination shows page 0 instead of page 1', file: 'Pagination.tsx', line: 14, timestamp: '2026-02-13T10:00:00Z' },
    { id: 18, category: 'Runtime', error: 'TypeError: items.filter is not a function', file: 'Filter.tsx', line: 27, timestamp: '2026-02-13T15:30:00Z' },
];

/**
 * Returns seed data for the dashboard.
 * In production, storage.ts will merge this with real MongoDB data.
 */
export function getSeedBugs(): BugEntry[] {
    return [...SEED_BUGS];
}
