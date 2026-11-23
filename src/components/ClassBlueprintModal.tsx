import React from 'react';
import { MonopolyGame } from '../engine/MonopolyGame';
import { getGroupName, getPhaseLabel, Language, UI_TEXT } from '../i18n/translations';
import { X } from 'lucide-react';

interface ClassBlueprintModalProps {
  lang: Language;
  game: MonopolyGame | null;
  onClose: () => void;
}

export const ClassBlueprintModal: React.FC<ClassBlueprintModalProps> = ({ lang, game, onClose }) => {
  const t = UI_TEXT[lang];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.blueprintTitle}
    >
      <div className="bg-[#FBF9F4] rounded-xl border border-slate-300 max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2
              className="text-xl font-bold text-slate-900"
              style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
            >
              {t.blueprintTitle}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">{t.blueprintSub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
            aria-label={t.cancelBtn}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {!game ? (
            <p className="text-sm text-slate-600">{t.blueprintEmpty}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1.5" dir="ltr">
                  GameAndRoomInfo
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.roomName}</span>
                  <span className="font-medium text-slate-900">{game.roomAndGameInfo.roomName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'رمز الجلسة' : 'sessionCode'}</span>
                  <span dir="ltr" className="font-mono text-slate-900">
                    {game.roomAndGameInfo.getSessionCode()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.maxPlayers}</span>
                  <span className="font-mono tabular-nums">{game.roomAndGameInfo.maxPlayers}</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1.5" dir="ltr">
                  Bank &amp; Bonus
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.bankCash}</span>
                  <span dir="ltr" className="font-mono tabular-nums">
                    ${game.bank.bankMoney.amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.availHouses}</span>
                  <span dir="ltr" className="font-mono tabular-nums">
                    {game.bank.availableHouses} / 32
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.availHotels}</span>
                  <span dir="ltr" className="font-mono tabular-nums">
                    {game.bank.availableHotels} / 12
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.freeParkingPot}</span>
                  <span dir="ltr" className="font-mono tabular-nums">
                    ${game.bonus.freeParkingAmount}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1.5" dir="ltr">
                  WhoseTurn &amp; Dice
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.turn}</span>
                  <span className="font-mono tabular-nums">{game.whoseTurn.turnNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.activeTurn}</span>
                  <span className="font-semibold" style={{ color: game.whoseTurn.currentPlayer.accentColor }}>
                    {game.whoseTurn.currentPlayer.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'المرحلة' : 'phase'}</span>
                  <span className="font-medium text-slate-900">
                    {getPhaseLabel(game.whoseTurn.phase, lang)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'النرد' : 'dice'}</span>
                  <span dir="ltr" className="font-mono tabular-nums">
                    {game.dice.die1} + {game.dice.die2} = {game.dice.total}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1.5" dir="ltr">
                  Jail &amp; Mortgage
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'خانة السجن' : 'jailTileIndex'}</span>
                  <span className="font-mono tabular-nums">{game.jail.jailTileIndex}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'كفالة السجن' : 'fineAmount'}</span>
                  <span dir="ltr" className="font-mono tabular-nums">${game.jail.fineAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'نسبة الرهن' : 'mortgageRate'}</span>
                  <span dir="ltr" className="font-mono tabular-nums">{game.mortgage.mortgageRate * 100}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'فائدة فك الرهن' : 'interestRate'}</span>
                  <span dir="ltr" className="font-mono tabular-nums">{game.mortgage.interestRate * 100}%</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1.5" dir="ltr">
                  Auction &amp; PendingDebt
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'حالة المزاد' : 'auction.isOpen'}</span>
                  <span className="font-mono">
                    {lang === 'ar' ? (game.auctionAction.isOpen ? 'مفتوح' : 'مغلق') : String(game.auctionAction.isOpen)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.highestBid}</span>
                  <span dir="ltr" className="font-mono tabular-nums">${game.auctionAction.highestBid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'الدين الحالي' : 'currentDebt'}</span>
                  <span className="font-mono tabular-nums">
                    {game.currentDebt
                      ? `$${game.currentDebt.amountDue} (${game.currentDebt.debtor.name})`
                      : lang === 'ar'
                      ? 'لا يوجد'
                      : 'null'}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1.5" dir="ltr">
                  CardDeck &amp; Outcomes
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.chanceDeck}</span>
                  <span className="font-mono tabular-nums">
                    {game.cardDeck.chancePool.length} {t.cardsCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.destinyChest}</span>
                  <span className="font-mono tabular-nums">
                    {game.cardDeck.destinyPool.length} {t.cardsCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'المُقصَون' : 'losers'}</span>
                  <span className="font-mono tabular-nums">{game.losers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{lang === 'ar' ? 'الفائز' : 'winner'}</span>
                  <span className="font-medium">
                    {game.winner ? game.winner.winningPlayer.name : lang === 'ar' ? 'قيد اللعب' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {game && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold text-emerald-900 mb-3">
                {lang === 'ar'
                  ? 'حالة احتكار المجموعات (SharedLandGroup)'
                  : 'SharedLandGroup Monopoly Status'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {game.sharedGroups.map((group) => {
                  const monopolist = game.players.find((p) => !p.isEliminated && group.hasFullMonopoly(p));
                  return (
                    <div key={group.groupName} className="border border-slate-200 rounded-md p-2.5">
                      <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <span>{getGroupName(group.groupName, lang)}</span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {monopolist
                          ? `${t.monopolyBadge}: ${monopolist.name}`
                          : lang === 'ar'
                          ? `${group.lands.length} صكوك موزعة`
                          : `${group.lands.length} deeds split`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

