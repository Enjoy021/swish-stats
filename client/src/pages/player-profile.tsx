import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, TrendingUp, Trophy, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { exportPlayerStatsCsv } from "@/lib/csv-export";
import type { Player, Team, PlayerBoxScore } from "@shared/schema";

interface GameResult {
  gameId: string;
  date: string;
  opponent: string;
  result: string;
  stats: PlayerBoxScore;
}

interface PlayerStatsResponse {
  player: Player;
  team: Team;
  games: GameResult[];
  seasonAverages: {
    gamesPlayed: number;
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    topg: number;
    fgPct: number;
    threePct: number;
    ftPct: number;
    eff: number;
  };
}

function pct(made: number, attempts: number): string {
  if (attempts === 0) return "—";
  return ((made / attempts) * 100).toFixed(1);
}

function calcEff(p: PlayerBoxScore): number {
  return p.points - (p.fga - p.fgm) - (p.fta - p.ftm) + p.reb + p.ast - p.to + p.stl + p.blk;
}

export default function PlayerProfilePage() {
  const { id: playerId } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<PlayerStatsResponse>({
    queryKey: ["/api/players", playerId, "stats"],
  });

  const careerHighs = useMemo(() => {
    if (!data || data.games.length < 2) return null;
    let maxPts = 0, maxReb = 0, maxAst = 0, maxStl = 0, maxBlk = 0;
    let ptsGame = "", rebGame = "", astGame = "", stlGame = "", blkGame = "";
    for (const g of data.games) {
      if (g.stats.points > maxPts) { maxPts = g.stats.points; ptsGame = g.opponent; }
      if (g.stats.reb > maxReb) { maxReb = g.stats.reb; rebGame = g.opponent; }
      if (g.stats.ast > maxAst) { maxAst = g.stats.ast; astGame = g.opponent; }
      if (g.stats.stl > maxStl) { maxStl = g.stats.stl; stlGame = g.opponent; }
      if (g.stats.blk > maxBlk) { maxBlk = g.stats.blk; blkGame = g.opponent; }
    }
    return [
      { label: "Points", value: maxPts, vs: ptsGame },
      { label: "Rebounds", value: maxReb, vs: rebGame },
      { label: "Assists", value: maxAst, vs: astGame },
      { label: "Steals", value: maxStl, vs: stlGame },
      { label: "Blocks", value: maxBlk, vs: blkGame },
    ].filter((h) => h.value > 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b h-14" />
        <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Player not found</p>
      </div>
    );
  }

  const { player, team, games, seasonAverages } = data;

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <Link href={`/teams/${team.id}`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back">
              <ChevronLeft className="w-4 h-4" /> {team.name}
            </Button>
          </Link>
          <h1 className="font-semibold text-base" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Player Profile
          </h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Player Header Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] text-white p-5">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full bg-[hsl(17,100%,60%)]/20 border-2 border-[hsl(17,100%,60%)]/40 flex items-center justify-center flex-shrink-0"
                data-testid="player-avatar"
              >
                <span className="text-2xl font-bold text-[hsl(17,100%,60%)]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {player.number}
                </span>
              </div>
              <div className="min-w-0">
                <h2
                  className="text-xl font-bold truncate"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                  data-testid="player-name"
                >
                  {player.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white/60 text-sm">{team.name}</span>
                  <span className="text-white/30">|</span>
                  <Badge variant="outline" className="border-white/20 text-white/70 text-[10px] h-5">
                    {player.position}
                  </Badge>
                </div>
                <p className="text-[10px] text-white/40 mt-1 tabular-nums">
                  {seasonAverages.gamesPlayed} game{seasonAverages.gamesPlayed !== 1 ? "s" : ""} played
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Season Averages — Primary */}
        {seasonAverages.gamesPlayed > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2" data-testid="stats-primary">
              <StatCard label="PPG" value={seasonAverages.ppg} accent />
              <StatCard label="RPG" value={seasonAverages.rpg} />
              <StatCard label="APG" value={seasonAverages.apg} />
            </div>

            {/* Season Averages — Secondary */}
            <div className="grid grid-cols-4 gap-2" data-testid="stats-secondary">
              <StatCardSmall label="SPG" value={seasonAverages.spg} />
              <StatCardSmall label="BPG" value={seasonAverages.bpg} />
              <StatCardSmall label="TOPG" value={seasonAverages.topg} />
              <StatCardSmall label="EFF" value={seasonAverages.eff} />
            </div>

            {/* Shooting Percentages */}
            <div className="grid grid-cols-3 gap-2" data-testid="stats-shooting">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">FG%</p>
                  <p className="text-base font-bold tabular-nums mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {seasonAverages.fgPct > 0 ? `${seasonAverages.fgPct}%` : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">3P%</p>
                  <p className="text-base font-bold tabular-nums mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {seasonAverages.threePct > 0 ? `${seasonAverages.threePct}%` : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">FT%</p>
                  <p className="text-base font-bold tabular-nums mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {seasonAverages.ftPct > 0 ? `${seasonAverages.ftPct}%` : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Career Highs */}
        {careerHighs && careerHighs.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-[hsl(17,100%,60%)]" />
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Career Highs</h3>
              </div>
              <div className="grid grid-cols-5 gap-2" data-testid="career-highs">
                {careerHighs.map((h) => (
                  <div key={h.label} className="text-center">
                    <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {h.value}
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">{h.label.slice(0, 3)}</p>
                    <p className="text-[9px] text-muted-foreground/60 truncate">vs {h.vs}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game Log */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[hsl(17,100%,60%)]" />
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Game Log</h3>
              </div>
              {games.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground h-7"
                  onClick={() => {
                    exportPlayerStatsCsv(player.name, games);
                    toast({ title: "CSV downloaded" });
                  }}
                  data-testid="button-export-player-csv"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span className="text-xs">CSV</span>
                </Button>
              )}
            </div>

            {games.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No game data yet</p>
            ) : (
              <ScrollArea className="w-full">
                <div className="min-w-[600px]">
                  <table className="w-full text-xs" data-testid="game-log-table">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 px-1.5 text-left font-semibold text-muted-foreground text-[10px] uppercase tracking-wider w-[100px] sticky left-0 bg-card z-10">Game</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider w-[55px]">Result</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">PTS</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">REB</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">AST</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">STL</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">BLK</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">FG</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">3PT</th>
                        <th className="py-2 px-1.5 text-center font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">EFF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {games.map((g) => {
                        const isWin = g.result.startsWith("W");
                        const eff = calcEff(g.stats);
                        return (
                          <tr
                            key={g.gameId}
                            className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                            data-testid={`game-row-${g.gameId}`}
                          >
                            <td className="py-2 px-1.5 sticky left-0 bg-card z-10">
                              <Link href={`/games/${g.gameId}/boxscore`}>
                                <div>
                                  <span className="font-medium text-foreground">vs {g.opponent}</span>
                                  {g.date && <p className="text-[9px] text-muted-foreground">{g.date}</p>}
                                </div>
                              </Link>
                            </td>
                            <td className="py-2 px-1.5 text-center">
                              <Badge
                                variant={isWin ? "default" : "outline"}
                                className={`text-[9px] h-5 px-1.5 ${isWin ? "bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,40%)] text-white" : "text-destructive border-destructive/30"}`}
                              >
                                {g.result}
                              </Badge>
                            </td>
                            <td className="py-2 px-1.5 text-center font-bold">{g.stats.points}</td>
                            <td className="py-2 px-1.5 text-center">{g.stats.reb}</td>
                            <td className="py-2 px-1.5 text-center">{g.stats.ast}</td>
                            <td className="py-2 px-1.5 text-center">{g.stats.stl}</td>
                            <td className="py-2 px-1.5 text-center">{g.stats.blk}</td>
                            <td className="py-2 px-1.5 text-center text-muted-foreground">
                              {g.stats.fgm}-{g.stats.fga}
                              <span className="text-[9px] ml-0.5">({pct(g.stats.fgm, g.stats.fga) === "—" ? "—" : `${pct(g.stats.fgm, g.stats.fga)}%`})</span>
                            </td>
                            <td className="py-2 px-1.5 text-center text-muted-foreground">
                              {g.stats.threePm}-{g.stats.threePa}
                            </td>
                            <td className={`py-2 px-1.5 text-center font-medium ${eff > 0 ? "text-[hsl(142,71%,45%)]" : eff < 0 ? "text-destructive" : ""}`}>
                              {eff}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* No games empty state */}
        {seasonAverages.gamesPlayed === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No game stats yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Stats will appear once this player records activity in a game</p>
            </CardContent>
          </Card>
        )}

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

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className={accent ? "ring-1 ring-[hsl(17,100%,60%)]/30" : ""}>
      <CardContent className="p-3 text-center">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p
          className={`text-2xl font-bold tabular-nums mt-0.5 ${accent ? "text-[hsl(17,100%,60%)]" : ""}`}
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StatCardSmall({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-2 text-center">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold tabular-nums mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
