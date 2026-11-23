import type { MonopolyGame } from './MonopolyGame';
import type { Player } from './player';
import type { CardEffectType } from './types';

export class ChanceCard {
  public cardId: string;
  public title: string;
  public effectType: CardEffectType;
  public value: number;

  constructor(cardId: string, title: string, effectType: CardEffectType, value: number) {
    this.cardId = cardId;
    this.title = title;
    this.effectType = effectType;
    this.value = value;
  }

  public applyEffect(player: Player, game: MonopolyGame): string {
    return game.resolveCardEffect(player, this.title, this.effectType, this.value, 'Chance');
  }
}

export class DestinyCard {
  public cardId: string;
  public title: string;
  public effectType: CardEffectType;
  public value: number;

  constructor(cardId: string, title: string, effectType: CardEffectType, value: number) {
    this.cardId = cardId;
    this.title = title;
    this.effectType = effectType;
    this.value = value;
  }

  public applyEffect(player: Player, game: MonopolyGame): string {
    return game.resolveCardEffect(player, this.title, this.effectType, this.value, 'Destiny');
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class CardDeck {
  public chancePool: ChanceCard[];
  public destinyPool: DestinyCard[];
  private chanceIndex = 0;
  private destinyIndex = 0;
  private chanceJailHeld = false;
  private destinyJailHeld = false;

  constructor() {
    this.chancePool = [
      new ChanceCard('ch-1', 'Advance to GO — Collect $200', 'ADVANCE_TO_TILE', 0),
      new ChanceCard('ch-2', 'Bank pays you dividend of $50', 'COLLECT_BANK', 50),
      new ChanceCard('ch-3', 'Advance to Illinois Ave', 'ADVANCE_TO_TILE', 24),
      new ChanceCard('ch-4', 'Advance to Boardwalk', 'ADVANCE_TO_TILE', 39),
      new ChanceCard('ch-5', 'Speeding fine — Pay $15 to Free Parking', 'PAY_FREE_PARKING', 15),
      new ChanceCard('ch-6', 'Go back 3 spaces', 'MOVE_RELATIVE', -3),
      new ChanceCard('ch-7', 'Go directly to Jail — Do not pass GO', 'GO_TO_JAIL', 10),
      new ChanceCard('ch-8', 'Building loan matures — Collect $150', 'COLLECT_BANK', 150),
      new ChanceCard('ch-9', 'General repairs: $25 per house, $100 per hotel', 'REPAIRS', 25),
      new ChanceCard('ch-10', 'Elected Board Chair — Pay each player $50', 'PAY_EACH_PLAYER', 50),
      new ChanceCard('ch-11', 'Advance to nearest Railroad (Pay 2× rent if owned)', 'NEAREST_RAILROAD', 0),
      new ChanceCard('ch-12', 'Advance to nearest Utility (Pay 10× dice if owned)', 'NEAREST_UTILITY', 0),
      new ChanceCard('ch-13', 'Advance to St. Charles Place', 'ADVANCE_TO_TILE', 11),
      new ChanceCard('ch-14', 'Advance to Reading Railroad', 'ADVANCE_TO_TILE', 5),
      new ChanceCard('ch-15', 'Get Out of Jail Free — Keep until needed', 'GET_OUT_OF_JAIL_FREE', 0),
    ];

    this.destinyPool = [
      new DestinyCard('ds-1', 'Advance to GO — Collect $200', 'ADVANCE_TO_TILE', 0),
      new DestinyCard('ds-2', 'Bank error in your favor — Collect $200', 'COLLECT_BANK', 200),
      new DestinyCard('ds-3', 'Doctor fee — Pay $50 to Free Parking', 'PAY_FREE_PARKING', 50),
      new DestinyCard('ds-4', 'From sale of stock you get $50', 'COLLECT_BANK', 50),
      new DestinyCard('ds-5', 'Go to Jail — Do not pass GO', 'GO_TO_JAIL', 10),
      new DestinyCard('ds-6', 'Holiday fund matures — Collect $100', 'COLLECT_BANK', 100),
      new DestinyCard('ds-7', 'Income tax refund — Collect $20', 'COLLECT_BANK', 20),
      new DestinyCard('ds-8', 'It is your birthday — Collect $10 from each player', 'COLLECT_FROM_PLAYERS', 10),
      new DestinyCard('ds-9', 'Hospital fees — Pay $100 to Bank', 'PAY_BANK', 100),
      new DestinyCard('ds-10', 'School fees — Pay $50 to Bank', 'PAY_BANK', 50),
      new DestinyCard('ds-11', 'Receive $25 consultancy fee', 'COLLECT_BANK', 25),
      new DestinyCard('ds-12', 'You inherit $100', 'COLLECT_BANK', 100),
      new DestinyCard('ds-13', 'Street repairs: $40 per house, $115 per hotel', 'REPAIRS', 40),
      new DestinyCard('ds-14', 'Get Out of Jail Free — Keep until needed', 'GET_OUT_OF_JAIL_FREE', 0),
    ];

    this.shuffleChance();
    this.shuffleDestiny();
  }

  public shuffleChance(): void {
    this.chancePool = shuffleArray(this.chancePool);
    this.chanceIndex = 0;
  }

  public shuffleDestiny(): void {
    this.destinyPool = shuffleArray(this.destinyPool);
    this.destinyIndex = 0;
  }

  public returnJailFreeCard(deck: 'Chance' | 'Destiny'): void {
    if (deck === 'Chance') {
      this.chanceJailHeld = false;
    } else {
      this.destinyJailHeld = false;
    }
  }

  public drawChance(): ChanceCard {
    for (let attempt = 0; attempt < this.chancePool.length; attempt++) {
      const card = this.chancePool[this.chanceIndex];
      this.chanceIndex = (this.chanceIndex + 1) % this.chancePool.length;
      if (this.chanceIndex === 0) {
        this.shuffleChance();
      }
      if (card.effectType === 'GET_OUT_OF_JAIL_FREE') {
        if (this.chanceJailHeld) continue;
        this.chanceJailHeld = true;
      }
      return card;
    }
    return this.chancePool[0];
  }

  public drawDestiny(): DestinyCard {
    for (let attempt = 0; attempt < this.destinyPool.length; attempt++) {
      const card = this.destinyPool[this.destinyIndex];
      this.destinyIndex = (this.destinyIndex + 1) % this.destinyPool.length;
      if (this.destinyIndex === 0) {
        this.shuffleDestiny();
      }
      if (card.effectType === 'GET_OUT_OF_JAIL_FREE') {
        if (this.destinyJailHeld) continue;
        this.destinyJailHeld = true;
      }
      return card;
    }
    return this.destinyPool[0];
  }
}
