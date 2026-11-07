// Recursive shadowcasting field of view.

const OCTANTS = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

export function computeFov(
  w: number,
  h: number,
  ox: number,
  oy: number,
  radius: number,
  opaque: (x: number, y: number) => boolean,
  mark: (x: number, y: number) => void,
): void {
  mark(ox, oy);
  for (const [xx, xy, yx, yy] of OCTANTS) castLight(1, 1.0, 0.0, xx, xy, yx, yy);

  function castLight(row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number) {
    if (start < end) return;
    const r2 = radius * radius;
    let newStart = 0;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1;
      const dy = -j;
      let blocked = false;
      while (dx <= 0) {
        dx += 1;
        const x = ox + dx * xx + dy * xy;
        const y = oy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        const inside = x >= 0 && y >= 0 && x < w && y < h;
        if (inside && dx * dx + dy * dy <= r2) mark(x, y);
        const isOpaque = !inside || opaque(x, y);
        if (blocked) {
          if (isOpaque) {
            newStart = rSlope;
          } else {
            blocked = false;
            start = newStart;
          }
        } else if (isOpaque && j < radius) {
          blocked = true;
          castLight(j + 1, start, lSlope, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  }
}
