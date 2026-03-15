import { useMemo, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Flame, Target, X, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/hooks/use-toast";
import type { Game, Team, Player, GameEvent } from "@shared/schema";

type GameData = Game & {
  homeTeam: Team & { players: Player[] };
  awayTeam: Team & { players: Player[] };
};

type ShotZone = {
  id: string;
  label: string;
  points: 2 | 3;
  path: string;
  x: number;
  y: number;
};

const COURT_ZONES: ShotZone[] = [
  { id: "paint", label: "Paint", points: 2, path: "M 130 200 L 130 320 L 270 320 L 270 200 Z", x: 200, y: 260 },
  { id: "mid-left", label: "Mid Left", points: 2, path: "M 40 200 L 130 200 L 130 320 L 40 320 Z", x: 85, y: 260 },
  { id: "mid-right", label: "Mid Right", points: 2, path: "M 270 200 L 360 200 L 360 320 L 270 320 Z", x: 315, y: 260 },
  { id: "mid-top", label: "Mid Top", points: 2, path: "M 130 120 L 130 200 L 270 200 L 270 120 Z", x: 200, y: 160 },
  { id: "3pt-left", label: "3PT Left", points: 3, path: "M 0 120 L 40 120 L 40 380 L 0 380 Z", x: 20, y: 250 },
  { id: "3pt-right", label: "3PT Right", points: 3, path: "M 360 120 L 400 120 L 400 380 L 360 380 Z", x: 380, y: 250 },
  { id: "3pt-top-left", label: "3PT Top Left", points: 3, path: "M 40 0 L 130 0 L 130 120 L 40 120 Z", x: 85, y: 60 },
  { id: "3pt-top", label: "3PT Top", points: 3, path: "M 130 0 L 270 0 L 270 120 L 130 120 Z", x: 200, y: 60 },
  { id: "3pt-top-right", label: "3PT Top Right", points: 3, path: "M 270 0 L 360 0 L 360 120 L 270 120 Z", x: 315, y: 60 },
  { id: "3pt-corner-left", label: "3PT Corner L", points: 3, path: "M 0 0 L 40 0 L 40 120 L 0 120 Z", x: 20, y: 60 },
  { id: "3pt-corner-right", label: "3PT Corner R", points: 3, path: "M 360 0 L 400 0 L 400 120 L 360 120 Z", x: 380, y: 60 },
];

const SHOT_EVENT_TYPES = ["2pt_attempt", "2pt_made", "3pt_attempt", "3pt_made"] as const;

function isShotEvent(e: GameEvent): boolean {
  return SHOT_EVENT_TYPES.includes(e.eventType as typeof SHOT_EVENT_TYPES[number]) && !e.isDeleted;
}

function isMade(e: GameEvent): boolean {
  return e.eventType === "2pt_made" || e.eventType === "3pt_made";
}

function is3pt(e: GameEvent): boolean {
  return e.eventType === "3pt_made" || e.eventType === "3pt_attempt";
}

function pct(made: number, attempts: number): string {
  if (attempts === 0) return "—";
  return ((made / attempts) * 100).toFixed(1);
}

/** Map a shot event to the zone it falls in based on courtX/courtY */
function getZoneForShot(e: GameEvent): string | null {
  if (e.courtX == null || e.courtY == null) return null;
  const x = e.courtX;
  const y = e.courtY;
  for (const zone of COURT_ZONES) {
    if (pointInZone(x, y, zone)) return zone.id;
  }
  return null;
}

/** Simple point-in-rect test since all zones are axis-aligned rectangles */
function pointInZone(x: number, y: number, zone: ShotZone): boolean {
  // Parse the path to get bounding rect: "M x1 y1 L x2 y2 L x3 y3 L x4 y4 Z"
  const nums = zone.path.match(/[\d.]+/g)?.map(Number) || [];
  if (nums.length < 8) return false;
  const xs = [nums[0], nums[2], nums[4], nums[6]];
  const ys = [nums[1], nums[3], nums[5], nums[7]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/** Get heat map color for FG% — red (cold) → yellow → green (hot) */
function heatColor(fgPct: number): string {
  if (fgPct >= 60) return "hsla(142, 71%, 45%, 0.45)";
  if (fgPct >= 50) return "hsla(142, 71%, 45%, 0.3)";
  if (fgPct >= 40) return "hsla(45, 100%, 51%, 0.3)";
  if (fgPct >= 30) return "hsla(17, 100%, 60%, 0.3)";
  return "hsla(0, 84%, 60%, 0.3)";
}

type FilterState = {
  playerId: string | null;
  quarter: number | null;
  shotType: "all" | "2pt" | "3pt";
  result: "all" | "made" | "missed";
  teamId: string | null;
};

export default function ShotChartPage() {
  const { id: gameId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [heatMap, setHeatMap] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    playerId: null,
    quarter: null,
    shotType: "all",
    result: "all",
    teamId: null,
  });

  const { data: game, isLoading: gameLoading } = useQuery<GameData>({
    queryKey: ["/api/games", gameId],
  });

  const { data: events = [] } = useQuery<GameEvent[]>({
    queryKey: ["/api/games", gameId, "events"],
  });

  const allPlayers = useMemo(() => {
    if (!game) return [];
    return [...(game.homeTeam?.players || []), ...(game.awayTeam?.players || [])];
  }, [game]);

  const totalQuarters = useMemo(() => {
    if (!game) return 4;
    return game.gameFormat === "halves" ? 2 : 4;
  }, [game]);

  const quarterLabel = game?.gameFormat === "halves" ? "Half" : "Q";

  // All shot events
  const shotEvents = useMemo(() => events.filter(isShotEvent), [events]);

  // Filtered shots
  const filteredShots = useMemo(() => {
    return shotEvents.filter((e) => {
      if (filters.teamId && e.teamId !== filters.teamId) return false;
      if (filters.playerId && e.playerId !== filters.playerId) return false;
      if (filters.quarter !== null && e.quarter !== filters.quarter) return false;
      if (filters.shotType === "2pt" && is3pt(e)) return false;
      if (filters.shotType === "3pt" && !is3pt(e)) return false;
      if (filters.result === "made" && !isMade(e)) return false;
      if (filters.result === "missed" && isMade(e)) return false;
      return true;
    });
  }, [shotEvents, filters]);

  // Stats
  const stats = useMemo(() => {
    const fga = filteredShots.length;
    const fgm = filteredShots.filter(isMade).length;
    const tpa = filteredShots.filter(is3pt).length;
    const tpm = filteredShots.filter((e) => e.eventType === "3pt_made").length;
    const twoPa = fga - tpa;
    const twoPm = fgm - tpm;
    return { fga, fgm, tpa, tpm, twoPa, twoPm };
  }, [filteredShots]);

  // Zone stats for heat map
  const zoneStats = useMemo(() => {
    const map = new Map<string, { made: number; attempts: number }>();
    for (const zone of COURT_ZONES) {
      map.set(zone.id, { made: 0, attempts: 0 });
    }
    for (const shot of filteredShots) {
      const zoneId = getZoneForShot(shot);
      if (zoneId) {
        const s = map.get(zoneId)!;
        s.attempts++;
        if (isMade(shot)) s.made++;
      }
    }
    return map;
  }, [filteredShots]);

  const clearFilter = useCallback((key: keyof FilterState) => {
    setFilters((f) => ({ ...f, [key]: key === "shotType" || key === "result" ? "all" : null }));
  }, []);

  const hasActiveFilters = filters.playerId || filters.quarter !== null || filters.shotType !== "all" || filters.result !== "all" || filters.teamId;

  const getPlayerLabel = (playerId: string) => {
    const p = allPlayers.find((pl) => pl.id === playerId);
    return p ? `#${p.number} ${p.name.split(" ").pop()}` : playerId;
  };

  if (gameLoading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b h-14" />
        <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Game not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <Link href={`/games/${gameId}/live`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back">
              <ChevronLeft className="w-4 h-4" /> Game
            </Button>
          </Link>
          <h1 className="font-semibold text-base" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Shot Chart
          </h1>
          <div className="flex items-center gap-1">
            <Toggle
              pressed={heatMap}
              onPressedChange={setHeatMap}
              size="sm"
              className="gap-1 data-[state=on]:bg-orange-500/20 data-[state=on]:text-orange-400"
              data-testid="toggle-heatmap"
            >
              <Flame className="w-4 h-4" />
              <span className="text-xs hidden sm:inline">Heat</span>
            </Toggle>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={async () => {
                const shareText = `🏀 Shot Chart: ${game?.homeTeam?.name} vs ${game?.awayTeam?.name}`;
                const shareUrl = window.location.href;
                if (navigator.share) {
                  try {
                    await navigator.share({ title: shareText, text: shareText, url: shareUrl });
                    return;
                  } catch { /* cancelled */ }
                }
                await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                toast({ title: "Link copied to clipboard" });
              }}
              data-testid="button-share-shotchart"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {/* Score Banner */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] text-white px-4 py-3">
            <div className="flex items-center justify-center gap-4">
              <button
                className={`text-center flex-1 rounded-lg px-2 py-1 transition-colors ${filters.teamId === game.homeTeamId ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/5"}`}
                onClick={() => setFilters((f) => ({ ...f, teamId: f.teamId === game.homeTeamId ? null : game.homeTeamId, playerId: null }))}
                data-testid="filter-home-team"
              >
                <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.homeTeam?.name}</p>
                <p className="text-xl font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {events.reduce((a, e) => {
                    if (e.teamId !== game.homeTeamId || e.isDeleted) return a;
                    if (e.eventType === "2pt_made") return a + 2;
                    if (e.eventType === "3pt_made") return a + 3;
                    if (e.eventType === "ft_made") return a + 1;
                    return a;
                  }, 0)}
                </p>
              </button>
              <span className="text-white/30 text-xs">vs</span>
              <button
                className={`text-center flex-1 rounded-lg px-2 py-1 transition-colors ${filters.teamId === game.awayTeamId ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/5"}`}
                onClick={() => setFilters((f) => ({ ...f, teamId: f.teamId === game.awayTeamId ? null : game.awayTeamId, playerId: null }))}
                data-testid="filter-away-team"
              >
                <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.awayTeam?.name}</p>
                <p className="text-xl font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {events.reduce((a, e) => {
                    if (e.teamId !== game.awayTeamId || e.isDeleted) return a;
                    if (e.eventType === "2pt_made") return a + 2;
                    if (e.eventType === "3pt_made") return a + 3;
                    if (e.eventType === "ft_made") return a + 1;
                    return a;
                  }, 0)}
                </p>
              </button>
            </div>
          </div>
        </Card>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-1.5" data-testid="filter-bar">
          {/* Quarter filter */}
          {Array.from({ length: totalQuarters }, (_, i) => i + 1).map((q) => (
            <Badge
              key={`q${q}`}
              variant={filters.quarter === q ? "default" : "outline"}
              className="cursor-pointer text-xs h-7 px-2.5"
              onClick={() => setFilters((f) => ({ ...f, quarter: f.quarter === q ? null : q }))}
              data-testid={`filter-quarter-${q}`}
            >
              {quarterLabel}{q}
            </Badge>
          ))}
          <span className="w-px h-7 bg-border" />
          {/* Shot type */}
          <Badge
            variant={filters.shotType === "2pt" ? "default" : "outline"}
            className="cursor-pointer text-xs h-7 px-2.5"
            onClick={() => setFilters((f) => ({ ...f, shotType: f.shotType === "2pt" ? "all" : "2pt" }))}
            data-testid="filter-2pt"
          >
            2PT
          </Badge>
          <Badge
            variant={filters.shotType === "3pt" ? "default" : "outline"}
            className="cursor-pointer text-xs h-7 px-2.5"
            onClick={() => setFilters((f) => ({ ...f, shotType: f.shotType === "3pt" ? "all" : "3pt" }))}
            data-testid="filter-3pt"
          >
            3PT
          </Badge>
          <span className="w-px h-7 bg-border" />
          {/* Result */}
          <Badge
            variant={filters.result === "made" ? "default" : "outline"}
            className="cursor-pointer text-xs h-7 px-2.5"
            onClick={() => setFilters((f) => ({ ...f, result: f.result === "made" ? "all" : "made" }))}
            data-testid="filter-made"
          >
            <Target className="w-3 h-3 mr-1" />Made
          </Badge>
          <Badge
            variant={filters.result === "missed" ? "default" : "outline"}
            className="cursor-pointer text-xs h-7 px-2.5"
            onClick={() => setFilters((f) => ({ ...f, result: f.result === "missed" ? "all" : "missed" }))}
            data-testid="filter-missed"
          >
            <X className="w-3 h-3 mr-1" />Miss
          </Badge>
        </div>

        {/* Player filter chips (show when a team is selected) */}
        {filters.teamId && (
          <div className="flex flex-wrap gap-1.5" data-testid="filter-players">
            {(filters.teamId === game.homeTeamId ? game.homeTeam?.players : game.awayTeam?.players)
              ?.filter((p) => p.isActive)
              .sort((a, b) => a.number - b.number)
              .map((p) => (
                <Badge
                  key={p.id}
                  variant={filters.playerId === p.id ? "default" : "outline"}
                  className="cursor-pointer text-xs h-7 px-2.5"
                  onClick={() => setFilters((f) => ({ ...f, playerId: f.playerId === p.id ? null : p.id }))}
                  data-testid={`filter-player-${p.id}`}
                >
                  #{p.number} {p.name.split(" ").pop()}
                </Badge>
              ))}
          </div>
        )}

        {/* Active filter summary */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Showing:</span>
            <div className="flex flex-wrap gap-1">
              {filters.teamId && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {filters.teamId === game.homeTeamId ? game.homeTeam?.name : game.awayTeam?.name}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => { clearFilter("teamId"); clearFilter("playerId"); }} />
                </Badge>
              )}
              {filters.playerId && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {getPlayerLabel(filters.playerId)}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => clearFilter("playerId")} />
                </Badge>
              )}
              {filters.quarter !== null && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {quarterLabel}{filters.quarter}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => clearFilter("quarter")} />
                </Badge>
              )}
              {filters.shotType !== "all" && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {filters.shotType.toUpperCase()}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => clearFilter("shotType")} />
                </Badge>
              )}
              {filters.result !== "all" && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {filters.result}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => clearFilter("result")} />
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] h-5 px-1.5 text-muted-foreground"
              onClick={() => setFilters({ playerId: null, quarter: null, shotType: "all", result: "all", teamId: null })}
              data-testid="clear-all-filters"
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Court SVG with shots */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-b from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] p-3">
            <svg
              viewBox="0 0 400 380"
              className="w-full"
              style={{ maxHeight: "320px" }}
              data-testid="shot-chart-court"
            >
              {/* Court background */}
              <rect x="0" y="0" width="400" height="380" fill="hsl(25, 40%, 28%)" rx="4" />

              {/* Heat map zones (behind court lines) */}
              {heatMap && COURT_ZONES.map((zone) => {
                const zs = zoneStats.get(zone.id);
                const fgPct = zs && zs.attempts > 0 ? (zs.made / zs.attempts) * 100 : -1;
                return (
                  <path
                    key={`heat-${zone.id}`}
                    d={zone.path}
                    fill={fgPct >= 0 ? heatColor(fgPct) : "transparent"}
                  />
                );
              })}

              {/* Court lines */}
              <rect x="20" y="0" width="360" height="380" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
              {/* Half court line */}
              <line x1="20" y1="0" x2="380" y2="0" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
              {/* Paint */}
              <rect x="140" y="220" width="120" height="160" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.35" />
              {/* Free throw circle */}
              <circle cx="200" cy="220" r="60" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
              {/* 3-point arc */}
              <path d="M 40 380 L 40 160 Q 40 20 200 20 Q 360 20 360 160 L 360 380" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.35" />
              {/* Basket */}
              <circle cx="200" cy="340" r="8" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
              <rect x="185" y="348" width="30" height="2" fill="white" fillOpacity="0.3" />

              {/* Heat map zone labels */}
              {heatMap && COURT_ZONES.map((zone) => {
                const zs = zoneStats.get(zone.id);
                if (!zs || zs.attempts === 0) return null;
                const fgPct = (zs.made / zs.attempts) * 100;
                return (
                  <g key={`heat-label-${zone.id}`}>
                    <text
                      x={zone.x}
                      y={zone.y - 6}
                      textAnchor="middle"
                      fill="white"
                      fontSize="13"
                      fontWeight="700"
                      opacity="0.95"
                    >
                      {fgPct.toFixed(0)}%
                    </text>
                    <text
                      x={zone.x}
                      y={zone.y + 10}
                      textAnchor="middle"
                      fill="white"
                      fontSize="9"
                      opacity="0.6"
                    >
                      {zs.made}/{zs.attempts}
                    </text>
                  </g>
                );
              })}

              {/* Shot plots (only when not in heat map mode) */}
              {!heatMap && filteredShots.map((shot) => {
                if (shot.courtX == null || shot.courtY == null) return null;
                const made = isMade(shot);
                return made ? (
                  <circle
                    key={shot.id}
                    cx={shot.courtX}
                    cy={shot.courtY}
                    r="6"
                    fill="hsl(142, 71%, 45%)"
                    fillOpacity="0.85"
                    stroke="white"
                    strokeWidth="0.5"
                    strokeOpacity="0.5"
                  />
                ) : (
                  <g key={shot.id}>
                    <line
                      x1={shot.courtX - 4}
                      y1={shot.courtY - 4}
                      x2={shot.courtX + 4}
                      y2={shot.courtY + 4}
                      stroke="hsl(0, 84%, 60%)"
                      strokeWidth="2"
                      strokeOpacity="0.85"
                    />
                    <line
                      x1={shot.courtX + 4}
                      y1={shot.courtY - 4}
                      x2={shot.courtX - 4}
                      y2={shot.courtY + 4}
                      stroke="hsl(0, 84%, 60%)"
                      strokeWidth="2"
                      strokeOpacity="0.85"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-2">
              {!heatMap ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="hsl(142, 71%, 45%)" /></svg>
                    <span className="text-[10px] text-white/60">Made</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12">
                      <line x1="2" y1="2" x2="10" y2="10" stroke="hsl(0, 84%, 60%)" strokeWidth="2" />
                      <line x1="10" y1="2" x2="2" y2="10" stroke="hsl(0, 84%, 60%)" strokeWidth="2" />
                    </svg>
                    <span className="text-[10px] text-white/60">Missed</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "hsla(0, 84%, 60%, 0.3)" }} />
                    <span className="text-[10px] text-white/60">&lt;30%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "hsla(17, 100%, 60%, 0.3)" }} />
                    <span className="text-[10px] text-white/60">30-39%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "hsla(45, 100%, 51%, 0.3)" }} />
                    <span className="text-[10px] text-white/60">40-49%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "hsla(142, 71%, 45%, 0.35)" }} />
                    <span className="text-[10px] text-white/60">50%+</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Summary Stats Bar */}
        <div className="grid grid-cols-3 gap-2" data-testid="stats-summary">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">FG</p>
              <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {stats.fga > 0 ? `${pct(stats.fgm, stats.fga)}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{stats.fgm}/{stats.fga}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">2PT</p>
              <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {stats.twoPa > 0 ? `${pct(stats.twoPm, stats.twoPa)}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{stats.twoPm}/{stats.twoPa}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">3PT</p>
              <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {stats.tpa > 0 ? `${pct(stats.tpm, stats.tpa)}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{stats.tpm}/{stats.tpa}</p>
            </CardContent>
          </Card>
        </div>

        {/* Shot breakdown by zone */}
        {filteredShots.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Zone Breakdown
              </h3>
              <div className="space-y-2">
                {COURT_ZONES.map((zone) => {
                  const zs = zoneStats.get(zone.id);
                  if (!zs || zs.attempts === 0) return null;
                  const fgPct = (zs.made / zs.attempts) * 100;
                  return (
                    <div key={zone.id} className="flex items-center gap-2" data-testid={`zone-stat-${zone.id}`}>
                      <span className="text-xs text-muted-foreground w-24 truncate">{zone.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${fgPct}%`,
                            background: fgPct >= 50 ? "hsl(142, 71%, 45%)" : fgPct >= 35 ? "hsl(45, 100%, 51%)" : "hsl(0, 84%, 60%)",
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-12 text-right">
                        {fgPct.toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-10">
                        {zs.made}/{zs.attempts}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {filteredShots.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Target className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No shots match the current filters</p>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-xs underline"
                  onClick={() => setFilters({ playerId: null, quarter: null, shotType: "all", result: "all", teamId: null })}
                >
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation Links */}
        <div className="flex gap-2">
          <Link href={`/games/${gameId}/live`} className="flex-1">
            <Button variant="outline" className="w-full text-xs h-10" data-testid="nav-live">
              Live Scoring
            </Button>
          </Link>
          <Link href={`/games/${gameId}/boxscore`} className="flex-1">
            <Button variant="outline" className="w-full text-xs h-10" data-testid="nav-boxscore">
              Box Score
            </Button>
          </Link>
        </div>

        <footer className="text-center py-4">
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </footer>
      </div>
    </div>
  );
}
