// BrokenLogic.tsx — Planted Bug #2 (Logic Error)
// Bug: `<=` instead of `<` in the loop condition renders one extra
//       undefined item at the end of the list.
// Expected behavior: No crash, but an extra empty list item appears.
// Fix: Change `i <= items.length` to `i < items.length`.

import { useState } from "react";

const FRUIT_DATA = ["Apple", "Banana", "Cherry", "Date", "Elderberry"];

export default function BrokenLogic() {
  const [items] = useState(FRUIT_DATA);
  const [showList, setShowList] = useState(false);

  const buildList = () => {
    const result: string[] = [];
    // BUG: off-by-one — `<=` reads one past the end of the array
    for (let i = 0; i <= items.length; i++) {
      result.push(items[i]);
    }
    return result;
  };

  return (
    <div>
      <h2>Logic Bug Demo</h2>
      <p>Click the button to render a fruit list. Notice the extra empty item at the bottom.</p>
      <button className="action" onClick={() => setShowList(true)}>
        Show List
      </button>
      {showList && (
        <ul>
          {buildList().map((item, idx) => (
            <li key={idx}>{item ?? "(undefined)"}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
