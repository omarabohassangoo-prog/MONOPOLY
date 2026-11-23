import { Money } from './economy';

export const PLAYER_ACCENT_COLORS: Record<number, string> = {
  1: '#C83E37',
  2: '#1D5FA7',
  3: '#B97A18',
  4: '#6E3B96',
};

export abstract class Player {
  public id: string;
  public name: string;
  public position: number;
  public inJail: boolean;
  public jailTurns: number;
  public isEliminated: boolean;
  public wallet: Money;
  public isBot: boolean;
  public accentColor: string;
  public jailFreeCards: ('Chance' | 'Destiny')[];
  public abstract readonly playerNumber: number;
  public abstract tokenName: string;

  constructor(id: string, name: string, startingCash = 1500, isBot = false, accentColor = '#1D5FA7') {
    this.id = id;
    this.name = name;
    this.position = 0;
    this.inJail = false;
    this.jailTurns = 0;
    this.isEliminated = false;
    this.wallet = new Money(startingCash, 'USD');
    this.isBot = isBot;
    this.accentColor = accentColor;
    this.jailFreeCards = [];
  }

  public move(steps: number, boardSize = 40): boolean {
    const previousPos = this.position;
    const rawNext = previousPos + steps;
    const passedGo = steps > 0 && rawNext >= boardSize;
    this.position = ((rawNext % boardSize) + boardSize) % boardSize;
    return passedGo;
  }

  public pay(amount: number): boolean {
    return this.wallet.subtract(amount);
  }

  public receive(amount: number): void {
    this.wallet.add(amount);
  }
}

export class PlayerOne extends Player {
  public readonly playerNumber = 1;
  public tokenName: string;

  constructor(id: string, name: string, tokenName = 'Top Hat', startingCash = 1500, isBot = false) {
    super(id, name, startingCash, isBot, PLAYER_ACCENT_COLORS[1]);
    this.tokenName = tokenName;
  }
}

export class PlayerTwo extends Player {
  public readonly playerNumber = 2;
  public tokenName: string;

  constructor(id: string, name: string, tokenName = 'Battleship', startingCash = 1500, isBot = false) {
    super(id, name, startingCash, isBot, PLAYER_ACCENT_COLORS[2]);
    this.tokenName = tokenName;
  }
}

export class PlayerThree extends Player {
  public readonly playerNumber = 3;
  public tokenName: string;

  constructor(id: string, name: string, tokenName = 'Race Car', startingCash = 1500, isBot = false) {
    super(id, name, startingCash, isBot, PLAYER_ACCENT_COLORS[3]);
    this.tokenName = tokenName;
  }
}

export class PlayerFour extends Player {
  public readonly playerNumber = 4;
  public tokenName: string;

  constructor(id: string, name: string, tokenName = 'Scottie Dog', startingCash = 1500, isBot = false) {
    super(id, name, startingCash, isBot, PLAYER_ACCENT_COLORS[4]);
    this.tokenName = tokenName;
  }
}

export class Winner {
  public winningPlayer: Player;
  public finalNetWorth: number;

  constructor(winningPlayer: Player, finalNetWorth: number) {
    this.winningPlayer = winningPlayer;
    this.finalNetWorth = finalNetWorth;
  }

  public announceWinner(): string {
    return `${this.winningPlayer.name} wins the game with $${this.finalNetWorth.toLocaleString()} net worth!`;
  }
}

export class Loser {
  public bankruptPlayer: Player;
  public turnEliminated: number;

  constructor(bankruptPlayer: Player, turnEliminated: number) {
    this.bankruptPlayer = bankruptPlayer;
    this.turnEliminated = turnEliminated;
  }

  public eliminate(player: Player): void {
    player.isEliminated = true;
    player.inJail = false;
    player.jailTurns = 0;
  }
}
