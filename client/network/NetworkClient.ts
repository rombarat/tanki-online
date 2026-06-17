import { createClient } from "rivetkit/client";
import type { registry } from "../../src/index.ts";

export class NetworkClient {
  private client: any;
  private matchConn: any = null;
  private matchmaker: any;
  
  constructor() {
    const endpoint = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:6420"
      : window.location.origin;
      
    this.client = createClient<typeof registry>({ endpoint });
    this.matchmaker = this.client.tankMatchmaker.getOrCreate(["main"]);
  }
  
  public async queueForMatch(mode: "team" | "ffa", tankType: string, username: string) {
    return await this.matchmaker.queueForMatch({ mode, tankType, username });
  }
  
  public async getAssignment(playerId: string) {
    return await this.matchmaker.getAssignment({ playerId });
  }
  
  public listenToMatchmaker(event: string, callback: (data: any) => void) {
    this.matchmaker.connect();
    this.matchmaker.on(event, callback);
  }
  
  public connectToMatch(matchId: string, playerId: string) {
    const matchActor = this.client.tankMatch.getOrCreate([matchId]);
    this.matchConn = matchActor.connect({
      params: { playerId }
    });
    return this.matchConn;
  }
  
  public sendMove(x: number, y: number, z: number, rotationY: number, turretRotationY: number) {
    if (!this.matchConn) return;
    this.matchConn.move({ x, y, z, rotationY, turretRotationY }).catch((err: any) => {
      console.warn("Failed to send move action:", err);
    });
  }
  
  public sendFire(x: number, z: number, vx: number, vz: number) {
    if (!this.matchConn) return;
    this.matchConn.fire({ x, z, vx, vz }).catch((err: any) => {
      console.warn("Failed to send fire action:", err);
    });
  }
  
  public sendUseAbility() {
    if (!this.matchConn) return;
    this.matchConn.useAbility().catch((err: any) => {
      console.warn("Failed to use ability:", err);
    });
  }
  
  public sendSwitchTeam() {
    if (!this.matchConn) return;
    this.matchConn.switchTeam().catch((err: any) => {
      console.warn("Failed to switch team:", err);
    });
  }
  
  public disconnect() {
    if (this.matchConn) {
      this.matchConn.disconnect();
      this.matchConn = null;
    }
  }
}
