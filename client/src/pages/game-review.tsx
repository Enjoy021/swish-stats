import { useState, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Trash2,
  Plus,
  BarChart3,
  Crosshair,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { exportGameEventsCsv } from "@/lib/csv-export";
import type { Game, Team, Player, GameEvent } from "@shared/schema";

type GameData = Game & {
  homeTeam: Team & { players: Player[] };
  awayTeam: Team & { players: Player[] };
};

const EVENT_LABELS: Record<string, string> = {
  "2pt_made": "2PT Made",
  "2pt_attempt": "2PT Miss",
  "3pt_made": "3PT Made",
  "3pt_attempt": "3PT Miss",
  ft_made: "FT Made",
  ft_attempt: "FT Miss",
  offensive_rebound: "Off. Rebound",
  defensive_rebound: "Def. Rebound",
  team_rebound: "Team Rebound",
  assist: "Assist",
  turnover: "Turnover",
  steal: "Steal",
  block: "Block",
  personal_foul: "Personal Foul",
  technical_foul: "Technical Foul",
  unsportsmanlike_foul: "Unsportsmanlike",
  foul_drawn: "Foul Drawn",
  substitution_in: "Sub In",
  substitution_out: "Sub Out",
  timeout: "Timeout",
  period_start: "Period Start",
  period_end: "Period End",
};

const EVENT_COLORS: Record<string, string> = {
  "2pt_made": "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
  "3pt_made": "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
  ft_made: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30",
  "2pt_attempt": "bg-destructive/10 text-destructive border-destructive/30",
  "3pt_attempt": "bg-destructive/10 text-destructive border-destructive/30",
  ft_attempt: "bg-destructive/10 text-destructive border-destructive/30",
  personal_foul: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  technical_foul: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  unsportsmanlike_foul: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  foul_drawn: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  assist: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  steal: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  block: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  turnover: "bg-destructive/10 text-destructive border-destructive/30",
  offensive_rebound: "bg-muted text-muted-foreground border-border",
  defensive_rebound: "bg-muted text-muted-foreground border-border",
  team_rebound: "bg-muted text-muted-foreground border-border",
};

const ADDABLE_EVENT_TYPES = [
  "2pt_made", "2pt_attempt", "3pt_made", "3pt_attempt",
  "ft_made", "ft_attempt",
  "offensive_rebound", "defensive_rebound",
  "assist", "turnover", "steal", "block",
  "personal_foul", "technical_foul",
] as const;

function formatClock(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function periodLabel(quarter: number, format: string): string {
  if (format === "halves") {
    if (quarter <= 2) return quarter === 1 ? "1st Half" : "2nd Half";
    return `OT${quarter - 2}`;
  }
  if (quarter <= 4) return `Q${quarter}`;
  return `OT${quarter - 4}`;
}

export default function GameReviewPage() {
  const { id: gameId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuarter, setAddQuarter] = useState("1");
  const [addTeamId, setAddTeamId] = useState("");
  const [addPlayerId, setAddPlayerId] = useState("");
  const [addEventType, setAddEventType] = useState("");

  const { data: game, isLoading } = useQuery<GameData>({
    queryKey: ["/api/games", gameId],
  });

  const { data: events = [] } = useQuery<GameEvent[]>({
    queryKey: ["/api/games", gameId, "events"],
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) =>
      apiRequest("DELETE", `/api/games/${gameId}/events/${eventId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/games", gameId, "events"] });
      qc.invalidateQueries({ queryKey: ["/api/games", gameId, "boxscore"] });
      setDeleteTarget(null);
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      teamId: string;
      playerId?: string;
      eventType: string;
      quarter: number;
    }) => apiRequest("POST", `/api/games/${gameId}/events`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/games", gameId, "events"] });
      qc.invalidateQueries({ queryKey: ["/api/games", gameId, "boxscore"] });
      setAddOpen(false);
      setAddEventType("");
      setAddPlayerId("");
    },
  });

  // Build player lookup
  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    if (!game) return m;
    for (const p of [...game.homeTeam.players, ...game.awayTeam.players]) {
      m.set(p.id, p);
    }
    return m;
  }, [game]);

  const teamMap = useMemo(() => {
    const m = new Map<string, Team>();
    if (!game) return m;
    m.set(game.homeTeam.id, game.homeTeam);
    m.set(game.awayTeam.id, game.awayTeam);
    return m;
  }, [game]);

  // Group events by period, chronological (oldest first)
  const groupedEvents = useMemo(() => {
    const sorted = [...events].reverse(); // chronological
    const groups = new Map<number, GameEvent[]>();
    for (const e of sorted) {
      const q = e.quarter;
      if (!groups.has(q)) groups.set(q, []);
      groups.get(q)!.push(e);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [events]);

  // Running score calculation
  const runningScores = useMemo(() => {
    if (!game) return new Map<string, { home: number; away: number }>();
    const scores = new Map<string, { home: number; away: number }>();
    let home = 0, away = 0;
    const sorted = [...events].reverse();
    for (const e of sorted) {
      const pts =
        e.eventType === "2pt_made" ? 2 :
        e.eventType === "3pt_made" ? 3 :
        e.eventType === "ft_made" ? 1 : 0;
      if (pts > 0) {
        if (e.teamId === game.homeTeamId) home += pts;
        else away += pts;
      }
      scores.set(e.id, { home, away });
    }
    return scores;
  }, [events, game]);

  // Players for the selected team in add dialog
  const addTeamPlayers = useMemo(() => {
    if (!game || !addTeamId) return [];
    if (addTeamId === game.homeTeamId) return game.homeTeam.players;
    return game.awayTeam.players;
  }, [game, addTeamId]);

  const handleAdd = useCallback(() => {
    if (!addEventType || !addTeamId) return;
    addMutation.mutate({
      teamId: addTeamId,
      playerId: addPlayerId || undefined,
      eventType: addEventType,
      quarter: parseInt(addQuarter),
    });
  }, [addEventType, addTeamId, addPlayerId, addQuarter, addMutation]);

  if (isLoading) {
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

  const gameFormat = game.gameFormat || "quarters";
  const totalPeriods = gameFormat === "halves" ? 2 : 4;

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <Link href={`/games/${gameId}/boxscore`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back">
              <ChevronLeft className="w-4 h-4" /> Box Score
            </Button>
          </Link>
          <h1 className="font-semibold text-base" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Game Review
          </h1>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => {
              if (!game || events.length === 0) return;
              exportGameEventsCsv(events, game.homeTeamId, game.homeTeam?.name || "Home", game.awayTeam?.name || "Away");
              toast({ title: "CSV downloaded" });
            }}
            disabled={events.length === 0}
            data-testid="button-export-events-csv"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-xs">CSV</span>
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Score Summary */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] text-white p-4">
            <div className="flex items-center justify-center gap-6">
              <div className="text-center flex-1">
                <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.homeTeam?.name}</p>
                <p className="text-2xl font-bold tabular-nums mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {runningScores.size > 0 ? Array.from(runningScores.values()).pop()?.home ?? 0 : 0}
                </p>
              </div>
              <span className="text-white/30 text-sm">—</span>
              <div className="text-center flex-1">
                <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.awayTeam?.name}</p>
                <p className="text-2xl font-bold tabular-nums mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {runningScores.size > 0 ? Array.from(runningScores.values()).pop()?.away ?? 0 : 0}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Navigation Links */}
        <div className="flex gap-2">
          <Link href={`/games/${gameId}/boxscore`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid="link-boxscore">
              <BarChart3 className="w-3.5 h-3.5" /> Box Score
            </Button>
          </Link>
          <Link href={`/games/${gameId}/shotchart`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid="link-shotchart">
              <Crosshair className="w-3.5 h-3.5" /> Shot Chart
            </Button>
          </Link>
        </div>

        {/* Add Event Button */}
        <Button
          className="w-full gap-2 bg-[hsl(17,100%,60%)] hover:bg-[hsl(17,100%,50%)] text-white"
          onClick={() => {
            setAddTeamId(game.homeTeamId);
            setAddQuarter("1");
            setAddPlayerId("");
            setAddEventType("");
            setAddOpen(true);
          }}
          data-testid="button-add-event"
        >
          <Plus className="w-4 h-4" /> Add Event
        </Button>

        {/* Play-by-Play */}
        {groupedEvents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No events recorded</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Events will appear here once the game starts</p>
            </CardContent>
          </Card>
        ) : (
          groupedEvents.map(([quarter, qEvents]) => (
            <Card key={quarter}>
              <CardContent className="p-4">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {periodLabel(quarter, gameFormat)}
                </h3>
                <div className="space-y-1.5">
                  {qEvents.map((e) => {
                    const player = e.playerId ? playerMap.get(e.playerId) : null;
                    const team = teamMap.get(e.teamId);
                    const isScoring = ["2pt_made", "3pt_made", "ft_made"].includes(e.eventType);
                    const score = runningScores.get(e.id);
                    const colorClass = EVENT_COLORS[e.eventType] || "bg-muted text-muted-foreground border-border";

                    return (
                      <div
                        key={e.id}
                        className="flex items-center gap-2 group"
                        data-testid={`event-row-${e.id}`}
                      >
                        {/* Clock */}
                        <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right flex-shrink-0">
                          {formatClock(e.gameClockSeconds)}
                        </span>

                        {/* Event Badge */}
                        <Badge
                          variant="outline"
                          className={`text-[9px] h-5 px-1.5 flex-shrink-0 ${colorClass}`}
                        >
                          {EVENT_LABELS[e.eventType] || e.eventType}
                        </Badge>

                        {/* Player & Team */}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs">
                            {player ? (
                              <Link href={`/players/${player.id}`}>
                                <span className="font-medium hover:underline cursor-pointer">
                                  #{player.number} {player.name}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{team?.name || ""}</span>
                            )}
                          </span>
                        </div>

                        {/* Running Score (scoring events only) */}
                        {isScoring && score && (
                          <span className="text-[10px] font-bold tabular-nums text-muted-foreground flex-shrink-0">
                            {score.home}-{score.away}
                          </span>
                        )}

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={() => setDeleteTarget(e.id)}
                          data-testid={`button-delete-${e.id}`}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the event from the game record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Event Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Period</label>
              <Select value={addQuarter} onValueChange={setAddQuarter}>
                <SelectTrigger data-testid="select-quarter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: totalPeriods + 2 }, (_, i) => i + 1).map((q) => (
                    <SelectItem key={q} value={String(q)}>
                      {periodLabel(q, gameFormat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Team</label>
              <Select value={addTeamId} onValueChange={(v) => { setAddTeamId(v); setAddPlayerId(""); }}>
                <SelectTrigger data-testid="select-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={game.homeTeamId}>{game.homeTeam?.name}</SelectItem>
                  <SelectItem value={game.awayTeamId}>{game.awayTeam?.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Player</label>
              <Select value={addPlayerId} onValueChange={setAddPlayerId}>
                <SelectTrigger data-testid="select-player">
                  <SelectValue placeholder="Select player (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {addTeamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Event Type</label>
              <Select value={addEventType} onValueChange={setAddEventType}>
                <SelectTrigger data-testid="select-event-type">
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {EVENT_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!addEventType || !addTeamId || addMutation.isPending}
              onClick={handleAdd}
              className="bg-[hsl(17,100%,60%)] hover:bg-[hsl(17,100%,50%)] text-white"
              data-testid="button-submit-event"
            >
              {addMutation.isPending ? "Adding..." : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
