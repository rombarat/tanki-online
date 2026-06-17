import { TANK_STATS } from "../../src/actors/config.ts";

export class HUD {
  private hpBarFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private playerNameTag: HTMLSpanElement;
  private scoreRedText: HTMLSpanElement;
  private scoreBlueText: HTMLSpanElement;
  private teamScoresBar: HTMLDivElement;
  private ffaScoresBar: HTMLDivElement;
  private ffaLeaderName: HTMLSpanElement;
  private ffaLeaderScore: HTMLSpanElement;
  private killfeedContainer: HTMLDivElement;
  private abilityUi: HTMLDivElement;
  private abilityIcon: HTMLDivElement;
  private abilityName: HTMLSpanElement;
  private abilityCooldownOverlay: HTMLDivElement;
  private abilityCooldownText: HTMLSpanElement;
  
  private scoreboardOverlay: HTMLDivElement;
  private scoreboardBody: HTMLTableSectionElement;
  private scoreboardModeLabel: HTMLSpanElement;
  private gameOverOverlay: HTMLDivElement;
  private winTitle: HTMLHeadingElement;
  private winSubtitle: HTMLParagraphElement;
  
  private damageVignette: HTMLDivElement;
  
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;
  
  constructor() {
    this.hpBarFill = document.getElementById("hp-bar-fill") as HTMLDivElement;
    this.hpText = document.getElementById("hp-text") as HTMLSpanElement;
    this.playerNameTag = document.getElementById("player-name-tag") as HTMLSpanElement;
    this.scoreRedText = document.getElementById("score-red") as HTMLSpanElement;
    this.scoreBlueText = document.getElementById("score-blue") as HTMLSpanElement;
    this.teamScoresBar = document.getElementById("team-scores") as HTMLDivElement;
    this.ffaScoresBar = document.getElementById("ffa-scores") as HTMLDivElement;
    this.ffaLeaderName = document.getElementById("ffa-leader-name") as HTMLSpanElement;
    this.ffaLeaderScore = document.getElementById("ffa-leader-score") as HTMLSpanElement;
    this.killfeedContainer = document.getElementById("killfeed") as HTMLDivElement;
    
    this.abilityUi = document.getElementById("ability-ui") as HTMLDivElement;
    this.abilityIcon = document.getElementById("ability-icon") as HTMLDivElement;
    this.abilityName = document.getElementById("ability-name") as HTMLSpanElement;
    this.abilityCooldownOverlay = document.getElementById("ability-cooldown-overlay") as HTMLDivElement;
    this.abilityCooldownText = document.getElementById("ability-cooldown-text") as HTMLSpanElement;
    
    this.scoreboardOverlay = document.getElementById("scoreboard-overlay") as HTMLDivElement;
    this.scoreboardBody = document.getElementById("scoreboard-body") as HTMLTableSectionElement;
    this.scoreboardModeLabel = document.getElementById("sb-game-mode") as HTMLSpanElement;
    
    this.gameOverOverlay = document.getElementById("game-over-overlay") as HTMLDivElement;
    this.winTitle = document.getElementById("win-title") as HTMLHeadingElement;
    this.winSubtitle = document.getElementById("win-subtitle") as HTMLParagraphElement;
    
    this.damageVignette = document.getElementById("damage-vignette") as HTMLDivElement;
    this.minimapCanvas = document.getElementById("minimap-canvas") as HTMLCanvasElement;
    this.minimapCtx = this.minimapCanvas.getContext("2d");
  }
  
  public setupPlayerDetails(username: string, tankType: string) {
    this.playerNameTag.textContent = username;
    const stats = TANK_STATS[tankType];
    if (stats) {
      this.abilityName.textContent = stats.abilityDescription.split(" - ")[0]; // Ability title
      
      // Emoji mapping for abilities
      if (tankType === "scout") this.abilityIcon.textContent = "🏎️";
      else if (tankType === "titan") this.abilityIcon.textContent = "🛡️";
      else if (tankType === "destroyer") this.abilityIcon.textContent = "💥";
      else if (tankType === "medic") this.abilityIcon.textContent = "🔧";
    }
  }
  
  public updateHP(hp: number, maxHp: number) {
    const pct = Math.max(0, (hp / maxHp) * 100);
    this.hpBarFill.style.width = `${pct}%`;
    this.hpText.textContent = `${hp} / ${maxHp}`;
    
    // Smoothly shift colors from green to red
    if (pct > 50) {
      this.hpBarFill.style.background = "linear-gradient(90deg, #00e676 0%, #00b0ff 100%)";
    } else if (pct > 25) {
      this.hpBarFill.style.background = "linear-gradient(90deg, #ffc107 0%, #ff9800 100%)";
    } else {
      this.hpBarFill.style.background = "linear-gradient(90deg, #ff5252 0%, #ff1744 100%)";
    }
  }
  
  public updateAbilityCooldown(now: number, cooldownTimestamp: number) {
    if (now < cooldownTimestamp) {
      this.abilityUi.classList.add("cooldown");
      const remainingSeconds = Math.ceil((cooldownTimestamp - now) / 1000);
      this.abilityCooldownText.textContent = remainingSeconds.toString();
    } else {
      this.abilityUi.classList.remove("cooldown");
    }
  }
  
  public updateScores(state: any) {
    if (state.mode === "team") {
      this.teamScoresBar.style.display = "flex";
      this.ffaScoresBar.style.display = "none";
      this.scoreRedText.textContent = state.teamScores.red.toString();
      this.scoreBlueText.textContent = state.teamScores.blue.toString();
    } else {
      this.teamScoresBar.style.display = "none";
      this.ffaScoresBar.style.display = "flex";
      
      // Find top scorer
      let bestPlayer = "-";
      let bestScore = 0;
      for (const p of Object.values(state.players) as any[]) {
        if (p.score > bestScore) {
          bestScore = p.score;
          bestPlayer = p.username;
        }
      }
      this.ffaLeaderName.textContent = bestPlayer;
      this.ffaLeaderScore.textContent = bestScore.toString();
    }
  }
  
  public updateMinimap(localPlayerId: string, players: any, worldSize: number) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, w, h);
    
    // Draw outer boundary circle
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Center point represents (0,0) of the world
    const halfWorld = worldSize / 2;
    const scale = (w / 2 - 4) / halfWorld; // Map bounds
    
    // Draw all players
    const localPlayer = players[localPlayerId];
    for (const [id, player] of Object.entries(players) as [string, any][]) {
      if (!player.alive) continue;
      
      // Map world coords (X, Z) to canvas coords
      const cx = w / 2 + player.x * scale;
      const cy = h / 2 + player.z * scale;
      
      // Select color
      if (id === localPlayerId) {
        ctx.fillStyle = "#00ff7f"; // Green for self
      } else if (localPlayer && localPlayer.teamId !== "ffa" && player.teamId === localPlayer.teamId) {
        ctx.fillStyle = "#3a82e8"; // Blue for allies
      } else {
        ctx.fillStyle = "#ff3333"; // Red for enemies
      }
      
      // Draw dot
      ctx.beginPath();
      ctx.arc(cx, cy, id === localPlayerId ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  public addKill(attackerName: string, victimName: string, localPlayerId: string, attackerId: string, victimId: string, teamMode: boolean) {
    const item = document.createElement("div");
    item.className = "killfeed-item";
    
    let isAttackerAlly = false;
    let isVictimAlly = false;
    
    // Style colors
    if (teamMode) {
      // Basic styling: system actions
      if (attackerName.includes("System")) {
        item.innerHTML = `<span class="victim">${victimName}</span> החליף קבוצה.`;
      } else {
        item.innerHTML = `<span class="attacker">${attackerName}</span> 💥 <span class="victim">${victimName}</span>`;
      }
    } else {
      item.innerHTML = `<span class="attacker">${attackerName}</span> 💥 <span class="victim">${victimName}</span>`;
    }
    
    this.killfeedContainer.appendChild(item);
    
    // Scroll and remove after 4 seconds
    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transition = "opacity 0.5s ease";
      setTimeout(() => {
        item.remove();
      }, 500);
    }, 4000);
  }
  
  public flashHit() {
    this.damageVignette.className = "hit";
    // Force redraw
    this.damageVignette.offsetHeight;
    this.damageVignette.className = "";
    
    // Quick flash effect
    this.damageVignette.style.boxShadow = "inset 0 0 60px rgba(255, 0, 0, 0.8)";
    setTimeout(() => {
      this.damageVignette.style.boxShadow = "inset 0 0 100px rgba(255, 0, 0, 0)";
    }, 150);
  }

  public flashHeal() {
    this.damageVignette.className = "heal";
    this.damageVignette.offsetHeight;
    this.damageVignette.className = "";
    
    this.damageVignette.style.boxShadow = "inset 0 0 60px rgba(0, 255, 127, 0.5)";
    setTimeout(() => {
      this.damageVignette.style.boxShadow = "inset 0 0 100px rgba(255, 0, 0, 0)";
    }, 150);
  }
  
  public showScoreboard(visible: boolean, players: any, localPlayerId: string, mode: string) {
    if (visible) {
      this.scoreboardOverlay.style.display = "flex";
      this.scoreboardModeLabel.textContent = mode === "team" ? "קרב קבוצות" : "חופשי לכולם";
      
      // Clear body
      this.scoreboardBody.innerHTML = "";
      
      // Sort players by score
      const sorted = Object.entries(players).sort((a: any, b: any) => b[1].score - a[1].score);
      
      for (const [id, player] of sorted as [string, any][]) {
        const tr = document.createElement("tr");
        if (id === localPlayerId) {
          tr.className = "self-row";
        } else if (player.teamId === "red") {
          tr.className = "red-team";
        } else if (player.teamId === "blue") {
          tr.className = "blue-team";
        }
        
        tr.innerHTML = `
          <td>${player.username} ${id === localPlayerId ? ' (אתה)' : ''}</td>
          <td>${player.teamId === "red" ? 'אדום' : player.teamId === "blue" ? 'כחול' : 'חופשי'}</td>
          <td>${player.tankType.toUpperCase()}</td>
          <td>${player.score}</td>
        `;
        this.scoreboardBody.appendChild(tr);
      }
    } else {
      this.scoreboardOverlay.style.display = "none";
    }
  }
  
  public showGameOver(winnerTeam: string | null, winnerUsername: string | null) {
    this.gameOverOverlay.style.display = "flex";
    
    if (winnerTeam === "ffa") {
      this.winTitle.textContent = "הקרב הסתיים!";
      this.winSubtitle.textContent = `המנצח הגדול: ${winnerUsername}!`;
    } else {
      this.winTitle.textContent = winnerTeam === "red" ? "הקבוצה האדומה ניצחה!" : "הקבוצה הכחולה ניצחה!";
      this.winTitle.style.color = winnerTeam === "red" ? "var(--accent-red)" : "var(--accent-blue)";
      this.winSubtitle.textContent = `המצטיין: ${winnerUsername}`;
    }
    
    const backBtn = document.getElementById("btn-back-lobby") as HTMLButtonElement;
    backBtn.addEventListener("click", () => {
      window.location.href = "/index.html";
    });
  }
}
