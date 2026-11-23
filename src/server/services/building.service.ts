import type { GameState, OwnedAsset } from '../domain/types.ts';
import { invariant } from '../domain/errors.ts';
import { recordGameEvent } from '../domain/events.ts';

export class BuildingService {
  build(s: GameState, playerId: string, squareId: number) {
    const p = s.players.find((x) => x.id === playerId);
    const sq = s.board[squareId];
    const a = s.assets.find((x) => x.squareId === squareId);

    invariant(
      s.status === 'ACTIVE' && s.players[s.currentPlayerIndex]?.id === playerId,
      'NOT_YOUR_TURN',
      'Only the current player may build'
    );
    invariant(
      !s.pendingDecision && !s.pendingAuction && !s.pendingTrade,
      'PENDING_ACTION',
      'Resolve pending actions before building'
    );
    invariant(!!p && p.status === 'ACTIVE', 'PLAYER_NOT_ACTIVE', 'Player is not active');
    invariant(
      !!sq && !!a && a.ownerId === playerId && !a.mortgaged,
      'NOT_OWNER',
      'You must own an unmortgaged property'
    );
    invariant(!!sq.group, 'INVALID_PROPERTY', 'Only color properties can be developed');

    const group = s.board.filter((x) => x.group === sq.group);
    const assets = group.map((x) => s.assets.find((y) => y.squareId === x.id)!);
    invariant(
      assets.every((x) => x && x.ownerId === playerId),
      'MONOPOLY_REQUIRED',
      'Own the full color group'
    );
    invariant(!assets.some((x) => x.mortgaged), 'GROUP_MORTGAGED', 'No building while group is mortgaged');

    const level = (x: OwnedAsset) => (x.hotels ? 5 : x.houses);
    invariant(
      level(a) === Math.min(...assets.map(level)),
      'EVEN_BUILDING_REQUIRED',
      'Buildings must be built evenly'
    );

    const bank = s.bankBuildings ?? (s.bankBuildings = { housesRemaining: 32, hotelsRemaining: 12 });
    const cost = sq.houseCost ?? 100;
    invariant(p.cash >= cost, 'INSUFFICIENT_FUNDS', 'Not enough cash');

    if (a.houses < 4 && !a.hotels) {
      invariant(bank.housesRemaining > 0, 'BANK_OUT_OF_HOUSES', 'The bank has no houses available');
      a.houses++;
      bank.housesRemaining--;
    } else {
      invariant(a.houses === 4 && !a.hotels, 'MAX_BUILDINGS', 'Property already has a hotel');
      invariant(
        assets.every((x) => x.houses === 4 || x.hotels === 1),
        'HOTEL_REQUIREMENT',
        'Every property in the color group must have four houses or a hotel'
      );
      invariant(bank.hotelsRemaining > 0, 'BANK_OUT_OF_HOTELS', 'The bank has no hotels available');
      a.houses = 0;
      a.hotels = 1;
      bank.housesRemaining += 4;
      bank.hotelsRemaining--;
    }

    p.cash -= cost;
    recordGameEvent(s, 'BUILDING_BUILT', `${p.name} developed ${sq.name}`, {
      squareId,
      playerId: p.id,
      houses: a.houses,
      hotels: a.hotels,
      cost,
    });
    return a;
  }

  sell(s: GameState, playerId: string, squareId: number) {
    const a = s.assets.find((x) => x.squareId === squareId);
    const sq = s.board[squareId];
    const p = s.players.find((x) => x.id === playerId);

    invariant(
      s.status === 'ACTIVE' && s.players[s.currentPlayerIndex]?.id === playerId,
      'NOT_YOUR_TURN',
      'Only the current player may sell buildings'
    );
    invariant(
      !s.pendingAuction && !s.pendingTrade,
      'PENDING_ACTION',
      'Resolve the pending auction or trade first'
    );
    invariant(
      !!p && !!a && !!sq && a.ownerId === playerId && (a.houses > 0 || a.hotels > 0),
      'NO_BUILDING',
      'No building to sell'
    );

    const group = s.board.filter((x) => x.group === sq.group);
    const assets = group.map((x) => s.assets.find((y) => y.squareId === x.id)!);
    const level = (x: OwnedAsset) => (x.hotels ? 5 : x.houses);
    invariant(
      level(a) === Math.max(...assets.map(level)),
      'EVEN_SELLING_REQUIRED',
      'Buildings must be sold evenly'
    );

    const bank = s.bankBuildings ?? (s.bankBuildings = { housesRemaining: 32, hotelsRemaining: 12 });
    const refund = Math.floor((sq.houseCost ?? 100) / 2);

    if (a.hotels) {
      invariant(
        bank.housesRemaining >= 4,
        'BANK_OUT_OF_HOUSES',
        'Cannot exchange hotel because the bank lacks four houses'
      );
      a.hotels = 0;
      a.houses = 4;
      bank.housesRemaining -= 4;
      bank.hotelsRemaining++;
    } else {
      a.houses--;
      bank.housesRemaining++;
    }

    p.cash += refund;
    recordGameEvent(s, 'BUILDING_SOLD', `${p.name} sold a building on ${sq.name}`, {
      squareId,
      playerId: p.id,
      houses: a.houses,
      hotels: a.hotels,
      refund,
    });
    return a;
  }
}
