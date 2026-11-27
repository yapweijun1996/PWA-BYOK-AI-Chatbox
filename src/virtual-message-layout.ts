export const virtualMessageThreshold = 200;
export const estimatedMessageHeight = 180;
export const virtualOverscanScreens = 2;

export type VirtualRange = {
  start: number;
  end: number;
  before: number;
  after: number;
};

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
