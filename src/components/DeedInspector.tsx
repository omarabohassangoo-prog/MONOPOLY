import React, { useEffect, useState } from 'react';
import { Land } from '../engine/board';
import { MonopolyGame } from '../engine/MonopolyGame';
import { Player } from '../engine/player';
import { TurnPhase } from '../engine/types';
import { getGroupName, getTileName, Language, UI_TEXT } from '../i18n/translations';
import { Home, Building2, Landmark, ArrowRightLeft } from 'lucide-react';

interface DeedInspectorProps {
  lang: Language;
  game: MonopolyGame;
  land: Land;
  onBuildHouse: (land: Land) => void;
  onBuildHotel: (land: Land) => void;
  onDemolishHouse: (land: Land) => void;
  onDemolishHotel: (land: Land) => void;
  onMortgage: (land: Land) => void;
  onRedeem: (land: Land) => void;
  onSellToPlayer: (seller: Player, buyer: Player, land: Land, price: number) => void;
}

export const DeedInspector: React.FC<DeedInspectorProps> = ({
  lang,
  game,
  land,
  onBuildHouse,
  onBuildHotel,
  onDemolishHouse,
  onDemolishHotel,
  onMortgage,
  onRedeem,
  onSellToPlayer,
}) => {
  const t = UI_TEXT[lang];
  const activePlayer = game.whoseTurn.currentPlayer;
  const otherPlayers = game.players.filter((p) => !p.isEliminated && p.id !== activePlayer.id);
  const otherPlayerIds = otherPlayers.map((p) => p.id).join(',');

  const [buyerId, setBuyerId] = useState<string>(otherPlayers[0]?.id ?? '');
  const [salePrice, setSalePrice] = useState<string>(String(land.price.amount || 100));

  useEffect(() => {
    setSalePrice(String(land.price.amount || 100));
  }, [land.index, land.price.amount]);

  useEffect(() => {
    const ids = otherPlayerIds ? otherPlayerIds.split(',') : [];
    if (!ids.includes(buyerId)) {
      setBuyerId(ids[0] ?? '');
    }
  }, [activePlayer.id, otherPlayerIds, buyerId]);

  const isOwnedByCurrent = land.owner?.id === activePlayer.id && !activePlayer.isBot;
  const canManagePhase =
    game.whoseTurn.phase === TurnPhase.MANAGE_ASSETS ||
    game.whoseTurn.phase === TurnPhase.RESOLVE_DEBT ||
    game.whoseTurn.phase === TurnPhase.ROLL_DICE;

  const group = land.parentGroup;
  const hasMonopoly = group ? group.hasFullMonopoly(activePlayer) : false;
  const canBuildHouse =
    isOwnedByCurrent &&
    canManagePhase &&
    land.kind === 'PROPERTY' &&
    group !== null &&
    !land.hasHotel() &&
    land.getHousesCount() < 4 &&
    group.isBalancedToBuild(land) &&
    game.bank.availableHouses > 0 &&
    activePlayer.wallet.hasEnough(land.houseCost);

  const canBuildHotel =
    isOwnedByCurrent &&
    canManagePhase &&
    land.kind === 'PROPERTY' &&
    group !== null &&
    !land.hasHotel() &&
    land.getHousesCount() === 4 &&
    group.isBalancedToBuild(land) &&
    game.bank.availableHotels > 0 &&
    activePlayer.wallet.hasEnough(land.houseCost);

  const canDemolishHouse =
    isOwnedByCurrent &&
    canManagePhase &&
    land.kind === 'PROPERTY' &&
    group !== null &&
    !land.hasHotel() &&
    land.getHousesCount() > 0 &&
    group.isBalancedToDemolish(land);

  const canDemolishHotel =
    isOwnedByCurrent &&
    canManagePhase &&
    land.kind === 'PROPERTY' &&
    group !== null &&
    land.hasHotel() &&
    group.isBalancedToDemolish(land);

  const canMortgage =
    isOwnedByCurrent &&
    canManagePhase &&
    land.isPurchasable() &&
    !land.isMortgaged &&
    land.getHousesCount() === 0 &&
    !land.hasHotel() &&
    (!group || !group.hasAnyBuildings());

  const redeemCost = game.mortgage.getRedeemCost(land);
  const canRedeem =
    isOwnedByCurrent &&
    canManagePhase &&
    land.isMortgaged &&
    activePlayer.wallet.hasEnough(redeemCost);

  const canSellToPeer =
    isOwnedByCurrent &&
    canManagePhase &&
    land.isPurchasable() &&
    land.getHousesCount() === 0 &&
    !land.hasHotel() &&
    (!group || !group.hasAnyBuildings()) &&
    otherPlayers.length > 0;

  const tileDisplayName = getTileName(land.index, land.name, lang);
  const groupDisplayName = land.groupName ? getGroupName(land.groupName, lang) : land.kind.replace('_', ' ');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div
          className="px-4 py-3 border-b border-slate-200"
          style={{
            backgroundColor: land.kind === 'PROPERTY' ? land.groupColor : '#1E293B',
          }}
        >
          <div className="text-[11px] font-medium text-white/85">
            #{land.index} · {groupDisplayName}
          </div>
          <h3
            className="text-lg font-bold text-white leading-snug"
            style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
          >
            {tileDisplayName}
          </h3>
        </div>

        <div className="p-4 space-y-3 text-xs">
          {land.isPurchasable() ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{t.purchasePrice}</span>
                <span dir="ltr" className="font-mono font-bold tabular-nums text-slate-900">
                  ${land.price.amount}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{t.currentOwner}</span>
                <span
                  className="font-semibold"
                  style={{ color: land.owner ? land.owner.accentColor : '#64748B' }}
                >
                  {land.owner ? land.owner.name : t.unownedBank}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{t.activeRent}</span>
                <span dir="ltr" className="font-mono font-bold tabular-nums text-emerald-800">
                  {land.isMortgaged
                    ? t.mortgagedZero
                    : `$${land.getRent(game.dice.total, game.boardLands)}`}
                </span>
              </div>

              {land.kind === 'PROPERTY' && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-slate-500">{t.rentSchedule}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t.baseRent}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.baseRent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t.fullGroup}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.baseRent * 2}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t.house1}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.rentTiers[0]}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t.house2}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.rentTiers[1]}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t.house3}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.rentTiers[2]}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t.house4}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.rentTiers[3]}</span>
                    </div>
                    <div className="flex justify-between col-span-2 pt-1 border-t border-slate-100 font-semibold text-slate-900">
                      <span>{t.hotelLabel}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${land.rentTiers[4]}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-600">
                    <span>{t.houseHotelCost}</span>
                    <span dir="ltr" className="font-mono tabular-nums">${land.houseCost}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>{t.builtStatus}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {land.hasHotel()
                        ? `1 ${t.hotelLabel}`
                        : `${land.getHousesCount()}/4 ${t.housesCountLabel}`}
                    </span>
                  </div>
                </div>
              )}

              {land.kind === 'RAILROAD' && (
                <div className="space-y-1 text-slate-600">
                  {[1, 2, 3, 4].map((cnt) => (
                    <div key={cnt} className="flex justify-between">
                      <span>{cnt} {lang === 'ar' ? 'محطة' : 'Railroad'}</span>
                      <span dir="ltr" className="font-mono tabular-nums">${25 * Math.pow(2, cnt - 1)}</span>
                    </div>
                  ))}
                </div>
              )}

              {land.kind === 'UTILITY' && (
                <div className="space-y-1 text-slate-600">
                  <p>{lang === 'ar' ? 'مرفق واحد: 4× مجموع النرد' : '1 Utility owned: 4× dice roll'}</p>
                  <p>{lang === 'ar' ? 'مرفقان: 10× مجموع النرد' : '2 Utilities owned: 10× dice roll'}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-600">
                <span>{t.mortgageValue}</span>
                <span dir="ltr" className="font-mono tabular-nums">${land.mortgageValue}</span>
              </div>
            </>
          ) : (
            <p className="text-slate-600 leading-relaxed">
              {land.kind === 'GO' && (lang === 'ar' ? 'اجمع $200 في كل مرة تمر أو تقف عند نقطة الانطلاق.' : 'Collect $200 salary every time you pass or land on GO.')}
              {land.kind === 'JAIL' && (lang === 'ar' ? 'الزيارة مجانية. إذا كنت مسجوناً، ارمِ دبل أو ادفع كفالة $50.' : 'Visiting is free. If in Jail, roll doubles or pay $50 bail.')}
              {land.kind === 'FREE_PARKING' && (lang === 'ar' ? `تجمع الضرائب والغرامات. الصندوق الحالي: $${game.bonus.freeParkingAmount}.` : `Collects all taxes and card fines. Current pot: $${game.bonus.freeParkingAmount}.`)}
              {land.kind === 'GO_TO_JAIL' && (lang === 'ar' ? 'تُنتقل مباشرة إلى السجن دون الحصول على $200.' : 'Move directly to Jail without collecting $200.')}
              {land.kind === 'TAX' && (lang === 'ar' ? `ادفع ضريبة بقيمة $${land.taxAmount}.` : `Pay $${land.taxAmount} tax.`)}
              {land.kind === 'CHANCE' && (lang === 'ar' ? 'اسحب بطاقة فرصة ونفّذ تأثيرها فوراً.' : 'Draw the top Chance card and apply its effect immediately.')}
              {land.kind === 'DESTINY' && (lang === 'ar' ? 'اسحب بطاقة صندوق الحظ ونفّذ تأثيرها فوراً.' : 'Draw the top Destiny Chest card and apply its effect.')}
            </p>
          )}
        </div>
      </div>

      {isOwnedByCurrent && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-800">
            {t.ownerControls} ({activePlayer.name})
          </div>

          {land.kind === 'PROPERTY' && (
            <div className="space-y-2">
              {!hasMonopoly && (
                <p className="text-[11px] text-slate-500">
                  {t.monopolyHint}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!canBuildHouse}
                  onClick={() => onBuildHouse(land)}
                  className="px-2.5 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Home size={13} />
                  {t.addHouse} (${land.houseCost})
                </button>
                <button
                  type="button"
                  disabled={!canBuildHotel}
                  onClick={() => onBuildHotel(land)}
                  className="px-2.5 py-2 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Building2 size={13} />
                  {t.addHotel} (${land.houseCost})
                </button>
                <button
                  type="button"
                  disabled={!canDemolishHouse}
                  onClick={() => onDemolishHouse(land)}
                  className="px-2.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {t.sellHouse} (+${Math.round(land.houseCost * 0.5)})
                </button>
                <button
                  type="button"
                  disabled={!canDemolishHotel}
                  onClick={() => onDemolishHotel(land)}
                  className="px-2.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {t.sellHotel} (+${Math.round(land.houseCost * 0.5)})
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            {land.isMortgaged ? (
              <button
                type="button"
                disabled={!canRedeem}
                onClick={() => onRedeem(land)}
                className="w-full py-2 px-3 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
              >
                <Landmark size={14} />
                {t.redeemMortgage} (${redeemCost})
              </button>
            ) : (
              <button
                type="button"
                disabled={!canMortgage}
                onClick={() => onMortgage(land)}
                className="w-full py-2 px-3 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
              >
                <Landmark size={14} />
                {t.mortgageProp} (+${land.mortgageValue})
              </button>
            )}
          </div>

          {canSellToPeer && (() => {
            const targetBuyer =
              otherPlayers.find((p) => p.id === (buyerId || otherPlayers[0]?.id)) ?? otherPlayers[0];
            const parsedPrice = parseInt(salePrice, 10);
            const isValidSale =
              Boolean(targetBuyer) &&
              !isNaN(parsedPrice) &&
              parsedPrice > 0 &&
              targetBuyer.wallet.hasEnough(parsedPrice);

            return (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                  <ArrowRightLeft size={13} />
                  {t.sellDeedToPlayer}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={targetBuyer?.id ?? ''}
                    onChange={(e) => setBuyerId(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
                  >
                    {otherPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${p.wallet.amount})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    dir="ltr"
                    min={1}
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-20 px-2 py-1.5 rounded border border-slate-300 text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={!isValidSale}
                  onClick={() => {
                    if (isValidSale && targetBuyer) {
                      onSellToPlayer(activePlayer, targetBuyer, land, parsedPrice);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  {t.executeSale}
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
