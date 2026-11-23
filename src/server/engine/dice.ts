import { randomInt } from 'crypto';

export interface DiceRoll {
  die1: number;
  die2: number;
  total: number;
  isDouble: boolean;
}

export class DiceRoller {
  roll(): DiceRoll {
    const die1 = randomInt(1, 7);
    const die2 = randomInt(1, 7);
    return {
      die1,
      die2,
      total: die1 + die2,
      isDouble: die1 === die2,
    };
  }
}
