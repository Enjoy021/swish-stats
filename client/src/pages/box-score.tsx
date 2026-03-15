import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Share2, Copy, Check, Crosshair, ListChecks, BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { exportBoxScoreCsv } from "@/lib/csv-export";
import type { Game, Team, Player, GameEvent, TeamBoxScore, PlayerBoxScore } from "@shared/schema";

interface AdvancedTeamStats {
  pointsInPaint: number;
  secondChancePoints: number;
  fastBreakPoints: number;
  benchPoints: number;
  largestLead: number;
}

interface AdvancedStatsResponse {
  home: AdvancedTeamStats;
  away: AdvancedTeamStats;
  leadChanges: number;
  timesTied: number;
  largestRun: number;
}

type GameData = Game & {
  homeTeam: Team & { players: Player[] };
  awayTeam: Team & { players: Player[] };
};

function pct(made: number, attempts: number): string {
  if (attempts === 0) return "—";
  return ((made / attempts) * 100).toFixed(1);
}

function pctNum(made: number, attempts: number): number {
  if (attempts === 0) return 0;
  return (made / attempts) * 100;
}

function calcEff(p: PlayerBoxScore): number {
  return p.points - (p.fga - p.fgm) - (p.fta - p.ftm) + p.reb + p.ast - p.to + p.stl + p.blk;
}

// Calculate minutes from substitution events
function calcMinutes(events: GameEvent[], playerId: string, periodLength: number, totalPeriods: number): number {
  const sorted = [...events].reverse(); // chronological order
  let totalSeconds = 0;
  let isOnCourt = false;
  let lastSubInClock = periodLength * 60;

  for (const e of sorted) {
    if (e.playerId !== playerId) continue;
    if (e.eventType === "substitution_in") {
      isOnCourt = true;
      lastSubInClock = e.gameClockSeconds || periodLength * 60;
    } else if (e.eventType === "substitution_out") {
      if (isOnCourt) {
        const outClock = e.gameClockSeconds || 0;
        totalSeconds += Math.max(0, lastSubInClock - outClock);
      }
      isOnCourt = false;
    }
  }

  // If still on court at end, add remaining time
  if (isOnCourt) {
    totalSeconds += lastSubInClock;
  }

  return Math.round(totalSeconds / 60);
}

export default function BoxScorePage() {
  const { id: gameId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("home");

  const { data: game, isLoading: gameLoading } = useQuery<GameData>({
    queryKey: ["/api/games", gameId],
  });

  const { data: events = [] } = useQuery<GameEvent[]>({
    queryKey: ["/api/games", gameId, "events"],
  });

  const { data: homeBoxScore, isLoading: homeLoading } = useQuery<TeamBoxScore>({
    queryKey: ["/api/games", gameId, "boxscore", game?.homeTeamId],
    enabled: !!game?.homeTeamId,
  });

  const { data: awayBoxScore, isLoading: awayLoading } = useQuery<TeamBoxScore>({
    queryKey: ["/api/games", gameId, "boxscore", game?.awayTeamId],
    enabled: !!game?.awayTeamId,
  });

  const { data: advancedStats } = useQuery<AdvancedStatsResponse>({
    queryKey: ["/api/games", gameId, "advanced-stats"],
    enabled: !!game,
  });

  // Calculate score from events
  const homeScore = events.reduce((acc, e) => {
    if (e.teamId !== game?.homeTeamId) return acc;
    if (e.eventType === '2pt_made') return acc + 2;
    if (e.eventType === '3pt_made') return acc + 3;
    if (e.eventType === 'ft_made') return acc + 1;
    return acc;
  }, 0);

  const awayScore = events.reduce((acc, e) => {
    if (e.teamId !== game?.awayTeamId) return acc;
    if (e.eventType === '2pt_made') return acc + 2;
    if (e.eventType === '3pt_made') return acc + 3;
    if (e.eventType === 'ft_made') return acc + 1;
    return acc;
  }, 0);

  // Calculate minutes for all players
  const playerMinutes = useMemo(() => {
    if (!game || !events.length) return new Map<string, number>();
    const mins = new Map<string, number>();
    const allPlayers = [...(game.homeTeam?.players || []), ...(game.awayTeam?.players || [])];
    const totalPeriods = game.gameFormat === "halves" ? 2 : 4;
    for (const p of allPlayers) {
      mins.set(p.id, calcMinutes(events, p.id, game.periodLength || 10, totalPeriods));
    }
    return mins;
  }, [events, game]);

  const handleExportCsv = () => {
    const bs = activeTab === "away" ? awayBoxScore : homeBoxScore;
    if (!bs) return;
    exportBoxScoreCsv(bs.teamName, bs.players, bs.totals);
    toast({ title: "CSV downloaded" });
  };

  const handleShare = async () => {
    if (!homeBoxScore || !awayBoxScore || !game) return;

    const shareText = `🏀 ${game.homeTeam?.name} ${homeScore} - ${awayScore} ${game.awayTeam?.name}`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, text: shareText, url: shareUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    copyBoxScore();
  };

  const copyBoxScore = () => {
    if (!homeBoxScore || !awayBoxScore || !game) return;

    const formatTeam = (bs: TeamBoxScore) => {
      const header = "Player          PTS  FG     3PT    FT     REB AST STL BLK TO  PF  EFF";
      const divider = "─".repeat(header.length);
      const rows = bs.players
        .sort((a, b) => b.points - a.points)
        .map(p => {
          const name = `#${p.playerNumber} ${p.playerName}`.padEnd(16).slice(0, 16);
          const eff = calcEff(p);
          return `${name}${p.points.toString().padStart(3)}  ${p.fgm}-${p.fga}`.padEnd(27) +
            `${p.threePm}-${p.threePa}`.padEnd(7) +
            `${p.ftm}-${p.fta}`.padEnd(7) +
            `${p.reb.toString().padStart(3)} ${p.ast.toString().padStart(3)} ${p.stl.toString().padStart(3)} ${p.blk.toString().padStart(3)} ${p.to.toString().padStart(3)} ${p.pf.toString().padStart(3)} ${eff.toString().padStart(4)}`;
        });
      const totals = `${"TOTALS".padEnd(16)}${bs.totals.points.toString().padStart(3)}  ${bs.totals.fgm}-${bs.totals.fga}`.padEnd(27) +
        `${bs.totals.threePm}-${bs.totals.threePa}`.padEnd(7) +
        `${bs.totals.ftm}-${bs.totals.fta}`.padEnd(7) +
        `${bs.totals.reb.toString().padStart(3)} ${bs.totals.ast.toString().padStart(3)} ${bs.totals.stl.toString().padStart(3)} ${bs.totals.blk.toString().padStart(3)} ${bs.totals.to.toString().padStart(3)} ${bs.totals.pf.toString().padStart(3)}`;
      
      return `${bs.teamName}\n${divider}\n${header}\n${divider}\n${rows.join("\n")}\n${divider}\n${totals}`;
    };

    const text = `🏀 ${game.homeTeam?.name} ${homeScore} - ${awayScore} ${game.awayTeam?.name}\n${game.venue ? game.venue + " • " : ""}${game.gameDate || ""}\n${"═".repeat(50)}\n\n${formatTeam(homeBoxScore)}\n\n${formatTeam(awayBoxScore)}\n\nFG%: ${pct(homeBoxScore.totals.fgm, homeBoxScore.totals.fga)}% / ${pct(awayBoxScore.totals.fgm, awayBoxScore.totals.fga)}%\n3PT%: ${pct(homeBoxScore.totals.threePm, homeBoxScore.totals.threePa)}% / ${pct(awayBoxScore.totals.threePm, awayBoxScore.totals.threePa)}%\nFT%: ${pct(homeBoxScore.totals.ftm, homeBoxScore.totals.fta)}% / ${pct(awayBoxScore.totals.ftm, awayBoxScore.totals.fta)}%`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Box score copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Could not copy", variant: "destructive" });
    });
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const res = await fetch(`${API_BASE}/api/games/${gameId}/report/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `game-report-${gameId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded" });
    } catch {
      toast({ title: "Failed to download PDF", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  if (gameLoading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b h-14" />
        <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
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
          <Link href={game.status === 'completed' ? '/' : `/games/${gameId}/live`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back">
              <ChevronLeft className="w-4 h-4" /> {game.status === 'completed' ? 'Home' : 'Game'}
            </Button>
          </Link>
          <h1 className="font-semibold text-base" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Box Score
          </h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={handleExportCsv}
              data-testid="button-export-csv"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="text-xs">CSV</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={handleDownloadPdf}
              disabled={downloading}
              data-testid="button-download-pdf"
            >
              <Download className={`w-4 h-4 ${downloading ? "animate-pulse" : ""}`} />
              <span className="text-xs">{downloading ? "..." : "PDF"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={handleShare}
              data-testid="button-share-game"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
              <span className="text-xs">{copied ? "Copied" : "Share"}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Score Summary */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] text-white p-4">
            <div className="flex items-center justify-center gap-6">
              <div className="text-center flex-1">
                <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.homeTeam?.name}</p>
                <p className="text-3xl font-bold tabular-nums mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="text-home-final-score">
                  {homeScore}
                </p>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-white/30 text-sm">—</span>
                <span className={`text-[9px] mt-1 px-2 py-0.5 rounded-full ${
                  game.status === 'completed' ? 'bg-white/10 text-white/60' : 'bg-green-500/20 text-green-300'
                }`}>
                  {game.status === 'completed' ? 'FINAL' : game.status?.toUpperCase()}
                </span>
              </div>
              <div className="text-center flex-1">
                <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.awayTeam?.name}</p>
                <p className="text-3xl font-bold tabular-nums mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="text-away-final-score">
                  {awayScore}
                </p>
              </div>
            </div>
            {game.venue && (
              <p className="text-[10px] text-white/40 text-center mt-2">{game.venue} • {game.gameDate}</p>
            )}
          </div>
        </Card>

        {/* Shooting Summary */}
        {homeBoxScore && awayBoxScore && (
          <div className="grid grid-cols-3 gap-2">
            <ShootingCard label="FG%" home={pct(homeBoxScore.totals.fgm, homeBoxScore.totals.fga)} away={pct(awayBoxScore.totals.fgm, awayBoxScore.totals.fga)} sub={`${homeBoxScore.totals.fgm}-${homeBoxScore.totals.fga} / ${awayBoxScore.totals.fgm}-${awayBoxScore.totals.fga}`} />
            <ShootingCard label="3PT%" home={pct(homeBoxScore.totals.threePm, homeBoxScore.totals.threePa)} away={pct(awayBoxScore.totals.threePm, awayBoxScore.totals.threePa)} sub={`${homeBoxScore.totals.threePm}-${homeBoxScore.totals.threePa} / ${awayBoxScore.totals.threePm}-${awayBoxScore.totals.threePa}`} />
            <ShootingCard label="FT%" home={pct(homeBoxScore.totals.ftm, homeBoxScore.totals.fta)} away={pct(awayBoxScore.totals.ftm, awayBoxScore.totals.fta)} sub={`${homeBoxScore.totals.ftm}-${homeBoxScore.totals.fta} / ${awayBoxScore.totals.ftm}-${awayBoxScore.totals.fta}`} />
          </div>
        )}

        {/* Box Score Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="home" data-testid="tab-boxscore-home">{game.homeTeam?.name || "Home"}</TabsTrigger>
            <TabsTrigger value="away" data-testid="tab-boxscore-away">{game.awayTeam?.name || "Away"}</TabsTrigger>
            <TabsTrigger value="advanced" data-testid="tab-boxscore-advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="mt-3">
            {homeLoading ? (
              <Skeleton className="h-48 rounded-xl" />
            ) : homeBoxScore ? (
              <BoxScoreTable boxScore={homeBoxScore} playerMinutes={playerMinutes} />
            ) : null}
          </TabsContent>

          <TabsContent value="away" className="mt-3">
            {awayLoading ? (
              <Skeleton className="h-48 rounded-xl" />
            ) : awayBoxScore ? (
              <BoxScoreTable boxScore={awayBoxScore} playerMinutes={playerMinutes} />
            ) : null}
          </TabsContent>

          <TabsContent value="advanced" className="mt-3">
            {advancedStats && homeBoxScore && awayBoxScore ? (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Advanced Stats</h3>
                  <div className="space-y-3">
                    <ComparisonRow label="Pts in Paint" home={advancedStats.home.pointsInPaint} away={advancedStats.away.pointsInPaint} />
                    <ComparisonRow label="2nd Chance" home={advancedStats.home.secondChancePoints} away={advancedStats.away.secondChancePoints} />
                    <ComparisonRow label="Bench Pts" home={advancedStats.home.benchPoints} away={advancedStats.away.benchPoints} />
                    <ComparisonRow label="Fast Break" home={advancedStats.home.fastBreakPoints} away={advancedStats.away.fastBreakPoints} />
                    <ComparisonRow label="Largest Lead" home={advancedStats.home.largestLead} away={advancedStats.away.largestLead} />
                  </div>
                  <div className="mt-4 pt-3 border-t border-border space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Lead Changes</span>
                      <span className="font-bold tabular-nums">{advancedStats.leadChanges}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Times Tied</span>
                      <span className="font-bold tabular-nums">{advancedStats.timesTied}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Largest Run</span>
                      <span className="font-bold tabular-nums">{advancedStats.largestRun}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Skeleton className="h-48 rounded-xl" />
            )}
          </TabsContent>
        </Tabs>

        {/* Team Comparison */}
        {homeBoxScore && awayBoxScore && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Team Comparison</h3>
              <div className="space-y-3">
                <ComparisonRow label="FG%" home={pct(homeBoxScore.totals.fgm, homeBoxScore.totals.fga)} away={pct(awayBoxScore.totals.fgm, awayBoxScore.totals.fga)} />
                <ComparisonRow label="3PT%" home={pct(homeBoxScore.totals.threePm, homeBoxScore.totals.threePa)} away={pct(awayBoxScore.totals.threePm, awayBoxScore.totals.threePa)} />
                <ComparisonRow label="FT%" home={pct(homeBoxScore.totals.ftm, homeBoxScore.totals.fta)} away={pct(awayBoxScore.totals.ftm, awayBoxScore.totals.fta)} />
                <ComparisonRow label="Points" home={homeBoxScore.totals.points} away={awayBoxScore.totals.points} />
                <ComparisonRow label="Rebounds" home={homeBoxScore.totals.reb} away={awayBoxScore.totals.reb} />
                <ComparisonRow label="Assists" home={homeBoxScore.totals.ast} away={awayBoxScore.totals.ast} />
                <ComparisonRow label="Steals" home={homeBoxScore.totals.stl} away={awayBoxScore.totals.stl} />
                <ComparisonRow label="Blocks" home={homeBoxScore.totals.blk} away={awayBoxScore.totals.blk} />
                <ComparisonRow label="Turnovers" home={homeBoxScore.totals.to} away={awayBoxScore.totals.to} isLowerBetter />
                <ComparisonRow label="Fouls" home={homeBoxScore.totals.pf} away={awayBoxScore.totals.pf} isLowerBetter />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Links */}
        <div className="flex gap-2">
          <Link href={`/games/${gameId}/shotchart`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid="link-shotchart">
              <Crosshair className="w-3.5 h-3.5" /> Shot Chart
            </Button>
          </Link>
          <Link href={`/games/${gameId}/review`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid="link-review">
              <ListChecks className="w-3.5 h-3.5" /> Game Review
            </Button>
          </Link>
        </div>

        {/* Back to game / Attribution */}
        {game.status !== 'completed' && (
          <Link href={`/games/${gameId}/live`}>
            <Button variant="outline" className="w-full" data-testid="button-back-to-game">
              Back to Live Scoring
            </Button>
          </Link>
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

function ShootingCard({ label, home, away, sub }: { label: string; home: string; away: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-sm font-bold text-primary">{home === "—" ? "—" : `${home}%`}</span>
          <span className="text-[10px] text-muted-foreground">/</span>
          <span className="text-sm font-bold text-secondary">{away === "—" ? "—" : `${away}%`}</span>
        </div>
        <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function BoxScoreTable({ boxScore, playerMinutes }: { boxScore: TeamBoxScore; playerMinutes: Map<string, number> }) {
  const columns = [
    { key: "player", label: "Player", sticky: true },
    { key: "min", label: "MIN" },
    { key: "pts", label: "PTS" },
    { key: "fgma", label: "FG" },
    { key: "fgpct", label: "FG%" },
    { key: "3pma", label: "3PT" },
    { key: "3ppct", label: "3P%" },
    { key: "ftma", label: "FT" },
    { key: "ftpct", label: "FT%" },
    { key: "oreb", label: "OR" },
    { key: "dreb", label: "DR" },
    { key: "reb", label: "REB" },
    { key: "ast", label: "AST" },
    { key: "stl", label: "STL" },
    { key: "blk", label: "BLK" },
    { key: "to", label: "TO" },
    { key: "pf", label: "PF" },
    { key: "eff", label: "EFF" },
  ];

  const sortedPlayers = [...boxScore.players].sort((a, b) => b.points - a.points);

  // Team totals
  const totalEff = sortedPlayers.reduce((s, p) => s + calcEff(p), 0);
  const totalMins = sortedPlayers.reduce((s, p) => s + (playerMinutes.get(p.playerId) || 0), 0);

  return (
    <Card>
      <ScrollArea className="w-full">
        <div className="min-w-[700px]">
          <table className="w-full text-xs" data-testid="table-boxscore">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-2 px-1.5 text-left font-semibold text-muted-foreground text-[10px] uppercase tracking-wider ${
                      col.key === "player" ? "w-[110px] sticky left-0 bg-card z-10" : "w-[40px] text-center"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p) => {
                const eff = calcEff(p);
                const mins = playerMinutes.get(p.playerId) || 0;
                return (
                  <tr key={p.playerId} className="border-b border-border/50 hover:bg-muted/30" data-testid={`row-player-${p.playerId}`}>
                    <td className="py-2 px-1.5 font-medium sticky left-0 bg-card z-10">
                      <span className="text-primary font-bold mr-1">#{p.playerNumber}</span>
                      <span className="truncate">{p.playerName.split(" ").pop()}</span>
                    </td>
                    <td className="py-2 px-1.5 text-center text-muted-foreground">{mins}</td>
                    <td className="py-2 px-1.5 text-center font-bold">{p.points}</td>
                    <td className="py-2 px-1.5 text-center">{p.fgm}-{p.fga}</td>
                    <td className="py-2 px-1.5 text-center text-muted-foreground">{pct(p.fgm, p.fga) === "—" ? "—" : `${pct(p.fgm, p.fga)}`}</td>
                    <td className="py-2 px-1.5 text-center">{p.threePm}-{p.threePa}</td>
                    <td className="py-2 px-1.5 text-center text-muted-foreground">{pct(p.threePm, p.threePa) === "—" ? "—" : `${pct(p.threePm, p.threePa)}`}</td>
                    <td className="py-2 px-1.5 text-center">{p.ftm}-{p.fta}</td>
                    <td className="py-2 px-1.5 text-center text-muted-foreground">{pct(p.ftm, p.fta) === "—" ? "—" : `${pct(p.ftm, p.fta)}`}</td>
                    <td className="py-2 px-1.5 text-center">{p.oreb}</td>
                    <td className="py-2 px-1.5 text-center">{p.dreb}</td>
                    <td className="py-2 px-1.5 text-center font-medium">{p.reb}</td>
                    <td className="py-2 px-1.5 text-center">{p.ast}</td>
                    <td className="py-2 px-1.5 text-center">{p.stl}</td>
                    <td className="py-2 px-1.5 text-center">{p.blk}</td>
                    <td className="py-2 px-1.5 text-center">{p.to}</td>
                    <td className="py-2 px-1.5 text-center">{p.pf}</td>
                    <td className={`py-2 px-1.5 text-center font-medium ${eff > 0 ? "text-[hsl(142,71%,45%)]" : eff < 0 ? "text-destructive" : ""}`}>{eff}</td>
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr className="bg-muted/50 font-bold" data-testid="row-totals">
                <td className="py-2 px-1.5 sticky left-0 bg-muted/50 z-10">TOTALS</td>
                <td className="py-2 px-1.5 text-center text-muted-foreground">{totalMins}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.points}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.fgm}-{boxScore.totals.fga}</td>
                <td className="py-2 px-1.5 text-center">{pct(boxScore.totals.fgm, boxScore.totals.fga) === "—" ? "—" : `${pct(boxScore.totals.fgm, boxScore.totals.fga)}`}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.threePm}-{boxScore.totals.threePa}</td>
                <td className="py-2 px-1.5 text-center">{pct(boxScore.totals.threePm, boxScore.totals.threePa) === "—" ? "—" : `${pct(boxScore.totals.threePm, boxScore.totals.threePa)}`}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.ftm}-{boxScore.totals.fta}</td>
                <td className="py-2 px-1.5 text-center">{pct(boxScore.totals.ftm, boxScore.totals.fta) === "—" ? "—" : `${pct(boxScore.totals.ftm, boxScore.totals.fta)}`}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.oreb}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.dreb}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.reb}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.ast}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.stl}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.blk}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.to}</td>
                <td className="py-2 px-1.5 text-center">{boxScore.totals.pf}</td>
                <td className="py-2 px-1.5 text-center font-medium">{totalEff}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Card>
  );
}

function ComparisonRow({
  label,
  home,
  away,
  isLowerBetter = false,
}: {
  label: string;
  home: number | string;
  away: number | string;
  isLowerBetter?: boolean;
}) {
  const homeNum = typeof home === "string" ? parseFloat(home) || 0 : home;
  const awayNum = typeof away === "string" ? parseFloat(away) || 0 : away;
  const homeWins = isLowerBetter ? homeNum < awayNum : homeNum > awayNum;
  const awayWins = isLowerBetter ? awayNum < homeNum : awayNum > homeNum;
  const total = homeNum + awayNum || 1;

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs tabular-nums w-10 text-right font-medium ${homeWins ? "text-primary" : "text-muted-foreground"}`}>
        {typeof home === "string" && home !== "—" ? `${home}%` : home}
      </span>
      <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-muted gap-px">
        <div
          className={`h-full rounded-l-full transition-all ${homeWins ? "bg-primary" : "bg-muted-foreground/30"}`}
          style={{ width: `${Math.max(2, (homeNum / total) * 100)}%` }}
        />
        <div
          className={`h-full rounded-r-full transition-all ${awayWins ? "bg-secondary" : "bg-muted-foreground/30"}`}
          style={{ width: `${Math.max(2, (awayNum / total) * 100)}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums w-10 text-left font-medium ${awayWins ? "text-secondary" : "text-muted-foreground"}`}>
        {typeof away === "string" && away !== "—" ? `${away}%` : away}
      </span>
      <span className="text-[10px] text-muted-foreground w-16 text-center">{label}</span>
    </div>
  );
}
