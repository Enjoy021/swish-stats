import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Undo2, BarChart3, Pause, Play, Square, RotateCcw, X, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Game, Player, Team, GameEvent } from "@shared/schema";

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

// Half-court zones
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

const TURNOVER_TYPES = [
  "Bad Pass", "Travel", "Ball Handling", "Shot Clock",
  "Offensive Foul", "Out of Bounds", "3 Seconds", "5 Seconds",
  "8 Seconds", "Double Dribble", "Other"
];

function getPlayerLabel(player: Player) {
  const parts = player.name.split(" ");
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  const firstInit = parts[0]?.[0] || "";
  return `#${player.number} ${firstInit}. ${lastName}`;
}

function getPlayerFouls(events: GameEvent[], playerId: string): number {
  return events.filter(e =>
    e.playerId === playerId &&
    (e.eventType === "personal_foul" || e.eventType === "technical_foul" || e.eventType === "unsportsmanlike_foul")
  ).length;
}

function getTeamFoulsInPeriod(events: GameEvent[], teamId: string, period: number): number {
  return events.filter(e =>
    e.teamId === teamId &&
    e.quarter === period &&
    (e.eventType === "personal_foul" || e.eventType === "technical_foul" || e.eventType === "unsportsmanlike_foul")
  ).length;
}

function getOnCourtPlayers(events: GameEvent[], teamId: string, allPlayers: Player[]): Set<string> {
  // Start with players who have substitution_in with metadata.type === "starter"
  const onCourt = new Set<string>();
  
  // Process events chronologically (events are newest-first, so reverse)
  const sorted = [...events].reverse();
  
  for (const e of sorted) {
    if (e.teamId !== teamId) continue;
    if (e.eventType === "substitution_in") {
      onCourt.add(e.playerId!);
    } else if (e.eventType === "substitution_out") {
      onCourt.delete(e.playerId!);
    }
  }
  
  // If no sub events exist, show first 5 players
  if (onCourt.size === 0) {
    allPlayers.slice(0, 5).forEach(p => onCourt.add(p.id));
  }
  
  return onCourt;
}

// Calculate running score at a given event
function getRunningScore(events: GameEvent[], upToIndex: number, homeTeamId: string): { home: number; away: number } {
  // Events are newest-first, so we need to count from the end to upToIndex
  let home = 0, away = 0;
  const sorted = [...events].reverse();
  const targetIdx = sorted.length - 1 - upToIndex;
  
  for (let i = 0; i <= targetIdx; i++) {
    const e = sorted[i];
    const pts = e.eventType === '2pt_made' ? 2 : e.eventType === '3pt_made' ? 3 : e.eventType === 'ft_made' ? 1 : 0;
    if (e.teamId === homeTeamId) home += pts; else away += pts;
  }
  return { home, away };
}

export default function LiveScoringPage() {
  const { id: gameId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // State
  const [activeTeam, setActiveTeam] = useState<"home" | "away">("home");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedZone, setSelectedZone] = useState<ShotZone | null>(null);
  const [pendingZone, setPendingZone] = useState<ShotZone | null>(null);
  const [showShooterSelect, setShowShooterSelect] = useState(false);
  const [showShotPrompt, setShowShotPrompt] = useState(false);
  const [showReboundPrompt, setShowReboundPrompt] = useState(false);
  const [showStealPrompt, setShowStealPrompt] = useState(false);
  const [showFoulPrompt, setShowFoulPrompt] = useState(false);
  const [showTurnoverPrompt, setShowTurnoverPrompt] = useState(false);
  const [showAssistPrompt, setShowAssistPrompt] = useState(false);
  const [showSubPrompt, setShowSubPrompt] = useState(false);
  const [showFTPrompt, setShowFTPrompt] = useState(false);
  const [showNextPeriodConfirm, setShowNextPeriodConfirm] = useState(false);
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const [lastScoringEvent, setLastScoringEvent] = useState<{ teamId: string; playerId: string } | null>(null);
  const [lastMissEvent, setLastMissEvent] = useState<{ teamId: string } | null>(null);
  const [lastTurnoverTeamId, setLastTurnoverTeamId] = useState<string | null>(null);
  const [gameClockMinutes, setGameClockMinutes] = useState(10);
  const [gameClockSeconds, setGameClockSeconds] = useState(0);
  const [scoreAnimating, setScoreAnimating] = useState<"home" | "away" | null>(null);

  // Fetch game data
  const { data: game, isLoading: gameLoading } = useQuery<GameData>({
    queryKey: ["/api/games", gameId],
  });

  // Fetch events
  const { data: events = [] } = useQuery<GameEvent[]>({
    queryKey: ["/api/games", gameId, "events"],
    refetchInterval: 2000,
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

  // Track on-court players
  const homeOnCourt = useMemo(() =>
    game ? getOnCourtPlayers(events, game.homeTeamId, game.homeTeam?.players || []) : new Set<string>(),
    [events, game]
  );
  const awayOnCourt = useMemo(() =>
    game ? getOnCourtPlayers(events, game.awayTeamId, game.awayTeam?.players || []) : new Set<string>(),
    [events, game]
  );

  // Team fouls in current period
  const homeTeamFouls = useMemo(() =>
    game ? getTeamFoulsInPeriod(events, game.homeTeamId, game.currentPeriod || 1) : 0,
    [events, game]
  );
  const awayTeamFouls = useMemo(() =>
    game ? getTeamFoulsInPeriod(events, game.awayTeamId, game.currentPeriod || 1) : 0,
    [events, game]
  );

  useEffect(() => {
    if (game?.periodLength) {
      setGameClockMinutes(game.periodLength);
    }
  }, [game?.periodLength]);

  // Show pause overlay
  useEffect(() => {
    setShowPauseOverlay(game?.status === "paused");
  }, [game?.status]);

  // Shot indicators from events
  const shotIndicators = useMemo(() => {
    return events
      .filter(e => e.courtX != null && e.courtY != null && (
        e.eventType === '2pt_made' || e.eventType === '2pt_attempt' ||
        e.eventType === '3pt_made' || e.eventType === '3pt_attempt'
      ))
      .map(e => ({
        x: e.courtX!,
        y: e.courtY!,
        made: e.eventType === '2pt_made' || e.eventType === '3pt_made',
        teamId: e.teamId,
      }));
  }, [events]);

  // Add event mutation
  const addEvent = useMutation({
    mutationFn: async (eventData: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/events`, {
        ...eventData,
        quarter: game?.currentPeriod || 1,
        gameClockSeconds: gameClockMinutes * 60 + gameClockSeconds,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "events"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error recording event", description: e.message, variant: "destructive" });
    },
  });

  // Undo mutation
  const undoEvent = useMutation({
    mutationFn: async (eventId: string) => {
      await apiRequest("DELETE", `/api/games/${gameId}/events/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "events"] });
      toast({ title: "Undone" });
    },
  });

  // Update game status
  const updateGame = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/games/${gameId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
    },
  });

  const currentOnCourt = activeTeam === "home" ? homeOnCourt : awayOnCourt;
  const currentTeam = activeTeam === "home" ? game?.homeTeam : game?.awayTeam;
  const currentTeamId = activeTeam === "home" ? game?.homeTeamId : game?.awayTeamId;
  const opposingTeam = activeTeam === "home" ? game?.awayTeam : game?.homeTeam;
  const opposingTeamId = activeTeam === "home" ? game?.awayTeamId : game?.homeTeamId;

  const onCourtPlayers = useMemo(() =>
    currentTeam?.players?.filter(p => currentOnCourt.has(p.id)) || [],
    [currentTeam, currentOnCourt]
  );
  const benchPlayers = useMemo(() =>
    currentTeam?.players?.filter(p => !currentOnCourt.has(p.id)) || [],
    [currentTeam, currentOnCourt]
  );

  // Handle court zone tap — allow zone-first, then player selection
  const handleZoneTap = (zone: ShotZone) => {
    if (!selectedPlayer) {
      // Zone-first flow: store zone and show shooter selection sheet
      setPendingZone(zone);
      setShowShooterSelect(true);
      return;
    }
    setSelectedZone(zone);
    setShowShotPrompt(true);
  };

  // Handle shooter selection from the zone-first flow
  const handleShooterSelected = (player: Player) => {
    setSelectedPlayer(player);
    setShowShooterSelect(false);
    if (pendingZone) {
      setSelectedZone(pendingZone);
      setPendingZone(null);
      setShowShotPrompt(true);
    }
  };

  // Quick score — record a made shot without court location
  const recordQuickScore = (points: 2 | 3) => {
    if (!selectedPlayer || !currentTeamId) return;
    const eventType = points === 3 ? "3pt_made" : "2pt_made";
    addEvent.mutate({
      playerId: selectedPlayer.id,
      teamId: currentTeamId,
      eventType,
      shotResult: "made",
      metadata: { zone: "Quick Score" },
    });
    toast({ title: `+${points}! ${getPlayerLabel(selectedPlayer)}`, duration: 1500 });
    setLastScoringEvent({ teamId: currentTeamId, playerId: selectedPlayer.id });
    setLastMissEvent(null);
    setScoreAnimating(activeTeam);
    setTimeout(() => setScoreAnimating(null), 400);
    setTimeout(() => setShowAssistPrompt(true), 300);
  };

  // Record shot
  const recordShot = (made: boolean) => {
    if (!selectedPlayer || !selectedZone || !currentTeamId) return;
    const eventType = selectedZone.points === 3
      ? (made ? "3pt_made" : "3pt_attempt")
      : (made ? "2pt_made" : "2pt_attempt");

    addEvent.mutate({
      playerId: selectedPlayer.id,
      teamId: currentTeamId,
      eventType,
      courtX: selectedZone.x,
      courtY: selectedZone.y,
      shotResult: made ? "made" : "missed",
      metadata: { zone: selectedZone.label },
    });

    setShowShotPrompt(false);
    setSelectedZone(null);

    if (made) {
      const pts = selectedZone.points;
      toast({ title: `${pts === 3 ? "3-pointer" : "2-pointer"}! +${pts}`, duration: 1500 });
      setLastScoringEvent({ teamId: currentTeamId, playerId: selectedPlayer.id });
      setLastMissEvent(null);
      setScoreAnimating(activeTeam);
      setTimeout(() => setScoreAnimating(null), 400);
      // Auto-prompt for assist
      setTimeout(() => setShowAssistPrompt(true), 300);
    } else {
      setLastMissEvent({ teamId: currentTeamId });
      setLastScoringEvent(null);
      // Auto-prompt for rebound/block
      setTimeout(() => setShowReboundPrompt(true), 300);
    }
  };

  // Record free throw
  const recordFT = (made: boolean) => {
    if (!selectedPlayer || !currentTeamId) return;
    addEvent.mutate({
      playerId: selectedPlayer.id,
      teamId: currentTeamId,
      eventType: made ? "ft_made" : "ft_attempt",
      shotResult: made ? "made" : "missed",
    });
    setShowFTPrompt(false);
    if (made) {
      setLastScoringEvent({ teamId: currentTeamId, playerId: selectedPlayer.id });
      setScoreAnimating(activeTeam);
      setTimeout(() => setScoreAnimating(null), 400);
    }
  };

  // Record assist
  const recordAssist = (assistPlayer: Player) => {
    if (!currentTeamId) return;
    addEvent.mutate({
      playerId: assistPlayer.id,
      teamId: currentTeamId,
      eventType: "assist",
      assistPlayerId: lastScoringEvent?.playerId,
    });
    setShowAssistPrompt(false);
    setLastScoringEvent(null);
    toast({ title: `AST: ${getPlayerLabel(assistPlayer)}`, duration: 1500 });
  };

  // Record rebound
  const recordRebound = (type: "offensive" | "defensive", player: Player, teamId: string) => {
    addEvent.mutate({
      playerId: player.id,
      teamId: teamId,
      eventType: type === "offensive" ? "offensive_rebound" : "defensive_rebound",
    });
    setShowReboundPrompt(false);
    setLastMissEvent(null);
    toast({ title: `${type === "offensive" ? "OFF" : "DEF"} REB: ${getPlayerLabel(player)}`, duration: 1500 });
  };

  // Record block
  const recordBlock = (player: Player, teamId: string) => {
    addEvent.mutate({
      playerId: player.id,
      teamId: teamId,
      eventType: "block",
    });
    setShowReboundPrompt(false);
    setLastMissEvent(null);
    toast({ title: `BLK: ${getPlayerLabel(player)}`, duration: 1500 });
  };

  // Record foul
  const recordFoul = (type: "personal_foul" | "technical_foul" | "unsportsmanlike_foul") => {
    if (!selectedPlayer || !currentTeamId) return;
    addEvent.mutate({
      playerId: selectedPlayer.id,
      teamId: currentTeamId,
      eventType: type,
    });
    setShowFoulPrompt(false);
    toast({ title: `FOUL: ${getPlayerLabel(selectedPlayer)}`, duration: 1500 });

    // Check foul count
    const currentFouls = getPlayerFouls(events, selectedPlayer.id) + 1; // +1 for the one we just added
    if (currentFouls >= 5) {
      toast({
        title: `FOULED OUT! ${getPlayerLabel(selectedPlayer)}`,
        description: `${currentFouls} personal fouls`,
        variant: "destructive",
        duration: 4000,
      });
      // Auto-prompt for substitution
      setTimeout(() => setShowSubPrompt(true), 500);
    }
  };

  // Record turnover
  const recordTurnover = (subtype: string) => {
    if (!selectedPlayer || !currentTeamId) return;
    addEvent.mutate({
      playerId: selectedPlayer.id,
      teamId: currentTeamId,
      eventType: "turnover",
      metadata: { type: subtype },
    });
    setShowTurnoverPrompt(false);
    toast({ title: `TO: ${getPlayerLabel(selectedPlayer)} (${subtype})`, duration: 1500 });
    setLastTurnoverTeamId(currentTeamId);
    // Auto-prompt for steal
    setTimeout(() => setShowStealPrompt(true), 300);
  };

  // Record steal
  const recordSteal = (player: Player, teamId: string) => {
    addEvent.mutate({
      playerId: player.id,
      teamId: teamId,
      eventType: "steal",
    });
    setShowStealPrompt(false);
    setLastTurnoverTeamId(null);
    toast({ title: `STL: ${getPlayerLabel(player)}`, duration: 1500 });
  };

  // Record substitution
  const recordSub = (playerOut: Player, playerIn: Player) => {
    if (!currentTeamId) return;
    addEvent.mutate({
      playerId: playerOut.id,
      teamId: currentTeamId,
      eventType: "substitution_out",
    });
    addEvent.mutate({
      playerId: playerIn.id,
      teamId: currentTeamId,
      eventType: "substitution_in",
    });
    setShowSubPrompt(false);
    toast({ title: `SUB: ${getPlayerLabel(playerIn)} for ${getPlayerLabel(playerOut)}`, duration: 2000 });
  };

  // Handle next period
  const handleNextPeriod = () => {
    if (!game || !currentTeamId) return;
    const totalPeriods = game.gameFormat === "halves" ? 2 : 4;
    const next = (game.currentPeriod || 1) + 1;
    
    // Record period end/start events
    addEvent.mutate({
      teamId: game.homeTeamId,
      eventType: "period_end",
      metadata: { period: game.currentPeriod },
    });
    
    if (next <= totalPeriods) {
      updateGame.mutate({ currentPeriod: next });
      setGameClockMinutes(game.periodLength || 10);
      setGameClockSeconds(0);
      addEvent.mutate({
        teamId: game.homeTeamId,
        eventType: "period_start",
        metadata: { period: next },
      });
      setShowNextPeriodConfirm(false);
    } else {
      // End of regulation — show End Game vs Overtime
      setShowNextPeriodConfirm(false);
      setShowEndGameConfirm(true);
    }
  };

  // Handle overtime
  const handleOvertime = () => {
    if (!game) return;
    const next = (game.currentPeriod || 1) + 1;
    updateGame.mutate({ currentPeriod: next });
    setGameClockMinutes(5); // FIBA OT is 5 minutes
    setGameClockSeconds(0);
    addEvent.mutate({
      teamId: game.homeTeamId,
      eventType: "period_start",
      metadata: { period: next, overtime: true },
    });
    setShowEndGameConfirm(false);
  };

  // Handle end game
  const handleEndGame = () => {
    updateGame.mutate({ status: "completed" });
    setShowEndGameConfirm(false);
    navigate(`/games/${gameId}/boxscore`);
  };

  // Get period label
  const getPeriodLabel = (period: number): string => {
    if (!game) return "";
    const totalPeriods = game.gameFormat === "halves" ? 2 : 4;
    if (period <= totalPeriods) {
      return game.gameFormat === "halves" ? `H${period}` : `Q${period}`;
    }
    return `OT${period - totalPeriods}`;
  };

  // Format event for play-by-play
  const formatEvent = useCallback((event: GameEvent, index: number) => {
    const player = [...(game?.homeTeam?.players || []), ...(game?.awayTeam?.players || [])]
      .find(p => p.id === event.playerId);
    const playerLabel = player ? getPlayerLabel(player) : "Team";
    const mins = Math.floor((event.gameClockSeconds || 0) / 60);
    const secs = (event.gameClockSeconds || 0) % 60;
    const clock = `${mins}:${secs.toString().padStart(2, "0")}`;
    const meta = event.metadata as Record<string, string> | null;

    const typeLabels: Record<string, string> = {
      "2pt_made": "2PT Made",
      "2pt_attempt": "2PT Missed",
      "3pt_made": "3PT Made",
      "3pt_attempt": "3PT Missed",
      "ft_made": "FT Made",
      "ft_attempt": "FT Missed",
      "offensive_rebound": "OFF REB",
      "defensive_rebound": "DEF REB",
      "assist": "AST",
      "turnover": `TO${meta?.type ? ` (${meta.type})` : ""}`,
      "steal": "STL",
      "block": "BLK",
      "personal_foul": "PF",
      "technical_foul": "TECH",
      "unsportsmanlike_foul": "UNSPORT",
      "substitution_in": "SUB IN",
      "substitution_out": "SUB OUT",
      "period_start": "Period Start",
      "period_end": "Period End",
    };

    const label = typeLabels[event.eventType] || event.eventType;
    const zone = meta?.zone ? ` (${meta.zone})` : "";
    
    // Calculate running score for scoring events
    const isScoringEvent = ['2pt_made', '3pt_made', 'ft_made'].includes(event.eventType);
    let scoreStr = "";
    if (isScoringEvent && game) {
      const score = getRunningScore(events, index, game.homeTeamId);
      scoreStr = ` [${score.home}-${score.away}]`;
    }

    return {
      text: `${getPeriodLabel(event.quarter)} ${clock} — ${playerLabel} ${label}${zone}${scoreStr}`,
      type: event.eventType,
    };
  }, [game, events]);

  const totalPeriods = game?.gameFormat === "halves" ? 2 : 4;
  const isOvertime = (game?.currentPeriod || 1) > totalPeriods;

  // Get event color class
  const getEventColorClass = (type: string): string => {
    if (type.includes("made")) return "text-[hsl(142,71%,45%)] dark:text-[hsl(142,71%,55%)]";
    if (type.includes("attempt") || type === "turnover") return "text-destructive";
    if (type === "assist") return "text-blue-500 dark:text-blue-400";
    if (type.includes("foul")) return "text-yellow-600 dark:text-yellow-400";
    if (type === "steal" || type === "block") return "text-blue-500 dark:text-blue-400";
    return "text-muted-foreground";
  };

  // Group events by quarter
  const groupedEvents = useMemo(() => {
    const groups: { period: number; events: GameEvent[] }[] = [];
    let currentPeriod = -1;
    for (const event of events) {
      if (event.quarter !== currentPeriod) {
        currentPeriod = event.quarter;
        groups.push({ period: currentPeriod, events: [] });
      }
      groups[groups.length - 1].events.push(event);
    }
    return groups;
  }, [events]);

  if (gameLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading game...</div>
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Score Header */}
      <div className="bg-gradient-to-r from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] text-white px-3 pt-2 pb-3">
        <div className="flex items-center justify-between mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white h-8 px-2" data-testid="button-back">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] border-white/30 ${
                game.status === "live" ? "text-green-300 border-green-400/30" : 
                game.status === "paused" ? "text-yellow-300 border-yellow-400/30" :
                "text-white/60 border-white/20"
              }`}
            >
              {game.status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse" />}
              {game.status?.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-white/30 text-white/80">
              {isOvertime ? `OT${(game.currentPeriod || 1) - totalPeriods}` : `${game.gameFormat === "halves" ? "H" : "Q"}${game.currentPeriod}`}
            </Badge>
          </div>
          <Link href={`/games/${gameId}/boxscore`}>
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white h-8 px-2" data-testid="button-boxscore">
              <BarChart3 className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Score Display */}
        <div className="flex items-center justify-center gap-4">
          <div className="text-center flex-1">
            <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.homeTeam?.name}</p>
            <p
              className={`text-4xl font-bold tabular-nums transition-transform duration-300 ${
                scoreAnimating === "home" ? "scale-125" : ""
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
              data-testid="text-home-score"
            >
              {homeScore}
            </p>
          </div>
          <div className="text-white/30 text-lg font-light">—</div>
          <div className="text-center flex-1">
            <p className="text-[10px] uppercase tracking-wider text-white/60 truncate">{game.awayTeam?.name}</p>
            <p
              className={`text-4xl font-bold tabular-nums transition-transform duration-300 ${
                scoreAnimating === "away" ? "scale-125" : ""
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
              data-testid="text-away-score"
            >
              {awayScore}
            </p>
          </div>
        </div>

        {/* Team Fouls */}
        <div className="flex items-center justify-center gap-4 mt-1">
          <span className={`text-[9px] px-2 py-0.5 rounded-full ${homeTeamFouls >= 5 ? "bg-red-500/30 text-red-300 font-bold" : "bg-white/10 text-white/50"}`}>
            Fouls: {homeTeamFouls} {homeTeamFouls >= 5 && "BONUS"}
          </span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full ${awayTeamFouls >= 5 ? "bg-red-500/30 text-red-300 font-bold" : "bg-white/10 text-white/50"}`}>
            Fouls: {awayTeamFouls} {awayTeamFouls >= 5 && "BONUS"}
          </span>
        </div>

        {/* Game Clock */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="flex items-center bg-white/10 rounded-lg px-2 py-1.5 gap-1">
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 text-sm font-bold transition-colors active:scale-95"
              onClick={() => setGameClockMinutes(m => Math.max(0, m - 1))}
              data-testid="button-clock-min-down"
            >−</button>
            <span className="text-xl font-mono tabular-nums w-8 text-center font-bold" data-testid="text-game-clock-min">
              {gameClockMinutes.toString().padStart(2, "0")}
            </span>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 text-sm font-bold transition-colors active:scale-95"
              onClick={() => setGameClockMinutes(m => m + 1)}
              data-testid="button-clock-min-up"
            >+</button>
            <span className="text-xl font-mono font-bold text-white/60 mx-0.5">:</span>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 text-sm font-bold transition-colors active:scale-95"
              onClick={() => setGameClockSeconds(s => {
                if (s <= 0) { setGameClockMinutes(m => Math.max(0, m - 1)); return 55; }
                return s - 5;
              })}
              data-testid="button-clock-sec-down"
            >−</button>
            <span className="text-xl font-mono tabular-nums w-8 text-center font-bold" data-testid="text-game-clock-sec">
              {gameClockSeconds.toString().padStart(2, "0")}
            </span>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 text-sm font-bold transition-colors active:scale-95"
              onClick={() => setGameClockSeconds(s => {
                if (s >= 55) { setGameClockMinutes(m => m + 1); return 0; }
                return s + 5;
              })}
              data-testid="button-clock-sec-up"
            >+</button>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => {
                if (game.status === "live") updateGame.mutate({ status: "paused" });
                else updateGame.mutate({ status: "live" });
              }}
              data-testid="button-pause-resume"
            >
              {game.status === "live" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => {
                const next = (game.currentPeriod || 1) + 1;
                if (next <= totalPeriods) {
                  setShowNextPeriodConfirm(true);
                } else {
                  setShowEndGameConfirm(true);
                }
              }}
              data-testid="button-next-period"
            >
              {(game.currentPeriod || 1) < totalPeriods ? (
                <span className="text-[10px] font-medium">Next {game.gameFormat === "halves" ? "Half" : "Qtr"}</span>
              ) : (
                <Square className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Team Tabs */}
      <div className="px-3 py-2 border-b border-border">
        <Tabs value={activeTeam} onValueChange={(v) => { setActiveTeam(v as "home" | "away"); setSelectedPlayer(null); }}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="home" className="text-xs" data-testid="tab-home-team">
              {game.homeTeam?.name || "Home"}
            </TabsTrigger>
            <TabsTrigger value="away" className="text-xs" data-testid="tab-away-team">
              {game.awayTeam?.name || "Away"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* On-Court Players */}
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">On Court</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {onCourtPlayers.map((player) => {
            const fouls = getPlayerFouls(events, player.id);
            const fouledOut = fouls >= 5;
            return (
              <button
                key={player.id}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 min-h-[48px] relative active:scale-95
                  ${selectedPlayer?.id === player.id
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-[hsl(17,100%,60%)] ring-offset-2 ring-offset-background"
                    : fouledOut
                      ? "bg-destructive/10 text-destructive border border-destructive/30"
                      : "bg-muted text-foreground hover:bg-accent"}`}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
                data-testid={`chip-player-${player.id}`}
              >
                <span className="font-bold">#{player.number}</span>
                <span>{player.name.split(" ")[0]?.[0]}. {player.name.split(" ").slice(1).join(" ") || player.name.split(" ")[0]}</span>
                {fouls > 0 && (
                  <span className={`text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center ml-0.5 ${
                    fouls >= 5 ? "bg-red-800 text-white" : fouls >= 4 ? "bg-red-500 text-white" : "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                  }`}>
                    {fouls}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Bench Players */}
        {benchPlayers.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-2 font-medium">Bench</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {benchPlayers.map((player) => {
                const fouls = getPlayerFouls(events, player.id);
                return (
                  <button
                    key={player.id}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium whitespace-nowrap transition-all shrink-0 min-h-[36px] active:scale-95
                      ${selectedPlayer?.id === player.id
                        ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-[hsl(17,100%,60%)] ring-offset-1 ring-offset-background"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
                    data-testid={`chip-bench-${player.id}`}
                  >
                    <span className="font-bold">#{player.number}</span>
                    <span>{player.name.split(" ").pop()}</span>
                    {fouls > 0 && (
                      <span className={`text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center ${
                        fouls >= 5 ? "bg-red-800 text-white" : fouls >= 4 ? "bg-red-500 text-white" : "bg-yellow-500/20 text-yellow-600"
                      }`}>{fouls}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Court View */}
      <div className="flex-1 overflow-hidden px-3 py-2">
        <svg viewBox="0 0 400 380" className="w-full max-w-md mx-auto" style={{ maxHeight: "260px" }}>
          {/* Court background */}
          <rect x="0" y="0" width="400" height="380" fill="hsl(var(--muted))" rx="8" opacity="0.3" />

          {/* Court lines */}
          <rect x="5" y="5" width="390" height="370" fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" rx="4" />

          {/* 3-point arc */}
          <path d="M 40 380 L 40 200 Q 40 80 200 60 Q 360 80 360 200 L 360 380" fill="none" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 2" />

          {/* Paint */}
          <rect x="130" y="200" width="140" height="120" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />

          {/* Free throw circle */}
          <circle cx="200" cy="200" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.8" strokeDasharray="3 2" />

          {/* Basket */}
          <circle cx="200" cy="340" r="6" fill="none" stroke="hsl(17 100% 60%)" strokeWidth="1.5" />
          <rect x="180" y="346" width="40" height="4" fill="hsl(var(--border))" />

          {/* Shot indicators */}
          {shotIndicators.map((shot, i) => (
            shot.made ? (
              <circle
                key={`shot-${i}`}
                cx={shot.x}
                cy={shot.y}
                r="4"
                fill={shot.teamId === game.homeTeamId ? "hsl(142,71%,45%)" : "hsl(180,50%,40%)"}
                opacity="0.6"
              />
            ) : (
              <g key={`shot-${i}`}>
                <line x1={shot.x - 3} y1={shot.y - 3} x2={shot.x + 3} y2={shot.y + 3} stroke="hsl(0,84%,60%)" strokeWidth="1.5" opacity="0.5" />
                <line x1={shot.x + 3} y1={shot.y - 3} x2={shot.x - 3} y2={shot.y + 3} stroke="hsl(0,84%,60%)" strokeWidth="1.5" opacity="0.5" />
              </g>
            )
          ))}

          {/* Tappable zones */}
          {COURT_ZONES.map((zone) => (
            <path
              key={zone.id}
              d={zone.path}
              fill={selectedZone?.id === zone.id ? "hsl(17 100% 60% / 0.25)" : "hsl(var(--muted-foreground) / 0.04)"}
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              strokeOpacity="0.3"
              className="cursor-pointer hover:fill-[hsl(17_100%_60%_/_0.1)] active:fill-[hsl(17_100%_60%_/_0.2)] transition-colors"
              onClick={() => handleZoneTap(zone)}
              data-testid={`zone-${zone.id}`}
            >
              <title>{zone.label} ({zone.points}PT)</title>
            </path>
          ))}

          {/* Zone labels */}
          {COURT_ZONES.map((zone) => (
            <text
              key={`label-${zone.id}`}
              x={zone.x}
              y={zone.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="600"
              fill="hsl(var(--muted-foreground))"
              className="pointer-events-none select-none"
              opacity="0.8"
            >
              {zone.points === 3 ? "3" : "2"}
            </text>
          ))}
        </svg>
      </div>

      {/* Selected Player Banner + Quick Score (Fix 2 + Fix 6) */}
      {selectedPlayer && (
        <div className="px-3 pt-2">
          <div className="bg-primary/10 text-primary text-sm px-3 py-1.5 rounded-lg flex items-center justify-between max-w-md mx-auto">
            <div className="flex items-center gap-2">
              <span className="font-bold">Selected: #{selectedPlayer.number}</span>
              <span className="text-xs">{selectedPlayer.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-md active:scale-95 transition-transform"
                onClick={() => recordQuickScore(2)}
                data-testid="button-quick-2"
              >
                +2
              </button>
              <button
                className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-md active:scale-95 transition-transform"
                onClick={() => recordQuickScore(3)}
                data-testid="button-quick-3"
              >
                +3
              </button>
              <button
                className="ml-1 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                onClick={() => setSelectedPlayer(null)}
                data-testid="button-clear-player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-3 py-2 border-t border-border">
        <div className="max-w-md mx-auto space-y-1.5">
          {/* Scoring / Play row */}
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Scoring / Play</p>
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-12 text-xs font-semibold active:scale-95 transition-transform"
              onClick={() => { if (selectedPlayer) setShowFTPrompt(true); else toast({ title: "Select a player", variant: "destructive" }); }}
              data-testid="button-ft"
            >
              FT
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-12 text-xs font-semibold active:scale-95 transition-transform"
              onClick={() => { setShowReboundPrompt(true); }}
              data-testid="button-reb"
            >
              REB
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-12 text-xs font-semibold active:scale-95 transition-transform"
              onClick={() => { if (selectedPlayer) setShowTurnoverPrompt(true); else toast({ title: "Select a player", variant: "destructive" }); }}
              data-testid="button-to"
            >
              TO
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-12 text-xs font-semibold active:scale-95 transition-transform"
              onClick={() => { if (selectedPlayer) setShowFoulPrompt(true); else toast({ title: "Select a player", variant: "destructive" }); }}
              data-testid="button-foul"
            >
              FOUL
            </Button>
          </div>
          {/* Other row */}
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium pt-0.5">Other</p>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs font-semibold active:scale-95 transition-transform"
              onClick={() => {
                if (!selectedPlayer || !currentTeamId) { toast({ title: "Select a player", variant: "destructive" }); return; }
                addEvent.mutate({
                  playerId: selectedPlayer.id,
                  teamId: currentTeamId,
                  eventType: "steal",
                });
                toast({ title: `STL: ${getPlayerLabel(selectedPlayer)}`, duration: 1500 });
              }}
              disabled={!selectedPlayer}
              data-testid="button-stl"
            >
              STL
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs font-semibold active:scale-95 transition-transform"
              onClick={() => setShowSubPrompt(true)}
              data-testid="button-sub"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> SUB
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-[10px] font-medium text-destructive hover:bg-destructive/10 active:scale-95 transition-transform"
              onClick={() => { if (events.length > 0) undoEvent.mutate(events[0].id); }}
              disabled={events.length === 0}
              data-testid="button-undo"
            >
              <Undo2 className="w-3 h-3 mr-1" /> UNDO
            </Button>
          </div>
        </div>
      </div>

      {/* Play-by-Play Log */}
      <div className="border-t border-border bg-muted/30 max-h-[160px] overflow-y-auto custom-scrollbar">
        <div className="px-3 py-2">
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Tap a court zone or action button to begin recording
            </p>
          ) : (
            <>
              {groupedEvents.map((group) => (
                <div key={group.period}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 px-2 py-1 rounded my-1 text-center">
                    {getPeriodLabel(group.period)}
                  </div>
                  {group.events
                    .filter(e => e.eventType !== 'period_start' && e.eventType !== 'period_end')
                    .map((event) => {
                      const idx = events.indexOf(event);
                      const formatted = formatEvent(event, idx);
                      return (
                        <div
                          key={event.id}
                          className="flex items-center justify-between py-1.5 px-2 bg-background rounded text-[11px] group mb-0.5"
                          data-testid={`event-${event.id}`}
                        >
                          <span className={`truncate mr-2 ${getEventColorClass(event.eventType)}`}>
                            {formatted.text}
                          </span>
                          <button
                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-destructive hover:text-destructive/80 shrink-0 transition-opacity p-1"
                            onClick={() => undoEvent.mutate(event.id)}
                            data-testid={`button-undo-event-${event.id}`}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* === BOTTOM SHEETS / DIALOGS === */}

      {/* Shot Made/Missed */}
      <Sheet open={showShotPrompt} onOpenChange={setShowShotPrompt}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-center">
              {selectedZone?.points === 3 ? "3-Point Shot" : "2-Point Shot"} — {selectedZone?.label}
            </SheetTitle>
            <SheetDescription className="text-center">
              {selectedPlayer ? getPlayerLabel(selectedPlayer) : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="h-16 text-lg font-bold bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,35%)] text-white active:scale-95 transition-transform"
              onClick={() => recordShot(true)}
              data-testid="button-shot-made"
            >
              MADE
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="h-16 text-lg font-bold active:scale-95 transition-transform"
              onClick={() => recordShot(false)}
              data-testid="button-shot-missed"
            >
              MISSED
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Shooter Selection Sheet (Fix 1: zone-first flow) */}
      <Sheet open={showShooterSelect} onOpenChange={(v) => { setShowShooterSelect(v); if (!v) setPendingZone(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 max-h-[80vh]">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-center">
              {pendingZone?.points === 3 ? "3-Point Shot" : "2-Point Shot"} — {pendingZone?.label}
            </SheetTitle>
            <SheetDescription className="text-center text-xs">Select the shooter</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-y-auto max-h-[50vh]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">On Court</p>
            {onCourtPlayers.map((player) => (
              <Button
                key={`shooter-${player.id}`}
                variant="outline"
                className="w-full h-12 justify-start gap-2 font-medium active:scale-95 transition-transform"
                onClick={() => handleShooterSelected(player)}
                data-testid={`button-shooter-${player.id}`}
              >
                <span className="font-bold text-primary">#{player.number}</span>
                <span>{player.name}</span>
              </Button>
            ))}
            {benchPlayers.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-3">Bench</p>
                {benchPlayers.map((player) => (
                  <Button
                    key={`shooter-bench-${player.id}`}
                    variant="outline"
                    className="w-full h-10 justify-start gap-2 text-sm text-muted-foreground active:scale-95 transition-transform"
                    onClick={() => handleShooterSelected(player)}
                    data-testid={`button-shooter-bench-${player.id}`}
                  >
                    <span className="font-bold">#{player.number}</span>
                    <span>{player.name}</span>
                  </Button>
                ))}
              </>
            )}
            <Button
              variant="ghost"
              className="w-full h-10 text-muted-foreground"
              onClick={() => { setShowShooterSelect(false); setPendingZone(null); }}
              data-testid="button-cancel-shooter"
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Free Throw */}
      <Sheet open={showFTPrompt} onOpenChange={setShowFTPrompt}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-center">Free Throw</SheetTitle>
            <SheetDescription className="text-center">
              {selectedPlayer ? getPlayerLabel(selectedPlayer) : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="h-16 text-lg font-bold bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,35%)] text-white active:scale-95 transition-transform"
              onClick={() => recordFT(true)}
              data-testid="button-ft-made"
            >
              MADE
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="h-16 text-lg font-bold active:scale-95 transition-transform"
              onClick={() => recordFT(false)}
              data-testid="button-ft-missed"
            >
              MISSED
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Assist Prompt — Bottom Sheet */}
      <Sheet open={showAssistPrompt} onOpenChange={(v) => { setShowAssistPrompt(v); if (!v) setLastScoringEvent(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 max-h-[70vh]">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-center">Who assisted?</SheetTitle>
            <SheetDescription className="text-center text-xs">Select the passer or tap No Assist</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-y-auto max-h-[50vh]">
            {currentTeam?.players
              ?.filter(p => p.id !== lastScoringEvent?.playerId)
              .map((player) => (
                <Button
                  key={player.id}
                  variant="outline"
                  className="w-full h-12 justify-start gap-2 font-medium active:scale-95 transition-transform"
                  onClick={() => recordAssist(player)}
                  data-testid={`button-assist-player-${player.id}`}
                >
                  <span className="font-bold text-primary">#{player.number}</span>
                  <span>{player.name}</span>
                </Button>
              ))}
            <Button
              variant="ghost"
              className="w-full h-12 text-muted-foreground"
              onClick={() => { setShowAssistPrompt(false); setLastScoringEvent(null); }}
              data-testid="button-skip-assist"
            >
              No Assist
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Rebound / Block Prompt — Bottom Sheet (Fix 5: on-court players first, def rebound first) */}
      <Sheet open={showReboundPrompt} onOpenChange={setShowReboundPrompt}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 max-h-[80vh]">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-center">Rebound / Block</SheetTitle>
            <SheetDescription className="text-center text-xs">On-court players shown first</SheetDescription>
          </SheetHeader>
          <ReboundUI
            currentTeam={currentTeam}
            opposingTeam={opposingTeam}
            currentTeamId={currentTeamId}
            opposingTeamId={opposingTeamId}
            currentOnCourt={currentOnCourt}
            opposingOnCourt={activeTeam === "home" ? awayOnCourt : homeOnCourt}
            onRebound={recordRebound}
            onBlock={recordBlock}
            onSkip={() => { setShowReboundPrompt(false); setLastMissEvent(null); }}
          />
        </SheetContent>
      </Sheet>

      {/* Steal Prompt — Bottom Sheet (after turnover) */}
      <Sheet open={showStealPrompt} onOpenChange={(v) => { setShowStealPrompt(v); if (!v) setLastTurnoverTeamId(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 max-h-[70vh]">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-center">Steal?</SheetTitle>
            <SheetDescription className="text-center text-xs">Who stole the ball?</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-y-auto max-h-[50vh]">
            {/* Show opposing team players */}
            {(lastTurnoverTeamId === game.homeTeamId ? game.awayTeam : game.homeTeam)?.players?.map(p => (
              <Button
                key={p.id}
                variant="outline"
                className="w-full h-12 justify-start gap-2 font-medium active:scale-95 transition-transform"
                onClick={() => recordSteal(p, lastTurnoverTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)}
                data-testid={`button-steal-player-${p.id}`}
              >
                <span className="font-bold text-secondary">#{p.number}</span>
                <span>{p.name}</span>
              </Button>
            ))}
            <Button
              variant="ghost"
              className="w-full h-12 text-muted-foreground"
              onClick={() => { setShowStealPrompt(false); setLastTurnoverTeamId(null); }}
              data-testid="button-skip-steal"
            >
              No Steal
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Foul Type */}
      <Sheet open={showFoulPrompt} onOpenChange={setShowFoulPrompt}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-center">Foul Type</SheetTitle>
            <SheetDescription className="text-center text-xs">
              {selectedPlayer ? `${getPlayerLabel(selectedPlayer)} — ${getPlayerFouls(events, selectedPlayer.id)} fouls` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full h-12 font-semibold active:scale-95 transition-transform"
              onClick={() => recordFoul("personal_foul")}
              data-testid="button-personal-foul"
            >
              Personal Foul
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 font-semibold active:scale-95 transition-transform"
              onClick={() => recordFoul("technical_foul")}
              data-testid="button-technical-foul"
            >
              Technical Foul
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 font-semibold text-destructive active:scale-95 transition-transform"
              onClick={() => recordFoul("unsportsmanlike_foul")}
              data-testid="button-unsportsmanlike-foul"
            >
              Unsportsmanlike Foul
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Turnover Type */}
      <Sheet open={showTurnoverPrompt} onOpenChange={setShowTurnoverPrompt}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-center">Turnover Type</SheetTitle>
            <SheetDescription className="text-center text-xs">
              {selectedPlayer ? getPlayerLabel(selectedPlayer) : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
            {TURNOVER_TYPES.map((type) => (
              <Button
                key={type}
                variant="outline"
                className="h-11 text-xs active:scale-95 transition-transform"
                onClick={() => recordTurnover(type)}
                data-testid={`button-to-${type.toLowerCase().replace(/\s/g, "-")}`}
              >
                {type}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Substitution — Full Screen Dialog */}
      <Dialog open={showSubPrompt} onOpenChange={setShowSubPrompt}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Substitution</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Select player out, then player in
            </DialogDescription>
          </DialogHeader>
          <SubstitutionUI
            onCourtPlayers={onCourtPlayers}
            benchPlayers={benchPlayers}
            onSub={(out, inn) => recordSub(out, inn)}
            onCancel={() => setShowSubPrompt(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Next Period Confirmation */}
      <AlertDialog open={showNextPeriodConfirm} onOpenChange={setShowNextPeriodConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              End {getPeriodLabel(game.currentPeriod || 1)} and start {getPeriodLabel((game.currentPeriod || 1) + 1)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Team foul counts will reset for the new period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNextPeriod}>
              Start {getPeriodLabel((game.currentPeriod || 1) + 1)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* End Game / Overtime Confirmation */}
      <AlertDialog open={showEndGameConfirm} onOpenChange={setShowEndGameConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {homeScore === awayScore ? "Tied Game!" : "End of Regulation"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Score: {game.homeTeam?.name} {homeScore} - {awayScore} {game.awayTeam?.name}
              {homeScore === awayScore && ". The game is tied — overtime?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {homeScore === awayScore && (
              <Button variant="outline" onClick={handleOvertime} data-testid="button-overtime">
                Overtime (5 min)
              </Button>
            )}
            <AlertDialogAction onClick={handleEndGame} data-testid="button-end-game">
              End Game
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pause Overlay */}
      {showPauseOverlay && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="text-center text-white space-y-4">
            <p className="text-3xl font-bold">Game Paused</p>
            <p className="text-white/60 text-sm">
              {getPeriodLabel(game.currentPeriod || 1)} — {homeScore} : {awayScore}
            </p>
            <Button
              size="lg"
              className="bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,35%)] text-white h-14 px-8 text-lg font-bold active:scale-95 transition-transform"
              onClick={() => {
                updateGame.mutate({ status: "live" });
                setShowPauseOverlay(false);
              }}
              data-testid="button-resume-game"
            >
              <Play className="w-5 h-5 mr-2" /> Resume
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubstitutionUI({
  onCourtPlayers,
  benchPlayers,
  onSub,
  onCancel,
}: {
  onCourtPlayers: Player[];
  benchPlayers: Player[];
  onSub: (out: Player, inn: Player) => void;
  onCancel: () => void;
}) {
  const [playerOut, setPlayerOut] = useState<Player | null>(null);

  return (
    <div className="space-y-4">
      {!playerOut ? (
        <>
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider text-center">Player OUT (On Court)</p>
          <div className="space-y-1.5">
            {onCourtPlayers.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="w-full h-12 justify-start gap-2 active:scale-95 transition-transform"
                onClick={() => setPlayerOut(p)}
                data-testid={`button-sub-out-${p.id}`}
              >
                <span className="font-bold text-destructive">#{p.number}</span>
                <span>{p.name}</span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="text-center bg-muted/50 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Subbing out:</p>
            <p className="font-semibold text-sm text-destructive">#{playerOut.number} {playerOut.name}</p>
          </div>
          <p className="text-xs font-semibold text-[hsl(142,71%,45%)] uppercase tracking-wider text-center">Player IN (Bench)</p>
          <div className="space-y-1.5">
            {benchPlayers.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="w-full h-12 justify-start gap-2 active:scale-95 transition-transform"
                onClick={() => onSub(playerOut, p)}
                data-testid={`button-sub-in-${p.id}`}
              >
                <span className="font-bold text-[hsl(142,71%,45%)]">#{p.number}</span>
                <span>{p.name}</span>
              </Button>
            ))}
            {benchPlayers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No bench players available</p>
            )}
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setPlayerOut(null)}>
            ← Back
          </Button>
        </>
      )}
      <Button variant="ghost" className="w-full" onClick={onCancel} data-testid="button-cancel-sub">
        Cancel
      </Button>
    </div>
  );
}

function ReboundUI({
  currentTeam,
  opposingTeam,
  currentTeamId,
  opposingTeamId,
  currentOnCourt,
  opposingOnCourt,
  onRebound,
  onBlock,
  onSkip,
}: {
  currentTeam: (Team & { players: Player[] }) | undefined;
  opposingTeam: (Team & { players: Player[] }) | undefined;
  currentTeamId: string | undefined;
  opposingTeamId: string | undefined;
  currentOnCourt: Set<string>;
  opposingOnCourt: Set<string>;
  onRebound: (type: "offensive" | "defensive", player: Player, teamId: string) => void;
  onBlock: (player: Player, teamId: string) => void;
  onSkip: () => void;
}) {
  const [showBench, setShowBench] = useState(false);

  const currentOnCourtPlayers = currentTeam?.players?.filter(p => currentOnCourt.has(p.id)) || [];
  const currentBenchPlayers = currentTeam?.players?.filter(p => !currentOnCourt.has(p.id)) || [];
  const opposingOnCourtPlayers = opposingTeam?.players?.filter(p => opposingOnCourt.has(p.id)) || [];
  const opposingBenchPlayers = opposingTeam?.players?.filter(p => !opposingOnCourt.has(p.id)) || [];

  return (
    <div className="space-y-3 overflow-y-auto max-h-[60vh]">
      {/* Defensive Rebound first (most likely after a miss) */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Def Rebound ({opposingTeam?.name})</p>
        <div className="flex flex-wrap gap-1.5">
          {opposingOnCourtPlayers.map(p => (
            <Button
              key={`dreb-${p.id}`}
              variant="outline"
              size="sm"
              className="h-10 text-xs active:scale-95 transition-transform"
              onClick={() => onRebound("defensive", p, opposingTeamId!)}
            >
              #{p.number} {p.name.split(" ").pop()}
            </Button>
          ))}
          {showBench && opposingBenchPlayers.map(p => (
            <Button
              key={`dreb-bench-${p.id}`}
              variant="outline"
              size="sm"
              className="h-10 text-xs text-muted-foreground active:scale-95 transition-transform"
              onClick={() => onRebound("defensive", p, opposingTeamId!)}
            >
              #{p.number} {p.name.split(" ").pop()}
            </Button>
          ))}
        </div>
      </div>
      {/* Offensive Rebound — same team */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Off Rebound ({currentTeam?.name})</p>
        <div className="flex flex-wrap gap-1.5">
          {currentOnCourtPlayers.map(p => (
            <Button
              key={`oreb-${p.id}`}
              variant="outline"
              size="sm"
              className="h-10 text-xs active:scale-95 transition-transform"
              onClick={() => onRebound("offensive", p, currentTeamId!)}
            >
              #{p.number} {p.name.split(" ").pop()}
            </Button>
          ))}
          {showBench && currentBenchPlayers.map(p => (
            <Button
              key={`oreb-bench-${p.id}`}
              variant="outline"
              size="sm"
              className="h-10 text-xs text-muted-foreground active:scale-95 transition-transform"
              onClick={() => onRebound("offensive", p, currentTeamId!)}
            >
              #{p.number} {p.name.split(" ").pop()}
            </Button>
          ))}
        </div>
      </div>
      {/* Block — opposing team */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Block ({opposingTeam?.name})</p>
        <div className="flex flex-wrap gap-1.5">
          {opposingOnCourtPlayers.map(p => (
            <Button
              key={`blk-${p.id}`}
              variant="outline"
              size="sm"
              className="h-10 text-xs active:scale-95 transition-transform"
              onClick={() => onBlock(p, opposingTeamId!)}
            >
              #{p.number} {p.name.split(" ").pop()}
            </Button>
          ))}
          {showBench && opposingBenchPlayers.map(p => (
            <Button
              key={`blk-bench-${p.id}`}
              variant="outline"
              size="sm"
              className="h-10 text-xs text-muted-foreground active:scale-95 transition-transform"
              onClick={() => onBlock(p, opposingTeamId!)}
            >
              #{p.number} {p.name.split(" ").pop()}
            </Button>
          ))}
        </div>
      </div>
      {/* Show bench toggle */}
      {(currentBenchPlayers.length > 0 || opposingBenchPlayers.length > 0) && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setShowBench(!showBench)}
        >
          {showBench ? "Hide Bench" : "Show Bench Players"}
        </Button>
      )}
      <Button
        variant="ghost"
        className="w-full"
        onClick={onSkip}
        data-testid="button-skip-reb"
      >
        No Rebound (Out of Bounds)
      </Button>
    </div>
  );
}
