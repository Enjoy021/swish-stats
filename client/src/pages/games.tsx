import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trophy, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Game } from "@shared/schema";

type GameWithTeams = Game & { homeTeamName?: string; awayTeamName?: string };

function GameCard({ game }: { game: GameWithTeams }) {
  const { data: score } = useQuery<{ homeScore: number; awayScore: number }>({
    queryKey: ["/api/games", game.id, "score"],
    enabled: game.status === "live" || game.status === "completed" || game.status === "paused",
  });

  return (
    <Link href={game.status === 'completed' ? `/games/${game.id}/boxscore` : `/games/${game.id}/live`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid={`card-game-${game.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between pr-2">
                  <p className="font-semibold text-sm truncate">{game.homeTeamName || "Home"}</p>
                  {score && (
                    <p className={`font-bold text-base tabular-nums ml-2 ${
                      score.homeScore > score.awayScore ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {score.homeScore}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between pr-2">
                  <p className="font-semibold text-sm truncate">{game.awayTeamName || "Away"}</p>
                  {score && (
                    <p className={`font-bold text-base tabular-nums ml-2 ${
                      score.awayScore > score.homeScore ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {score.awayScore}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                  ${game.status === 'live' ? 'bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,35%)] dark:text-[hsl(142,71%,55%)]' :
                    game.status === 'completed' ? 'bg-muted text-muted-foreground' :
                    game.status === 'paused' ? 'bg-[hsl(17,100%,60%)]/15 text-[hsl(17,100%,50%)]' :
                    'bg-muted text-muted-foreground'}`}>
                  {game.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-[hsl(142,71%,45%)] mr-1 animate-pulse" />}
                  {game.status === 'completed' ? 'FINAL' : game.status.charAt(0).toUpperCase() + game.status.slice(1)}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Q{game.currentPeriod}
                </span>
                {game.gameDate && (
                  <span className="text-[10px] text-muted-foreground">{game.gameDate}</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function GamesPage() {
  const { data: games, isLoading } = useQuery<GameWithTeams[]>({
    queryKey: ["/api/games"],
  });

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-back-home">
              <ChevronLeft className="w-4 h-4" /> Home
            </Button>
          </Link>
          <h1 className="font-semibold text-base" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Games
          </h1>
          <Link href="/games/new">
            <Button size="sm" className="gap-1" data-testid="button-new-game">
              <Plus className="w-4 h-4" /> New
            </Button>
          </Link>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : games && games.length > 0 ? (
          games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))
        ) : (
          <Card className="border-dashed border-2">
            <CardContent className="p-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Trophy className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="font-medium mb-1">No games yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Start your first game to begin recording stats.
              </p>
              <Link href="/games/new">
                <Button data-testid="button-start-first-game">
                  <Plus className="w-4 h-4 mr-1" /> Start Game
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
