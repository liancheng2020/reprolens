export interface UiObservation {
  clear: boolean;
  inViewport: boolean;
  centerClear: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  hit: string | null;
}

// Fixed browser-side probe shared by runtime and exported tests; not user-supplied JS.
export function uiProbe(element: Element): UiObservation {
  const rect = element.getBoundingClientRect();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const inViewport = rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
    && rect.right <= viewport.width && rect.bottom <= viewport.height;
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const centerClear = Boolean(hit && (hit === element || element.contains(hit)));
  return { clear: inViewport && centerClear, inViewport, centerClear,
    bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport,
    hit: hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') : null };
}
