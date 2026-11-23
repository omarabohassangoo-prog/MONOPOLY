import React, { useState } from 'react';
import { MonopolyGame } from '../engine/MonopolyGame';
import { Player } from '../engine/player';
import { PendingTradeOffer } from '../engine/types';
import { getTileName, Language, translateGameText, UI_TEXT } from '../i18n/translations';
import { TokenIcon } from './TokenAndDice';
import { ArrowLeftRight, X, Check, Ban } from 'lucide-react';

interface TradeModalProps {
  lang: Language;
  game: MonopolyGame;
  proposer: Player;
  onClose: () => void;
  onPropose: (offer: PendingTradeOffer) => { status: 'accepted' | 'declined' | 'pending'; reason: string };
}

export const TradeModal: React.FC<TradeModalProps> = ({
  lang,
  game,
  proposer,
  onClose,
  onPropose,
}) => {
  const t = UI_TEXT[lang];
  const partners = game.players.filter((p) => !p.isEliminated && p.id !== proposer.id);
  const [partnerId, setPartnerId] = useState<string>(partners[0]?.id ?? '');
  const [offeredLands, setOfferedLands] = useState<number[]>([]);
  const [requestedLands, setRequestedLands] = useState<number[]>([]);
  const [offeredCash, setOfferedCash] = useState<number>(0);
  const [requestedCash, setRequestedCash] = useState<number>(0);
  const [offeredJail, setOfferedJail] = useState<number>(0);
  const [requestedJail, setRequestedJail] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);

  const partner = partners.find((p) => p.id === partnerId) ?? partners[0];
  if (!partner) return null;

  const isTradable = (idx: number) => {
    const land = game.boardLands[idx];
    if (!land || land.getHousesCount() > 0 || land.hasHotel()) return false;
    if (land.parentGroup?.hasAnyBuildings()) return false;
    return true;
  };

  const myLands = game.getPlayerProperties(proposer).filter((l) => isTradable(l.index));
  const partnerLands = game.getPlayerProperties(partner).filter((l) => isTradable(l.index));

  const toggleIndex = (list: number[], setList: (next: number[]) => void, idx: number) => {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx]);
  };

  const handleSubmit = () => {
    const result = onPropose({
      fromPlayerId: proposer.id,
      toPlayerId: partner.id,
      offeredLandIndices: offeredLands,
      offeredCash,
      offeredJailCards: offeredJail,
      requestedLandIndices: requestedLands,
      requestedCash,
      requestedJailCards: requestedJail,
    });

    if (result.status === 'accepted' || result.status === 'pending') {
      onClose();
    } else {
      setFeedback({ tone: 'warn', text: translateGameText(result.reason, lang) });
    }
  };

  const offerTotal =
    offeredCash +
    offeredJail * 50 +
    offeredLands.reduce((sum, idx) => sum + game.boardLands[idx].price.amount, 0);
  const requestTotal =
    requestedCash +
    requestedJail * 50 +
    requestedLands.reduce((sum, idx) => sum + game.boardLands[idx].price.amount, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.proposeTradeTitle}
    >
      <div className="bg-[#FBF9F4] rounded-xl border border-slate-300 max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ArrowLeftRight size={18} className="text-emerald-800" />
            <div>
              <h2
                className="text-xl font-bold text-slate-900"
                style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
              >
                {t.proposeTradeTitle}
              </h2>
              <p className="text-xs text-slate-600">{t.proposeTradeSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70"
            aria-label={t.cancelBtn}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {/* Partner Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 me-1">{t.tradeWith}:</span>
            {partners.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPartnerId(p.id);
                  setRequestedLands([]);
                  setRequestedJail(0);
                  setFeedback(null);
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  partner.id === p.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <TokenIcon
                  tokenName={p.tokenName}
                  color={partner.id === p.id ? '#FFFFFF' : p.accentColor}
                  size={13}
                />
                <span>{p.name}</span>
                <span dir="ltr" className="font-mono opacity-75">${p.wallet.amount}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Side: Your Offer */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold" style={{ color: proposer.accentColor }}>
                  {t.youOffer} ({proposer.name})
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600" dir="ltr">
                  {t.estValue}: ${offerTotal}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t.cashOffer} ({lang === 'ar' ? `الحد الأقصى $${proposer.wallet.amount}` : `Max $${proposer.wallet.amount}`})
                </label>
                <input
                  type="number"
                  dir="ltr"
                  min={0}
                  max={proposer.wallet.amount}
                  value={offeredCash}
                  onChange={(e) =>
                    setOfferedCash(Math.max(0, Math.min(proposer.wallet.amount, Number(e.target.value) || 0)))
                  }
                  className="w-full px-3 py-1.5 rounded border border-slate-300 text-xs font-mono"
                />
              </div>

              {proposer.jailFreeCards.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    {t.jailCardsHeld} ({proposer.jailFreeCards.length})
                  </span>
                  <input
                    type="number"
                    dir="ltr"
                    min={0}
                    max={proposer.jailFreeCards.length}
                    value={offeredJail}
                    onChange={(e) =>
                      setOfferedJail(Math.max(0, Math.min(proposer.jailFreeCards.length, Number(e.target.value) || 0)))
                    }
                    className="w-16 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                  />
                </div>
              )}

              <div>
                <div className="text-[11px] font-medium text-slate-600 mb-1.5">
                  {t.unbuiltProps} ({myLands.length})
                </div>
                {myLands.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{t.noTradableProps}</p>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pe-1">
                    {myLands.map((land) => {
                      const checked = offeredLands.includes(land.index);
                      return (
                        <button
                          key={land.index}
                          type="button"
                          onClick={() => toggleIndex(offeredLands, setOfferedLands, land.index)}
                          className={`w-full px-2.5 py-1.5 rounded border text-start text-xs flex items-center justify-between transition-colors ${
                            checked
                              ? 'bg-emerald-50 border-emerald-700 text-slate-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: land.groupColor }}
                            />
                            <span className="truncate">{getTileName(land.index, land.name, lang)}</span>
                          </span>
                          <span dir="ltr" className="font-mono text-[11px] shrink-0">
                            ${land.price.amount}
                            {land.isMortgaged ? ` (${t.mortBadge})` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: You Request */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold" style={{ color: partner.accentColor }}>
                  {t.youRequest} ({partner.name})
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600" dir="ltr">
                  {t.estValue}: ${requestTotal}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t.cashRequest} ({lang === 'ar' ? `الحد الأقصى $${partner.wallet.amount}` : `Max $${partner.wallet.amount}`})
                </label>
                <input
                  type="number"
                  dir="ltr"
                  min={0}
                  max={partner.wallet.amount}
                  value={requestedCash}
                  onChange={(e) =>
                    setRequestedCash(Math.max(0, Math.min(partner.wallet.amount, Number(e.target.value) || 0)))
                  }
                  className="w-full px-3 py-1.5 rounded border border-slate-300 text-xs font-mono"
                />
              </div>

              {partner.jailFreeCards.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    {t.jailCardsHeld} ({partner.jailFreeCards.length})
                  </span>
                  <input
                    type="number"
                    dir="ltr"
                    min={0}
                    max={partner.jailFreeCards.length}
                    value={requestedJail}
                    onChange={(e) =>
                      setRequestedJail(Math.max(0, Math.min(partner.jailFreeCards.length, Number(e.target.value) || 0)))
                    }
                    className="w-16 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                  />
                </div>
              )}

              <div>
                <div className="text-[11px] font-medium text-slate-600 mb-1.5">
                  {t.partnerProps} ({partnerLands.length})
                </div>
                {partnerLands.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{t.noTradableProps}</p>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pe-1">
                    {partnerLands.map((land) => {
                      const checked = requestedLands.includes(land.index);
                      return (
                        <button
                          key={land.index}
                          type="button"
                          onClick={() => toggleIndex(requestedLands, setRequestedLands, land.index)}
                          className={`w-full px-2.5 py-1.5 rounded border text-start text-xs flex items-center justify-between transition-colors ${
                            checked
                              ? 'bg-amber-50 border-amber-700 text-slate-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: land.groupColor }}
                            />
                            <span className="truncate">{getTileName(land.index, land.name, lang)}</span>
                          </span>
                          <span dir="ltr" className="font-mono text-[11px] shrink-0">
                            ${land.price.amount}
                            {land.isMortgaged ? ` (${t.mortBadge})` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {feedback && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
              {feedback.text}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            disabled={
              offeredLands.length === 0 &&
              requestedLands.length === 0 &&
              offeredCash === 0 &&
              requestedCash === 0 &&
              offeredJail === 0 &&
              requestedJail === 0
            }
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            {t.sendTradeBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

interface IncomingTradeModalProps {
  lang: Language;
  game: MonopolyGame;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingTradeModal: React.FC<IncomingTradeModalProps> = ({
  lang,
  game,
  onAccept,
  onDecline,
}) => {
  const t = UI_TEXT[lang];
  const offer = game.pendingTrade;
  if (!offer) return null;

  const from = game.players.find((p) => p.id === offer.fromPlayerId);
  const to = game.players.find((p) => p.id === offer.toPlayerId);
  if (!from || !to) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.incomingTradeFor}
    >
      <div className="bg-[#FBF9F4] rounded-xl border border-amber-300 max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div>
          <p className="text-xs font-semibold text-amber-800">
            {t.incomingTradeFor} {to.name}
          </p>
          <h2
            className="text-xl font-bold text-slate-900 mt-0.5"
            style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
          >
            {from.name} {t.proposesDeal}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1.5">
            <div className="font-semibold text-emerald-900 border-b border-slate-100 pb-1">
              {t.youReceive}
            </div>
            {offer.offeredCash > 0 && (
              <div className="font-mono font-semibold text-emerald-800" dir="ltr">
                ${offer.offeredCash}
              </div>
            )}
            {offer.offeredJailCards > 0 && (
              <div>{offer.offeredJailCards}× {t.jailFreeHeld}</div>
            )}
            {offer.offeredLandIndices.map((idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: game.boardLands[idx].groupColor }}
                />
                <span>{getTileName(idx, game.boardLands[idx].name, lang)}</span>
              </div>
            ))}
            {offer.offeredCash === 0 && offer.offeredJailCards === 0 && offer.offeredLandIndices.length === 0 && (
              <div className="text-slate-400 italic">{t.nothingLabel}</div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1.5">
            <div className="font-semibold text-rose-900 border-b border-slate-100 pb-1">
              {t.youGive}
            </div>
            {offer.requestedCash > 0 && (
              <div className="font-mono font-semibold text-rose-800" dir="ltr">
                ${offer.requestedCash}
              </div>
            )}
            {offer.requestedJailCards > 0 && (
              <div>{offer.requestedJailCards}× {t.jailFreeHeld}</div>
            )}
            {offer.requestedLandIndices.map((idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: game.boardLands[idx].groupColor }}
                />
                <span>{getTileName(idx, game.boardLands[idx].name, lang)}</span>
              </div>
            ))}
            {offer.requestedCash === 0 && offer.requestedJailCards === 0 && offer.requestedLandIndices.length === 0 && (
              <div className="text-slate-400 italic">{t.nothingLabel}</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
          >
            <Ban size={14} />
            {t.declineBtn}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="px-5 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Check size={14} />
            {t.acceptDealBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

