/**
 * Tracks which hex bins the user has selected as reference ("query") features
 * for a find-similar run. ObjectIDs are stored; the map highlights them.
 */
type Listener = (ids: number[]) => void;

const selected = new Set<number>();
const listeners = new Set<Listener>();

function emit(): void {
  const ids = [...selected];
  listeners.forEach((fn) => fn(ids));
}

/** Toggles a hex bin's selection state. Returns true if now selected. */
export function toggleSelection(objectId: number): boolean {
  const nowSelected = !selected.has(objectId);
  if (nowSelected) {
    selected.add(objectId);
  } else {
    selected.delete(objectId);
  }
  emit();
  return nowSelected;
}

/** Clears all selected hex bins. */
export function clearSelection(): void {
  if (selected.size === 0) return;
  selected.clear();
  emit();
}

/** Returns the currently selected hex-bin ObjectIDs. */
export function getSelection(): number[] {
  return [...selected];
}

/** Subscribes to selection changes. Returns an unsubscribe function. */
export function subscribeSelection(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
