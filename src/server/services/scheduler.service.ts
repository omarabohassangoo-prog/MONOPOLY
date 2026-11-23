import { GameEngine } from '../engine/game-engine.ts';
import { GameRepository } from '../repositories/game.repository.ts';
import { AuctionService } from './auction.service.ts';
import { CardsService } from './cards.service.ts';
import { emitGameUpdate, sanitizePublicState } from '../socket/socket.ts';

export function startTimeoutScheduler(intervalMs = 5000): () => void {
  const repo = new GameRepository();
  const engine = new GameEngine();
  const auction = new AuctionService();
  const cards = new CardsService(engine);

  const settlePendingDecisionOnTimeout = (s: ReturnType<GameRepository['listActiveGames']>[number]['state'], playerId: string) => {
    const d = s.pendingDecision;
    if (!d || d.playerId !== playerId) return;

    if (d.kind === 'PURCHASE') {
      engine.declinePurchase(s, playerId);
      return;
    }

    if (d.kind === 'CARD') {
      const player = s.players.find((p) => p.id === playerId);
      if (player) {
        cards.draw(s, player, d.deck ?? 'CHANCE');
      }
    }

    // Re-check if a RENT or TAX debt is now pending (from landing or card draw)
    const after = s.pendingDecision;
    if (!after || after.playerId !== playerId) return;
    const debtor = s.players.find((p) => p.id === playerId);
    if (!debtor) return;

    if (after.kind === 'RENT') {
      if (debtor.cash >= (after.amount ?? 0)) {
        engine.settleRent(s, playerId);
      } else {
        engine.declareBankruptcy(s, playerId);
      }
    } else if (after.kind === 'TAX') {
      if (debtor.cash >= (after.amount ?? 0)) {
        engine.settleTax(s, playerId);
      } else {
        engine.declareBankruptcy(s, playerId);
      }
    }
  };

  const tick = () => {
    const now = Date.now();
    let activeGames: ReturnType<GameRepository['listActiveGames']> = [];
    try {
      activeGames = repo.listActiveGames();
    } catch {
      return;
    }

    for (const g of activeGames) {
      try {
        const s = g.state;
        let mutated = false;

        if (s.pendingAuction?.expiresAt && now > Date.parse(s.pendingAuction.expiresAt)) {
          for (const id of s.pendingAuction.eligibleIds) {
            if (
              id !== s.pendingAuction.highestBidderId &&
              !s.pendingAuction.passedIds.includes(id)
            ) {
              s.pendingAuction.passedIds.push(id);
            }
          }
          if (auction.isComplete(s)) {
            auction.close(s);
            engine.record(s, 'AUCTION_TIMED_OUT', 'Auction closed automatically on timeout');
            mutated = true;
          }
        } else if (
          s.turnExpiresAt &&
          now > Date.parse(s.turnExpiresAt) &&
          s.turnPhase !== 'AUCTION'
        ) {
          const p = engine.current(s);

          if (s.pendingTrade && now > Date.parse(s.pendingTrade.expiresAt)) {
            delete s.pendingTrade;
            engine.record(s, 'TRADE_EXPIRED', 'Pending trade expired');
          }

          if (s.pendingMortgageDecisions && s.pendingMortgageDecisions.length > 0) {
            for (const m of [...s.pendingMortgageDecisions]) {
              engine.resolveTransferredMortgage(s, m.creditorId, m.squareId, false);
            }
          }

          if (s.pendingDecision) {
            settlePendingDecisionOnTimeout(s, p.id);
          } else if (s.turnPhase === 'ROLL') {
            engine.roll(s, p.id);
            settlePendingDecisionOnTimeout(s, p.id);
          }

          if (
            s.status === 'ACTIVE' &&
            s.turnPhase === 'ACTION' &&
            !s.pendingDecision &&
            !s.pendingAuction &&
            !s.pendingTrade &&
            engine.current(s).id === p.id
          ) {
            s.doublesCount = 0;
            engine.record(s, 'TURN_TIMED_OUT', `${p.name}'s turn timed out`);
            engine.endTurn(s, p.id);
          }
          mutated = true;
        }

        if (mutated) {
          repo.save(s, g.version);
          emitGameUpdate(g.id, sanitizePublicState(s));
        }
      } catch {
        // Ignore version conflicts or single-game errors on background sweep
      }
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
