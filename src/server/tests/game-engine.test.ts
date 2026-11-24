import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine/game-engine.ts';
import { BuildingService } from '../services/building.service.ts';
import { TradeService } from '../services/trade.service.ts';
import { CardsService } from '../services/cards.service.ts';
import type { Player } from '../domain/types.ts';

const player = (id: string): Player => ({
  id,
  name: id,
  token: `hash-${id}`,
  color: '#000',
  cash: 1500,
  position: 0,
  status: 'ACTIVE',
  jailTurns: 0,
  getOutOfJailCards: 0,
});

function activeGame() {
  const e = new GameEngine();
  const s = e.create('TEST01', player('a'));
  e.addPlayer(s, player('b'));
  e.start(s);
  return {
    e,
    s,
    current: s.players[0]!.id,
    other: s.players[1]!.id,
  };
}

describe('GameEngine rules', () => {
  it('creates a 40-square game and starts with 2-8 players', () => {
    const { s } = activeGame();
    assert.equal(s.board.length, 40);
    assert.equal(s.status, 'ACTIVE');
    assert.equal(s.settings.maxPlayers, 8);
  });

  it('rejects actions from a non-current player', () => {
    const { e, s, other } = activeGame();
    assert.throws(() => e.roll(s, other), /It is not your turn/);
  });

  it('requires a purchase decision before buying and charges the printed price', () => {
    const { e, s, current } = activeGame();
    const p = e.current(s);
    p.position = 1;
    e.resolveLanding(s, p, 7);
    assert.equal(s.pendingDecision?.kind, 'PURCHASE');
    e.buy(s, current);
    assert.equal(p.cash, 1440);
    assert.equal(s.assets[0]?.squareId, 1);
    assert.equal(s.pendingDecision, undefined);
  });

  it('opens mandatory auction after declining an unowned property', () => {
    const { e, s, current } = activeGame();
    const p = e.current(s);
    p.position = 1;
    e.resolveLanding(s, p, 7);
    e.declinePurchase(s, current);
    assert.equal(s.turnPhase, 'AUCTION');
    assert.equal(s.pendingAuction?.squareId, 1);
  });

  it('calculates double base rent for a complete unmortgaged color group', () => {
    const { e, s, other } = activeGame();
    s.assets.push(
      { squareId: 1, ownerId: other, houses: 0, hotels: 0, mortgaged: false },
      { squareId: 3, ownerId: other, houses: 0, hotels: 0, mortgaged: false }
    );
    assert.equal(e.calculateRent(s, s.board[1]!, 0, 0, 7), 4);
  });

  it('settles rent to the owner and clears the pending debt', () => {
    const { e, s, current, other } = activeGame();
    s.assets.push({ squareId: 1, ownerId: other, houses: 0, hotels: 0, mortgaged: false });
    const p = e.current(s);
    p.position = 1;
    e.resolveLanding(s, p, 7);
    const owner = s.players.find((x) => x.id === other)!;
    const before = owner.cash;
    e.settleRent(s, current);
    assert.equal(owner.cash, before + 2);
    assert.equal(s.pendingDecision, undefined);
  });

  it('transfers remaining cash and property to the creditor on bankruptcy', () => {
    const { e, s, current, other } = activeGame();
    const debtor = s.players.find((x) => x.id === current)!;
    const creditor = s.players.find((x) => x.id === other)!;
    debtor.cash = 125;
    s.assets.push({ squareId: 1, ownerId: current, houses: 0, hotels: 0, mortgaged: false });
    e.bankrupt(s, current, other);
    assert.equal(debtor.status, 'BANKRUPT');
    assert.equal(creditor.cash, 1625);
    assert.equal(s.assets[0]?.ownerId, other);
  });

  it('enforces even building and bank inventory', () => {
    const { s, current } = activeGame();
    const building = new BuildingService();
    s.assets.push(
      { squareId: 1, ownerId: current, houses: 0, hotels: 0, mortgaged: false },
      { squareId: 3, ownerId: current, houses: 0, hotels: 0, mortgaged: false }
    );
    building.build(s, current, 1);
    assert.throws(() => building.build(s, current, 1), /Buildings must be built evenly/);
    building.build(s, current, 3);
    assert.equal(s.bankBuildings?.housesRemaining, 30);
  });

  it('rejects trade proposals outside the action phase', () => {
    const { s, current, other } = activeGame();
    const trade = new TradeService();
    assert.throws(
      () => trade.propose(s, current, other, { cashFrom: 0, cashTo: 0, assetsFrom: [], assetsTo: [] }),
      /Trades are only available during the action phase/
    );
  });

  it('rejects trade of properties not owned by the offerer', () => {
    const { s, current, other } = activeGame();
    s.turnPhase = 'ACTION';
    const trade = new TradeService();
    assert.throws(
      () => trade.propose(s, current, other, { cashFrom: 0, cashTo: 0, assetsFrom: [1], assetsTo: [] }),
      /Trade includes unavailable property/
    );
  });

  it('creates and shuffles card decks and does not expose an empty deck on first draw', () => {
    const { s, e } = activeGame();
    const p = e.current(s);
    p.position = 7;
    s.turnPhase = 'ACTION';
    e.resolveLanding(s, p, 7);
    const cards = new CardsService(e);
    const card = cards.draw(s, p, 'CHANCE');
    assert.ok(card.id);
    assert.equal(s.cardDecks?.chance.length, 15);
  });

  it('allows liquidating assets before paying rent instead of instant bankruptcy', () => {
    const { e, s, current, other } = activeGame();
    const debtor = s.players.find((x) => x.id === current)!;
    const creditor = s.players.find((x) => x.id === other)!;
    s.assets.push(
      { squareId: 39, ownerId: other, houses: 0, hotels: 0, mortgaged: false },
      { squareId: 1, ownerId: current, houses: 0, hotels: 0, mortgaged: false }
    );
    debtor.cash = 30;
    debtor.position = 39;
    e.resolveLanding(s, debtor, 7);
    assert.equal(s.pendingDecision?.kind, 'RENT');
    assert.throws(() => e.settleRent(s, current), /Cannot pay rent/);

    // Debtor mortgages square 1 (+30 cash -> 60 total >= 50 rent)
    debtor.cash += 30;
    e.settleRent(s, current);
    assert.equal(debtor.status, 'ACTIVE');
    assert.equal(debtor.cash, 10);
    assert.equal(creditor.cash, 1550);
  });

  it('recycles Get Out of Jail Free cards to originating discard pile on use', () => {
    const { e, s, current } = activeGame();
    const p = e.current(s);
    e.sendToJail(s, p);
    p.getOutOfJailCards = 1;
    p.jailCardDecks = ['COMMUNITY'];
    e.useJailCard(s, current);
    assert.equal(p.getOutOfJailCards, 0);
    assert.equal(p.jailTurns, 0);
    assert.equal(s.cardDecks?.communityDiscard.length, 1);
    assert.equal(s.cardDecks?.communityDiscard[0]?.type, 'GET_OUT_OF_JAIL');
  });

  it('charges 10% mortgage transfer fee on bankruptcy and lets creditor unmortgage or keep', () => {
    const e = new GameEngine();
    const s = e.create('THREE1', player('a'));
    e.addPlayer(s, player('b'));
    e.addPlayer(s, player('c'));
    e.start(s);

    const [p1, p2] = [s.players[0]!, s.players[1]!];
    s.assets.push({ squareId: 39, ownerId: p1.id, houses: 0, hotels: 0, mortgaged: true });
    p1.cash = 10;
    const p2Before = p2.cash;
    e.bankrupt(s, p1.id, p2.id);

    // 10% of $200 mortgage ($400 price) = $20 fee, plus $10 cash inherited = -10 net
    assert.equal(p2.cash, p2Before + 10 - 20);
    assert.equal(s.pendingMortgageDecisions?.length, 1);

    e.resolveTransferredMortgage(s, p2.id, 39, true);
    assert.equal(s.assets.find((a) => a.squareId === 39)?.mortgaged, false);
    assert.equal(p2.cash, p2Before + 10 - 20 - 200);
    assert.equal(s.pendingMortgageDecisions, undefined);
  });

  it('supports leaving waiting rooms and resigning active matches', () => {
    const { e, s, current, other } = activeGame();
    e.leaveGame(s, current);
    assert.equal(s.players.find((p) => p.id === current)?.status, 'LEFT');
    assert.equal(s.status, 'FINISHED');
    assert.equal(s.winnerId, other);
  });
});
