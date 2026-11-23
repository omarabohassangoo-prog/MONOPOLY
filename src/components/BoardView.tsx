import React, { useState } from 'react';
import { Land } from '../engine/board';
import { MonopolyGame } from '../engine/MonopolyGame';
import { Player } from '../engine/player';
import { TurnPhase } from '../engine/types';
import {
  getCardTitle,
  getPhaseLabel,
  getTileName,
  Language,
  translateGameText,
  UI_TEXT,
} from '../i18n/translations';
import { DieFace, TokenIcon } from './TokenAndDice';
import {
  Sparkles,
  Landmark,
  Train,
  Zap,
  Droplets,
  Lock,
  Car,
  ArrowUpLeft,
  Gavel,
  AlertTriangle,
  HelpCircle,
  Package,
  ArrowLeftRight,
  KeyRound,
  Star,
} from 'lucide-react';

interface BoardViewProps {
  lang: Language;
  game: MonopolyGame;
  selectedLandIndex: number;
  animatedTokenPos: { playerId: string; position: number } | null;
  onSelectLand: (index: number) => void;
  onRollDice: () => void;
  onBuyLand: () => void;
  onStartAuction: () => void;
  onPlaceBid: (player: Player, amount: number) => void;
  onPassAuction: (player: Player) => void;
  onUseJailFreeCard: () => void;
  onPayJailFine: () => void;
  onAttemptJailEscape: () => void;
  onPayDebt: () => void;
  onDeclareBankruptcy: () => void;
  onOpenTrade: () => void;
  onEndTurn: () => void;
  isRolling: boolean;
}

function getGridPosition(index: number): { row: number; col: number; edge: 'bottom' | 'left' | 'top' | 'right' | 'corner' } {
  if (index === 0) return { row: 11, col: 11, edge: 'corner' };
  if (index > 0 && index < 10) return { row: 11, col: 11 - index, edge: 'bottom' };
  if (index === 10) return { row: 11, col: 1, edge: 'corner' };
  if (index > 10 && index < 20) return { row: 11 - (index - 10), col: 1, edge: 'left' };
  if (index === 20) return { row: 1, col: 1, edge: 'corner' };
  if (index > 20 && index < 30) return { row: 1, col: 1 + (index - 20), edge: 'top' };
  if (index === 30) return { row: 1, col: 11, edge: 'corner' };
  return { row: 1 + (index - 30), col: 11, edge: 'right' };
}

export const BoardView: React.FC<BoardViewProps> = ({
  lang,
  game,
  selectedLandIndex,
  animatedTokenPos,
  onSelectLand,
  onRollDice,
  onBuyLand,
  onStartAuction,
  onPlaceBid,
  onPassAuction,
  onUseJailFreeCard,
  onPayJailFine,
  onAttemptJailEscape,
  onPayDebt,
  onDeclareBankruptcy,
  onOpenTrade,
  onEndTurn,
  isRolling,
}) => {
  const t = UI_TEXT[lang];
  const [customBid, setCustomBid] = useState<string>('');
  const [bidError, setBidError] = useState<string | null>(null);
  const currentPlayer = game.whoseTurn.currentPlayer;
  const currentTile = game.boardLands[currentPlayer.position];
  const phase = game.whoseTurn.phase;
  const auction = game.auctionAction;
  const activeAuctionBidder = auction.getCurrentBidder();
  const activePlayers = game.players.filter((p) => !p.isEliminated);
  const isAnimating = animatedTokenPos !== null;

  const getVisualPos = (player: Player) => {
    if (animatedTokenPos && animatedTokenPos.playerId === player.id) {
      return animatedTokenPos.position;
    }
    return player.position;
  };

  const renderTileContent = (land: Land, edge: 'bottom' | 'left' | 'top' | 'right' | 'corner') => {
    const playersHere = activePlayers.filter((p) => getVisualPos(p) === land.index);
    const isSelected = selectedLandIndex === land.index;
    const isCurrentLanding = getVisualPos(currentPlayer) === land.index;
    const housesCount = land.getHousesCount();
    const hasHotel = land.hasHotel();
    const hasGroupMonopoly = Boolean(land.owner && land.parentGroup?.hasFullMonopoly(land.owner));

    const bandPositionClass =
      edge === 'bottom'
        ? 'top-0 inset-x-0 h-2.5'
        : edge === 'top'
        ? 'bottom-0 inset-x-0 h-2.5'
        : edge === 'left'
        ? 'right-0 inset-y-0 w-2.5'
        : edge === 'right'
        ? 'left-0 inset-y-0 w-2.5'
        : '';

    const fullTileName = getTileName(land.index, land.name, lang);
    const shortName =
      lang === 'ar'
        ? fullTileName
            .replace('نقطة الانطلاق GO', 'انطلاق GO')
            .replace('شارع ', '')
            .replace('ساحة ', '')
        : land.name
            .replace(' Ave', '')
            .replace(' Place', '')
            .replace(' Railroad', ' RR')
            .replace('North Carolina', 'N. Carolina')
            .replace('Pennsylvania', 'Penn.')
            .replace('Mediterranean', 'Medit.');

    const renderSpecialIcon = () => {
      switch (land.kind) {
        case 'GO':
          return <ArrowUpLeft size={16} className="text-emerald-700" />;
        case 'JAIL':
          return null;
        case 'FREE_PARKING':
          return <Car size={16} className="text-rose-700" />;
        case 'GO_TO_JAIL':
          return <Gavel size={15} className="text-amber-700" />;
        case 'RAILROAD':
          return <Train size={13} className="text-slate-700" />;
        case 'UTILITY':
          return land.index === 12 ? (
            <Zap size={13} className="text-amber-600" />
          ) : (
            <Droplets size={13} className="text-sky-600" />
          );
        case 'CHANCE':
          return <HelpCircle size={13} className="text-amber-600" />;
        case 'DESTINY':
          return <Package size={13} className="text-sky-700" />;
        case 'TAX':
          return <Landmark size={13} className="text-slate-600" />;
        default:
          return null;
      }
    };

    // Special iconic Jail corner (Tile 10): separate "In Jail" cell from "Just Visiting"
    if (land.index === 10) {
      const prisoners = playersHere.filter((p) => p.inJail);
      const visitors = playersHere.filter((p) => !p.inJail);

      return (
        <button
          key={land.index}
          type="button"
          onClick={() => onSelectLand(land.index)}
          style={{ gridRow: 11, gridColumn: 1 }}
          className={`relative border border-[#C7BEA8] bg-[#F7F3E9] hover:bg-[#FFFDF8] transition-colors overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
            isSelected ? 'ring-2 ring-inset ring-emerald-700 z-10' : ''
          }`}
          title={fullTileName}
        >
          {/* In Jail inner cell */}
          <div className="absolute top-0 right-0 w-[68%] h-[68%] bg-[#EFE3D2] border-b border-l border-amber-700/40 flex flex-col items-center justify-center p-0.5">
            <Lock size={11} className="text-amber-800" />
            <span className="text-[8px] font-bold text-amber-950 leading-none mt-0.5">
              {t.inJailCorner}
            </span>
            {prisoners.length > 0 && (
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                {prisoners.map((p) => (
                  <span
                    key={p.id}
                    className="p-0.5 rounded-full bg-white border border-slate-300"
                  >
                    <TokenIcon tokenName={p.tokenName} color={p.accentColor} size={10} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Just Visiting outer corner */}
          <div className="absolute bottom-0.5 left-0.5 right-0.5 flex items-center justify-between px-0.5">
            <span className="text-[7px] font-semibold text-slate-600">{t.visitCorner}</span>
            {visitors.length > 0 && (
              <div className="flex gap-0.5">
                {visitors.map((p) => (
                  <span key={p.id} className="p-0.5 rounded-full bg-white border border-slate-300">
                    <TokenIcon tokenName={p.tokenName} color={p.accentColor} size={9} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>
      );
    }

    return (
      <button
        key={land.index}
        type="button"
        onClick={() => onSelectLand(land.index)}
        style={{
          gridRow: getGridPosition(land.index).row,
          gridColumn: getGridPosition(land.index).col,
        }}
        className={`relative text-left p-1 border border-[#C7BEA8] bg-[#F7F3E9] hover:bg-[#FFFDF8] transition-colors flex flex-col justify-between overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
          isSelected ? 'ring-2 ring-inset ring-emerald-700 bg-[#FFFDF8] z-10' : ''
        } ${isCurrentLanding && !isSelected ? 'ring-2 ring-inset ring-amber-500 bg-[#FFFDF7]' : ''} ${
          land.isMortgaged ? 'opacity-70 bg-[#E6E0D2]' : ''
        }`}
        title={`${fullTileName}${land.price.amount > 0 ? ` — $${land.price.amount}` : ''}`}
      >
        {/* Property Color Band */}
        {land.kind === 'PROPERTY' && (
          <div
            className={`absolute ${bandPositionClass} flex ${
              edge === 'left' || edge === 'right' ? 'flex-col py-0.5' : 'flex-row px-0.5'
            } items-center justify-center gap-0.5`}
            style={{ backgroundColor: land.groupColor }}
          >
            {hasGroupMonopoly && !hasHotel && housesCount === 0 && (
              <Star size={7} className="fill-amber-300 text-amber-200" />
            )}
            {hasHotel && (
              <span className="w-2.5 h-1.5 bg-red-600 border border-white/80 rounded-[1px]" title={t.hotelLabel} />
            )}
            {!hasHotel &&
              housesCount > 0 &&
              Array.from({ length: housesCount }).map((_, idx) => (
                <span
                  key={idx}
                  className="w-1.5 h-1.5 bg-emerald-400 border border-emerald-950/60 rounded-[1px]"
                  title={t.housesCountLabel}
                />
              ))}
          </div>
        )}

        {/* Owner Color Marker */}
        {land.owner && (
          <div
            className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border border-white shadow-xs"
            style={{ backgroundColor: land.owner.accentColor }}
            title={`${t.ownerLabel}: ${land.owner.name}`}
          />
        )}

        {/* Inner Label */}
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className={`flex flex-col items-center justify-center text-center w-full h-full ${
            edge === 'bottom' && land.kind === 'PROPERTY'
              ? 'pt-2.5'
              : edge === 'top' && land.kind === 'PROPERTY'
              ? 'pb-2.5'
              : edge === 'left' && land.kind === 'PROPERTY'
              ? 'pr-2.5'
              : edge === 'right' && land.kind === 'PROPERTY'
              ? 'pl-2.5'
              : ''
          }`}
        >
          {renderSpecialIcon()}
          <span
            className={`${
              land.index === 0 ? 'text-[10px] font-extrabold text-emerald-900' : 'text-[8.5px] font-semibold text-slate-900'
            } leading-[1.15] line-clamp-2 px-0.5 mt-0.5`}
          >
            {shortName}
          </span>
          {land.index === 0 && (
            <span dir="ltr" className="text-[7px] font-mono font-bold text-emerald-800 mt-0.5">+$200</span>
          )}
          {land.isPurchasable() && (
            <span dir="ltr" className="text-[9px] font-mono tabular-nums text-slate-600 mt-0.5">
              {land.isMortgaged ? t.mortBadge : `$${land.price.amount}`}
            </span>
          )}
          {land.kind === 'TAX' && (
            <span dir="ltr" className="text-[9px] font-mono tabular-nums text-rose-700 mt-0.5">
              -${land.taxAmount}
            </span>
          )}
          {land.kind === 'FREE_PARKING' && game.bonus.freeParkingAmount > 0 && (
            <span dir="ltr" className="text-[9px] font-mono tabular-nums font-bold text-emerald-700 mt-0.5">
              ${game.bonus.freeParkingAmount}
            </span>
          )}
        </div>

        {/* Player Tokens on Tile */}
        {playersHere.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-wrap items-center justify-center gap-0.5 bg-white/95 rounded-md px-1 py-0.5 shadow-sm border border-slate-300">
              {playersHere.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-center rounded-full p-0.5 transition-transform duration-150 ${
                    p.id === currentPlayer.id ? 'ring-1 ring-slate-900 scale-110' : ''
                  }`}
                  style={{ backgroundColor: `${p.accentColor}22` }}
                >
                  <TokenIcon tokenName={p.tokenName} color={p.accentColor} size={11} />
                </div>
              ))}
            </div>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="w-full aspect-square max-w-[720px] mx-auto bg-[#EDE6D6] p-1.5 rounded-xl border-2 border-[#3E2A1E] shadow-xl">
      {/* Keep the outer 11x11 Monopoly grid LTR so clockwise numbering stays exact */}
      <div dir="ltr" className="w-full h-full grid grid-cols-11 grid-rows-11 bg-[#D8D0BE] rounded-lg overflow-hidden">
        {game.boardLands.map((land) => {
          const { edge } = getGridPosition(land.index);
          return renderTileContent(land, edge);
        })}

        {/* Center 9x9 Tabletop Stage */}
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}
          className="bg-[#EEF4EE] border border-[#C7BEA8] p-3 sm:p-4 flex flex-col justify-between relative overflow-y-auto custom-scrollbar"
        >
          {/* Top Stage Header */}
          <div className="flex items-center justify-between border-b border-slate-300/70 pb-2 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-mono tabular-nums font-semibold text-slate-800">
                  {t.turn} {game.whoseTurn.turnNumber}
                </span>
                <span>·</span>
                <span className="truncate">{game.roomAndGameInfo.roomName}</span>
                <span>·</span>
                <span dir="ltr" className="font-mono text-slate-500">
                  {game.roomAndGameInfo.getSessionCode()}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <TokenIcon
                  tokenName={currentPlayer.tokenName}
                  color={currentPlayer.accentColor}
                  size={17}
                />
                <span
                  className="text-base font-bold truncate"
                  style={{
                    color: currentPlayer.accentColor,
                    fontFamily: lang === 'ar' ? undefined : 'var(--font-display)',
                  }}
                >
                  {currentPlayer.name}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  — {getPhaseLabel(phase, lang)}
                </span>
              </div>
            </div>

            <div className="text-end shrink-0">
              <div className="text-[11px] text-slate-500">{t.freeParkingPot}</div>
              <div dir="ltr" className="text-base font-mono font-bold tabular-nums text-emerald-800">
                ${game.bonus.freeParkingAmount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Middle Stage */}
          {auction.isOpen && auction.targetLand ? (
            <div className="my-auto bg-white rounded-lg border border-amber-300 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <p className="text-xs font-semibold text-amber-800">
                    {t.liveAuction} · {auction.activeBidders.length} {t.activeBidders}
                  </p>
                  <h3
                    className="text-lg font-bold text-slate-900"
                    style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
                  >
                    {getTileName(auction.targetLand.index, auction.targetLand.name, lang)}
                    <span className="ms-2 text-xs font-mono font-normal text-slate-500">
                      ({t.deedLabel} ${auction.targetLand.price.amount})
                    </span>
                  </h3>
                </div>
                <div className="text-end">
                  <div className="text-[11px] text-slate-500">{t.highestBid}</div>
                  <div dir="ltr" className="text-xl font-mono font-bold tabular-nums text-emerald-800">
                    ${auction.highestBid}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {auction.highestBidder ? auction.highestBidder.name : t.openingBid}
                  </div>
                </div>
              </div>

              {/* Bidder Roster Strip */}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {activePlayers.map((p) => {
                  const isIn = auction.activeBidders.some((b) => b.id === p.id);
                  const isTurn = activeAuctionBidder?.id === p.id;
                  const isLeading = auction.highestBidder?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`px-2 py-1 rounded border flex items-center gap-1 ${
                        isTurn
                          ? 'bg-amber-50 border-amber-500 font-semibold text-slate-900'
                          : isIn
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                      }`}
                    >
                      <TokenIcon tokenName={p.tokenName} color={p.accentColor} size={11} />
                      <span>{p.name}</span>
                      {isLeading && <span className="text-emerald-700 font-semibold">{t.leadTag}</span>}
                    </div>
                  );
                })}
              </div>

              {activeAuctionBidder && (
                <div className="space-y-2.5">
                  {!activeAuctionBidder.isBot ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {[10, 25, 50, 100].map((inc) => {
                        const targetBid = auction.highestBidder
                          ? auction.highestBid + inc
                          : inc;
                        const canAfford = activeAuctionBidder.wallet.hasEnough(targetBid);
                        return (
                          <button
                            key={inc}
                            type="button"
                            disabled={!canAfford}
                            onClick={() => onPlaceBid(activeAuctionBidder, targetBid)}
                            className="px-3 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-mono font-semibold disabled:opacity-40 transition-colors whitespace-nowrap"
                          >
                            {t.bidBtn} ${targetBid}
                          </button>
                        );
                      })}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          dir="ltr"
                          min={(auction.highestBid || 0) + 1}
                          max={activeAuctionBidder.wallet.amount}
                          value={customBid}
                          onChange={(e) => setCustomBid(e.target.value)}
                          placeholder={t.customBidPlaceholder}
                          className="w-24 px-2.5 py-2 rounded-md border border-slate-300 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const minValid = auction.highestBidder ? auction.highestBid + 1 : 1;
                            const val = parseInt(customBid, 10);
                            if (isNaN(val) || val < minValid) {
                              setBidError(
                                lang === 'ar'
                                  ? `يجب أن لا تقل المزايدة عن $${minValid}.`
                                  : `Bid must be at least $${minValid}.`
                              );
                              return;
                            }
                            if (!activeAuctionBidder.wallet.hasEnough(val)) {
                              setBidError(
                                lang === 'ar'
                                  ? `الرصيد غير كافٍ (المحفظة: $${activeAuctionBidder.wallet.amount}).`
                                  : `Insufficient funds (wallet: $${activeAuctionBidder.wallet.amount}).`
                              );
                              return;
                            }
                            setBidError(null);
                            onPlaceBid(activeAuctionBidder, val);
                            setCustomBid('');
                          }}
                          className="px-3 py-2 rounded-md bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 whitespace-nowrap"
                        >
                          {t.bidBtn}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBidError(null);
                          onPassAuction(activeAuctionBidder);
                        }}
                        className="ms-auto px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
                      >
                        {t.passBtn}
                      </button>
                      {bidError && (
                        <p className="w-full text-[11px] font-medium text-rose-700">{bidError}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 italic">
                      {activeAuctionBidder.name} {t.botEvaluatingBid}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="my-auto flex flex-col gap-2.5">
              {/* Decks + Dice Row */}
              <div className="grid grid-cols-3 gap-3 items-center">
                <div className="bg-[#E3EEF7] border border-[#B9D3E8] rounded-lg p-2.5 text-center">
                  <div className="text-[11px] font-semibold text-sky-900">{t.destinyChest}</div>
                  <div className="text-[11px] text-sky-700 font-mono tabular-nums mt-0.5">
                    {game.cardDeck.destinyPool.length} {t.cardsCount}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-0.5">
                  <div dir="ltr" className="flex items-center gap-2.5">
                    <DieFace
                      value={game.dice.die1}
                      isDouble={game.dice.isDouble}
                      rolling={isRolling}
                    />
                    <DieFace
                      value={game.dice.die2}
                      isDouble={game.dice.isDouble}
                      rolling={isRolling}
                    />
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-600 mt-1">
                    {t.totalRoll}: {game.dice.total}
                    {game.dice.isDouble ? ` · ${t.doublesTag}` : ''}
                  </div>
                </div>

                <div className="bg-[#F9EEDB] border border-[#E7CCA0] rounded-lg p-2.5 text-center">
                  <div className="text-[11px] font-semibold text-amber-900">{t.chanceDeck}</div>
                  <div className="text-[11px] text-amber-700 font-mono tabular-nums mt-0.5">
                    {game.cardDeck.chancePool.length} {t.cardsCount}
                  </div>
                </div>
              </div>

              {/* Live Outcome Banner */}
              {game.lastNotification && (
                <div
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border ${
                    game.lastNotification.tone === 'good'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : game.lastNotification.tone === 'warn'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-white/80 border-slate-200 text-slate-700'
                  }`}
                >
                  {translateGameText(game.lastNotification.text, lang)}
                </div>
              )}

              {/* Drawn Card Spotlight OR Current Space Summary */}
              {game.lastDrawnCard ? (
                <div
                  className={`rounded-lg border p-3 ${
                    game.lastDrawnCard.deck === 'Chance'
                      ? 'bg-[#FFF8EC] border-amber-300'
                      : 'bg-[#F0F7FC] border-sky-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-semibold text-slate-800">
                      {game.lastDrawnCard.deck === 'Chance' ? t.chanceDeck : t.destinyChest} · {game.lastDrawnCard.playerName}
                    </span>
                    <Sparkles size={14} className="text-amber-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {getCardTitle(game.lastDrawnCard.title, lang)}
                  </p>
                </div>
              ) : (
                <div className="bg-white/90 rounded-lg border border-slate-200 px-3.5 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">
                      {t.currentPos} (#{currentTile.index})
                    </div>
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {getTileName(currentTile.index, currentTile.name, lang)}
                    </div>
                  </div>
                  {currentTile.isPurchasable() && (
                    <div className="text-end shrink-0">
                      <div className="text-[11px] text-slate-500">
                        {currentTile.owner ? `${t.ownerLabel}: ${currentTile.owner.name}` : t.availableDeed}
                      </div>
                      <div dir="ltr" className="text-sm font-mono font-bold tabular-nums text-slate-900">
                        {currentTile.owner
                          ? `${t.rentLabel} $${currentTile.getRent(game.dice.total, game.boardLands)}`
                          : `$${currentTile.price.amount}`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Console */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                {isAnimating ? (
                  <div className="px-4 py-2 rounded-lg bg-emerald-900 text-white text-xs font-semibold">
                    {t.movingToken}
                  </div>
                ) : currentPlayer.isBot ? (
                  <div className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold">
                    {currentPlayer.name} {t.takingTurn}
                  </div>
                ) : (
                  <>
                    {phase === TurnPhase.ROLL_DICE && !currentPlayer.inJail && (
                      <button
                        type="button"
                        onClick={onRollDice}
                        className="px-5 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
                      >
                        {t.rollDiceSpace}
                      </button>
                    )}

                    {phase === TurnPhase.ROLL_DICE && currentPlayer.inJail && (
                      <>
                        {currentPlayer.jailFreeCards.length > 0 && (
                          <button
                            type="button"
                            onClick={onUseJailFreeCard}
                            className="px-3.5 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap"
                          >
                            <KeyRound size={13} />
                            {t.useJailFreeCard}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onAttemptJailEscape}
                          className="px-4 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
                        >
                          {t.rollDoubles} ({currentPlayer.jailTurns}/{game.jail.maxAttempts})
                        </button>
                        <button
                          type="button"
                          disabled={!currentPlayer.wallet.hasEnough(game.jail.fineAmount)}
                          onClick={onPayJailFine}
                          className="px-4 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-sm disabled:opacity-40 transition-colors whitespace-nowrap"
                        >
                          {t.payBail} ${game.jail.fineAmount}
                        </button>
                      </>
                    )}

                    {phase === TurnPhase.BUY_OR_AUCTION && (
                      <>
                        <button
                          type="button"
                          disabled={!currentPlayer.wallet.hasEnough(currentTile.price.amount)}
                          onClick={onBuyLand}
                          className="px-4 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold shadow-sm disabled:opacity-40 transition-colors whitespace-nowrap"
                        >
                          {t.buyBtn} {getTileName(currentTile.index, currentTile.name, lang)} (${currentTile.price.amount})
                        </button>
                        <button
                          type="button"
                          onClick={onStartAuction}
                          className="px-4 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
                        >
                          {t.declineAuction}
                        </button>
                      </>
                    )}

                    {(phase === TurnPhase.ROLL_DICE ||
                      phase === TurnPhase.MANAGE_ASSETS ||
                      phase === TurnPhase.RESOLVE_DEBT) && (
                      <button
                        type="button"
                        onClick={onOpenTrade}
                        className="px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
                      >
                        <ArrowLeftRight size={14} />
                        {t.tradeBtn}
                      </button>
                    )}

                    {phase === TurnPhase.MANAGE_ASSETS && (
                      <button
                        type="button"
                        onClick={onEndTurn}
                        className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
                      >
                        {game.whoseTurn.isDoubleRoll && !currentPlayer.inJail
                          ? t.bonusRollSpace
                          : t.endTurnSpace}
                      </button>
                    )}

                    {phase === TurnPhase.RESOLVE_DEBT && game.currentDebt && (
                      <div className="w-full bg-rose-50 border border-rose-300 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-rose-900">
                          <AlertTriangle size={16} className="text-rose-700 shrink-0" />
                          <span>
                            {t.debtDue} <strong className="font-mono" dir="ltr">${game.currentDebt.amountDue}</strong>{' '}
                            ({translateGameText(game.currentDebt.reason, lang)}). {t.debtHint}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 ms-auto">
                          <button
                            type="button"
                            disabled={!currentPlayer.wallet.hasEnough(game.currentDebt.amountDue)}
                            onClick={onPayDebt}
                            className="px-3.5 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                          >
                            {t.payBtn} ${game.currentDebt.amountDue}
                          </button>
                          <button
                            type="button"
                            onClick={onDeclareBankruptcy}
                            className="px-3.5 py-2 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold whitespace-nowrap"
                          >
                            {t.declareBankruptcy}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Bottom Stage: Compact Recent Ledger */}
          <div className="border-t border-slate-300/70 pt-2">
            <div className="text-[11px] font-semibold text-slate-600 mb-1">{t.recentActivity}</div>
            <div className="space-y-1 max-h-16 overflow-y-auto custom-scrollbar pe-1">
              {game.logs.slice(0, 3).map((entry) => (
                <div key={entry.id} className="text-[11px] text-slate-700 flex items-baseline gap-1.5 leading-snug">
                  <span
                    className="font-semibold shrink-0"
                    style={{ color: entry.playerColor }}
                  >
                    {entry.playerName}:
                  </span>
                  <span className="truncate">{translateGameText(entry.message, lang)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

