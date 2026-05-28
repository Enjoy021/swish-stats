// Shared shot-zone geometry used by both the live-scoring input court and
// the post-game shot chart. Coordinates are in a 400x380 SVG space with the
// basket at (200, 340) and the baseline at y=380. The 3-pt arc has radius
// 190 (≈23.75 ft @ 8 px/ft), so its apex is at (200, 150) and it meets the
// corner-3 strip at (24, 268) and (376, 268).
//
// Zones approximate the 10-region NBA/coach layout: a restricted/rim area
// plus left/right paint, left/right baseline 2, left/right elbow 2, left/
// right wing 3, and a top 3. Polygons are straight-line approximations
// (point-in-polygon hit testing); the SVG itself draws the real arc.

export type ShotZone = {
  id: string;
  label: string;
  shortLabel: string;
  points: 2 | 3;
  /** SVG path used for both the fill and the hit-test bounding polygon. */
  path: string;
  /** Vertices used for point-in-polygon (parsed from path). */
  polygon: Array<[number, number]>;
  /** Label anchor — roughly the visual centroid. */
  x: number;
  y: number;
};

function parsePathVertices(path: string): Array<[number, number]> {
  // Path uses only M and L commands plus a trailing Z. Numbers are
  // space-separated; parse them in pairs.
  const nums = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const verts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    verts.push([nums[i], nums[i + 1]]);
  }
  return verts;
}

function makeZone(
  id: string,
  label: string,
  shortLabel: string,
  points: 2 | 3,
  path: string,
  x: number,
  y: number,
): ShotZone {
  return { id, label, shortLabel, points, path, polygon: parsePathVertices(path), x, y };
}

export const COURT_ZONES: ShotZone[] = [
  // Paint subdivisions (3 zones)
  makeZone("restricted", "Restricted", "RIM", 2,
    "M 140 300 L 260 300 L 260 380 L 140 380 Z", 200, 340),
  makeZone("left-paint", "Left Paint", "L PNT", 2,
    "M 140 200 L 200 200 L 200 300 L 140 300 Z", 170, 250),
  makeZone("right-paint", "Right Paint", "R PNT", 2,
    "M 200 200 L 260 200 L 260 300 L 200 300 Z", 230, 250),

  // Inside arc, outside paint (4 zones)
  makeZone("left-baseline-2", "L Baseline 2", "L BL", 2,
    "M 24 268 L 140 268 L 140 380 L 24 380 Z", 82, 324),
  makeZone("right-baseline-2", "R Baseline 2", "R BL", 2,
    "M 260 268 L 376 268 L 376 380 L 260 380 Z", 318, 324),
  makeZone("left-elbow-2", "Left Elbow", "L ELB", 2,
    "M 24 268 L 140 268 L 140 200 L 200 200 L 200 150 L 90 200 Z", 110, 222),
  makeZone("right-elbow-2", "Right Elbow", "R ELB", 2,
    "M 200 150 L 200 200 L 260 200 L 260 268 L 376 268 L 310 200 Z", 290, 222),

  // Outside arc (5 zones — corners split from wings per real basketball)
  makeZone("left-corner-3", "Left Corner 3", "L COR", 3,
    "M 0 268 L 24 268 L 24 380 L 0 380 Z", 12, 324),
  makeZone("right-corner-3", "Right Corner 3", "R COR", 3,
    "M 376 268 L 400 268 L 400 380 L 376 380 Z", 388, 324),
  makeZone("left-wing-3", "Left Wing 3", "L 3", 3,
    "M 0 0 L 90 200 L 24 268 L 0 268 Z", 35, 150),
  makeZone("right-wing-3", "Right Wing 3", "R 3", 3,
    "M 400 0 L 400 268 L 376 268 L 310 200 Z", 365, 150),
  makeZone("top-3", "Top 3", "TOP 3", 3,
    "M 0 0 L 400 0 L 310 200 L 200 150 L 90 200 Z", 200, 80),
];

/** Standard ray-casting point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Find which zone a shot at (x, y) falls in, or null if outside all zones. */
export function getZoneForPoint(x: number, y: number): ShotZone | null {
  for (const zone of COURT_ZONES) {
    if (pointInPolygon(x, y, zone.polygon)) return zone;
  }
  return null;
}

/** SVG path string for the visually-correct 3-pt arc (real basketball proportions). */
export const THREE_POINT_ARC_PATH =
  "M 24 380 L 24 268 A 190 190 0 0 1 376 268 L 376 380";
