import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trophy, Users, ChevronRight, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SwishLogoFull } from "@/components/SwishLogo";
import { apiRequest } from "@/lib/queryClient";
import type { Team, Game, GameEvent } from "@shared/schema";

type GameWithTeams = Game & { homeTeamName?: string; awayTeamName?: string };

function useGameScore(gameId: string, enabled: boolean) {
  return useQuery<{ homeScore: number; awayScore: number }>({
    queryKey: ["/api/games", gameId, "score"],
    enabled,
  });
}

function GameScoreCard({ game }: { game: GameWithTeams }) {
  const { data: score } = useGameScore(game.id, game.status === "live" || game.status === "completed" || game.status === "paused");

  return (
    <Link href={game.status === 'completed' ? `/games/${game.id}/boxscore` : `/games/${game.id}/live`}>
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer"
        data-testid={`card-game-${game.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm truncate">{game.homeTeamName || "Home"}</p>
                    {score && (
                      <p className={`font-bold text-base tabular-nums ${
                        score.homeScore > score.awayScore ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {score.homeScore}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="font-semibold text-sm truncate">{game.awayTeamName || "Away"}</p>
                    {score && (
                      <p className={`font-bold text-base tabular-nums ${
                        score.awayScore > score.homeScore ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {score.awayScore}
                      </p>
                    )}
                  </div>
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
                {game.status !== 'completed' && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Q{game.currentPeriod}
                  </span>
                )}
                {game.gameDate && (
                  <span className="text-[10px] text-muted-foreground">{game.gameDate}</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  const { data: teams, isLoading: teamsLoading } = useQuery<(Team & { playerCount: number })[]>({
    queryKey: ["/api/teams"],
  });

  const { data: games, isLoading: gamesLoading } = useQuery<GameWithTeams[]>({
    queryKey: ["/api/games"],
  });

  // Quick stats
  const totalGames = games?.length || 0;
  const completedGames = games?.filter(g => g.status === 'completed').length || 0;
  const liveGames = games?.filter(g => g.status === 'live').length || 0;

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[hsl(210,35%,16%)] to-[hsl(220,40%,13%)] text-white px-4 pt-8 pb-10">
        <SwishLogoFull className="text-white" />
        <div className="mt-6 max-w-sm mx-auto">
          <Link href="/games/new">
            <Button
              size="lg"
              className="w-full bg-[hsl(17,100%,60%)] hover:bg-[hsl(17,100%,50%)] text-white font-semibold text-base h-14 rounded-xl shadow-lg touch-target"
              data-testid="button-new-game"
            >
              <Plus className="w-5 h-5 mr-2" />
              New Game
            </Button>
          </Link>
        </div>

        {/* Quick Stats */}
        {totalGames > 0 && (
          <div className="flex items-center justify-center gap-6 mt-4 text-white/60 text-xs">
            <div className="text-center">
              <p className="text-lg font-bold text-white tabular-nums">{totalGames}</p>
              <p>Games</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white tabular-nums">{completedGames}</p>
              <p>Completed</p>
            </div>
            {liveGames > 0 && (
              <>
                <div className="w-px h-8 bg-white/20" />
                <div className="text-center">
                  <p className="text-lg font-bold text-green-300 tabular-nums">{liveGames}</p>
                  <p>Live</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="px-4 -mt-4 max-w-lg mx-auto space-y-6">
        {/* My Teams Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> My Teams
            </h2>
            <Link href="/teams">
              <Button variant="ghost" size="sm" className="text-secondary text-xs" data-testid="link-all-teams">
                View All <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>

          {teamsLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-40 shrink-0 rounded-xl" />
              ))}
            </div>
          ) : teams && teams.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {teams.map((team) => (
                <Link key={team.id} href={`/teams/${team.id}`}>
                  <Card
                    className="shrink-0 min-w-[10rem] max-w-[12rem] hover:shadow-md transition-shadow cursor-pointer border-border/50"
                    data-testid={`card-team-${team.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-secondary" />
                        </div>
                        <span className="font-semibold text-sm leading-tight break-words line-clamp-2">{team.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {team.playerCount} player{team.playerCount !== 1 ? "s" : ""}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              <Link href="/teams">
                <Card className="shrink-0 min-w-[10rem] max-w-[12rem] border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center">
                  <CardContent className="p-4 flex flex-col items-center gap-2 text-muted-foreground">
                    <Plus className="w-6 h-6" />
                    <span className="text-xs font-medium">Add Team</span>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No teams yet</p>
                <p className="text-xs text-muted-foreground mb-4">Create your first team to start tracking stats</p>
                <Link href="/teams">
                  <Button size="sm" variant="outline" data-testid="button-create-first-team">
                    <Plus className="w-4 h-4 mr-1" /> Create Team
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Recent Games Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Recent Games
            </h2>
          </div>

          {gamesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : games && games.length > 0 ? (
            <div className="space-y-3">
              {games.slice(0, 5).map((game) => (
                <GameScoreCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Trophy className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No games recorded yet</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Start a new game to begin recording live stats
                </p>
                <Link href="/games/new">
                  <Button size="sm" data-testid="button-start-first-game">
                    <Plus className="w-4 h-4 mr-1" /> Start Game
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Attribution */}
        <footer className="text-center py-4 mt-4">
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
