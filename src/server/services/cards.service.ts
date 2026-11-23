import { randomInt } from 'crypto';
import type { Card, GameState, Player } from '../domain/types.ts';
import { GameEngine } from '../engine/game-engine.ts';
import { invariant } from '../domain/errors.ts';

// Paraphrased classic-style card effects; card artwork and official text are not included.
const chance: Card[] = [
  { id: 'ch01', type: 'MOVE', position: 0, message: 'Advance to GO and collect salary' },
  { id: 'ch02', type: 'MOVE', position: 24, message: 'Advance to Illinois Avenue' },
  { id: 'ch03', type: 'MOVE', position: 11, message: 'Advance to St. Charles Place' },
  {
    id: 'ch04',
    type: 'MOVE_NEXT_RAILROAD',
    message: 'Advance to the next railroad; pay double rent if owned',
  },
  {
    id: 'ch05',
    type: 'MOVE_NEXT_RAILROAD',
    message: 'Advance to the next railroad; pay double rent if owned',
  },
  {
    id: 'ch06',
    type: 'MOVE_NEXT_UTILITY',
    message: 'Advance to the next utility and roll for its rent',
  },
  { id: 'ch07', type: 'MOVE_NEXT_RAILROAD', message: 'Advance to the nearest railroad' },
  { id: 'ch08', type: 'BACK_THREE', message: 'Move back three spaces' },
  { id: 'ch09', type: 'JAIL', message: 'Go directly to jail' },
  {
    id: 'ch10',
    type: 'GET_OUT_OF_JAIL',
    message: 'Keep this card to leave jail without paying',
  },
  { id: 'ch11', type: 'CASH', amount: 50, message: 'Receive a bank award of 50' },
  { id: 'ch12', type: 'CASH', amount: 150, message: 'Receive a bank award of 150' },
  { id: 'ch13', type: 'CASH', amount: -15, message: 'Pay a small fine of 15' },
  { id: 'ch14', type: 'CASH', amount: -100, message: 'Pay a penalty of 100' },
  { id: 'ch15', type: 'REPAIRS', amount: 25, message: 'Pay 25 per house and 100 per hotel' },
  { id: 'ch16', type: 'CASH', amount: 100, message: 'Receive a dividend of 100' },
];

const community: Card[] = [
  { id: 'cc01', type: 'MOVE', position: 0, message: 'Advance to GO and collect salary' },
  { id: 'cc02', type: 'JAIL', message: 'Go directly to jail' },
  {
    id: 'cc03',
    type: 'GET_OUT_OF_JAIL',
    message: 'Keep this card to leave jail without paying',
  },
  { id: 'cc04', type: 'CASH', amount: 200, message: 'Receive 200' },
  { id: 'cc05', type: 'CASH', amount: 100, message: 'Receive 100' },
  { id: 'cc06', type: 'CASH', amount: 50, message: 'Receive 50' },
  { id: 'cc07', type: 'CASH', amount: 25, message: 'Receive 25' },
  { id: 'cc08', type: 'CASH', amount: 10, message: 'Receive 10' },
  { id: 'cc09', type: 'CASH', amount: -50, message: 'Pay 50' },
  { id: 'cc10', type: 'CASH', amount: -100, message: 'Pay 100' },
  { id: 'cc11', type: 'CASH', amount: -150, message: 'Pay 150' },
  { id: 'cc12', type: 'PAY_EACH_PLAYER', amount: 50, message: 'Pay each other player 50' },
  {
    id: 'cc13',
    type: 'COLLECT_EACH_PLAYER',
    amount: 10,
    message: 'Collect 10 from each other player',
  },
  { id: 'cc14', type: 'REPAIRS', amount: 40, message: 'Pay 40 per house and 115 per hotel' },
  { id: 'cc15', type: 'CASH', amount: 100, message: 'Receive 100 from a fund' },
  { id: 'cc16', type: 'CASH', amount: 20, message: 'Receive 20' },
];

export class CardsService {
  private engine: GameEngine;

  constructor(engine = new GameEngine()) {
    this.engine = engine;
  }

  initialize(s: GameState): void {
    const shuffle = (a: Card[]) => {
      const x = [...a];
      for (let i = x.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [x[i], x[j]] = [x[j]!, x[i]!];
      }
      return x;
    };
    s.cardDecks = {
      chance: shuffle(chance),
      community: shuffle(community),
      chanceDiscard: [],
      communityDiscard: [],
    };
  }

  draw(s: GameState, p: Player, deck: 'CHANCE' | 'COMMUNITY'): Card {
    invariant(
      s.status === 'ACTIVE' && this.engine.current(s).id === p.id,
      'NOT_YOUR_TURN',
      'Only the current player may draw'
    );
    invariant(s.turnPhase === 'ACTION', 'INVALID_PHASE', 'Card cannot be drawn now');
    const square = s.board[p.position];
    const pending = s.pendingDecision;
    const fromPending =
      !!pending && pending.kind === 'CARD' && pending.playerId === p.id && pending.deck === deck;

    invariant(
      fromPending ||
        (!pending &&
          ((deck === 'CHANCE' && square?.type === 'CHANCE') ||
            (deck === 'COMMUNITY' && square?.type === 'COMMUNITY'))),
      'WRONG_CARD_SQUARE',
      'Draw the deck matching the pending card square'
    );

    if (fromPending) delete s.pendingDecision;

    if (
      !s.cardDecks ||
      (!s.cardDecks.chance.length &&
        !s.cardDecks.chanceDiscard.length &&
        !s.cardDecks.community.length &&
        !s.cardDecks.communityDiscard.length)
    ) {
      this.initialize(s);
    }

    const d = s.cardDecks!;
    const pile = deck === 'CHANCE' ? d.chance : d.community;
    const discard = deck === 'CHANCE' ? d.chanceDiscard : d.communityDiscard;

    if (!pile.length) {
      const recycled = discard.splice(0);
      invariant(recycled.length > 0, 'CARD_DECK_EMPTY', 'No cards remain in this deck');
      for (let i = recycled.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [recycled[i], recycled[j]] = [recycled[j]!, recycled[i]!];
      }
      pile.push(...recycled);
    }

    const c = pile.shift()!;
    this.apply(s, p, c, deck);
    if (c.type !== 'GET_OUT_OF_JAIL') discard.push(c);
    this.engine.record(s, 'CARD_DRAWN', `${p.name}: ${c.message}`, { cardId: c.id, deck });
    return c;
  }

  private apply(s: GameState, p: Player, c: Card, deck: 'CHANCE' | 'COMMUNITY'): void {
    if (c.type === 'CASH') {
      if (c.amount! >= 0) {
        p.cash += c.amount!;
        this.engine.record(s, 'CARD_CASH_RECEIVED', `${p.name} received ${c.amount}`, {
          playerId: p.id,
          amount: c.amount,
        });
      } else {
        const due = -c.amount!;
        if (p.cash < due) {
          s.pendingDecision = {
            kind: 'TAX',
            playerId: p.id,
            squareId: p.position,
            amount: due,
          };
        } else {
          this.engine.transfer(s, p.id, undefined, due, 'CARD_PAYMENT');
        }
      }
    }
    if (c.type === 'MOVE') {
      this.moveTo(s, p, c.position!);
    }
    if (c.type === 'BACK_THREE') {
      this.moveTo(s, p, (p.position + 37) % 40, false);
    }
    if (c.type === 'MOVE_NEXT_RAILROAD' || c.type === 'MOVE_NEXT_UTILITY') {
      const wanted = c.type === 'MOVE_NEXT_RAILROAD' ? 'RAILROAD' : 'UTILITY';
      let pos = p.position;
      do {
        pos = (pos + 1) % 40;
      } while (s.board[pos]?.type !== wanted);
      const steps = (pos - p.position + 40) % 40;
      this.engine.move(s, p, steps);
      const diceTotal =
        wanted === 'UTILITY' ? randomInt(1, 7) + randomInt(1, 7) : (s.lastDice?.total ?? 7);
      this.engine.resolveLanding(s, p, diceTotal);
      if (wanted === 'RAILROAD') {
        const a = s.assets.find((x) => x.squareId === pos);
        if (a && a.ownerId !== p.id && !a.mortgaged) {
          const rent = this.engine.calculateRent(s, s.board[pos]!, 0, 0, diceTotal) * 2;
          s.pendingDecision = {
            kind: 'RENT',
            playerId: p.id,
            squareId: pos,
            amount: rent,
            creditorId: a.ownerId,
          };
        }
      }
    }
    if (c.type === 'JAIL') this.engine.sendToJail(s, p);
    if (c.type === 'GET_OUT_OF_JAIL') {
      p.getOutOfJailCards++;
      p.jailCardDecks ??= [];
      p.jailCardDecks.push(deck);
    }
    if (c.type === 'REPAIRS') {
      const houses = s.assets
        .filter((a) => a.ownerId === p.id)
        .reduce((n, a) => n + a.houses, 0);
      const hotels = s.assets
        .filter((a) => a.ownerId === p.id)
        .reduce((n, a) => n + a.hotels, 0);
      const due = houses * c.amount! + hotels * (deck === 'CHANCE' ? 100 : 115);
      if (due > 0 && p.cash < due) {
        s.pendingDecision = {
          kind: 'TAX',
          playerId: p.id,
          squareId: p.position,
          amount: due,
        };
      } else {
        this.engine.transfer(s, p.id, undefined, due, 'CARD_REPAIRS');
      }
    }
    if (c.type === 'PAY_EACH_PLAYER' || c.type === 'COLLECT_EACH_PLAYER') {
      for (const other of s.players.filter((x) => x.status === 'ACTIVE' && x.id !== p.id)) {
        if (c.type === 'PAY_EACH_PLAYER') {
          this.engine.transfer(s, p.id, other.id, c.amount!, 'CARD_PAYMENT');
        } else {
          this.engine.transfer(s, other.id, p.id, c.amount!, 'CARD_COLLECTION');
        }
      }
    }
  }

  private moveTo(s: GameState, p: Player, pos: number, collectSalary = true): void {
    const old = p.position;
    if (collectSalary && pos < old) {
      p.cash += s.settings.passGoSalary;
      this.engine.record(s, 'PASSED_GO', `${p.name} collected ${s.settings.passGoSalary}`, {
        amount: s.settings.passGoSalary,
        playerId: p.id,
      });
    }
    p.position = pos;
    this.engine.resolveLanding(s, p, s.lastDice?.total ?? 7);
  }
}
