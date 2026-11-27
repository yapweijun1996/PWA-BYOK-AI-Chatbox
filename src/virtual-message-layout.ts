export const virtualMessageThreshold = 200;
export const estimatedMessageHeight = 180;
export const virtualOverscanScreens = 2;

export type VirtualRange = {
  start: number;
  end: number;
  before: number;
  after: number;
};

export type VirtualSegment = { kind: "rows"; start: number; end: number } | { kind: "gap"; start: number; end: number; height: number };

/** Keep retained rows mounted without filling the gaps between them and the viewport. */
export function virtualMessageSegments(heights: readonly number[], range: VirtualRange, retained: ReadonlySet<number>): VirtualSegment[] {
  const segments: VirtualSegment[] = [];
  let start = 0;
  while (start < heights.length) {
    const visible = (start >= range.start && start < range.end) || retained.has(start);
    let end = start + 1;
    while (end < heights.length && (((end >= range.start && end < range.end) || retained.has(end)) === visible)) end++;
    if (visible) segments.push({ kind: "rows", start, end });
    else segments.push({ kind: "gap", start, end, height: heights.slice(start, end).reduce((total, height) => total + (Number.isFinite(height) && height > 0 ? height : estimatedMessageHeight), 0) });
    start = end;
  }
  return segments;
}

/** Offsets include each message's bottom margin. The range end is exclusive. */
export function virtualMessageRange(
  heights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
): VirtualRange {
  const offsets = [0];
  for (const height of heights)
    offsets.push(
      offsets[offsets.length - 1] +
        (Number.isFinite(height) && height > 0
          ? height
          : estimatedMessageHeight),
    );
  const total = offsets[offsets.length - 1];
  const viewport = Math.max(0, viewportHeight);
  const top = Math.max(0, scrollTop - viewport * virtualOverscanScreens);
  const bottom = Math.min(
    total,
    Math.max(0, scrollTop) + viewport * (1 + virtualOverscanScreens),
  );
  const lowerBound = (value: number) => {
    let low = 0,
      high = heights.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (offsets[mid + 1] < value) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const start = lowerBound(top);
  const end = Math.min(heights.length, Math.max(start, lowerBound(bottom) + 1));
  return { start, end, before: offsets[start], after: total - offsets[end] };
}
