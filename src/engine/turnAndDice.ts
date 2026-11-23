import type { Bank } from './economy';
import type { Player } from './player';
import { TurnPhase } from './types';

export class Dice {
  public die1: number;
  public die2: number;
  public total: number;
  public isDouble: boolean;

  constructor() {
    this.die1 = 1;
    this.die2 = 1;
    this.total = 2;
    this.isDouble = false;
  }

  public roll(): { die1: number; die2: number; total: number; isDouble: boolean } {
    this.die1 = Math.floor(Math.random() * 6) + 1;
    this.die2 = Math.floor(Math.random() * 6) + 1;
    this.total = this.die1 + this.die2;
    this.isDouble = this.die1 === this.die2;
    return {
      die1: this.die1,
      die2: this.die2,
      total: this.total,
      isDouble: this.isDouble,
    };
  }
}

export class WhoseTurn {
  public turnNumber: number;
  public currentPlayer: Player;
  public phase: TurnPhase;
  public isDoubleRoll: boolean;
  public consecutiveDoubles: number;

  constructor(initialPlayer: Player) {
    this.turnNumber = 1;
    this.currentPlayer = initialPlayer;
    this.phase = TurnPhase.ROLL_DICE;
    this.isDoubleRoll = false;
    this.consecutiveDoubles = 0;
  }

  public nextTurn(players: Player[]): Player {
    const active = players.filter((p) => !p.isEliminated);
    if (active.length === 0) return this.currentPlayer;

    const currentIndex = players.findIndex((p) => p.id === this.currentPlayer.id);
    for (let offset = 1; offset <= players.length; offset++) {
      const candidate = players[(currentIndex + offset) % players.length];
      if (!candidate.isEliminated) {
        this.currentPlayer = candidate;
        break;
      }
    }

    this.turnNumber += 1;
    this.phase = TurnPhase.ROLL_DICE;
    this.resetDoubles();
    return this.currentPlayer;
  }

  public setPhase(phase: TurnPhase): void {
    this.phase = phase;
  }

  /**
   * Registers whether the roll was a double.
   * Returns true if player rolled maxDoubles consecutive doubles (speeding -> Jail).
   */
  public registerRoll(isDouble: boolean, maxDoubles = 3): boolean {
    this.isDoubleRoll = isDouble;
    if (isDouble) {
      this.consecutiveDoubles += 1;
      return this.consecutiveDoubles >= maxDoubles;
    }
    this.consecutiveDoubles = 0;
    return false;
  }

  public resetDoubles(): void {
    this.isDoubleRoll = false;
    this.consecutiveDoubles = 0;
  }
}

export class Jail {
  public jailTileIndex: number;
  public fineAmount: number;
  public maxAttempts: number;

  constructor(jailTileIndex = 10, fineAmount = 50, maxAttempts = 3) {
    this.jailTileIndex = jailTileIndex;
    this.fineAmount = fineAmount;
    this.maxAttempts = maxAttempts;
  }

  public sendToJail(player: Player, turn: WhoseTurn): void {
    player.position = this.jailTileIndex;
    player.inJail = true;
    player.jailTurns = 0;
    turn.resetDoubles();
  }

  public tryEscapeByDouble(player: Player, dice: Dice): boolean {
    if (!player.inJail) return false;
    if (dice.isDouble) {
      player.inJail = false;
      player.jailTurns = 0;
      return true;
    }
    player.jailTurns += 1;
    return false;
  }

  public payFineToRelease(player: Player, bank: Bank): boolean {
    if (!player.inJail) return false;
    if (!player.pay(this.fineAmount)) {
      return false;
    }
    bank.collect(this.fineAmount);
    player.inJail = false;
    player.jailTurns = 0;
    return true;
  }
}
