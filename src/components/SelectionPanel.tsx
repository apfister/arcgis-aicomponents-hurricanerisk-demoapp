import { useEffect, useState } from "react";
import { clearSelection, getSelection, subscribeSelection } from "../state/selection";

/**
 * A small overlay on the map showing how many hex bins are currently selected
 * as find-similar reference features, with a button to clear them.
 */
export default function SelectionPanel() {
  const [count, setCount] = useState(() => getSelection().length);

  useEffect(() => subscribeSelection((ids) => setCount(ids.length)), []);

  if (count === 0) return null;

  return (
    <div className="selection-panel">
      <span className="selection-panel__count">
        {count} hex bin{count === 1 ? "" : "s"} selected
      </span>
      <button className="selection-panel__clear" onClick={clearSelection}>
        Clear
      </button>
    </div>
  );
}
