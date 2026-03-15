import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertPlayerSchema, insertGameSchema, insertGameEventSchema } from "@shared/schema";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

const DEFAULT_USER_ID = 'default-user';

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ---- Teams ----
  app.get("/api/teams", async (_req, res) => {
    const teams = await storage.getTeams(DEFAULT_USER_ID);
    // Attach player counts
    const teamsWithCounts = await Promise.all(
      teams.map(async (team) => {
        const players = await storage.getPlayersByTeam(team.id);
        return { ...team, playerCount: players.length };
      })
    );
    res.json(teamsWithCounts);
  });

  app.get("/api/teams/:id", async (req, res) => {
    const team = await storage.getTeam(req.params.id);
    if (!team) return res.status(404).json({ error: "Team not found" });
    const players = await storage.getPlayersByTeam(team.id);
    res.json({ ...team, players });
  });

  app.post("/api/teams", async (req, res) => {
    const parsed = insertTeamSchema.safeParse({ ...req.body, userId: DEFAULT_USER_ID });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const team = await storage.createTeam(parsed.data);
    res.status(201).json(team);
  });

  app.patch("/api/teams/:id", async (req, res) => {
    const team = await storage.updateTeam(req.params.id, req.body);
    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json(team);
  });

  app.delete("/api/teams/:id", async (req, res) => {
    const deleted = await storage.deleteTeam(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Team not found" });
    res.json({ success: true });
  });

  // ---- Players ----
  app.get("/api/teams/:teamId/players", async (req, res) => {
    const players = await storage.getPlayersByTeam(req.params.teamId);
    res.json(players);
  });

  app.post("/api/players", async (req, res) => {
    const parsed = insertPlayerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const player = await storage.createPlayer(parsed.data);
    res.status(201).json(player);
  });

  app.patch("/api/players/:id", async (req, res) => {
    const player = await storage.updatePlayer(req.params.id, req.body);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  });

  app.delete("/api/players/:id", async (req, res) => {
    const deleted = await storage.deletePlayer(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Player not found" });
    res.json({ success: true });
  });

  // ---- Games ----
  app.get("/api/games", async (_req, res) => {
    const games = await storage.getGames(DEFAULT_USER_ID);
    // Attach team names
    const gamesWithTeams = await Promise.all(
      games.map(async (game) => {
        const homeTeam = await storage.getTeam(game.homeTeamId);
        const awayTeam = await storage.getTeam(game.awayTeamId);
        return { ...game, homeTeamName: homeTeam?.name, awayTeamName: awayTeam?.name };
      })
    );
    res.json(gamesWithTeams);
  });

  app.get("/api/games/:id", async (req, res) => {
    const game = await storage.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found" });
    const homeTeam = await storage.getTeam(game.homeTeamId);
    const awayTeam = await storage.getTeam(game.awayTeamId);
    const homePlayers = await storage.getPlayersByTeam(game.homeTeamId);
    const awayPlayers = await storage.getPlayersByTeam(game.awayTeamId);
    res.json({
      ...game,
      homeTeam: { ...homeTeam, players: homePlayers },
      awayTeam: { ...awayTeam, players: awayPlayers },
    });
  });

  app.post("/api/games", async (req, res) => {
    const parsed = insertGameSchema.safeParse({ ...req.body, userId: DEFAULT_USER_ID });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const game = await storage.createGame(parsed.data);
    res.status(201).json(game);
  });

  app.patch("/api/games/:id", async (req, res) => {
    const game = await storage.updateGame(req.params.id, req.body);
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  // ---- Game Events ----
  app.get("/api/games/:gameId/events", async (req, res) => {
    const events = await storage.getGameEvents(req.params.gameId);
    res.json(events);
  });

  app.post("/api/games/:gameId/events", async (req, res) => {
    const parsed = insertGameEventSchema.safeParse({
      ...req.body,
      gameId: req.params.gameId,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const event = await storage.createGameEvent(parsed.data);
    res.status(201).json(event);
  });

  app.delete("/api/games/:gameId/events/:eventId", async (req, res) => {
    const deleted = await storage.softDeleteGameEvent(req.params.eventId);
    if (!deleted) return res.status(404).json({ error: "Event not found" });
    res.json({ success: true });
  });

  // ---- Box Score ----
  app.get("/api/games/:gameId/boxscore/:teamId", async (req, res) => {
    const boxScore = await storage.getBoxScore(req.params.gameId, req.params.teamId);
    res.json(boxScore);
  });

  // ---- Player Stats ----
  app.get("/api/players/:id/stats", async (req, res) => {
    const player = await storage.getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: "Player not found" });

    const team = await storage.getTeam(player.teamId);
    if (!team) return res.status(404).json({ error: "Team not found" });

    // Find all games where this player's team participated
    const allGames = await storage.getGames(DEFAULT_USER_ID);
    const teamGames = allGames.filter(
      (g) =>
        (g.homeTeamId === player.teamId || g.awayTeamId === player.teamId) &&
        (g.status === "live" || g.status === "paused" || g.status === "completed")
    );

    const gameResults: Array<{
      gameId: string;
      date: string;
      opponent: string;
      result: string;
      stats: import("@shared/schema").PlayerBoxScore;
    }> = [];

    let totalPoints = 0,
      totalReb = 0,
      totalAst = 0,
      totalStl = 0,
      totalBlk = 0,
      totalTo = 0,
      totalFgm = 0,
      totalFga = 0,
      totalThreePm = 0,
      totalThreePa = 0,
      totalFtm = 0,
      totalFta = 0,
      totalEff = 0;

    for (const game of teamGames) {
      const isHome = game.homeTeamId === player.teamId;
      const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
      const opponent = await storage.getTeam(opponentId);

      const boxScore = await storage.getBoxScore(game.id, player.teamId);
      const playerStats = boxScore.players.find((p) => p.playerId === player.id);
      if (!playerStats) continue;

      // Check if player had any activity in this game
      const hadActivity =
        playerStats.points > 0 ||
        playerStats.fga > 0 ||
        playerStats.fta > 0 ||
        playerStats.reb > 0 ||
        playerStats.ast > 0 ||
        playerStats.stl > 0 ||
        playerStats.blk > 0 ||
        playerStats.to > 0 ||
        playerStats.pf > 0;
      if (!hadActivity) continue;

      // Calculate scores for W/L result
      const events = await storage.getGameEvents(game.id);
      let homeScore = 0,
        awayScore = 0;
      for (const event of events) {
        const pts =
          event.eventType === "2pt_made"
            ? 2
            : event.eventType === "3pt_made"
              ? 3
              : event.eventType === "ft_made"
                ? 1
                : 0;
        if (event.teamId === game.homeTeamId) homeScore += pts;
        else awayScore += pts;
      }

      const teamScore = isHome ? homeScore : awayScore;
      const oppScore = isHome ? awayScore : homeScore;
      const won = teamScore > oppScore;
      const result = `${won ? "W" : "L"} ${teamScore}-${oppScore}`;

      const eff =
        playerStats.points -
        (playerStats.fga - playerStats.fgm) -
        (playerStats.fta - playerStats.ftm) +
        playerStats.reb +
        playerStats.ast -
        playerStats.to +
        playerStats.stl +
        playerStats.blk;

      gameResults.push({
        gameId: game.id,
        date: game.gameDate || "",
        opponent: opponent?.name || "Unknown",
        result,
        stats: playerStats,
      });

      totalPoints += playerStats.points;
      totalReb += playerStats.reb;
      totalAst += playerStats.ast;
      totalStl += playerStats.stl;
      totalBlk += playerStats.blk;
      totalTo += playerStats.to;
      totalFgm += playerStats.fgm;
      totalFga += playerStats.fga;
      totalThreePm += playerStats.threePm;
      totalThreePa += playerStats.threePa;
      totalFtm += playerStats.ftm;
      totalFta += playerStats.fta;
      totalEff += eff;
    }

    const gp = gameResults.length;
    const seasonAverages = {
      gamesPlayed: gp,
      ppg: gp > 0 ? Math.round((totalPoints / gp) * 10) / 10 : 0,
      rpg: gp > 0 ? Math.round((totalReb / gp) * 10) / 10 : 0,
      apg: gp > 0 ? Math.round((totalAst / gp) * 10) / 10 : 0,
      spg: gp > 0 ? Math.round((totalStl / gp) * 10) / 10 : 0,
      bpg: gp > 0 ? Math.round((totalBlk / gp) * 10) / 10 : 0,
      topg: gp > 0 ? Math.round((totalTo / gp) * 10) / 10 : 0,
      fgPct: totalFga > 0 ? Math.round((totalFgm / totalFga) * 1000) / 10 : 0,
      threePct: totalThreePa > 0 ? Math.round((totalThreePm / totalThreePa) * 1000) / 10 : 0,
      ftPct: totalFta > 0 ? Math.round((totalFtm / totalFta) * 1000) / 10 : 0,
      eff: gp > 0 ? Math.round((totalEff / gp) * 10) / 10 : 0,
    };

    res.json({ player, team, games: gameResults, seasonAverages });
  });

  // ---- Advanced Stats ----
  app.get("/api/games/:gameId/advanced-stats", async (req, res) => {
    const game = await storage.getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const events = await storage.getGameEvents(req.params.gameId);
    const homePlayers = await storage.getPlayersByTeam(game.homeTeamId);
    const awayPlayers = await storage.getPlayersByTeam(game.awayTeamId);
    const homePlayerIds = new Set(homePlayers.map((p) => p.id));
    const awayPlayerIds = new Set(awayPlayers.map((p) => p.id));

    // Starters vs bench: first 5 by roster order are starters (simplified)
    const homeStarterIds = new Set(homePlayers.slice(0, 5).map((p) => p.id));
    const awayStarterIds = new Set(awayPlayers.slice(0, 5).map((p) => p.id));

    let homePointsInPaint = 0, awayPointsInPaint = 0;
    let homeSecondChance = 0, awaySecondChance = 0;
    let homeBenchPoints = 0, awayBenchPoints = 0;
    let homeScore = 0, awayScore = 0;
    let leadChanges = 0, timesTied = 0;
    let homeLargestLead = 0, awayLargestLead = 0;
    let homeCurrentRun = 0, awayCurrentRun = 0;
    let largestRun = 0;
    let lastScoringTeam: string | null = null;
    let prevLeader: string | null = null;
    let wasTied = true; // starts tied at 0-0

    // Track offensive rebounds for second-chance detection
    let homeHasOreb = false, awayHasOreb = false;

    // Process events in chronological order (getGameEvents returns newest-first)
    const chronological = [...events].reverse();

    for (const event of chronological) {
      const isHome = event.teamId === game.homeTeamId;

      // Track offensive rebounds
      if (event.eventType === "offensive_rebound") {
        if (isHome) homeHasOreb = true;
        else awayHasOreb = true;
      }

      // Reset oreb tracking on missed shots (new possession opportunity)
      if (event.eventType === "2pt_attempt" || event.eventType === "3pt_attempt" || event.eventType === "ft_attempt") {
        // A miss means a potential rebound follows; don't reset here
      }

      // Scoring events
      const pts =
        event.eventType === "2pt_made" ? 2 :
        event.eventType === "3pt_made" ? 3 :
        event.eventType === "ft_made" ? 1 : 0;

      if (pts > 0) {
        if (isHome) homeScore += pts;
        else awayScore += pts;

        // Points in paint: 2pt makes with courtX/courtY inside paint area
        // Paint is roughly center court, x between 35-65, y between 0-19 or 81-100 (near basket)
        if (event.eventType === "2pt_made" && event.courtX != null && event.courtY != null) {
          const inPaint = event.courtX >= 17 && event.courtX <= 83 &&
            (event.courtY <= 19 || event.courtY >= 81);
          if (inPaint) {
            if (isHome) homePointsInPaint += pts;
            else awayPointsInPaint += pts;
          }
        }

        // Second chance points: scoring after an offensive rebound
        if (isHome && homeHasOreb) {
          homeSecondChance += pts;
          homeHasOreb = false;
        } else if (!isHome && awayHasOreb) {
          awaySecondChance += pts;
          awayHasOreb = false;
        }

        // Bench points
        if (event.playerId) {
          if (isHome && !homeStarterIds.has(event.playerId)) homeBenchPoints += pts;
          else if (!isHome && !awayStarterIds.has(event.playerId)) awayBenchPoints += pts;
        }

        // Run tracking
        if (lastScoringTeam === event.teamId) {
          if (isHome) homeCurrentRun += pts;
          else awayCurrentRun += pts;
        } else {
          // New team scoring - reset
          if (isHome) {
            awayCurrentRun = 0;
            homeCurrentRun = pts;
          } else {
            homeCurrentRun = 0;
            awayCurrentRun = pts;
          }
          lastScoringTeam = event.teamId;
        }
        largestRun = Math.max(largestRun, homeCurrentRun, awayCurrentRun);

        // Lead changes and times tied
        const diff = homeScore - awayScore;
        const currentLeader = diff > 0 ? "home" : diff < 0 ? "away" : null;

        if (diff === 0 && !wasTied) {
          timesTied++;
          wasTied = true;
        } else if (diff !== 0) {
          wasTied = false;
        }

        if (currentLeader && prevLeader && currentLeader !== prevLeader) {
          leadChanges++;
        }
        prevLeader = currentLeader;

        // Track largest leads
        if (homeScore - awayScore > homeLargestLead) homeLargestLead = homeScore - awayScore;
        if (awayScore - homeScore > awayLargestLead) awayLargestLead = awayScore - homeScore;
      }

      // Reset oreb on turnovers (possession change)
      if (event.eventType === "turnover") {
        if (isHome) homeHasOreb = false;
        else awayHasOreb = false;
      }
    }

    res.json({
      home: {
        pointsInPaint: homePointsInPaint,
        secondChancePoints: homeSecondChance,
        fastBreakPoints: 0,
        benchPoints: homeBenchPoints,
        largestLead: homeLargestLead,
      },
      away: {
        pointsInPaint: awayPointsInPaint,
        secondChancePoints: awaySecondChance,
        fastBreakPoints: 0,
        benchPoints: awayBenchPoints,
        largestLead: awayLargestLead,
      },
      leadChanges,
      timesTied,
      largestRun,
    });
  });

  // ---- Score calculation ----
  app.get("/api/games/:gameId/score", async (req, res) => {
    const game = await storage.getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });
    
    const events = await storage.getGameEvents(req.params.gameId);
    
    let homeScore = 0;
    let awayScore = 0;
    
    for (const event of events) {
      const points = event.eventType === '2pt_made' ? 2 
        : event.eventType === '3pt_made' ? 3 
        : event.eventType === 'ft_made' ? 1 
        : 0;
      
      if (event.teamId === game.homeTeamId) {
        homeScore += points;
      } else {
        awayScore += points;
      }
    }
    
    res.json({ homeScore, awayScore });
  });

  // ---- PDF Game Report ----
  app.get("/api/games/:gameId/report/pdf", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.gameId);
      if (!game) return res.status(404).json({ error: "Game not found" });

      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = await storage.getTeam(game.awayTeamId);
      if (!homeTeam || !awayTeam) return res.status(404).json({ error: "Team not found" });

      const homeBoxScore = await storage.getBoxScore(game.id, game.homeTeamId);
      const awayBoxScore = await storage.getBoxScore(game.id, game.awayTeamId);

      const events = await storage.getGameEvents(game.id);
      let homeScore = 0, awayScore = 0;
      for (const event of events) {
        const pts = event.eventType === "2pt_made" ? 2
          : event.eventType === "3pt_made" ? 3
          : event.eventType === "ft_made" ? 1 : 0;
        if (event.teamId === game.homeTeamId) homeScore += pts;
        else awayScore += pts;
      }

      // Compute advanced stats inline
      const homePlayers = await storage.getPlayersByTeam(game.homeTeamId);
      const awayPlayers = await storage.getPlayersByTeam(game.awayTeamId);
      const homeStarterIds = new Set(homePlayers.slice(0, 5).map(p => p.id));
      const awayStarterIds = new Set(awayPlayers.slice(0, 5).map(p => p.id));

      let homePointsInPaint = 0, awayPointsInPaint = 0;
      let homeSecondChance = 0, awaySecondChance = 0;
      let homeBenchPoints = 0, awayBenchPoints = 0;
      let homeHasOreb = false, awayHasOreb = false;

      const chronological = [...events].reverse();
      for (const event of chronological) {
        const isHome = event.teamId === game.homeTeamId;
        if (event.eventType === "offensive_rebound") {
          if (isHome) homeHasOreb = true; else awayHasOreb = true;
        }
        const pts = event.eventType === "2pt_made" ? 2
          : event.eventType === "3pt_made" ? 3
          : event.eventType === "ft_made" ? 1 : 0;
        if (pts > 0) {
          if (event.eventType === "2pt_made" && event.courtX != null && event.courtY != null) {
            const inPaint = event.courtX >= 17 && event.courtX <= 83 && (event.courtY <= 19 || event.courtY >= 81);
            if (inPaint) { if (isHome) homePointsInPaint += pts; else awayPointsInPaint += pts; }
          }
          if (isHome && homeHasOreb) { homeSecondChance += pts; homeHasOreb = false; }
          else if (!isHome && awayHasOreb) { awaySecondChance += pts; awayHasOreb = false; }
          if (event.playerId) {
            if (isHome && !homeStarterIds.has(event.playerId)) homeBenchPoints += pts;
            else if (!isHome && !awayStarterIds.has(event.playerId)) awayBenchPoints += pts;
          }
        }
        if (event.eventType === "turnover") {
          if (isHome) homeHasOreb = false; else awayHasOreb = false;
        }
      }

      // Generate PDF
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const navy = "#1a2744";
      const orange = "#e8602c";

      // --- Header ---
      doc.setFillColor(navy);
      doc.rect(0, 0, pageWidth, 44, "F");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor("#ffffff");
      doc.text("GAME REPORT", pageWidth / 2, 14, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor("#cccccc");
      const dateVenue = [game.gameDate, game.venue].filter(Boolean).join(" • ");
      if (dateVenue) doc.text(dateVenue, pageWidth / 2, 20, { align: "center" });

      // Score
      doc.setFontSize(28);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor("#ffffff");
      doc.text(String(homeScore), pageWidth / 2 - 20, 35, { align: "right" });
      doc.setFontSize(14);
      doc.text("—", pageWidth / 2, 34, { align: "center" });
      doc.setFontSize(28);
      doc.text(String(awayScore), pageWidth / 2 + 20, 35, { align: "left" });

      // Team names
      doc.setFontSize(9);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor("#cccccc");
      doc.text(homeTeam.name, pageWidth / 2 - 20, 40, { align: "right" });
      doc.text(awayTeam.name, pageWidth / 2 + 20, 40, { align: "left" });

      // Status badge
      const status = game.status === "completed" ? "FINAL" : (game.status || "").toUpperCase();
      doc.setFontSize(7);
      doc.setTextColor(orange);
      doc.text(status, pageWidth / 2, 44 - 1, { align: "center" });

      let yPos = 52;

      // --- Box Score Helper ---
      const pctStr = (m: number, a: number) => a === 0 ? "—" : ((m / a) * 100).toFixed(1);

      const renderBoxScore = (teamName: string, boxScore: typeof homeBoxScore) => {
        // Team header
        doc.setFontSize(12);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(orange);
        doc.text(teamName, 14, yPos);
        yPos += 2;

        const sorted = [...boxScore.players].sort((a, b) => b.points - a.points);

        const tableHeaders = ["Player", "PTS", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "REB", "AST", "STL", "BLK", "TO", "PF"];
        const tableBody = sorted.map(p => [
          `#${p.playerNumber} ${p.playerName}`,
          String(p.points),
          `${p.fgm}-${p.fga}`,
          pctStr(p.fgm, p.fga),
          `${p.threePm}-${p.threePa}`,
          pctStr(p.threePm, p.threePa),
          `${p.ftm}-${p.fta}`,
          pctStr(p.ftm, p.fta),
          String(p.reb),
          String(p.ast),
          String(p.stl),
          String(p.blk),
          String(p.to),
          String(p.pf),
        ]);

        const t = boxScore.totals;
        tableBody.push([
          "TOTALS",
          String(t.points),
          `${t.fgm}-${t.fga}`,
          pctStr(t.fgm, t.fga),
          `${t.threePm}-${t.threePa}`,
          pctStr(t.threePm, t.threePa),
          `${t.ftm}-${t.fta}`,
          pctStr(t.ftm, t.fta),
          String(t.reb),
          String(t.ast),
          String(t.stl),
          String(t.blk),
          String(t.to),
          String(t.pf),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [tableHeaders],
          body: tableBody,
          theme: "grid",
          headStyles: {
            fillColor: navy,
            textColor: "#ffffff",
            fontSize: 7,
            fontStyle: "bold",
            halign: "center",
          },
          bodyStyles: {
            fontSize: 7,
            halign: "center",
          },
          columnStyles: {
            0: { halign: "left", cellWidth: 36 },
          },
          alternateRowStyles: {
            fillColor: "#f4f4f8",
          },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            // Bold totals row
            if (data.row.index === tableBody.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = "#e8e8ee";
            }
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
      };

      renderBoxScore(homeTeam.name, homeBoxScore);

      // Check if we need a new page
      if (yPos > 230) {
        doc.addPage();
        yPos = 16;
      }

      renderBoxScore(awayTeam.name, awayBoxScore);

      // --- Team Comparison ---
      if (yPos > 230) {
        doc.addPage();
        yPos = 16;
      }

      doc.setFontSize(12);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(orange);
      doc.text("Team Comparison", 14, yPos);
      yPos += 2;

      const ht = homeBoxScore.totals;
      const at = awayBoxScore.totals;
      const compHeaders = ["Stat", homeTeam.name, awayTeam.name];
      const compBody = [
        ["Points", String(ht.points), String(at.points)],
        ["FG%", pctStr(ht.fgm, ht.fga) + "%", pctStr(at.fgm, at.fga) + "%"],
        ["3PT%", pctStr(ht.threePm, ht.threePa) + "%", pctStr(at.threePm, at.threePa) + "%"],
        ["FT%", pctStr(ht.ftm, ht.fta) + "%", pctStr(at.ftm, at.fta) + "%"],
        ["Rebounds", String(ht.reb), String(at.reb)],
        ["Assists", String(ht.ast), String(at.ast)],
        ["Steals", String(ht.stl), String(at.stl)],
        ["Blocks", String(ht.blk), String(at.blk)],
        ["Turnovers", String(ht.to), String(at.to)],
        ["Pts in Paint", String(homePointsInPaint), String(awayPointsInPaint)],
        ["2nd Chance Pts", String(homeSecondChance), String(awaySecondChance)],
        ["Bench Pts", String(homeBenchPoints), String(awayBenchPoints)],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [compHeaders],
        body: compBody,
        theme: "grid",
        headStyles: {
          fillColor: navy,
          textColor: "#ffffff",
          fontSize: 8,
          fontStyle: "bold",
          halign: "center",
        },
        bodyStyles: {
          fontSize: 8,
          halign: "center",
        },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold", cellWidth: 40 },
        },
        alternateRowStyles: {
          fillColor: "#f4f4f8",
        },
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;

      // --- Footer ---
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor("#dddddd");
      doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
      doc.setFontSize(7);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor("#999999");
      doc.text("Generated by Swish Stats — Powered by Swish N' Dish", pageWidth / 2, pageHeight - 11, { align: "center" });
      doc.text(new Date().toLocaleString(), pageWidth / 2, pageHeight - 7, { align: "center" });

      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=game-report.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  });

  // ---- Season Stats ----
  app.get("/api/teams/:teamId/season-stats", async (req, res) => {
    const { teamId } = req.params;
    const team = await storage.getTeam(teamId);
    if (!team) return res.status(404).json({ error: "Team not found" });

    const allGames = await storage.getGames(DEFAULT_USER_ID);
    const teamGames = allGames.filter(
      (g) =>
        g.status === "completed" &&
        (g.homeTeamId === teamId || g.awayTeamId === teamId)
    );

    if (teamGames.length === 0) {
      return res.json({
        wins: 0,
        losses: 0,
        gamesPlayed: 0,
        ppg: 0,
        rpg: 0,
        apg: 0,
        fgPct: 0,
        threePct: 0,
        ftPct: 0,
        oppPpg: 0,
      });
    }

    let wins = 0;
    let losses = 0;
    let totalPts = 0;
    let totalReb = 0;
    let totalAst = 0;
    let totalFgm = 0;
    let totalFga = 0;
    let total3pm = 0;
    let total3pa = 0;
    let totalFtm = 0;
    let totalFta = 0;
    let totalOppPts = 0;

    for (const game of teamGames) {
      const bs = await storage.getBoxScore(game.id, teamId);
      const oppTeamId =
        game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
      const oppBs = await storage.getBoxScore(game.id, oppTeamId);

      totalPts += bs.totals.points;
      totalReb += bs.totals.reb;
      totalAst += bs.totals.ast;
      totalFgm += bs.totals.fgm;
      totalFga += bs.totals.fga;
      total3pm += bs.totals.threePm;
      total3pa += bs.totals.threePa;
      totalFtm += bs.totals.ftm;
      totalFta += bs.totals.fta;
      totalOppPts += oppBs.totals.points;

      if (bs.totals.points > oppBs.totals.points) wins++;
      else losses++;
    }

    const gp = teamGames.length;
    res.json({
      wins,
      losses,
      gamesPlayed: gp,
      ppg: parseFloat((totalPts / gp).toFixed(1)),
      rpg: parseFloat((totalReb / gp).toFixed(1)),
      apg: parseFloat((totalAst / gp).toFixed(1)),
      fgPct:
        totalFga > 0
          ? parseFloat(((totalFgm / totalFga) * 100).toFixed(1))
          : 0,
      threePct:
        total3pa > 0
          ? parseFloat(((total3pm / total3pa) * 100).toFixed(1))
          : 0,
      ftPct:
        totalFta > 0
          ? parseFloat(((totalFtm / totalFta) * 100).toFixed(1))
          : 0,
      oppPpg: parseFloat((totalOppPts / gp).toFixed(1)),
    });
  });

  return httpServer;
}
