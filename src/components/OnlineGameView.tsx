import React, { useEffect, useMemo, useState } from 'react';
import {
  ApiClientError,
  manopolyApi,
  type ChatMessage,
  type OnlineGameState,
  type OnlineOwnedAsset,
  type OnlinePlayer,
  type OnlineSquare,
  type OnlineTurnPhase,
  type PresenceInfo,
  type TransactionRecord,
} from '../api/manopolyClient';
import {
  getGroupName,
  getTileName,
  translateGameText,
  type Language,
  UI_TEXT,
} from '../i18n/translations';
import { DieFace } from './TokenAndDice';
import { soundFX } from '../utils/sound';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpLeft,
  Building2,
  Car,
  Clock,
  Droplets,
  Eye,
  Gavel,
  HelpCircle,
  KeyRound,
  Landmark,
  Lock,
  LogOut,
  MessageSquare,
  Package,
  Send,
  Skull,
  Train,
  Trophy,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

interface OnlineGameViewProps {
  lang: Language;
  game: OnlineGameState;
  myPlayerId: string | null;
  myPlayerToken: string | null;
  isSpectator?: boolean;
  socketConnected: boolean;
  presence: PresenceInfo;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => Promise<boolean>;
  onGameStateUpdate: (state: OnlineGameState) => void;
  onExitGame: () => void;
}

const GROUP_COLORS: Record<string, string> = {
  brown: '#8B4513',
  lightblue: '#38BDF8',
  pink: '#EC4899',
  orange: '#F97316',
  red: '#EF4444',
  yellow: '#EAB308',
  green: '#16A34A',
  darkblue: '#1D4ED8',
};

const GROUP_DISPLAY_NAMES: Record<string, string> = {
  brown: 'Brown',
  lightblue: 'Light Blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  darkblue: 'Dark Blue',
};

function getGridPosition(
  index: number
): { row: number; col: number; edge: 'bottom' | 'left' | 'top' | 'right' | 'corner' } {
  if (index === 0) return { row: 11, col: 11, edge: 'corner' };
  if (index > 0 && index < 10) return { row: 11, col: 11 - index, edge: 'bottom' };
  if (index === 10) return { row: 11, col: 1, edge: 'corner' };
  if (index > 10 && index < 20) return { row: 11 - (index - 10), col: 1, edge: 'left' };
  if (index === 20) return { row: 1, col: 1, edge: 'corner' };
  if (index > 20 && index < 30) return { row: 1, col: 1 + (index - 20), edge: 'top' };
  if (index === 30) return { row: 1, col: 11, edge: 'corner' };
  return { row: 1 + (index - 30), col: 11, edge: 'right' };
}

function formatTurnPhase(phase: OnlineTurnPhase, lang: Language): string {
  const map: Record<OnlineTurnPhase, { en: string; ar: string }> = {
    ROLL: { en: 'Roll Dice', ar: 'رمي النرد' },
    ACTION: { en: 'Manage / End Turn', ar: 'إدارة وإنهاء الدور' },
    RESOLVING: { en: 'Resolving Debt', ar: 'تسوية الالتزام' },
    JAIL: { en: 'Jail Turn', ar: 'دور السجن' },
    AUCTION: { en: 'Live Auction', ar: 'مزاد مباشر' },
    TRADE: { en: 'Pending Trade', ar: 'صفقة معلقة' },
    FINISHED: { en: 'Finished', ar: 'انتهت' },
  };
  return map[phase]?.[lang] ?? phase;
}

export const OnlineGameView: React.FC<OnlineGameViewProps> = ({
  lang,
  game,
  myPlayerId,
  myPlayerToken,
  isSpectator = false,
  socketConnected,
  presence,
  chatMessages,
  onSendChat,
  onGameStateUpdate,
  onExitGame,
}) => {
  const isAr = lang === 'ar';
  const t = UI_TEXT[lang];

  const [selectedSquareId, setSelectedSquareId] = useState<number>(1);
  const [rightTab, setRightTab] = useState<'deed' | 'portfolio' | 'ledger' | 'chat'>('deed');
  const [ledgerMode, setLedgerMode] = useState<'events' | 'transactions'>('events');
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [customBid, setCustomBid] = useState('');
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Trade modal state
  const [tradeToId, setTradeToId] = useState('');
  const [cashFrom, setCashFrom] = useState(0);
  const [cashTo, setCashTo] = useState(0);
  const [assetsFrom, setAssetsFrom] = useState<number[]>([]);
  const [assetsTo, setAssetsTo] = useState<number[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (rightTab === 'ledger' && ledgerMode === 'transactions') {
      setLoadingTx(true);
      manopolyApi
        .listTransactions(game.id, myPlayerToken)
        .then((res) => setTransactions(res.transactions))
        .catch(() => {
          // Keep existing transactions on transient error
        })
        .finally(() => setLoadingTx(false));
    }
  }, [game.id, game.version, ledgerMode, myPlayerToken, rightTab]);

  const currentPlayer = game.players[game.currentPlayerIndex];
  const me = myPlayerId ? game.players.find((p) => p.id === myPlayerId) : undefined;
  const isMyTurn = Boolean(
    !isSpectator &&
      myPlayerId &&
      myPlayerToken &&
      currentPlayer &&
      currentPlayer.id === myPlayerId &&
      game.status === 'ACTIVE'
  );
  const activePlayers = useMemo(
    () => game.players.filter((p) => p.status === 'ACTIVE'),
    [game.players]
  );

  const assetBySquare = useMemo(() => {
    const map = new Map<number, OnlineOwnedAsset>();
    for (const a of game.assets) map.set(a.squareId, a);
    return map;
  }, [game.assets]);

  const playerById = useMemo(() => {
    const map = new Map<string, OnlinePlayer>();
    for (const p of game.players) map.set(p.id, p);
    return map;
  }, [game.players]);

  const runAction = async (
    action: string,
    body?: unknown,
    sound?: 'roll' | 'cash' | 'build' | 'warn'
  ) => {
    if (!myPlayerToken || isSpectator) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await manopolyApi.mutate(game.id, action, myPlayerToken, body);
      onGameStateUpdate(res.state);
      if (sound === 'roll') soundFX.diceRoll();
      else if (sound === 'cash') soundFX.cashChime();
      else if (sound === 'build') soundFX.buildThud();
      else if (sound === 'warn') soundFX.alertWarning();
      if (res.state.status === 'FINISHED') soundFX.victoryFanfare();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'GAME_VERSION_CONFLICT') {
        try {
          const latest = await manopolyApi.getGame(game.id, myPlayerToken);
          onGameStateUpdate(latest.game);
        } catch {
          // Ignore refresh error
        }
      }
      setActionError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const getSquareColor = (sq: OnlineSquare) => {
    if (sq.group && GROUP_COLORS[sq.group]) return GROUP_COLORS[sq.group];
    if (sq.type === 'RAILROAD') return '#334155';
    if (sq.type === 'UTILITY') return '#0EA5E9';
    return '#CBD5E1';
  };

  const selectedSquare = game.board[selectedSquareId] ?? game.board[0]!;
  const selectedAsset = assetBySquare.get(selectedSquare.id);
  const selectedOwner = selectedAsset ? playerById.get(selectedAsset.ownerId) : undefined;

  const myAssets = useMemo(
    () => (myPlayerId ? game.assets.filter((a) => a.ownerId === myPlayerId) : []),
    [game.assets, myPlayerId]
  );

  const otherActivePlayers = useMemo(
    () => activePlayers.filter((p) => p.id !== myPlayerId),
    [activePlayers, myPlayerId]
  );

  const auction = game.pendingAuction;
  const isAuctionComplete = Boolean(
    auction &&
      auction.eligibleIds.every(
        (id) => auction.passedIds.includes(id) || id === auction.highestBidderId
      )
  );
  const canIBidInAuction = Boolean(
    !isSpectator &&
      myPlayerId &&
      auction &&
      auction.eligibleIds.includes(myPlayerId) &&
      !auction.passedIds.includes(myPlayerId)
  );

  const pendingDecision = game.pendingDecision;
  const isResolvingOwnDebt = Boolean(
    myPlayerId &&
      pendingDecision &&
      (pendingDecision.kind === 'RENT' || pendingDecision.kind === 'TAX') &&
      pendingDecision.playerId === myPlayerId
  );
  const myPendingMortgageDecision = useMemo(
    () =>
      myPlayerId
        ? game.pendingMortgageDecisions?.find((m) => m.creditorId === myPlayerId)
        : undefined,
    [game.pendingMortgageDecisions, myPlayerId]
  );

  const expiryIso =
    game.turnPhase === 'AUCTION' && auction?.expiresAt
      ? auction.expiresAt
      : game.status === 'ACTIVE'
      ? game.turnExpiresAt
      : undefined;
  const secondsLeft = expiryIso
    ? Math.max(0, Math.ceil((Date.parse(expiryIso) - nowMs) / 1000))
    : null;

  const currentSquare = currentPlayer ? game.board[currentPlayer.position] : undefined;

  const renderTileContent = (
    sq: OnlineSquare,
    edge: 'bottom' | 'left' | 'top' | 'right' | 'corner'
  ) => {
    const asset = assetBySquare.get(sq.id);
    const owner = asset ? playerById.get(asset.ownerId) : undefined;
    const playersHere = activePlayers.filter((p) => p.position === sq.id);
    const isSelected = selectedSquareId === sq.id;
    const isCurrentLanding = currentPlayer?.position === sq.id;

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

    const fullTileName = getTileName(sq.id, sq.name, lang);
    const shortName =
      lang === 'ar'
        ? fullTileName
            .replace('نقطة الانطلاق GO', 'انطلاق GO')
            .replace('شارع ', '')
            .replace('ساحة ', '')
        : sq.name
            .replace(' Avenue', ' Ave')
            .replace(' Place', '')
            .replace(' Railroad', ' RR')
            .replace('North Carolina', 'N. Carolina')
            .replace('Pennsylvania', 'Penn.')
            .replace('Mediterranean', 'Medit.');

    const renderSpecialIcon = () => {
      switch (sq.type) {
        case 'GO':
          return <ArrowUpLeft size={16} className="text-emerald-700" />;
        case 'FREE_PARKING':
          return <Car size={16} className="text-rose-700" />;
        case 'GO_TO_JAIL':
          return <Gavel size={15} className="text-amber-700" />;
        case 'RAILROAD':
          return <Train size={13} className="text-slate-700" />;
        case 'UTILITY':
          return sq.id === 12 ? (
            <Zap size={13} className="text-amber-600" />
          ) : (
            <Droplets size={13} className="text-sky-600" />
          );
        case 'CHANCE':
          return <HelpCircle size={13} className="text-amber-600" />;
        case 'COMMUNITY':
          return <Package size={13} className="text-sky-700" />;
        case 'TAX':
          return <Landmark size={13} className="text-slate-600" />;
        default:
          return null;
      }
    };

    const isHorizontalSide = edge === 'left' || edge === 'right';
    const contentPadding =
      edge === 'bottom'
        ? 'pt-3 px-0.5 pb-0.5'
        : edge === 'top'
        ? 'pb-3 px-0.5 pt-0.5'
        : edge === 'left'
        ? 'pe-3 ps-0.5 py-0.5'
        : edge === 'right'
        ? 'ps-3 pe-0.5 py-0.5'
        : 'p-1';

    return (
      <button
        type="button"
        onClick={() => {
          setSelectedSquareId(sq.id);
          setRightTab('deed');
        }}
        className={`relative w-full h-full flex flex-col items-center justify-between text-center select-none overflow-hidden transition-all ${contentPadding} ${
          asset?.mortgaged
            ? 'bg-slate-200/90 opacity-80'
            : sq.type === 'GO' || sq.type === 'FREE_PARKING'
            ? 'bg-[#EEF5E9]'
            : sq.type === 'JAIL' || sq.type === 'GO_TO_JAIL'
            ? 'bg-[#F8EFE2]'
            : 'bg-[#FBF9F2]'
        } ${
          isSelected
            ? 'ring-2 ring-inset ring-amber-500 z-10'
            : isCurrentLanding
            ? 'ring-2 ring-inset ring-emerald-700 z-10'
            : 'hover:bg-white'
        }`}
        title={fullTileName}
      >
        {sq.type === 'PROPERTY' && edge !== 'corner' && (
          <div
            className={`absolute ${bandPositionClass} flex items-center justify-center gap-0.5`}
            style={{ backgroundColor: getSquareColor(sq) }}
          >
            {asset?.hotels ? (
              <span className="w-2.5 h-2 rounded-[1px] bg-rose-600 border border-white/90 shadow-2xs" />
            ) : (
              Array.from({ length: asset?.houses ?? 0 }).map((_, idx) => (
                <span
                  key={idx}
                  className="w-1.5 h-1.5 rounded-[1px] bg-emerald-200 border border-emerald-950/50"
                />
              ))
            )}
          </div>
        )}

        {edge === 'corner' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-0.5">
            {sq.type === 'JAIL' ? (
              <>
                <div className="w-7 h-6 rounded border border-amber-700/60 bg-amber-100/80 flex items-center justify-center">
                  <Lock size={11} className="text-amber-800" />
                </div>
                <span className="text-[8.5px] font-bold text-slate-800 leading-none">
                  {t.inJailCorner}
                </span>
              </>
            ) : (
              <>
                {renderSpecialIcon()}
                <span className="text-[8.5px] font-bold text-slate-900 leading-tight px-0.5">
                  {shortName}
                </span>
              </>
            )}
          </div>
        ) : (
          <div
            className={`w-full h-full flex flex-col items-center justify-between ${
              isHorizontalSide ? 'py-0.5' : ''
            }`}
          >
            <div className="flex flex-col items-center gap-0.5 w-full">
              {renderSpecialIcon()}
              <span className="text-[7.5px] sm:text-[8px] font-semibold text-slate-800 leading-[1.08] line-clamp-2 px-0.5">
                {shortName}
              </span>
            </div>

            {sq.price ? (
              <span dir="ltr" className="text-[8px] font-mono font-semibold text-slate-600">
                ${sq.price}
              </span>
            ) : sq.tax ? (
              <span dir="ltr" className="text-[8px] font-mono font-semibold text-rose-700">
                -${sq.tax}
              </span>
            ) : null}
          </div>
        )}

        {owner && (
          <div
            className="absolute bottom-0.5 left-0.5 w-2 h-2 rounded-full border border-white shadow-2xs"
            style={{ backgroundColor: owner.color }}
            title={owner.name}
          />
        )}

        {playersHere.length > 0 && (
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-0.5 pointer-events-none p-0.5">
            {playersHere.map((p) => {
              const pIdx = game.players.findIndex((x) => x.id === p.id) + 1;
              return (
                <div
                  key={p.id}
                  className={`w-4 h-4 rounded-full bg-white shadow-md border-2 flex items-center justify-center text-[8px] font-bold text-slate-900 ${
                    p.id === currentPlayer?.id ? 'scale-110 ring-1 ring-amber-400' : ''
                  }`}
                  style={{ borderColor: p.color }}
                  title={p.name}
                >
                  {pIdx}
                </div>
              );
            })}
          </div>
        )}
      </button>
    );
  };

  const renderDeedInspector = () => {
    const ownsSelected = Boolean(myPlayerId && selectedAsset?.ownerId === myPlayerId);
    const canLiquidateSelected =
      !isSpectator &&
      isMyTurn &&
      ownsSelected &&
      !game.pendingAuction &&
      !game.pendingTrade &&
      (isResolvingOwnDebt || (game.turnPhase === 'ACTION' && !game.pendingDecision));

    const canBuildOrUnmortgageSelected =
      !isSpectator &&
      isMyTurn &&
      ownsSelected &&
      game.turnPhase === 'ACTION' &&
      !game.pendingDecision &&
      !game.pendingAuction &&
      !game.pendingTrade;

    const groupSquares = selectedSquare.group
      ? game.board.filter((x) => x.group === selectedSquare.group)
      : [];
    const ownsFullGroup =
      groupSquares.length > 0 &&
      groupSquares.every((x) => assetBySquare.get(x.id)?.ownerId === myPlayerId);

    const mortgageVal = selectedSquare.price ? Math.floor(selectedSquare.price / 2) : 0;
    const unmortgageCost = selectedSquare.price ? Math.ceil(selectedSquare.price * 0.55) : 0;

    return (
      <div className="space-y-3 text-xs">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
          <div
            className="px-3.5 py-2.5 text-white flex items-center justify-between"
            style={{ backgroundColor: getSquareColor(selectedSquare) }}
          >
            <div>
              <div className="text-[10px] opacity-90 font-medium">
                #{selectedSquare.id} ·{' '}
                {selectedSquare.group
                  ? getGroupName(GROUP_DISPLAY_NAMES[selectedSquare.group] ?? selectedSquare.group, lang)
                  : selectedSquare.type}
              </div>
              <div className="text-sm font-bold">
                {getTileName(selectedSquare.id, selectedSquare.name, lang)}
              </div>
            </div>
            {selectedSquare.price && (
              <span dir="ltr" className="font-mono font-bold text-sm">
                ${selectedSquare.price}
              </span>
            )}
          </div>

          <div className="p-3.5 space-y-2.5">
            {selectedSquare.type === 'PROPERTY' && selectedSquare.rent && (
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.baseRent}</span>
                  <span dir="ltr" className="font-mono font-semibold">
                    ${selectedSquare.rent[0]}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.fullGroup}</span>
                  <span dir="ltr" className="font-mono font-semibold">
                    ${(selectedSquare.rent[0] ?? 0) * 2}
                  </span>
                </div>
                {[1, 2, 3, 4].map((h) => (
                  <div key={h} className="flex justify-between">
                    <span className="text-slate-600">
                      {h} {isAr ? 'منازل' : h === 1 ? 'House' : 'Houses'}
                    </span>
                    <span dir="ltr" className="font-mono font-semibold">
                      ${selectedSquare.rent![h]}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.hotelLabel}</span>
                  <span dir="ltr" className="font-mono font-semibold">
                    ${selectedSquare.rent[5]}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5">
                  <span className="text-slate-600">{t.houseHotelCost}</span>
                  <span dir="ltr" className="font-mono font-semibold">
                    ${selectedSquare.houseCost}
                  </span>
                </div>
              </div>
            )}

            {selectedSquare.type === 'RAILROAD' && selectedSquare.rent && (
              <div className="space-y-1 text-[11px]">
                {[1, 2, 3, 4].map((cnt, idx) => (
                  <div key={cnt} className="flex justify-between">
                    <span className="text-slate-600">
                      {cnt} {isAr ? 'سكك حديدية' : cnt === 1 ? 'Railroad' : 'Railroads'}
                    </span>
                    <span dir="ltr" className="font-mono font-semibold">
                      ${selectedSquare.rent![idx]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {selectedSquare.type === 'UTILITY' && (
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {isAr
                  ? '4× نتيجة النرد عند امتلاك مرفق واحد، و10× نتيجة النرد عند امتلاك المرفقين.'
                  : 'Rent is 4× dice roll if 1 utility is owned, or 10× dice roll if both are owned.'}
              </p>
            )}

            {selectedSquare.price && (
              <div className="border-t border-slate-100 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.ownerLabel}</span>
                  <span className="font-semibold text-slate-900">
                    {selectedOwner ? selectedOwner.name : t.availableDeed}
                  </span>
                </div>
                {selectedAsset && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{isAr ? 'التطوير' : 'Development'}</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {selectedAsset.mortgaged
                        ? t.mortgagedBadge
                        : selectedAsset.hotels
                        ? `1 ${t.hotelLabel}`
                        : `${selectedAsset.houses} ${isAr ? 'منازل' : 'Houses'}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {canLiquidateSelected && selectedAsset && (
              <div className="border-t border-slate-200 pt-2.5 space-y-1.5">
                {selectedSquare.type === 'PROPERTY' &&
                  (ownsFullGroup || selectedAsset.houses > 0 || selectedAsset.hotels > 0) &&
                  !selectedAsset.mortgaged && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {canBuildOrUnmortgageSelected && ownsFullGroup && (
                        <button
                          type="button"
                          disabled={busy || selectedAsset.hotels === 1}
                          onClick={() => runAction('build', { squareId: selectedSquare.id }, 'build')}
                          className="py-1.5 px-2 rounded bg-[#0F5132] hover:bg-[#0B3F27] text-white text-[11px] font-semibold disabled:opacity-40"
                        >
                          {selectedAsset.houses === 4
                            ? isAr
                              ? 'بناء فندق'
                              : 'Build Hotel'
                            : isAr
                            ? 'بناء منزل'
                            : 'Build House'}{' '}
                          (${selectedSquare.houseCost})
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || (selectedAsset.houses === 0 && selectedAsset.hotels === 0)}
                        onClick={() =>
                          runAction('sell-building', { squareId: selectedSquare.id }, 'cash')
                        }
                        className="py-1.5 px-2 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-[11px] font-semibold disabled:opacity-40"
                      >
                        {isAr ? 'بيع مبنى' : 'Sell Building'}
                      </button>
                    </div>
                  )}
                {!selectedAsset.mortgaged ? (
                  <button
                    type="button"
                    disabled={busy || selectedAsset.houses > 0 || selectedAsset.hotels > 0}
                    onClick={() => runAction('mortgage', { squareId: selectedSquare.id }, 'cash')}
                    className="w-full py-1.5 px-2 rounded bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-semibold disabled:opacity-40"
                  >
                    {isAr ? `رهن العقار (+$${mortgageVal})` : `Mortgage (+$${mortgageVal})`}
                  </button>
                ) : (
                  canBuildOrUnmortgageSelected && (
                    <button
                      type="button"
                      disabled={busy || (me?.cash ?? 0) < unmortgageCost}
                      onClick={() => runAction('unmortgage', { squareId: selectedSquare.id }, 'cash')}
                      className="w-full py-1.5 px-2 rounded bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-semibold disabled:opacity-40"
                    >
                      {isAr
                        ? `فك الرهن (-$${unmortgageCost})`
                        : `Unmortgage (-$${unmortgageCost})`}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-4 grid grid-cols-1 xl:grid-cols-[290px_1fr_330px] gap-4 items-start">
      {/* Left Rail: Players Roster + Bank Supply */}
      <aside className="space-y-4">
        <div className="bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div>
              <h2
                className="text-base font-bold text-slate-900"
                style={{ fontFamily: isAr ? undefined : 'var(--font-display)' }}
              >
                {t.seatedPlayers}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Wifi size={11} className={socketConnected ? 'text-emerald-600' : 'text-amber-600'} />
                <span dir="ltr" className="font-mono font-semibold text-slate-700">
                  {game.code}
                </span>
                <span>·</span>
                <span>
                  {isAr ? 'جولة' : 'Round'} {game.round}
                </span>
                {presence.spectatorCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-sky-700 font-semibold">
                    · <Eye size={10} /> {presence.spectatorCount}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isSpectator || game.status !== 'ACTIVE') {
                  onExitGame();
                } else {
                  setShowLeaveConfirm(true);
                }
              }}
              className="p-1.5 rounded-md text-slate-500 hover:text-rose-700 hover:bg-slate-200/70 transition-colors"
              title={isSpectator ? (isAr ? 'إنهاء المشاهدة' : 'Stop watching') : isAr ? 'الانسحاب من المباراة' : 'Leave / Resign'}
            >
              <LogOut size={15} />
            </button>
          </div>

          {isSpectator && (
            <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 flex items-center gap-2 text-xs font-semibold text-sky-900">
              <Eye size={14} className="text-sky-700 shrink-0" />
              <span>{isAr ? 'أنت تشاهد المباراة مباشرة (للقراءة فقط)' : 'Spectator Mode (Live Read-Only)'}</span>
            </div>
          )}

          <div className="space-y-2.5">
            {game.players.map((p, idx) => {
              const isActive = currentPlayer?.id === p.id && p.status === 'ACTIVE';
              const isMe = Boolean(myPlayerId && p.id === myPlayerId);
              const isOnline = presence.onlinePlayerIds.includes(p.id);
              const props = game.assets.filter((a) => a.ownerId === p.id);
              const tile = game.board[p.position]!;

              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    p.status !== 'ACTIVE'
                      ? 'bg-slate-100 border-slate-200 opacity-55'
                      : isActive
                      ? 'bg-white border-emerald-700 ring-1 ring-emerald-700/30 shadow-xs'
                      : 'bg-white/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs"
                          style={{ backgroundColor: p.color }}
                        >
                          {idx + 1}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                          title={isOnline ? (isAr ? 'متصل' : 'Online') : isAr ? 'غير متصل' : 'Offline'}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                          <span className="truncate">{p.name}</span>
                          {isMe && (
                            <span className="px-1 py-0.2 rounded bg-emerald-100 text-emerald-900 text-[9px] font-bold shrink-0">
                              {isAr ? 'أنت' : 'You'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {p.status === 'LEFT'
                            ? isAr
                              ? 'منسحب'
                              : 'Left'
                            : p.status === 'BANKRUPT'
                            ? t.bankrupt
                            : p.jailTurns > 0
                            ? t.inJail
                            : isActive
                            ? t.activeTurn
                            : isAr
                            ? 'منتظر'
                            : 'Waiting'}
                          {' · '}
                          {getTileName(tile.id, tile.name, lang)}
                        </div>
                      </div>
                    </div>

                    <div className="text-end shrink-0">
                      <div
                        dir="ltr"
                        className="text-sm font-mono font-bold tabular-nums text-slate-900"
                      >
                        ${p.cash.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {p.getOutOfJailCards > 0 && p.status === 'ACTIVE' && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-sky-800">
                      <KeyRound size={11} />
                      <span>
                        {p.getOutOfJailCards}× {t.jailFreeHeld}
                      </span>
                    </div>
                  )}

                  {p.jailTurns > 0 && p.status === 'ACTIVE' && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                      <Lock size={11} />
                      <span>
                        {isAr ? `السجن (${p.jailTurns} محاولات متبقية)` : `Jail (${p.jailTurns} left)`}
                      </span>
                    </div>
                  )}

                  {p.status === 'BANKRUPT' && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                      <Skull size={11} />
                      <span>{t.eliminated}</span>
                    </div>
                  )}

                  {props.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                      {props.map((owned) => {
                        const sq = game.board[owned.squareId]!;
                        return (
                          <button
                            key={owned.squareId}
                            type="button"
                            onClick={() => {
                              setSelectedSquareId(owned.squareId);
                              setRightTab('deed');
                            }}
                            title={`${getTileName(sq.id, sq.name, lang)}${
                              owned.mortgaged ? ` (${t.mortgagedBadge})` : ''
                            }`}
                            className={`w-4 h-3 rounded-[2px] border border-black/15 transition-transform hover:scale-110 ${
                              owned.mortgaged ? 'opacity-35' : ''
                            }`}
                            style={{ backgroundColor: getSquareColor(sq) }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-4 space-y-2 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900 border-b border-slate-200 pb-2">
            <Landmark size={14} className="text-emerald-800" />
            <span>{t.bankSupply}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">{t.availHouses}</span>
            <span dir="ltr" className="font-mono font-semibold tabular-nums text-slate-900">
              {game.bankBuildings?.housesRemaining ?? 32} / 32
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">{t.availHotels}</span>
            <span dir="ltr" className="font-mono font-semibold tabular-nums text-slate-900">
              {game.bankBuildings?.hotelsRemaining ?? 12} / 12
            </span>
          </div>
        </div>
      </aside>

      {/* Center 11x11 Board */}
      <section className="flex flex-col items-center justify-center">
        <div
          dir="ltr"
          className="relative w-full max-w-[736px] aspect-square bg-[#C7DEC6] rounded-xl border-2 border-[#0E3F2E] shadow-2xl p-1.5 grid grid-cols-11 grid-rows-11 gap-0.5"
        >
          {game.board.map((sq) => {
            const { row, col, edge } = getGridPosition(sq.id);
            return (
              <div
                key={sq.id}
                style={{ gridRow: row, gridColumn: col }}
                className="w-full h-full border border-emerald-950/20 rounded-[2px] overflow-hidden"
              >
                {renderTileContent(sq, edge)}
              </div>
            );
          })}

          {/* Center 9x9 Tabletop Console */}
          <div
            dir={isAr ? 'rtl' : 'ltr'}
            style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}
            className="bg-[#DCEAD7]/92 rounded-lg border border-emerald-900/20 m-1 p-3.5 sm:p-5 flex flex-col justify-between overflow-hidden"
          >
            {/* Header Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {currentPlayer && (
                  <>
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: currentPlayer.color }}
                    />
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {currentPlayer.name}
                    </span>
                    <span className="text-xs text-slate-600">
                      · {formatTurnPhase(game.turnPhase, lang)}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2.5 text-xs text-slate-700">
                {secondsLeft !== null && (
                  <span
                    dir="ltr"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                      secondsLeft <= 15
                        ? 'bg-rose-100 text-rose-900 border border-rose-300'
                        : 'bg-white/80 text-slate-700 border border-slate-300'
                    }`}
                  >
                    <Clock size={11} />
                    {secondsLeft}s
                  </span>
                )}
                <span className="font-mono tabular-nums font-semibold">
                  {t.turn} {game.round}
                </span>
                {game.settings.freeParkingPot && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 font-mono text-[11px] font-semibold">
                    {t.freeParkingPot}: ${(game.freeParkingPot ?? 0).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* Action Error */}
            {actionError && (
              <div className="rounded-md bg-rose-50 border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-900">
                {actionError}
              </div>
            )}

            {/* Main Stage: Auction OR Normal Console */}
            {auction && game.turnPhase === 'AUCTION' ? (
              <div className="my-auto bg-[#FBF9F4] rounded-lg border border-amber-300 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                      {t.liveAuction}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {getTileName(
                        auction.squareId,
                        game.board[auction.squareId]?.name ?? '',
                        lang
                      )}
                    </h3>
                  </div>
                  <div className="text-end">
                    <div className="text-[11px] text-slate-500">{t.highestBid}</div>
                    <div dir="ltr" className="text-lg font-mono font-bold text-emerald-800">
                      ${auction.highestBid}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {isAr ? 'المتصدر' : 'Leader'}:{' '}
                    <strong>
                      {auction.highestBidderId
                        ? playerById.get(auction.highestBidderId)?.name
                        : t.openingBid}
                    </strong>
                  </span>
                  <span className="text-slate-500">
                    {isAr ? 'منسحبون:' : 'Passed:'} {auction.passedIds.length}/
                    {auction.eligibleIds.length}
                  </span>
                </div>

                {isAuctionComplete ? (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction('auction/close', {}, 'cash')}
                      className="px-4 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold disabled:opacity-40"
                    >
                      {isAr ? 'إغلاق وترسية المزاد' : 'Close & Award Auction'}
                    </button>
                  </div>
                ) : canIBidInAuction ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {[10, 25, 50, 100].map((inc) => {
                      const targetBid = auction.highestBid + inc;
                      const canAfford = (me?.cash ?? 0) >= targetBid;
                      return (
                        <button
                          key={inc}
                          type="button"
                          disabled={busy || !canAfford}
                          onClick={() => runAction('auction/bid', { amount: targetBid }, 'cash')}
                          className="px-3 py-1.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-mono font-semibold disabled:opacity-40"
                        >
                          {t.bidBtn} ${targetBid}
                        </button>
                      );
                    })}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        dir="ltr"
                        min={auction.highestBid + 1}
                        value={customBid}
                        onChange={(e) => setCustomBid(e.target.value)}
                        placeholder={t.customBidPlaceholder}
                        className="w-20 px-2 py-1.5 rounded border border-slate-300 text-xs font-mono bg-white"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const val = parseInt(customBid, 10);
                          if (!isNaN(val) && val > auction.highestBid) {
                            void runAction('auction/bid', { amount: val }, 'cash');
                            setCustomBid('');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded bg-slate-800 text-white text-xs font-semibold"
                      >
                        {t.bidBtn}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction('auction/pass')}
                      className="ms-auto px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      {t.passBtn}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 italic">
                    {isAr
                      ? 'بانتظار بقية المزايدين...'
                      : 'Waiting for other eligible bidders...'}
                  </p>
                )}
              </div>
            ) : (
              <div className="my-auto flex flex-col gap-2.5">
                {/* Decks & Dice */}
                <div className="grid grid-cols-3 gap-3 items-center">
                  <div className="bg-[#E3EEF7] border border-[#B9D3E8] rounded-lg p-2.5 text-center">
                    <div className="text-[11px] font-semibold text-sky-900">{t.destinyChest}</div>
                    <div className="text-[11px] text-sky-700 font-mono tabular-nums mt-0.5">
                      {game.cardDecks?.communityCount ?? 16} {t.cardsCount}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center py-0.5">
                    <div dir="ltr" className="flex items-center gap-2.5">
                      <DieFace
                        value={game.lastDice?.die1 ?? 1}
                        isDouble={Boolean(game.lastDice?.isDouble)}
                        rolling={busy}
                      />
                      <DieFace
                        value={game.lastDice?.die2 ?? 1}
                        isDouble={Boolean(game.lastDice?.isDouble)}
                        rolling={busy}
                      />
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-600 mt-1">
                      {t.totalRoll}: {game.lastDice?.total ?? 0}
                      {game.lastDice?.isDouble ? ` · ${t.doublesTag}` : ''}
                    </div>
                  </div>

                  <div className="bg-[#F9EEDB] border border-[#E7CCA0] rounded-lg p-2.5 text-center">
                    <div className="text-[11px] font-semibold text-amber-900">{t.chanceDeck}</div>
                    <div className="text-[11px] text-amber-700 font-mono tabular-nums mt-0.5">
                      {game.cardDecks?.chanceCount ?? 16} {t.cardsCount}
                    </div>
                  </div>
                </div>

                {/* Current Square Card */}
                {currentSquare && (
                  <div className="bg-white/90 rounded-lg border border-slate-200 px-3.5 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">
                        {t.currentPos} (#{currentSquare.id})
                      </div>
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {getTileName(currentSquare.id, currentSquare.name, lang)}
                      </div>
                    </div>
                    {currentSquare.price && (
                      <div className="text-end shrink-0">
                        <div className="text-[11px] text-slate-500">
                          {assetBySquare.get(currentSquare.id)
                            ? `${t.ownerLabel}: ${
                                playerById.get(assetBySquare.get(currentSquare.id)!.ownerId)?.name
                              }`
                            : t.availableDeed}
                        </div>
                        <div dir="ltr" className="text-sm font-mono font-bold text-slate-900">
                          ${currentSquare.price}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Console */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                  {!isMyTurn ? (
                    <div className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold">
                      {currentPlayer?.name} {t.takingTurn}
                    </div>
                  ) : (
                    <>
                      {game.turnPhase === 'ROLL' && (me?.jailTurns ?? 0) === 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction('roll', {}, 'roll')}
                          className="px-5 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-sm font-semibold shadow-sm disabled:opacity-40"
                        >
                          {isAr ? 'رمي النرد' : 'Roll Dice'}
                        </button>
                      )}

                      {game.turnPhase === 'ROLL' && (me?.jailTurns ?? 0) > 0 && (
                        <>
                          {(me?.getOutOfJailCards ?? 0) > 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction('use-jail-card', {}, 'cash')}
                              className="px-3.5 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5"
                            >
                              <KeyRound size={13} />
                              {t.useJailFreeCard}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runAction('roll', {}, 'roll')}
                            className="px-4 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold"
                          >
                            {t.rollDoubles} ({me?.jailTurns})
                          </button>
                          <button
                            type="button"
                            disabled={busy || (me?.cash ?? 0) < 50}
                            onClick={() => runAction('pay-jail', {}, 'cash')}
                            className="px-4 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold disabled:opacity-40"
                          >
                            {t.payBail} $50
                          </button>
                        </>
                      )}

                      {pendingDecision?.kind === 'PURCHASE' &&
                        pendingDecision.playerId === myPlayerId && (
                          <>
                            <button
                              type="button"
                              disabled={busy || (me?.cash ?? 0) < (pendingDecision.amount ?? 0)}
                              onClick={() => runAction('buy', {}, 'cash')}
                              className="px-4 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold disabled:opacity-40"
                            >
                              {t.buyBtn} (${pendingDecision.amount})
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction('decline-purchase', {}, 'warn')}
                              className="px-4 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
                            >
                              {t.declineAuction}
                            </button>
                          </>
                        )}

                      {pendingDecision?.kind === 'CARD' &&
                        pendingDecision.playerId === myPlayerId && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction('draw-card', { deck: pendingDecision.deck }, 'cash')
                            }
                            className="px-5 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold shadow-sm"
                          >
                            {pendingDecision.deck === 'CHANCE'
                              ? isAr
                                ? 'سحب بطاقة فرصة'
                                : 'Draw Chance Card'
                              : isAr
                              ? 'سحب بطاقة صندوق الحظ'
                              : 'Draw Community Chest Card'}
                          </button>
                        )}

                      {(pendingDecision?.kind === 'RENT' || pendingDecision?.kind === 'TAX') &&
                        pendingDecision.playerId === myPlayerId && (
                          <div className="w-full bg-rose-50 border border-rose-300 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs text-rose-900">
                              <AlertTriangle size={16} className="text-rose-700 shrink-0" />
                              <span>
                                {t.debtDue}{' '}
                                <strong className="font-mono" dir="ltr">
                                  ${pendingDecision.amount ?? 0}
                                </strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-2 ms-auto">
                              {pendingDecision.kind === 'TAX' &&
                                pendingDecision.squareId === undefined &&
                                (me?.getOutOfJailCards ?? 0) > 0 && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => runAction('use-jail-card', {}, 'cash')}
                                    className="px-3 py-2 rounded-md bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold"
                                  >
                                    {t.useJailFreeCard}
                                  </button>
                                )}
                              <button
                                type="button"
                                disabled={busy || (me?.cash ?? 0) < (pendingDecision.amount ?? 0)}
                                onClick={() =>
                                  runAction(
                                    pendingDecision.kind === 'RENT' ? 'pay-rent' : 'pay-tax',
                                    {},
                                    'cash'
                                  )
                                }
                                className="px-3.5 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold disabled:opacity-40"
                              >
                                {t.payBtn} ${pendingDecision.amount ?? 0}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => runAction('declare-bankruptcy', {}, 'warn')}
                                className="px-3.5 py-2 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold"
                              >
                                {t.declareBankruptcy}
                              </button>
                            </div>
                          </div>
                        )}

                      {game.turnPhase === 'ACTION' && !pendingDecision && (
                        <>
                          {otherActivePlayers.length > 0 && !game.pendingTrade && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setTradeToId(otherActivePlayers[0]?.id ?? '');
                                setCashFrom(0);
                                setCashTo(0);
                                setAssetsFrom([]);
                                setAssetsTo([]);
                                setShowTradeModal(true);
                              }}
                              className="px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
                            >
                              <ArrowLeftRight size={14} />
                              {t.tradeBtn}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy || Boolean(game.pendingTrade)}
                            onClick={() => runAction('end-turn')}
                            className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm disabled:opacity-40"
                          >
                            {game.doublesCount > 0 && (me?.jailTurns ?? 0) === 0
                              ? isAr
                                ? 'رمية إضافية (دبل)'
                                : 'Bonus Roll (Doubles)'
                              : isAr
                              ? 'إنهاء الدور'
                              : 'End Turn'}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Recent Events */}
            <div className="border-t border-slate-300/70 pt-2">
              <div className="text-[11px] font-semibold text-slate-600 mb-1">{t.recentActivity}</div>
              <div className="space-y-1 max-h-16 overflow-y-auto custom-scrollbar pe-1">
                {[...game.log]
                  .reverse()
                  .slice(0, 3)
                  .map((entry, idx) => (
                    <div key={idx} className="text-[11px] text-slate-700 flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">
                        [{entry.type}]
                      </span>
                      <span className="truncate">{translateGameText(entry.message, lang)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Rail: Deed | Portfolio | Ledger | Chat */}
      <aside className="bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-4 shadow-sm flex flex-col max-h-[736px]">
        <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setRightTab('deed')}
            className={`flex-1 py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
              rightTab === 'deed' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.tabDeed}
          </button>
          <button
            type="button"
            onClick={() => setRightTab('portfolio')}
            className={`flex-1 py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
              rightTab === 'portfolio' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.tabPortfolio} ({myAssets.length})
          </button>
          <button
            type="button"
            onClick={() => setRightTab('ledger')}
            className={`flex-1 py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
              rightTab === 'ledger' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.tabLedger} ({game.log.length})
          </button>
          <button
            type="button"
            onClick={() => setRightTab('chat')}
            className={`flex-1 py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1 ${
              rightTab === 'chat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <MessageSquare size={11} />
            {isAr ? 'دردشة' : 'Chat'}
            {chatMessages.length > 0 ? ` (${chatMessages.length})` : ''}
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar pe-0.5 flex-1">
          {rightTab === 'deed' ? (
            renderDeedInspector()
          ) : rightTab === 'portfolio' ? (
            <div className="space-y-2">
              {isResolvingOwnDebt && (
                <div className="rounded-lg bg-amber-50 border border-amber-300 p-2.5 text-[11px] text-amber-950 font-medium">
                  {isAr
                    ? 'يمكنك بيع المباني أو رهن العقارات هنا لتوفير السيولة وسداد الدين.'
                    : 'Sell buildings or mortgage properties below to raise cash for your debt.'}
                </div>
              )}
              {myAssets.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6">
                  {isSpectator
                    ? isAr
                      ? 'وضع المشاهدة: اضغط على أي عقار في اللوحة لعرض صكه.'
                      : 'Spectator mode: click any board square to inspect its deed.'
                    : isAr
                    ? 'لا تملك عقارات بعد.'
                    : 'No properties owned yet.'}
                </div>
              ) : (
                myAssets.map((a) => {
                  const sq = game.board[a.squareId]!;
                  const groupSquares = sq.group
                    ? game.board.filter((x) => x.group === sq.group)
                    : [];
                  const ownsGroup =
                    groupSquares.length > 0 &&
                    groupSquares.every((x) => assetBySquare.get(x.id)?.ownerId === myPlayerId);
                  const canLiquidate =
                    !isSpectator &&
                    isMyTurn &&
                    !game.pendingAuction &&
                    !game.pendingTrade &&
                    (isResolvingOwnDebt || (game.turnPhase === 'ACTION' && !game.pendingDecision));
                  const canBuildOrRedeem =
                    canLiquidate && game.turnPhase === 'ACTION' && !game.pendingDecision;

                  return (
                    <div
                      key={a.squareId}
                      className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSquareId(a.squareId);
                          setRightTab('deed');
                        }}
                        className="w-full text-start flex items-center justify-between hover:opacity-80"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-6 rounded-xs shrink-0"
                            style={{ backgroundColor: getSquareColor(sq) }}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {getTileName(sq.id, sq.name, lang)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {a.mortgaged
                                ? t.mortgagedBadge
                                : a.hotels
                                ? `1 ${t.hotelLabel}`
                                : a.houses > 0
                                ? `${a.houses} ${isAr ? 'منازل' : 'Houses'}`
                                : isAr
                                ? 'غير مطوّر'
                                : 'Undeveloped'}
                            </div>
                          </div>
                        </div>
                        <Building2 size={14} className="text-slate-400 shrink-0" />
                      </button>

                      {canLiquidate && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                          {canBuildOrRedeem &&
                            sq.type === 'PROPERTY' &&
                            ownsGroup &&
                            !a.mortgaged &&
                            a.hotels === 0 && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => runAction('build', { squareId: a.squareId }, 'build')}
                                className="px-2 py-1 rounded bg-[#0F5132] text-white text-[10px] font-semibold disabled:opacity-40"
                              >
                                {a.houses === 4 ? t.addHotel : t.addHouse}
                              </button>
                            )}
                          {(a.houses > 0 || a.hotels > 0) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction('sell-building', { squareId: a.squareId }, 'cash')
                              }
                              className="px-2 py-1 rounded border border-slate-300 text-slate-800 text-[10px] font-semibold"
                            >
                              {isAr ? 'بيع مبنى' : 'Sell Bldg'}
                            </button>
                          )}
                          {!a.mortgaged && a.houses === 0 && a.hotels === 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction('mortgage', { squareId: a.squareId }, 'cash')}
                              className="px-2 py-1 rounded bg-amber-700 text-white text-[10px] font-semibold"
                            >
                              {isAr
                                ? `رهن +$${Math.floor((sq.price ?? 0) / 2)}`
                                : `Mortgage +$${Math.floor((sq.price ?? 0) / 2)}`}
                            </button>
                          )}
                          {canBuildOrUnmortgage(a.mortgaged, canBuildOrRedeem) && (
                            <button
                              type="button"
                              disabled={busy || (me?.cash ?? 0) < Math.ceil((sq.price ?? 0) * 0.55)}
                              onClick={() =>
                                runAction('unmortgage', { squareId: a.squareId }, 'cash')
                              }
                              className="px-2 py-1 rounded bg-emerald-800 text-white text-[10px] font-semibold disabled:opacity-40"
                            >
                              {isAr
                                ? `فك -$${Math.ceil((sq.price ?? 0) * 0.55)}`
                                : `Redeem -$${Math.ceil((sq.price ?? 0) * 0.55)}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : rightTab === 'ledger' ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md text-[11px]">
                <button
                  type="button"
                  onClick={() => setLedgerMode('events')}
                  className={`flex-1 py-1 rounded font-semibold ${
                    ledgerMode === 'events' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  {isAr ? 'الأحداث' : 'Events'}
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerMode('transactions')}
                  className={`flex-1 py-1 rounded font-semibold ${
                    ledgerMode === 'transactions'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  {isAr ? 'الدفتر المالي' : 'Transactions'}
                </button>
              </div>

              {ledgerMode === 'events' ? (
                <div className="space-y-2">
                  {[...game.log].reverse().map((entry, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-md border border-slate-200 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold text-emerald-900">{entry.type}</span>
                        <span dir="ltr" className="font-mono text-[10px]">
                          {new Date(entry.at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-slate-800 leading-snug">
                        {translateGameText(entry.message, lang)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : loadingTx ? (
                <div className="text-xs text-slate-500 text-center py-6">
                  {isAr ? 'جاري تحميل المعاملات...' : 'Loading transactions...'}
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6">
                  {isAr ? 'لا توجد معاملات مالية مسجلة بعد.' : 'No financial transactions recorded yet.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="bg-white rounded-md border border-slate-200 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-800">{tx.type}</span>
                        <span
                          dir="ltr"
                          className={`font-mono font-bold ${
                            tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {tx.amount >= 0 ? `+$${tx.amount}` : `-$${Math.abs(tx.amount)}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {translateGameText(tx.details?.message ?? '', lang)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-[420px] justify-between gap-2">
              <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pe-1">
                {chatMessages.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-8">
                    {isAr ? 'لا توجد رسائل بعد. ابدأ المحادثة مع اللاعبين!' : 'No chat messages yet.'}
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold" style={{ color: msg.senderColor }}>
                          {msg.senderName}
                        </span>
                        <span dir="ltr" className="text-[10px] font-mono text-slate-400">
                          {new Date(msg.at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-slate-800 break-words">{msg.text}</p>
                    </div>
                  ))
                )}
              </div>

              {!isSpectator && myPlayerToken ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const text = chatInput.trim();
                    if (!text) return;
                    const ok = await onSendChat(text);
                    if (ok) setChatInput('');
                  }}
                  className="flex items-center gap-1.5 pt-2 border-t border-slate-200"
                >
                  <input
                    type="text"
                    maxLength={240}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={isAr ? 'اكتب رسالة...' : 'Write a message...'}
                    className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                  <button
                    type="submit"
                    className="p-2 rounded-md bg-[#0F5132] hover:bg-[#0B3F27] text-white"
                    aria-label={isAr ? 'إرسال' : 'Send'}
                  >
                    <Send size={13} />
                  </button>
                </form>
              ) : (
                <div className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-200">
                  {isAr ? 'الدردشة متاحة للاعبين المشاركين فقط.' : 'Chat is available to seated players only.'}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Online Trade Proposal Modal */}
      {showTradeModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-slate-300 max-w-xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {isAr ? 'اقتراح صفقة تبادل' : 'Propose Online Trade'}
              </h3>
              <button
                type="button"
                onClick={() => setShowTradeModal(false)}
                className="p-1 rounded hover:bg-slate-200 text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'الطرف المقابل' : 'Trade Partner'}
                </label>
                <select
                  value={tradeToId}
                  onChange={(e) => {
                    setTradeToId(e.target.value);
                    setAssetsTo([]);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300"
                >
                  {otherActivePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${p.cash})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="font-bold text-slate-800">{isAr ? 'ما تقدمه أنت' : 'You Offer'}</div>
                  <input
                    type="number"
                    dir="ltr"
                    min={0}
                    max={me?.cash ?? 0}
                    value={cashFrom}
                    onChange={(e) => setCashFrom(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Cash ($)"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {myAssets
                      .filter((a) => !a.mortgaged && a.houses === 0 && a.hotels === 0)
                      .map((a) => {
                        const sq = game.board[a.squareId]!;
                        const checked = assetsFrom.includes(a.squareId);
                        return (
                          <label key={a.squareId} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAssetsFrom((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== a.squareId)
                                    : [...prev, a.squareId]
                                )
                              }
                            />
                            <span className="truncate">{getTileName(sq.id, sq.name, lang)}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="font-bold text-slate-800">{isAr ? 'ما تطلبه' : 'You Request'}</div>
                  <input
                    type="number"
                    dir="ltr"
                    min={0}
                    value={cashTo}
                    onChange={(e) => setCashTo(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Cash ($)"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {game.assets
                      .filter(
                        (a) =>
                          a.ownerId === tradeToId &&
                          !a.mortgaged &&
                          a.houses === 0 &&
                          a.hotels === 0
                      )
                      .map((a) => {
                        const sq = game.board[a.squareId]!;
                        const checked = assetsTo.includes(a.squareId);
                        return (
                          <label key={a.squareId} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAssetsTo((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== a.squareId)
                                    : [...prev, a.squareId]
                                )
                              }
                            />
                            <span className="truncate">{getTileName(sq.id, sq.name, lang)}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTradeModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                disabled={busy || !tradeToId}
                onClick={async () => {
                  await runAction('trade/propose', {
                    toId: tradeToId,
                    cashFrom,
                    cashTo,
                    assetsFrom,
                    assetsTo,
                  });
                  setShowTradeModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold disabled:opacity-40"
              >
                {isAr ? 'إرسال العرض' : 'Send Trade Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Trade Confirmation Modal */}
      {game.pendingTrade && game.pendingTrade.toId === myPlayerId && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-amber-300 max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {isAr ? 'عرض تبادل وارد' : 'Incoming Trade Offer'}
            </h3>
            <p className="text-xs text-slate-600">
              {isAr ? 'من:' : 'From:'}{' '}
              <strong>{playerById.get(game.pendingTrade.fromId)?.name}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1">
                <div className="font-bold text-emerald-800">{isAr ? 'ستحصل على' : 'You Receive'}</div>
                <div dir="ltr" className="font-mono font-semibold">
                  ${game.pendingTrade.cashFrom}
                </div>
                {game.pendingTrade.assetsFrom.map((id) => (
                  <div key={id}>{getTileName(id, game.board[id]?.name ?? '', lang)}</div>
                ))}
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1">
                <div className="font-bold text-rose-800">{isAr ? 'ستدفع' : 'You Give'}</div>
                <div dir="ltr" className="font-mono font-semibold">
                  ${game.pendingTrade.cashTo}
                </div>
                {game.pendingTrade.assetsTo.map((id) => (
                  <div key={id}>{getTileName(id, game.board[id]?.name ?? '', lang)}</div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction('trade/respond', { accept: false })}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {isAr ? 'رفض' : 'Decline'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction('trade/respond', { accept: true }, 'cash')}
                className="px-4 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold"
              >
                {isAr ? 'قبول الصفقة' : 'Accept Trade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creditor Mortgage Transfer Decision Modal */}
      {myPendingMortgageDecision && !isSpectator && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-amber-300 max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {isAr ? 'عقار مرهون منقول إليك' : 'Transferred Mortgaged Property'}
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              {isAr
                ? `انتقل إليك العقار المرهون "${getTileName(
                    myPendingMortgageDecision.squareId,
                    game.board[myPendingMortgageDecision.squareId]?.name ?? '',
                    lang
                  )}" وتم خصم رسوم النقل (10%: $${myPendingMortgageDecision.fee}). هل ترغب في سداد أصل الرهن الآن ($${myPendingMortgageDecision.principal}) أم الإبقاء عليه مرهوناً؟`
                : `You inherited mortgaged property "${getTileName(
                    myPendingMortgageDecision.squareId,
                    game.board[myPendingMortgageDecision.squareId]?.name ?? '',
                    lang
                  )}" after a $${myPendingMortgageDecision.fee} transfer fee. Unmortgage now for $${myPendingMortgageDecision.principal}, or keep it mortgaged?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction('resolve-mortgage', {
                    squareId: myPendingMortgageDecision.squareId,
                    unmortgageNow: false,
                  })
                }
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {isAr ? 'إبقاءه مرهوناً' : 'Keep Mortgaged'}
              </button>
              <button
                type="button"
                disabled={busy || (me?.cash ?? 0) < myPendingMortgageDecision.principal}
                onClick={() =>
                  runAction(
                    'resolve-mortgage',
                    {
                      squareId: myPendingMortgageDecision.squareId,
                      unmortgageNow: true,
                    },
                    'cash'
                  )
                }
                className="px-4 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold disabled:opacity-40"
              >
                {isAr
                  ? `فك الرهن الآن ($${myPendingMortgageDecision.principal})`
                  : `Unmortgage Now ($${myPendingMortgageDecision.principal})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Resign / Leave Match Modal */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-rose-300 max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {isAr ? 'تأكيد الانسحاب من المباراة' : 'Confirm Resignation'}
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              {isAr
                ? 'سيؤدي مغادرة المباراة الجارية إلى تصفية أصولك وإعلان انسحابك لبقية اللاعبين.'
                : 'Leaving an active match forfeits your assets back to the bank and marks you as resigned.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (myPlayerToken) {
                    setBusy(true);
                    try {
                      await manopolyApi.leaveGame(game.id, myPlayerToken);
                    } catch {
                      // Leave even if already finished
                    } finally {
                      setBusy(false);
                    }
                  }
                  setShowLeaveConfirm(false);
                  onExitGame();
                }}
                className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold"
              >
                {isAr ? 'تأكيد الانسحاب' : 'Resign & Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finished Victory Modal */}
      {game.status === 'FINISHED' && game.winnerId && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-amber-300 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                <Trophy size={24} />
              </div>
              <div>
                <p className="text-xs font-medium text-amber-800">
                  {t.matchComplete} · <span dir="ltr">{game.code}</span>
                </p>
                <h2 className="text-2xl font-bold text-slate-900">
                  {playerById.get(game.winnerId)?.name} {t.winsLabel}
                </h2>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onExitGame}
                className="px-5 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold"
              >
                {t.returnLobby}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

function canBuildOrUnmortgage(mortgaged: boolean, canBuildOrRedeem: boolean): boolean {
  return mortgaged && canBuildOrRedeem;
}
