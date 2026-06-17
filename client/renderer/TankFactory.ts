export function getTeamColorHex(teamId: "red" | "blue" | "ffa"): number {
  if (teamId === "red") return 0xff3333;
  if (teamId === "blue") return 0x3366ff;
  return 0xffaa00; // Orange for FFA/Neutral
}
