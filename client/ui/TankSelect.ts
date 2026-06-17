export class TankSelect {
  private selectedTank: string = "scout";
  private cards: NodeListOf<HTMLElement>;
  
  constructor() {
    this.cards = document.querySelectorAll(".tank-card");
    this.cards.forEach((card) => {
      card.addEventListener("click", () => {
        this.cards.forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        this.selectedTank = card.getAttribute("data-tank") || "scout";
      });
    });
  }
  
  public getSelectedTank(): string {
    return this.selectedTank;
  }
}
