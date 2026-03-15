import type { PlayerBoxScore } from "@shared/schema";

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const csvContent = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pctStr(made: number, attempts: number): string {
  if (attempts === 0) return "—";
  return ((made / attempts) * 100).toFixed(1);
}

export function exportBoxScoreCsv(
  teamName: string,
  players: PlayerBoxScore[],
  totals: Omit<PlayerBoxScore, 'playerId' | 'playerName' | 'playerNumber'>
): void {
  const headers = [
    "#",
    "Player",
    "MIN",
    "PTS",
    "FGM",
    "FGA",
    "FG%",
    "3PM",
    "3PA",
    "3P%",
    "FTM",
    "FTA",
    "FT%",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TO",
    "PF",
  ];
  const rows = players.map((p) => [
    String(p.playerNumber),
    p.playerName,
    String(p.minutes),
    String(p.points),
    String(p.fgm),
    String(p.fga),
    pctStr(p.fgm, p.fga),
    String(p.threePm),
    String(p.threePa),
    pctStr(p.threePm, p.threePa),
    String(p.ftm),
    String(p.fta),
    pctStr(p.ftm, p.fta),
    String(p.oreb),
    String(p.dreb),
    String(p.reb),
    String(p.ast),
    String(p.stl),
    String(p.blk),
    String(p.to),
    String(p.pf),
  ]);
  rows.push([
    "",
    "TOTALS",
    String(totals.minutes),
    String(totals.points),
    String(totals.fgm),
    String(totals.fga),
    pctStr(totals.fgm, totals.fga),
    String(totals.threePm),
    String(totals.threePa),
    pctStr(totals.threePm, totals.threePa),
    String(totals.ftm),
    String(totals.fta),
    pctStr(totals.ftm, totals.fta),
    String(totals.oreb),
    String(totals.dreb),
    String(totals.reb),
    String(totals.ast),
    String(totals.stl),
    String(totals.blk),
    String(totals.to),
    String(totals.pf),
  ]);
  const safeName = teamName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  downloadCsv(`boxscore-${safeName}.csv`, headers, rows);
}

export function exportGameEventsCsv(
  events: Array<{
    gameClockSeconds: number | null;
    quarter: number;
    teamId: string;
    playerId: string | null;
    eventType: string;
    shotResult?: string | null;
    courtX?: number | null;
    courtY?: number | null;
  }>,
  homeTeamId: string,
  homeTeamName: string,
  awayTeamName: string
): void {
  const headers = [
    "Time",
    "Quarter",
    "Team",
    "Player",
    "Event",
    "Shot Result",
    "Court X",
    "Court Y",
  ];
  const rows = events.map((e) => {
    const mins = e.gameClockSeconds != null ? Math.floor(e.gameClockSeconds / 60) : "";
    const secs = e.gameClockSeconds != null ? (e.gameClockSeconds % 60).toString().padStart(2, "0") : "";
    const time = e.gameClockSeconds != null ? `${mins}:${secs}` : "";
    return [
      time,
      String(e.quarter),
      e.teamId === homeTeamId ? homeTeamName : awayTeamName,
      e.playerId || "",
      e.eventType,
      e.shotResult || "",
      e.courtX != null ? String(e.courtX) : "",
      e.courtY != null ? String(e.courtY) : "",
    ];
  });
  downloadCsv("game-events.csv", headers, rows);
}

export function exportPlayerStatsCsv(
  playerName: string,
  games: Array<{
    date: string;
    opponent: string;
    result: string;
    stats: PlayerBoxScore;
  }>
): void {
  const headers = [
    "Date",
    "Opponent",
    "Result",
    "PTS",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TO",
    "FGM",
    "FGA",
    "FG%",
    "3PM",
    "3PA",
    "3P%",
    "FTM",
    "FTA",
    "FT%",
  ];
  const rows = games.map((g) => [
    g.date,
    g.opponent,
    g.result,
    String(g.stats.points),
    String(g.stats.reb),
    String(g.stats.ast),
    String(g.stats.stl),
    String(g.stats.blk),
    String(g.stats.to),
    String(g.stats.fgm),
    String(g.stats.fga),
    pctStr(g.stats.fgm, g.stats.fga),
    String(g.stats.threePm),
    String(g.stats.threePa),
    pctStr(g.stats.threePm, g.stats.threePa),
    String(g.stats.ftm),
    String(g.stats.fta),
    pctStr(g.stats.ftm, g.stats.fta),
  ]);
  const safeName = playerName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  downloadCsv(`player-stats-${safeName}.csv`, headers, rows);
}
