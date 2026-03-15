import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Play, Calendar, MapPin, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Team, Player } from "@shared/schema";

type TeamWithPlayers = Team & { playerCount: number };

export default function GameSetupPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [gameFormat, setGameFormat] = useState<"quarters" | "halves">("quarters");
  const [periodLength, setPeriodLength] = useState("10");
  const [venue, setVenue] = useState("");
  const [gameDate, setGameDate] = useState(new Date().toISOString().split("T")[0]);
  const [homeStarters, setHomeStarters] = useState<Set<string>>(new Set());
  const [awayStarters, setAwayStarters] = useState<Set<string>>(new Set());

  const { data: teams, isLoading } = useQuery<TeamWithPlayers[]>({
    queryKey: ["/api/teams"],
  });

  // Fetch players for selected teams
  const { data: homeTeamData } = useQuery<Team & { players: Player[] }>({
    queryKey: ["/api/teams", homeTeamId],
    enabled: !!homeTeamId,
  });

  const { data: awayTeamData } = useQuery<Team & { players: Player[] }>({
    queryKey: ["/api/teams", awayTeamId],
    enabled: !!awayTeamId,
  });

  // Auto-switch period length when format changes
  useEffect(() => {
    if (gameFormat === "quarters") {
      setPeriodLength("10");
    } else {
      setPeriodLength("20");
    }
  }, [gameFormat]);

  // Reset starters when team changes
  useEffect(() => { setHomeStarters(new Set()); }, [homeTeamId]);
  useEffect(() => { setAwayStarters(new Set()); }, [awayTeamId]);

  const toggleStarter = (set: Set<string>, setFn: (s: Set<string>) => void, playerId: string) => {
    const next = new Set(set);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      if (next.size >= 5) {
        toast({ title: "Maximum 5 starters", description: "Deselect a player first", variant: "destructive" });
        return;
      }
      next.add(playerId);
    }
    setFn(next);
  };

  const createGame = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/games", {
        homeTeamId,
        awayTeamId,
        gameFormat,
        periodLength: parseInt(periodLength),
        venue: venue || undefined,
        gameDate: gameDate || undefined,
        status: "live",
      });
      const game = await res.json();
      
      // Record starting lineups as substitution_in events
      const starters = [...Array.from(homeStarters), ...Array.from(awayStarters)];
      for (const playerId of starters) {
        const teamId = homeStarters.has(playerId) ? homeTeamId : awayTeamId;
        await apiRequest("POST", `/api/games/${game.id}/events`, {
          playerId,
          teamId,
          eventType: "substitution_in",
          quarter: 1,
          gameClockSeconds: parseInt(periodLength) * 60,
          metadata: { type: "starter" },
        });
      }
      
      return game;
    },
    onSuccess: (game) => {
      navigate(`/games/${game.id}/live`);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const homePlayersCount = homeTeamData?.players?.length || 0;
  const awayPlayersCount = awayTeamData?.players?.length || 0;
  const canStart = homeTeamId && awayTeamId && homeTeamId !== awayTeamId 
    && homeStarters.size === 5 && awayStarters.size === 5;

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center px-4 h-14 max-w-lg mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back-home">
              <ChevronLeft className="w-4 h-4" /> Home
            </Button>
          </Link>
          <h1 className="flex-1 text-center font-semibold text-base pr-16" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            New Game
          </h1>
        </div>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : teams && teams.length >= 2 ? (
          <>
            {/* Team Selection */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Teams</h2>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Home Team</Label>
                    <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                      <SelectTrigger className="h-12" data-testid="select-home-team">
                        <SelectValue placeholder="Select home team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id} disabled={team.id === awayTeamId}>
                            {team.name} ({team.playerCount} players)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">VS</span>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Away Team</Label>
                    <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                      <SelectTrigger className="h-12" data-testid="select-away-team">
                        <SelectValue placeholder="Select away team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id} disabled={team.id === homeTeamId}>
                            {team.name} ({team.playerCount} players)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Starting 5 Selection */}
            {homeTeamId && homeTeamData?.players && homeTeamData.players.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Users className="w-4 h-4" /> {homeTeamData.name} — Starting 5
                    </h2>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      homeStarters.size === 5 
                        ? "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,35%)] dark:text-[hsl(142,71%,55%)]"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {homeStarters.size}/5
                    </span>
                  </div>
                  <div className="space-y-1">
                    {homeTeamData.players.map((player) => (
                      <button
                        key={player.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                          homeStarters.has(player.id) 
                            ? "bg-primary/10 border border-primary/30" 
                            : "bg-muted/50 hover:bg-muted border border-transparent"
                        }`}
                        onClick={() => toggleStarter(homeStarters, setHomeStarters, player.id)}
                        data-testid={`starter-home-${player.id}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          homeStarters.has(player.id) 
                            ? "bg-primary border-primary" 
                            : "border-muted-foreground/30"
                        }`}>
                          {homeStarters.has(player.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="font-bold text-sm text-primary">#{player.number}</span>
                        <span className="text-sm flex-1">{player.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{player.position}</span>
                      </button>
                    ))}
                  </div>
                  {homePlayersCount < 5 && (
                    <p className="text-xs text-destructive">Need at least 5 players. Add more on the Teams page.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {awayTeamId && awayTeamData?.players && awayTeamData.players.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Users className="w-4 h-4" /> {awayTeamData.name} — Starting 5
                    </h2>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      awayStarters.size === 5 
                        ? "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,35%)] dark:text-[hsl(142,71%,55%)]"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {awayStarters.size}/5
                    </span>
                  </div>
                  <div className="space-y-1">
                    {awayTeamData.players.map((player) => (
                      <button
                        key={player.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                          awayStarters.has(player.id) 
                            ? "bg-secondary/10 border border-secondary/30" 
                            : "bg-muted/50 hover:bg-muted border border-transparent"
                        }`}
                        onClick={() => toggleStarter(awayStarters, setAwayStarters, player.id)}
                        data-testid={`starter-away-${player.id}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          awayStarters.has(player.id) 
                            ? "bg-secondary border-secondary" 
                            : "border-muted-foreground/30"
                        }`}>
                          {awayStarters.has(player.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="font-bold text-sm text-secondary">#{player.number}</span>
                        <span className="text-sm flex-1">{player.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{player.position}</span>
                      </button>
                    ))}
                  </div>
                  {awayPlayersCount < 5 && (
                    <p className="text-xs text-destructive">Need at least 5 players. Add more on the Teams page.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Game Format */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Game Format</h2>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`p-3 rounded-lg border-2 text-center transition-all touch-target
                      ${gameFormat === "quarters"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"}`}
                    onClick={() => setGameFormat("quarters")}
                    data-testid="button-format-quarters"
                  >
                    <p className="font-semibold text-sm">4 Quarters</p>
                    <p className="text-[10px] mt-0.5 opacity-70">4×10min FIBA</p>
                  </button>
                  <button
                    className={`p-3 rounded-lg border-2 text-center transition-all touch-target
                      ${gameFormat === "halves"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"}`}
                    onClick={() => setGameFormat("halves")}
                    data-testid="button-format-halves"
                  >
                    <p className="font-semibold text-sm">2 Halves</p>
                    <p className="text-[10px] mt-0.5 opacity-70">2×20min NCAA</p>
                  </button>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Period Length (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={periodLength}
                    onChange={(e) => setPeriodLength(e.target.value)}
                    data-testid="input-period-length"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Details</h2>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Date
                  </Label>
                  <Input
                    type="date"
                    value={gameDate}
                    onChange={(e) => setGameDate(e.target.value)}
                    data-testid="input-game-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Venue
                  </Label>
                  <Input
                    placeholder="e.g. Main Court"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    data-testid="input-venue"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Validation Summary */}
            {(homeTeamId || awayTeamId) && (
              <div className="text-xs text-muted-foreground space-y-1 px-1">
                {!homeTeamId && <p className="text-destructive">• Select a home team</p>}
                {!awayTeamId && <p className="text-destructive">• Select an away team</p>}
                {homeTeamId === awayTeamId && homeTeamId && <p className="text-destructive">• Home and away must be different teams</p>}
                {homeTeamId && homeStarters.size < 5 && <p className="text-destructive">• Select 5 starters for {homeTeamData?.name || "home team"} ({homeStarters.size}/5)</p>}
                {awayTeamId && awayStarters.size < 5 && <p className="text-destructive">• Select 5 starters for {awayTeamData?.name || "away team"} ({awayStarters.size}/5)</p>}
              </div>
            )}

            {/* Start Button */}
            <Button
              size="lg"
              className="w-full h-14 text-base font-semibold rounded-xl touch-target bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,35%)] text-white"
              disabled={!canStart || createGame.isPending}
              onClick={() => createGame.mutate()}
              data-testid="button-start-game"
            >
              <Play className="w-5 h-5 mr-2" />
              {createGame.isPending ? "Starting..." : "Start Game"}
            </Button>
          </>
        ) : (
          <Card className="border-dashed border-2">
            <CardContent className="p-10 flex flex-col items-center text-center">
              <p className="font-medium mb-2">Need at least 2 teams</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create teams and add players before starting a game.
              </p>
              <Link href="/teams">
                <Button data-testid="button-go-to-teams">Go to Teams</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
