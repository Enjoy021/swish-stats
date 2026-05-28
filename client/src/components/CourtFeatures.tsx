import { memo } from "react";
import { THREE_POINT_ARC_PATH } from "@/lib/court-zones";

type CourtFeaturesProps = {
  /** Stroke color for court lines. Pass "white" for dark backgrounds. */
  stroke?: string;
  /** Base stroke opacity (lines scale relative to this). */
  opacity?: number;
};

/**
 * Static half-court line drawing — outline, paint, free-throw circle, 3-pt arc,
 * basket + backboard. Memoized so it doesn't redraw on clock ticks or polling.
 * Designed for SVG viewBox="0 30 400 320".
 */
export const CourtFeatures = memo(function CourtFeatures({
  stroke = "hsl(var(--foreground))",
  opacity = 1,
}: CourtFeaturesProps) {
  const op = Math.min(1, opacity);
  return (
    <>
      {/* Court outline */}
      <rect x="20" y="30" width="360" height="320" fill="none" stroke={stroke} strokeWidth="2.5" strokeOpacity={op} />
      {/* Half-court line (top edge) */}
      <line x1="20" y1="30" x2="380" y2="30" stroke={stroke} strokeWidth="2.5" strokeOpacity={op} />
      {/* Paint */}
      <rect x="140" y="200" width="120" height="180" fill="none" stroke={stroke} strokeWidth="2" strokeOpacity={op} />
      {/* Free throw circle (dashed) */}
      <circle cx="200" cy="200" r="50" fill="none" stroke={stroke} strokeWidth="1.75" strokeOpacity={op} strokeDasharray="5 3" />
      {/* 3-point arc */}
      <path d={THREE_POINT_ARC_PATH} fill="none" stroke={stroke} strokeWidth="2.25" strokeOpacity={op} />
      {/* Basket */}
      <circle cx="200" cy="340" r="7" fill="none" stroke="hsl(17 100% 60%)" strokeWidth="2.5" />
      <rect x="176" y="347" width="48" height="4" fill={stroke} fillOpacity={Math.min(1, op * 0.7)} />
    </>
  );
});
