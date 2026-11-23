import React from 'react';
import { Land } from '../engine/board';
import { MonopolyGame } from '../engine/MonopolyGame';
import { TurnPhase } from '../engine/types';
import { getGroupName, getTileName, Language, UI_TEXT } from '../i18n/translations';
import { Home, Building2, Landmark, Star } from 'lucide-react';

interface PortfolioManagerProps {
  lang: Language;
  game: MonopolyGame;
  onSelectLand: (index: number) => void;
  onBuildHouse: (land: Land) => void;
  onBuildHotel: (land: Land) => void;
  onDemolishHouse: (land: Land) => void;
  onMortgage: (land: Land) => void;
  onRedeem: (land: Land) => void;
}

export const PortfolioManager: React.FC<PortfolioManagerProps> = ({
  lang,
  game,
  onSelectLand,
  onBuildHouse,
  onBuildHotel,
  onDemolishHouse,
  onMortgage,
  onRedeem,
}) => {
  const t = UI_TEXT[lang];
  const player = game.whoseTurn.currentPlayer;
  const ownedLands = game.getPlayerProperties(player);
  const canManage =
    !player.isBot &&
    (game.whoseTurn.phase === TurnPhase.MANAGE_ASSETS ||
      game.whoseTurn.phase === TurnPhase.RESOLVE_DEBT ||
      game.whoseTurn.phase === TurnPhase.ROLL_DICE);

  if (ownedLands.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-5 text-center space-y-1.5">
        <div className="text-xs font-semibold text-slate-800">
          {lang === 'ar' ? `محفظة ${player.name}` : `${player.name}'s Portfolio`}
        </div>
        <p className="text-xs text-slate-500">{t.noDeedsOwned}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-600 px-1">
        <span className="font-semibold text-slate-800">
          {lang === 'ar'
            ? `عقارات ${player.name} (${ownedLands.length})`
            : `${player.name}'s Deeds (${ownedLands.length})`}
        </span>
        <span className="font-mono tabular-nums" dir="ltr">
          {lang === 'ar' ? `$${player.wallet.amount}` : `Cash: $${player.wallet.amount}`}
        </span>
      </div>

      {/* Color Groups First */}
      {game.sharedGroups.map((group) => {
        const ownedInGroup = group.lands.filter((l) => l.owner?.id === player.id);
        if (ownedInGroup.length === 0) return null;
        const fullMonopoly = group.hasFullMonopoly(player);

        return (
          <div key={group.groupName} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div
              className="px-3 py-2 flex items-center justify-between text-xs text-white font-semibold"
              style={{ backgroundColor: group.color }}
            >
              <span className="flex items-center gap-1.5">
                {fullMonopoly && <Star size={12} className="fill-amber-300 text-amber-300" />}
                <span>{getGroupName(group.groupName, lang)}</span>
              </span>
              <span className="font-mono text-[11px]">
                {ownedInGroup.length}/{group.lands.length} {fullMonopoly ? `· ${t.monopolyBadge}` : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {ownedInGroup.map((land) => {
                const canBuildH =
                  canManage &&
                  !land.hasHotel() &&
                  land.getHousesCount() < 4 &&
                  group.isBalancedToBuild(land) &&
                  game.bank.availableHouses > 0 &&
                  player.wallet.hasEnough(land.houseCost);

                const canBuildHot =
                  canManage &&
                  !land.hasHotel() &&
                  land.getHousesCount() === 4 &&
                  group.isBalancedToBuild(land) &&
                  game.bank.availableHotels > 0 &&
                  player.wallet.hasEnough(land.houseCost);

                const canSellH =
                  canManage &&
                  !land.hasHotel() &&
                  land.getHousesCount() > 0 &&
                  group.isBalancedToDemolish(land);

                const canMort =
                  canManage &&
                  !land.isMortgaged &&
                  land.getHousesCount() === 0 &&
                  !land.hasHotel() &&
                  !group.hasAnyBuildings();

                const redeemCost = game.mortgage.getRedeemCost(land);
                const canRedeem = canManage && land.isMortgaged && player.wallet.hasEnough(redeemCost);

                return (
                  <div key={land.index} className="p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectLand(land.index)}
                        className="font-semibold text-slate-900 hover:text-emerald-800 text-start truncate"
                      >
                        {getTileName(land.index, land.name, lang)}
                      </button>
                      <span className="font-mono text-[11px] text-slate-600 shrink-0">
                        {land.isMortgaged
                          ? t.mortgagedBadge
                          : land.hasHotel()
                          ? t.hotelLabel
                          : land.getHousesCount() > 0
                          ? lang === 'ar'
                            ? `${land.getHousesCount()} ${t.housesCountLabel}`
                            : `${land.getHousesCount()}H`
                          : `${t.rentLabel} $${land.getRent(game.dice.total, game.boardLands)}`}
                      </span>
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {fullMonopoly && !land.hasHotel() && land.getHousesCount() < 4 && (
                          <button
                            type="button"
                            disabled={!canBuildH}
                            onClick={() => onBuildHouse(land)}
                            className="px-2 py-1 rounded bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-35"
                          >
                            <Home size={11} />
                            +${land.houseCost}
                          </button>
                        )}
                        {fullMonopoly && land.getHousesCount() === 4 && !land.hasHotel() && (
                          <button
                            type="button"
                            disabled={!canBuildHot}
                            onClick={() => onBuildHotel(land)}
                            className="px-2 py-1 rounded bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-35"
                          >
                            <Building2 size={11} />
                            {t.hotelLabel}
                          </button>
                        )}
                        {land.getHousesCount() > 0 && (
                          <button
                            type="button"
                            disabled={!canSellH}
                            onClick={() => onDemolishHouse(land)}
                            className="px-2 py-1 rounded border border-slate-300 text-slate-700 text-[11px] font-semibold disabled:opacity-35"
                          >
                            {t.sellHouse}
                          </button>
                        )}
                        {land.isMortgaged ? (
                          <button
                            type="button"
                            disabled={!canRedeem}
                            onClick={() => onRedeem(land)}
                            className="ms-auto px-2 py-1 rounded bg-amber-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-35"
                          >
                            <Landmark size={11} />
                            {t.redeemMortgage} ${redeemCost}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canMort}
                            onClick={() => onMortgage(land)}
                            className="ms-auto px-2 py-1 rounded border border-slate-300 text-slate-700 text-[11px] font-semibold disabled:opacity-35"
                          >
                            {t.mortgageProp} +${land.mortgageValue}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Railroads & Utilities */}
      {ownedLands.some((l) => l.kind === 'RAILROAD' || l.kind === 'UTILITY') && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-800 text-white text-xs font-semibold">
            {t.railroadsUtilities}
          </div>
          <div className="divide-y divide-slate-100">
            {ownedLands
              .filter((l) => l.kind === 'RAILROAD' || l.kind === 'UTILITY')
              .map((land) => {
                const redeemCost = game.mortgage.getRedeemCost(land);
                return (
                  <div key={land.index} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onSelectLand(land.index)}
                      className="font-semibold text-slate-900 hover:text-emerald-800 truncate text-start"
                    >
                      {getTileName(land.index, land.name, lang)}
                    </button>
                    {canManage &&
                      (land.isMortgaged ? (
                        <button
                          type="button"
                          disabled={!player.wallet.hasEnough(redeemCost)}
                          onClick={() => onRedeem(land)}
                          className="px-2 py-1 rounded bg-amber-700 text-white text-[11px] font-semibold disabled:opacity-35 shrink-0"
                        >
                          {t.redeemMortgage} ${redeemCost}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onMortgage(land)}
                          className="px-2 py-1 rounded border border-slate-300 text-slate-700 text-[11px] font-semibold shrink-0"
                        >
                          {t.mortgageProp} +${land.mortgageValue}
                        </button>
                      ))}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

