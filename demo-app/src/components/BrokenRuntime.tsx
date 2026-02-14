// BrokenRuntime.tsx — Planted Bug #3 (Runtime Error)
// Bug: State is initialized as `undefined` instead of `[]`, so calling
//      `.map()` on it before the fetch resolves crashes with a TypeError.
// Expected error: TypeError: Cannot read properties of undefined (reading 'map')
// Fix: Initialize state as `useState<string[]>([])` or add a null check.

import { useState } from "react";

interface User {
  name: string;
}

export default function BrokenRuntime() {
  // BUG: state starts as undefined — .map() will crash immediately
  const [users, setUsers] = useState<User[] | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  const loadData = () => {
    // Simulate a slow fetch — state is undefined until this resolves
    setTimeout(() => {
      setUsers([
        { name: "Alice" },
        { name: "Bob" },
        { name: "Charlie" },
      ]);
      setLoaded(true);
    }, 2000);
  };

  return (
    <div>
      <h2>Runtime Bug Demo</h2>
      <p>Click "Load Data" — the app will crash because <code>.map()</code> is called on <code>undefined</code> state.</p>
      <button className="action" onClick={loadData}>
        Load Data
      </button>
      {/* BUG: users is undefined on first render after clicking, crashes here */}
      <ul>
        {users.map((u, idx) => (
          <li key={idx}>{u.name}</li>
        ))}
      </ul>
    </div>
  );
}
