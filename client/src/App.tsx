import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomNav } from "@/components/BottomNav";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import TeamsPage from "@/pages/teams";
import TeamDetailPage from "@/pages/team-detail";
import GamesPage from "@/pages/games";
import GameSetupPage from "@/pages/game-setup";
import LiveScoringPage from "@/pages/live-scoring";
import BoxScorePage from "@/pages/box-score";
import ShotChartPage from "@/pages/shot-chart";
import PlayerProfilePage from "@/pages/player-profile";
import GameReviewPage from "@/pages/game-review";

function AppRouter() {
  const [location] = useLocation();
  // Hide bottom nav on live scoring page to maximize screen space
  const hiddenNavPaths = ['/live'];
  const showNav = !hiddenNavPaths.some(p => location.includes(p));

  return (
    <>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/teams" component={TeamsPage} />
        <Route path="/teams/:id" component={TeamDetailPage} />
        <Route path="/games" component={GamesPage} />
        <Route path="/games/new" component={GameSetupPage} />
        <Route path="/games/:id/live" component={LiveScoringPage} />
        <Route path="/games/:id/boxscore" component={BoxScorePage} />
        <Route path="/games/:id/shotchart" component={ShotChartPage} />
        <Route path="/games/:id/review" component={GameReviewPage} />
        <Route path="/players/:id" component={PlayerProfilePage} />
        <Route component={NotFound} />
      </Switch>
      {showNav && <BottomNav />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
