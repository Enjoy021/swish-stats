import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, ChevronLeft, Trash2, Play, User, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Team, Player } from "@shared/schema";

interface SeasonStats {
  wins: number;
  losses: number;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  fgPct: number;
  threePct: number;
  ftPct: number;
  oppPpg: number;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

const positionColors: Record<string, string> = {
  PG: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  SG: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  SF: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  PF: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  C: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [open, setOpen] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("");
  const [playerPosition, setPlayerPosition] = useState<string>("PG");
  const { toast } = useToast();

  const { data: teamData, isLoading } = useQuery<Team & { players: Player[] }>({
    queryKey: ["/api/teams", id],
  });

  const { data: seasonStats } = useQuery<SeasonStats>({
    queryKey: ["/api/teams", id, "season-stats"],
    enabled: !!id,
  });

  const createPlayer = useMutation({
    mutationFn: async (data: { name: string; number: number; position: string; teamId: string }) => {
      const res = await apiRequest("POST", "/api/players", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setOpen(false);
      setPlayerName("");
      setPlayerNumber("");
      setPlayerPosition("PG");
      toast({ title: "Player added" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deletePlayer = useMutation({
    mutationFn: async (playerId: string) => {
      await apiRequest("DELETE", `/api/players/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Player removed" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !playerNumber || !id) return;
    createPlayer.mutate({
      name: playerName.trim(),
      number: parseInt(playerNumber),
      position: playerPosition,
      teamId: id,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center px-4 h-14 max-w-lg mx-auto">
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Team not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <Link href="/teams">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back-teams">
              <ChevronLeft className="w-4 h-4" /> Teams
            </Button>
          </Link>
          <h1 className="font-semibold text-base truncate max-w-[180px]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {teamData.name}
          </h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-player">
                <Plus className="w-4 h-4" /> Player
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Player</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  placeholder="Player name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  autoFocus
                  data-testid="input-player-name"
                />
                <Input
                  placeholder="Jersey number"
                  type="number"
                  min="0"
                  max="99"
                  value={playerNumber}
                  onChange={(e) => setPlayerNumber(e.target.value)}
                  data-testid="input-player-number"
                />
                <Select value={playerPosition} onValueChange={setPlayerPosition}>
                  <SelectTrigger data-testid="select-player-position">
                    <SelectValue placeholder="Position" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>
                        {pos} — {pos === "PG" ? "Point Guard" : pos === "SG" ? "Shooting Guard" : pos === "SF" ? "Small Forward" : pos === "PF" ? "Power Forward" : "Center"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-player">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createPlayer.isPending || !playerName.trim() || !playerNumber}
                    data-testid="button-save-player"
                  >
                    {createPlayer.isPending ? "Adding..." : "Add Player"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Quick action */}
        <Link href="/games/new">
          <Button
            variant="outline"
            className="w-full h-12 gap-2 border-primary/30 text-primary hover:bg-primary/5"
            data-testid="button-start-game"
          >
            <Play className="w-4 h-4" /> Start New Game
          </Button>
        </Link>

        {/* Season Stats */}
        {seasonStats && seasonStats.gamesPlayed > 0 && (
          <Card data-testid="card-season-stats">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[hsl(17,100%,60%)]" />
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Season Stats</h3>
                <Badge variant="outline" className="ml-auto text-[10px] h-5">
                  {seasonStats.wins}W - {seasonStats.losses}L
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>{seasonStats.ppg}</p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">PPG</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>{seasonStats.rpg}</p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">RPG</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>{seasonStats.apg}</p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">APG</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>{seasonStats.oppPpg}</p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">OPP PPG</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
                <div className="text-center">
                  <p className="text-sm font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {seasonStats.fgPct > 0 ? `${seasonStats.fgPct}%` : "—"}
                  </p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">FG%</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {seasonStats.threePct > 0 ? `${seasonStats.threePct}%` : "—"}
                  </p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">3PT%</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold tabular-nums" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {seasonStats.ftPct > 0 ? `${seasonStats.ftPct}%` : "—"}
                  </p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase">FT%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Roster */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Roster ({teamData.players?.length || 0})
          </h2>

          {teamData.players && teamData.players.length > 0 ? (
            <div className="space-y-2">
              {teamData.players
                .sort((a, b) => a.number - b.number)
                .map((player) => (
                  <Card key={player.id} data-testid={`card-player-${player.id}`}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Link href={`/players/${player.id}`}>
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center font-bold text-sm shrink-0 hover:bg-primary/10 transition-colors cursor-pointer"
                          style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          #{player.number}
                        </div>
                      </Link>
                      <Link href={`/players/${player.id}`} className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate hover:text-primary transition-colors cursor-pointer">{player.name}</p>
                        <Badge variant="secondary" className={`text-[10px] mt-0.5 ${positionColors[player.position] || ""}`}>
                          {player.position}
                        </Badge>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deletePlayer.mutate(player.id)}
                        data-testid={`button-delete-player-${player.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <User className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No players added</p>
                <p className="text-xs text-muted-foreground mb-4">Add players to build your roster</p>
                <Button size="sm" onClick={() => setOpen(true)} data-testid="button-empty-add-player">
                  <Plus className="w-4 h-4 mr-1" /> Add Player
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
