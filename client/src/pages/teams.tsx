import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Users, ChevronRight, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Team } from "@shared/schema";

export default function TeamsPage() {
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const { toast } = useToast();

  const { data: teams, isLoading } = useQuery<(Team & { playerCount: number })[]>({
    queryKey: ["/api/teams"],
  });

  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/teams", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setOpen(false);
      setTeamName("");
      toast({ title: "Team created", description: "Your new team is ready." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team deleted" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    createTeam.mutate(teamName.trim());
  };

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
            My Teams
          </h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-create-team">
                <Plus className="w-4 h-4" /> New
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Team</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  autoFocus
                  data-testid="input-team-name"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-team">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTeam.isPending || !teamName.trim()} data-testid="button-save-team">
                    {createTeam.isPending ? "Creating..." : "Create Team"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : teams && teams.length > 0 ? (
          teams.map((team) => (
            <Card
              key={team.id}
              className="hover:shadow-md transition-shadow"
              data-testid={`card-team-${team.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/15 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-secondary" />
                  </div>
                  <Link href={`/teams/${team.id}`} className="flex-1 min-w-0">
                    <div className="cursor-pointer">
                      <p className="font-semibold text-sm truncate">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {team.playerCount} player{team.playerCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      onClick={() => deleteTeam.mutate(team.id)}
                      data-testid={`button-delete-team-${team.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Link href={`/teams/${team.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-view-team-${team.id}`}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed border-2">
            <CardContent className="p-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="font-medium mb-1">No teams yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first team and add players to get started.
              </p>
              <Button onClick={() => setOpen(true)} data-testid="button-empty-create-team">
                <Plus className="w-4 h-4 mr-1" /> Create Team
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
