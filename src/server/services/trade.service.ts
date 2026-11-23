import { randomUUID } from 'crypto';
import type { GameState } from '../domain/types.ts';
import { invariant } from '../domain/errors.ts';
import { recordGameEvent } from '../domain/events.ts';

export class TradeService {
  propose(
    s: GameState,
    fromId: string,
    toId: string,
    offer: { cashFrom: number; cashTo: number; assetsFrom: number[]; assetsTo: number[] }
  ) {
    invariant(
      s.status === 'ACTIVE' && s.players[s.currentPlayerIndex]?.id === fromId,
      'NOT_YOUR_TURN',
      'Only the current player may propose a trade'
    );
    invariant(s.status === 'ACTIVE', 'GAME_NOT_ACTIVE', 'Game is not active');
    invariant(!s.pendingTrade, 'TRADE_PENDING', 'A trade is already pending');
    invariant(
      fromId !== toId && s.players.some((p) => p.id === toId && p.status === 'ACTIVE'),
      'INVALID_RECIPIENT',
      'Invalid trade recipient'
    );
    invariant(
      !s.pendingAuction && !s.pendingDecision,
      'PENDING_ACTION',
      'Resolve current action before trading'
    );
    invariant(
      new Set(offer.assetsFrom).size === offer.assetsFrom.length &&
        new Set(offer.assetsTo).size === offer.assetsTo.length,
      'DUPLICATE_ASSET',
      'Trade contains duplicate properties'
    );

    const valid = (ids: number[], owner: string) =>
      ids.every((id) =>
        s.assets.some(
          (a) => a.squareId === id && a.ownerId === owner && !a.mortgaged && !a.houses && !a.hotels
        )
      );
    invariant(
      valid(offer.assetsFrom, fromId) && valid(offer.assetsTo, toId),
      'ASSET_NOT_TRADEABLE',
      'Trade includes unavailable property or property with buildings'
    );
    invariant(
      offer.cashFrom > 0 ||
        offer.cashTo > 0 ||
        offer.assetsFrom.length > 0 ||
        offer.assetsTo.length > 0,
      'EMPTY_TRADE',
      'Trade offer must contain money or property'
    );
    invariant(
      Number.isInteger(offer.cashFrom) &&
        Number.isInteger(offer.cashTo) &&
        offer.cashFrom >= 0 &&
        offer.cashTo >= 0,
      'INVALID_CASH',
      'Cash must be non-negative integers'
    );

    const from = s.players.find((p) => p.id === fromId)!;
    invariant(from.cash >= offer.cashFrom, 'INSUFFICIENT_FUNDS', 'Offerer cannot cover offered cash');

    s.pendingTrade = {
      id: randomUUID(),
      fromId,
      toId,
      ...offer,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    recordGameEvent(s, 'TRADE_PROPOSED', `${from.name} proposed a trade`, {
      tradeId: s.pendingTrade.id,
      fromId,
      toId,
    });
    return s.pendingTrade;
  }

  respond(s: GameState, playerId: string, accept: boolean): GameState {
    const t = s.pendingTrade;
    invariant(!!t && t.toId === playerId, 'NO_TRADE', 'No trade for this player');
    if (Date.now() > Date.parse(t.expiresAt)) {
      delete s.pendingTrade;
      recordGameEvent(s, 'TRADE_EXPIRED', 'Trade offer expired', { tradeId: t.id });
      return s;
    }
    if (accept) {
      const from = s.players.find((p) => p.id === t.fromId);
      const to = s.players.find((p) => p.id === t.toId);
      invariant(
        !!from && !!to && from.status === 'ACTIVE' && to.status === 'ACTIVE',
        'PLAYER_NOT_ACTIVE',
        'Trade participant is no longer active'
      );
      invariant(
        from.cash >= t.cashFrom && to.cash >= t.cashTo,
        'INSUFFICIENT_FUNDS',
        'Trade cash unavailable'
      );
      const stillValid = (ids: number[], owner: string) =>
        ids.every((id) =>
          s.assets.some(
            (a) =>
              a.squareId === id && a.ownerId === owner && !a.mortgaged && !a.houses && !a.hotels
          )
        );
      invariant(
        stillValid(t.assetsFrom, from.id) && stillValid(t.assetsTo, to.id),
        'ASSET_CHANGED',
        'Trade assets changed before acceptance'
      );
      from.cash += t.cashTo - t.cashFrom;
      to.cash += t.cashFrom - t.cashTo;
      for (const id of t.assetsFrom) {
        s.assets.find((a) => a.squareId === id)!.ownerId = to.id;
      }
      for (const id of t.assetsTo) {
        s.assets.find((a) => a.squareId === id)!.ownerId = from.id;
      }
    }
    recordGameEvent(
      s,
      accept ? 'TRADE_ACCEPTED' : 'TRADE_REJECTED',
      accept ? 'Trade accepted' : 'Trade rejected',
      { tradeId: t.id, fromId: t.fromId, toId: t.toId }
    );
    delete s.pendingTrade;
    return s;
  }
}
