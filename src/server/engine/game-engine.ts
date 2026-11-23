import { randomInt, randomUUID } from 'crypto';
import { BOARD } from '../domain/board.ts';
import { DomainError, invariant } from '../domain/errors.ts';
import { recordGameEvent } from '../domain/events.ts';
import type { GameSettings, GameState, Player, Square } from '../domain/types.ts';
import { DiceRoller } from './dice.ts';

const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 8,
  startingCash: 1500,
  passGoSalary: 200,
  freeParkingPot: false,
  auctionOnDecline: true,
  turnTimeoutSeconds: 90,
  allowSpectators: true,
  ruleset: 'CLASSIC',
};

export class GameEngine {
  create(code: string, host: Player, settings: Partial<GameSettings> = {}): GameState {
    const cfg: GameSettings = { ...DEFAULT_SETTINGS, ...settings };
    const state: GameState = {
      id: randomUUID(),
      code,
      status: 'WAITING',
      players: [{ ...host, cash: cfg.startingCash, jailCardDecks: [] }],
      currentPlayerIndex: 0,
      round: 1,
      board: BOARD.map((x) => ({ ...x, rent: x.rent ? [...x.rent] : undefined })),
      assets: [],
      doublesCount: 0,
      turnPhase: 'ROLL',
      version: 0,
      eventSequence: 0,
      processedActionIds: [],
      log: [],
      settings: cfg,
      freeParkingPot: 0,
      bankBuildings: { housesRemaining: 32, hotelsRemaining: 12 },
      cardDecks: { chance: [], community: [], chanceDiscard: [], communityDiscard: [] },
    };
    this.record(state, 'ROOM_CREATED', 'Game room created', { code });
    return state;
  }

  addPlayer(s: GameState, p: Player): GameState {
    invariant(s.status === 'WAITING', 'GAME_NOT_WAITING', 'Game is not accepting players');
    invariant(s.players.length < s.settings.maxPlayers, 'GAME_FULL', 'Maximum players reached');
    invariant(
      !s.players.some((x) => x.id === p.id || (x.userId && x.userId === p.userId)),
      'PLAYER_EXISTS',
      'Player already joined'
    );
    s.players.push({ ...p, cash: s.settings.startingCash, jailCardDecks: p.jailCardDecks ?? [] });
    s.version++;
    this.record(s, 'PLAYER_JOINED', `${p.name} joined the room`, { playerId: p.id });
    return s;
  }

  start(s: GameState): GameState {
    invariant(s.status === 'WAITING', 'INVALID_STATE', 'Game cannot be started');
    invariant(s.players.length >= 2, 'NOT_ENOUGH_PLAYERS', 'At least two players required');
    for (let i = s.players.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [s.players[i], s.players[j]] = [s.players[j]!, s.players[i]!];
    }
    s.currentPlayerIndex = 0;
    s.status = 'ACTIVE';
    s.turnPhase = 'ROLL';
    this.refreshTurnClock(s);
    this.record(s, 'GAME_STARTED', 'Game started', {
      turnOrder: s.players.map((p) => p.id),
    });
    return s;
  }

  private refreshTurnClock(s: GameState): void {
    const now = Date.now();
    s.turnStartedAt = new Date(now).toISOString();
    s.turnExpiresAt = new Date(now + s.settings.turnTimeoutSeconds * 1000).toISOString();
  }

  current(s: GameState): Player {
    const p = s.players[s.currentPlayerIndex];
    if (!p) throw new DomainError('NO_CURRENT_PLAYER', 'No active player');
    return p;
  }

  roll(s: GameState, playerId: string) {
    this.assertTurn(s, playerId);
    invariant(s.turnPhase === 'ROLL', 'INVALID_PHASE', 'Dice can only be rolled at roll phase');
    const p = this.current(s);
    if (p.jailTurns > 0) return this.rollInJail(s, p);

    const result = new DiceRoller().roll();
    s.lastDice = result;
    if (result.isDouble) s.doublesCount++;
    else s.doublesCount = 0;

    if (s.doublesCount === 3) {
      this.sendToJail(s, p);
      s.doublesCount = 0;
      s.turnPhase = 'ACTION';
      this.record(s, 'THREE_DOUBLES_JAIL', `${p.name} rolled three consecutive doubles`);
      return { dice: result, jailed: true, state: s };
    }

    this.move(s, p, result.total);
    p.hasRolledThisTurn = true;
    s.turnPhase = 'ACTION';
    this.resolveLanding(s, p, result.total);
    this.record(s, 'DICE_ROLLED', `${p.name} rolled ${result.total}`, result);
    s.version++;
    return { dice: result, jailed: p.jailTurns > 0, state: s };
  }

  rollInJail(s: GameState, p: Player) {
    const result = new DiceRoller().roll();
    s.lastDice = result;
    if (result.isDouble) {
      p.jailTurns = 0;
      this.record(s, 'JAIL_RELEASED', `${p.name} rolled doubles to leave jail`);
      this.move(s, p, result.total);
      p.hasRolledThisTurn = true;
      s.turnPhase = 'ACTION';
      this.resolveLanding(s, p, result.total);
    } else {
      p.jailTurns--;
      if (p.jailTurns <= 0) {
        s.pendingDecision = { kind: 'TAX', playerId: p.id, amount: 50 };
        s.turnPhase = 'RESOLVING';
        this.record(s, 'JAIL_PAYMENT_REQUIRED', `${p.name} must pay 50 to leave jail`);
      } else {
        s.turnPhase = 'ACTION';
        this.record(s, 'JAIL_ROLL_FAILED', `${p.name} remains in jail`);
      }
    }
    s.version++;
    return { dice: result, jailed: p.jailTurns > 0, state: s };
  }

  move(s: GameState, p: Player, steps: number): void {
    const old = p.position;
    const raw = old + steps;
    p.position = ((raw % 40) + 40) % 40;
    if (raw >= 40) {
      p.cash += s.settings.passGoSalary;
      this.record(s, 'PASSED_GO', `${p.name} collected ${s.settings.passGoSalary}`, {
        amount: s.settings.passGoSalary,
        playerId: p.id,
      });
    }
  }

  resolveLanding(s: GameState, p: Player, diceTotal: number): void {
    const sq = s.board[p.position]!;
    if (sq.type === 'GO_TO_JAIL') {
      this.sendToJail(s, p);
      return;
    }
    if (['PROPERTY', 'RAILROAD', 'UTILITY'].includes(sq.type)) {
      const asset = s.assets.find((a) => a.squareId === sq.id);
      if (!asset) {
        s.pendingDecision = {
          kind: 'PURCHASE',
          playerId: p.id,
          squareId: sq.id,
          amount: sq.price,
        };
      } else if (asset.ownerId !== p.id && !asset.mortgaged) {
        const rent = this.calculateRent(s, sq, asset.houses, asset.hotels, diceTotal);
        s.pendingDecision = {
          kind: 'RENT',
          playerId: p.id,
          squareId: sq.id,
          amount: rent,
          creditorId: asset.ownerId,
        };
      }
    } else if (sq.type === 'TAX') {
      s.pendingDecision = {
        kind: 'TAX',
        playerId: p.id,
        squareId: sq.id,
        amount: sq.tax ?? 0,
      };
    } else if (sq.type === 'CHANCE' || sq.type === 'COMMUNITY') {
      s.pendingDecision = {
        kind: 'CARD',
        playerId: p.id,
        squareId: sq.id,
        deck: sq.type,
      };
    } else if (sq.type === 'FREE_PARKING' && s.settings.freeParkingPot && s.freeParkingPot) {
      const collected = s.freeParkingPot;
      p.cash += collected;
      this.record(s, 'FREE_PARKING_COLLECTED', `${p.name} collected ${collected}`, {
        amount: collected,
        playerId: p.id,
      });
      s.freeParkingPot = 0;
    }
  }

  buy(s: GameState, playerId: string): GameState {
    this.assertTurn(s, playerId);
    const d = s.pendingDecision;
    invariant(
      !!d && d.kind === 'PURCHASE' && d.playerId === playerId,
      'NO_PURCHASE_PENDING',
      'No purchase decision pending'
    );
    const p = this.current(s);
    const sq = s.board[d.squareId!]!;
    invariant(p.cash >= sq.price!, 'INSUFFICIENT_FUNDS', 'Not enough cash');
    p.cash -= sq.price!;
    s.assets.push({
      squareId: sq.id,
      ownerId: p.id,
      houses: 0,
      hotels: 0,
      mortgaged: false,
    });
    delete s.pendingDecision;
    this.record(s, 'ASSET_PURCHASED', `${p.name} purchased ${sq.name}`, {
      squareId: sq.id,
      price: sq.price,
      playerId: p.id,
    });
    s.version++;
    return s;
  }

  declinePurchase(s: GameState, playerId: string): GameState {
    this.assertTurn(s, playerId);
    const d = s.pendingDecision;
    invariant(
      !!d && d.kind === 'PURCHASE' && d.playerId === playerId,
      'NO_PURCHASE_PENDING',
      'No purchase decision pending'
    );
    const squareId = d.squareId!;
    delete s.pendingDecision;
    if (s.settings.auctionOnDecline) {
      const now = Date.now();
      s.pendingAuction = {
        squareId,
        highestBid: 0,
        eligibleIds: s.players.filter((p) => p.status === 'ACTIVE').map((p) => p.id),
        passedIds: [],
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 35_000).toISOString(),
      };
      s.turnPhase = 'AUCTION';
    }
    this.record(s, 'PURCHASE_DECLINED', `${this.current(s).name} declined purchase`);
    return s;
  }

  settleRent(s: GameState, playerId: string): number | undefined {
    this.assertTurn(s, playerId);
    const d = s.pendingDecision;
    invariant(
      !!d && d.kind === 'RENT' && d.playerId === playerId,
      'NO_RENT_PENDING',
      'No rent payment pending'
    );
    const p = this.current(s);
    invariant(
      p.cash >= d.amount!,
      'INSUFFICIENT_FUNDS',
      'Cannot pay rent; liquidate assets or declare bankruptcy'
    );
    this.transfer(s, playerId, d.creditorId!, d.amount!, 'RENT');
    delete s.pendingDecision;
    if (this.current(s).id === playerId && this.current(s).status === 'ACTIVE') {
      s.turnPhase = 'ACTION';
    }
    return d.amount;
  }

  settleTax(s: GameState, playerId: string): number | undefined {
    this.assertTurn(s, playerId);
    const d = s.pendingDecision;
    invariant(
      !!d && d.kind === 'TAX' && d.playerId === playerId,
      'NO_TAX_PENDING',
      'No tax payment pending'
    );
    const p = this.current(s);
    invariant(
      p.cash >= d.amount!,
      'INSUFFICIENT_FUNDS',
      'Cannot pay tax; liquidate assets or declare bankruptcy'
    );
    const jailBail = d.squareId === undefined;
    p.cash -= d.amount!;
    delete s.pendingDecision;
    if (jailBail) {
      const total = s.lastDice?.total ?? 0;
      this.move(s, p, total);
      this.resolveLanding(s, p, total);
      this.record(s, 'JAIL_BAIL_PAID', `${p.name} paid 50 to leave jail`, {
        amount: 50,
        playerId: p.id,
      });
    } else if (s.settings.freeParkingPot) {
      s.freeParkingPot = (s.freeParkingPot ?? 0) + d.amount!;
    }
    s.turnPhase = 'ACTION';
    if (!jailBail) {
      this.record(s, 'TAX_PAID', `${p.name} paid ${d.amount}`, {
        amount: d.amount,
        playerId: p.id,
      });
    }
    return d.amount;
  }

  payJail(s: GameState, playerId: string): boolean {
    this.assertTurn(s, playerId);
    const p = this.current(s);
    invariant(p.jailTurns > 0, 'NOT_IN_JAIL', 'Player is not in jail');
    invariant(p.cash >= 50, 'INSUFFICIENT_FUNDS', 'Not enough cash to pay bail');
    p.cash -= 50;
    p.jailTurns = 0;
    s.turnPhase = 'ROLL';
    this.record(s, 'JAIL_BAIL_PAID', `${p.name} paid 50 to leave jail`, {
      amount: 50,
      playerId: p.id,
    });
    return true;
  }

  useJailCard(s: GameState, playerId: string): boolean {
    this.assertTurn(s, playerId);
    const p = this.current(s);
    const d = s.pendingDecision;
    const afterThirdFailure =
      !!d && d.kind === 'TAX' && d.playerId === playerId && d.squareId === undefined;
    invariant(
      (p.jailTurns > 0 || afterThirdFailure) && p.getOutOfJailCards > 0,
      'NO_JAIL_CARD',
      'No jail card available'
    );
    p.getOutOfJailCards--;
    p.jailTurns = 0;

    // Recycle card back to the bottom/discard of its deck
    const deck = p.jailCardDecks?.pop() ?? 'CHANCE';
    if (s.cardDecks) {
      if (deck === 'CHANCE') {
        s.cardDecks.chanceDiscard.push({
          id: 'ch10',
          type: 'GET_OUT_OF_JAIL',
          message: 'Keep this card to leave jail without paying',
        });
      } else {
        s.cardDecks.communityDiscard.push({
          id: 'cc03',
          type: 'GET_OUT_OF_JAIL',
          message: 'Keep this card to leave jail without paying',
        });
      }
    }

    if (afterThirdFailure) {
      delete s.pendingDecision;
      const total = s.lastDice?.total ?? 0;
      this.move(s, p, total);
      this.resolveLanding(s, p, total);
      s.turnPhase = 'ACTION';
    } else {
      s.turnPhase = 'ROLL';
    }
    this.record(s, 'JAIL_CARD_USED', `${p.name} used a get out of jail card`);
    return true;
  }

  calculateRent(
    s: GameState,
    sq: Square,
    houses: number,
    hotels: number,
    diceTotal: number
  ): number {
    const asset = s.assets.find((a) => a.squareId === sq.id);
    if (!asset) return 0;
    if (sq.type === 'RAILROAD') {
      const count = s.assets.filter(
        (a) => a.ownerId === asset.ownerId && s.board[a.squareId]?.type === 'RAILROAD'
      ).length;
      return sq.rent?.[Math.max(0, count - 1)] ?? 25;
    }
    if (sq.type === 'UTILITY') {
      const count = s.assets.filter(
        (a) => a.ownerId === asset.ownerId && s.board[a.squareId]?.type === 'UTILITY'
      ).length;
      return diceTotal * (count === 2 ? 10 : 4);
    }
    const base = sq.rent?.[Math.min(5, hotels ? 5 : houses)] ?? 0;
    const group = sq.group ? s.board.filter((x) => x.group === sq.group) : [];
    const ownsAll =
      group.length > 0 &&
      group.every((x) => s.assets.some((a) => a.squareId === x.id && a.ownerId === asset.ownerId));
    return houses === 0 && hotels === 0 && ownsAll ? base * 2 : base;
  }

  transfer(
    s: GameState,
    fromId: string,
    toId: string | undefined,
    amount: number,
    type: string
  ): void {
    const from = s.players.find((x) => x.id === fromId);
    invariant(!!from, 'PLAYER_NOT_FOUND', 'Player not found');
    invariant(Number.isInteger(amount) && amount >= 0, 'INVALID_AMOUNT', 'Invalid amount');
    if (from.cash < amount) {
      this.record(s, 'DEBT_DEFAULTED', `${from.name} could not pay ${amount}`, {
        fromId,
        toId,
        amount,
        availableCash: from.cash,
      });
      this.bankrupt(s, fromId, toId);
      return;
    }
    from.cash -= amount;
    if (toId) {
      const to = s.players.find((x) => x.id === toId);
      if (to) to.cash += amount;
    } else if (s.settings.freeParkingPot) {
      s.freeParkingPot = (s.freeParkingPot ?? 0) + amount;
    }
    this.record(s, type, `${from.name} paid ${amount}`, { amount, fromId, toId });
  }

  endTurn(s: GameState, playerId: string): GameState {
    this.assertTurn(s, playerId);
    if (s.pendingTrade && Date.now() > Date.parse(s.pendingTrade.expiresAt)) {
      delete s.pendingTrade;
      this.record(s, 'TRADE_EXPIRED', 'Pending trade expired');
    }
    invariant(
      !s.pendingDecision &&
        !s.pendingAuction &&
        !s.pendingTrade &&
        !(s.pendingMortgageDecisions && s.pendingMortgageDecisions.length > 0),
      'PENDING_ACTION',
      'Resolve pending action before ending turn'
    );
    invariant(s.turnPhase === 'ACTION', 'INVALID_PHASE', 'Not ready to end turn');
    const p = this.current(s);
    if (s.doublesCount > 0 && p.status === 'ACTIVE' && p.jailTurns === 0) {
      s.turnPhase = 'ROLL';
      p.hasRolledThisTurn = false;
      this.refreshTurnClock(s);
    } else {
      s.doublesCount = 0;
      p.hasRolledThisTurn = false;
      this.advance(s);
    }
    s.version++;
    return s;
  }

  advance(s: GameState): void {
    let i = s.currentPlayerIndex;
    for (let n = 0; n < s.players.length; n++) {
      i = (i + 1) % s.players.length;
      if (i === 0) s.round++;
      if (s.players[i]!.status === 'ACTIVE') break;
    }
    s.currentPlayerIndex = i;
    s.turnPhase = 'ROLL';
    this.refreshTurnClock(s);
  }

  sendToJail(s: GameState, p: Player): void {
    p.position = 10;
    p.jailTurns = 3;
    p.hasRolledThisTurn = false;
    s.doublesCount = 0;
    this.record(s, 'PLAYER_JAILED', `${p.name} sent to jail`);
  }

  bankrupt(s: GameState, playerId: string, creditorId?: string): void {
    const p = s.players.find((x) => x.id === playerId);
    if (!p || p.status !== 'ACTIVE') return;
    p.status = 'BANKRUPT';

    const creditor = creditorId ? s.players.find((x) => x.id === creditorId) : undefined;

    for (const a of s.assets.filter((x) => x.ownerId === p.id)) {
      const sq = s.board[a.squareId]!;
      if (a.houses || a.hotels) {
        p.cash += Math.floor((sq.houseCost ?? 100) / 2) * (a.houses + a.hotels);
        const bank =
          s.bankBuildings ?? (s.bankBuildings = { housesRemaining: 32, hotelsRemaining: 12 });
        bank.housesRemaining += a.houses + a.hotels * 4;
        bank.hotelsRemaining += a.hotels;
        a.houses = 0;
        a.hotels = 0;
      }
      if (creditor) {
        a.ownerId = creditor.id;
        if (a.mortgaged) {
          const fee = Math.ceil((sq.price ?? 0) * 0.05);
          const principal = Math.floor((sq.price ?? 0) * 0.5);
          if (creditor.cash >= fee) {
            creditor.cash -= fee;
            this.record(
              s,
              'MORTGAGE_TRANSFER_FEE',
              `${creditor.name} paid ${fee} mortgage transfer fee on ${sq.name}`,
              { playerId: creditor.id, squareId: a.squareId, amount: fee }
            );
          }
          s.pendingMortgageDecisions ??= [];
          s.pendingMortgageDecisions.push({
            creditorId: creditor.id,
            squareId: a.squareId,
            fee,
            principal,
          });
        }
      } else {
        a.mortgaged = false;
        s.assets = s.assets.filter((x) => x.squareId !== a.squareId);
      }
    }

    if (creditor) {
      creditor.cash += p.cash;
      if (p.getOutOfJailCards > 0) {
        creditor.getOutOfJailCards += p.getOutOfJailCards;
        creditor.jailCardDecks = [
          ...(creditor.jailCardDecks ?? []),
          ...(p.jailCardDecks ?? []),
        ];
        p.getOutOfJailCards = 0;
        p.jailCardDecks = [];
      }
    }
    p.cash = 0;

    const active = s.players.filter((x) => x.status === 'ACTIVE');
    if (active.length === 1) {
      s.status = 'FINISHED';
      s.winnerId = active[0]!.id;
      s.turnPhase = 'FINISHED';
      delete s.pendingMortgageDecisions;
      this.record(s, 'GAME_FINISHED', `${active[0]!.name} won`);
    }

    this.record(s, 'PLAYER_BANKRUPT', `${p.name} is bankrupt`, {
      creditorId,
      playerId: p.id,
    });
    if (this.current(s).id === p.id && s.status === 'ACTIVE') {
      this.advance(s);
    }
  }

  resolveTransferredMortgage(
    s: GameState,
    playerId: string,
    squareId: number,
    unmortgageNow: boolean
  ): GameState {
    invariant(s.status === 'ACTIVE', 'GAME_NOT_ACTIVE', 'Game is not active');
    const list = s.pendingMortgageDecisions ?? [];
    const idx = list.findIndex((m) => m.creditorId === playerId && m.squareId === squareId);
    invariant(idx !== -1, 'NO_MORTGAGE_DECISION', 'No pending mortgage decision for this property');

    const decision = list[idx]!;
    const p = s.players.find((x) => x.id === playerId && x.status === 'ACTIVE');
    const asset = s.assets.find((a) => a.squareId === squareId && a.ownerId === playerId);
    const sq = s.board[squareId];
    invariant(!!p && !!asset && !!sq, 'INVALID_PROPERTY', 'Transferred property not found');

    if (unmortgageNow) {
      invariant(p.cash >= decision.principal, 'INSUFFICIENT_FUNDS', 'Not enough cash to unmortgage');
      p.cash -= decision.principal;
      asset.mortgaged = false;
      this.record(
        s,
        'PROPERTY_UNMORTGAGED',
        `${p.name} unmortgaged transferred ${sq.name} for ${decision.principal}`,
        { squareId, playerId: p.id, cost: decision.principal }
      );
    } else {
      this.record(
        s,
        'MORTGAGE_KEPT',
        `${p.name} kept ${sq.name} mortgaged`,
        { squareId, playerId: p.id }
      );
    }

    list.splice(idx, 1);
    if (list.length === 0) delete s.pendingMortgageDecisions;
    s.version++;
    return s;
  }

  declareBankruptcy(s: GameState, playerId: string): GameState {
    this.assertTurn(s, playerId);
    const d = s.pendingDecision;
    invariant(
      !!d && d.playerId === playerId && (d.kind === 'RENT' || d.kind === 'TAX'),
      'NO_DEBT',
      'No outstanding debt to settle'
    );
    this.record(
      s,
      'DEBT_DEFAULTED',
      `${this.current(s).name} declared bankruptcy on a debt of ${d.amount}`,
      {
        playerId,
        creditorId: d.kind === 'RENT' ? d.creditorId : undefined,
        amount: d.amount,
      }
    );
    this.bankrupt(s, playerId, d.kind === 'RENT' ? d.creditorId : undefined);
    delete s.pendingDecision;
    return s;
  }

  leaveGame(s: GameState, playerId: string): GameState {
    const idx = s.players.findIndex((p) => p.id === playerId);
    invariant(idx !== -1, 'PLAYER_NOT_FOUND', 'Player not in room');
    const p = s.players[idx]!;

    if (s.status === 'WAITING') {
      s.players.splice(idx, 1);
      if (s.players.length === 0) {
        s.status = 'CANCELLED';
      }
      this.record(s, 'PLAYER_LEFT', `${p.name} left the waiting room`, { playerId });
      s.version++;
      return s;
    }

    invariant(s.status === 'ACTIVE', 'GAME_NOT_ACTIVE', 'Cannot leave a finished game');
    if (s.pendingAuction) {
      s.pendingAuction.eligibleIds = s.pendingAuction.eligibleIds.filter((id) => id !== playerId);
      if (s.pendingAuction.eligibleIds.length === 0) {
        delete s.pendingAuction;
        s.turnPhase = 'ACTION';
      }
    }
    if (s.pendingTrade && (s.pendingTrade.fromId === playerId || s.pendingTrade.toId === playerId)) {
      delete s.pendingTrade;
    }
    if (s.pendingDecision?.playerId === playerId) {
      delete s.pendingDecision;
    }

    this.record(s, 'PLAYER_LEFT', `${p.name} resigned from the match`, { playerId });
    this.bankrupt(s, playerId, undefined);
    p.status = 'LEFT';
    return s;
  }

  assertTurn(s: GameState, id: string): void {
    invariant(s.status === 'ACTIVE', 'GAME_NOT_ACTIVE', 'Game is not active');
    invariant(this.current(s).id === id, 'NOT_YOUR_TURN', 'It is not your turn');
    invariant(this.current(s).status === 'ACTIVE', 'PLAYER_NOT_ACTIVE', 'Player is not active');
  }

  record(s: GameState, type: string, message: string, data?: unknown): void {
    recordGameEvent(s, type, message, data);
  }
}
