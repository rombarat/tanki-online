import { NetworkClient } from "./network/NetworkClient.ts";
import { TankSelect } from "./ui/TankSelect.ts";

window.addEventListener("DOMContentLoaded", () => {
  const tankSelect = new TankSelect();
  const netClient = new NetworkClient();
  
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  const playButton = document.getElementById("btn-play") as HTMLButtonElement;
  const modeTeamBtn = document.getElementById("mode-team") as HTMLButtonElement;
  const modeFfaBtn = document.getElementById("mode-ffa") as HTMLButtonElement;
  const queueStatusText = document.getElementById("queue-text") as HTMLParagraphElement;
  const queueBar = document.getElementById("queue-bar") as HTMLDivElement;
  const queueContainer = document.getElementById("queue-status-container") as HTMLDivElement;
  
  let selectedMode: "team" | "ffa" = "team";
  let myPlayerId: string | null = null;
  let isQueued = false;
  
  // Set up mode selectors
  modeTeamBtn.addEventListener("click", () => {
    if (isQueued) return;
    modeTeamBtn.classList.add("active");
    modeFfaBtn.classList.remove("active");
    selectedMode = "team";
    updateQueueText();
  });
  
  modeFfaBtn.addEventListener("click", () => {
    if (isQueued) return;
    modeFfaBtn.classList.add("active");
    modeTeamBtn.classList.remove("active");
    selectedMode = "ffa";
    updateQueueText();
  });
  
  // Disable button if name empty
  usernameInput.addEventListener("input", () => {
    if (!isQueued) {
      playButton.disabled = !usernameInput.value.trim();
    }
  });
  
  // Enable play button on server connected
  playButton.disabled = false;
  queueStatusText.textContent = "מחובר לשרת. מוכן לקרב!";
  
  let queueSizes: Record<string, number> = { team: 0, ffa: 0 };
  
  function updateQueueText() {
    if (isQueued) {
      queueStatusText.textContent = `מחפש קרב... (${queueSizes[selectedMode] || 1}/8 שחקנים בתור)`;
    } else {
      const count = queueSizes[selectedMode] || 0;
      queueStatusText.textContent = `${count} שחקנים ממתינים בתור למצב זה.`;
      queueBar.style.width = "0%";
    }
  }
  
  // Listen to queue updates from matchmaker
  netClient.listenToMatchmaker("queueUpdate", (data: any) => {
    if (data && data.counts) {
      queueSizes = data.counts;
      updateQueueText();
      if (isQueued) {
        const capacity = 8;
        const current = queueSizes[selectedMode] || 1;
        const pct = Math.min(100, (current / capacity) * 100);
        queueBar.style.width = `${pct}%`;
      }
    }
  });
  
  // Listen to assignments
  netClient.listenToMatchmaker("assignmentReady", (assignment: any) => {
    console.log("Assignment event:", assignment);
    if (myPlayerId && assignment.playerId === myPlayerId) {
      console.log("Match found! Joining match:", assignment.matchId);
      
      // Save details to session storage
      sessionStorage.setItem("playerId", myPlayerId);
      sessionStorage.setItem("matchId", assignment.matchId);
      sessionStorage.setItem("teamId", assignment.teamId);
      sessionStorage.setItem("tankType", tankSelect.getSelectedTank());
      sessionStorage.setItem("username", usernameInput.value.trim() || "Player");
      
      // Redirect to game page
      window.location.href = "/game.html";
    }
  });
  
  playButton.addEventListener("click", async () => {
    if (isQueued) return;
    
    const username = usernameInput.value.trim() || "Player";
    const tankType = tankSelect.getSelectedTank();
    
    playButton.disabled = true;
    playButton.textContent = "מחפש משחק...";
    isQueued = true;
    queueContainer.classList.add("searching");
    queueBar.style.width = "12%";
    
    // Disable inputs during queue
    usernameInput.disabled = true;
    
    try {
      const res = await netClient.queueForMatch(selectedMode, tankType, username);
      myPlayerId = res.playerId;
      console.log("Queued successfully. Player ID:", myPlayerId);
      updateQueueText();
    } catch (err) {
      console.error("Queue error:", err);
      playButton.disabled = false;
      playButton.textContent = "הצטרף לקרב!";
      isQueued = false;
      usernameInput.disabled = false;
      queueContainer.classList.remove("searching");
      queueStatusText.textContent = "שגיאה בכניסה לתור. נסה שוב.";
    }
  });
});
