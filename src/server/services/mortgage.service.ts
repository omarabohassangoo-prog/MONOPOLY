import type { GameState } from '../domain/types.ts';
import { invariant } from '../domain/errors.ts';
import { recordGameEvent } from '../domain/events.ts';

export class MortgageService {
  mortgage(s: GameState, playerId: string, squareId: number): number {
    const a = s.assets.find((x) => x.squareId === squareId);
    const sq = s.board[squareId];
    const p = s.players.find((x) => x.id === playerId);

    invariant(
      s.status === 'ACTIVE' && s.players[s.currentPlayerIndex]?.id === playerId,
      'NOT_YOUR_TURN',
      'Only the current player may mortgage'
    );
    invariant(
      !s.pendingAuction && !s.pendingTrade,
      'PENDING_ACTION',
      'Resolve the pending auction or trade first'
    );
    invariant(!!sq && !!p, 'INVALID_PLAYER_OR_PROPERTY', 'Invalid player or property');
    invariant(!!a && a.ownerId === playerId && !a.mortgaged, 'NOT_MORTGAGEABLE', 'Asset unavailable');
    if (sq.group) {
      invariant(
        s.board
          .filter((x) => x.group === sq.group)
          .every((x) => {
            const owned = s.assets.find((y) => y.squareId === x.id);
            return !owned || (owned.houses === 0 && owned.hotels === 0);
          }),
        'BUILDINGS_REMAIN',
        'Sell all buildings in the color group before mortgaging'
      );
    }

    a.mortgaged = true;
    const value = Math.floor((sq.price ?? 0) / 2);
    p.cash += value;
    recordGameEvent(s, 'PROPERTY_MORTGAGED', `${p.name} mortgaged ${sq.name}`, {
      squareId,
      playerId: p.id,
      value,
    });
    return value;
  }

  unmortgage(s: GameState, playerId: string, squareId: number): number {
    const a = s.assets.find((x) => x.squareId === squareId);
    const sq = s.board[squareId];
    const p = s.players.find((x) => x.id === playerId);

    invariant(
      s.status === 'ACTIVE' && s.players[s.currentPlayerIndex]?.id === playerId,
      'NOT_YOUR_TURN',
      'Only the current player may unmortgage'
    );
    invariant(
      !s.pendingAuction && !s.pendingTrade,
      'PENDING_ACTION',
      'Resolve the pending auction or trade first'
    );
    invariant(!!sq && !!p, 'INVALID_PLAYER_OR_PROPERTY', 'Invalid player or property');
    invariant(!!a && a.ownerId === playerId && a.mortgaged, 'NOT_MORTGAGED', 'Asset is not mortgaged');

    const cost = Math.ceil((sq.price ?? 0) * 0.55);
    invariant(p.cash >= cost, 'INSUFFICIENT_FUNDS', 'Not enough cash');
    p.cash -= cost;
    a.mortgaged = false;
    recordGameEvent(s, 'PROPERTY_UNMORTGAGED', `${p.name} unmortgaged ${sq.name}`, {
      squareId,
      playerId: p.id,
      cost,
    });
    return cost;
  }
}
