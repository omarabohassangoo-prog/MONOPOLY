import type { GameState } from '../domain/types.ts';
import { invariant } from '../domain/errors.ts';
import { recordGameEvent } from '../domain/events.ts';

export class AuctionService {
  start(s: GameState, squareId: number) {
    invariant(
      s.turnPhase === 'AUCTION' && s.pendingAuction?.squareId === squareId,
      'AUCTION_NOT_ALLOWED',
      'Auction must be opened by declining the pending purchase'
    );
    return s.pendingAuction;
  }

  bid(s: GameState, playerId: string, amount: number) {
    const a = s.pendingAuction;
    invariant(!!a, 'NO_AUCTION', 'No active auction');
    invariant(
      a.eligibleIds.includes(playerId) && !a.passedIds.includes(playerId),
      'NOT_ELIGIBLE',
      'Player cannot bid'
    );
    invariant(
      Number.isInteger(amount) && amount > a.highestBid,
      'INVALID_BID',
      'Bid must exceed current bid'
    );
    const p = s.players.find((x) => x.id === playerId);
    invariant(!!p && p.status === 'ACTIVE', 'PLAYER_NOT_ACTIVE', 'Player is not active');
    invariant(p.cash >= amount, 'INSUFFICIENT_FUNDS', 'Bid exceeds available cash');
    a.highestBid = amount;
    a.highestBidderId = playerId;
    recordGameEvent(s, 'AUCTION_BID', `${p.name} bid ${amount}`, {
      squareId: a.squareId,
      amount,
      playerId,
    });
    return a;
  }

  pass(s: GameState, playerId: string) {
    const a = s.pendingAuction;
    invariant(!!a && a.eligibleIds.includes(playerId), 'NOT_ELIGIBLE', 'Player cannot pass');
    if (!a.passedIds.includes(playerId)) a.passedIds.push(playerId);
    const p = s.players.find((x) => x.id === playerId);
    recordGameEvent(s, 'AUCTION_PASSED', `${p?.name ?? playerId} passed`, {
      squareId: a.squareId,
      playerId,
    });
    return this.isComplete(s);
  }

  isComplete(s: GameState): boolean {
    const a = s.pendingAuction;
    return (
      !!a &&
      a.eligibleIds.every((id) => a.passedIds.includes(id) || id === a.highestBidderId)
    );
  }

  close(s: GameState): GameState {
    const a = s.pendingAuction;
    invariant(!!a, 'NO_AUCTION', 'No active auction');
    invariant(
      this.isComplete(s),
      'AUCTION_OPEN',
      'Every eligible bidder must pass or win before closing'
    );
    if (a.highestBidderId) {
      const p = s.players.find((x) => x.id === a.highestBidderId)!;
      invariant(p.cash >= a.highestBid, 'INSUFFICIENT_FUNDS', 'Winner no longer has enough cash');
      p.cash -= a.highestBid;
      s.assets.push({
        squareId: a.squareId,
        ownerId: p.id,
        houses: 0,
        hotels: 0,
        mortgaged: false,
      });
    }
    recordGameEvent(
      s,
      'AUCTION_CLOSED',
      a.highestBidderId ? 'Auction awarded to highest bidder' : 'Auction ended without bids',
      { squareId: a.squareId, bid: a.highestBid, bidderId: a.highestBidderId }
    );
    delete s.pendingAuction;
    s.turnPhase = 'ACTION';
    return s;
  }
}
