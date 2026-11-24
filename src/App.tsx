import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { BoardView } from './components/BoardView';
import { ClassBlueprintModal } from './components/ClassBlueprintModal';
import { DeedInspector } from './components/DeedInspector';
import { PortfolioManager } from './components/PortfolioManager';
import { TitleLobby } from './components/TitleLobby';
const OnlineLobbyPanel = React.lazy(() =>
  import('./components/OnlineLobbyPanel').then((module) => ({ default: module.OnlineLobbyPanel }))
);
const OnlineGameView = React.lazy(() =>
  import('./components/OnlineGameView').then((module) => ({ default: module.OnlineGameView }))
);
import { TokenIcon } from './components/TokenAndDice';
import { IncomingTradeModal, TradeModal } from './components/TradeModal';
import {
  connectGameSocket,
  manopolyApi,
  type AuthUser,
  type ChatMessage,
  type GameSocketHandle,
  type OnlineGameState,
  type PresenceInfo,
} from './api/manopolyClient';
import { Land } from './engine/board';
import { GameAndRoomInfo, MonopolyGame } from './engine/MonopolyGame';
import { Player } from './engine/player';
import { PendingTradeOffer, PlayerSetupConfig, TurnPhase } from './engine/types';
import { getTileName, Language, translateGameText, UI_TEXT } from './i18n/translations';
import { soundFX } from './utils/sound';
import {
  Volume2,
  VolumeX,
  Trophy,
  RotateCcw,
  Lock,
  Skull,
  Landmark,
  X,
  KeyRound,
  Globe,
  Wifi,
  Users,
} from 'lucide-react';

type AppViewState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER' | 'ONLINE_PLAYING';

const DEFAULT_PLAYERS_EN: PlayerSetupConfig[] = [
  { playerNumber: 1, name: 'Victoria', tokenName: 'Top Hat', isBot: false, enabled: true },
  { playerNumber: 2, name: 'Reginald (Bot)', tokenName: 'Battleship', isBot: true, enabled: true },
  { playerNumber: 3, name: 'Clara (Bot)', tokenName: 'Race Car', isBot: true, enabled: true },
  { playerNumber: 4, name: 'Arthur (Bot)', tokenName: 'Scottie Dog', isBot: true, enabled: true },
];

const DEFAULT_PLAYERS_AR: PlayerSetupConfig[] = [
  { playerNumber: 1, name: 'فيكتوريا', tokenName: 'Top Hat', isBot: false, enabled: true },
  { playerNumber: 2, name: 'طارق (روبوت)', tokenName: 'Battleship', isBot: true, enabled: true },
  { playerNumber: 3, name: 'كلارا (روبوت)', tokenName: 'Race Car', isBot: true, enabled: true },
  { playerNumber: 4, name: 'آرثر (روبوت)', tokenName: 'Scottie Dog', isBot: true, enabled: true },
];

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [viewState, setViewState] = useState<AppViewState>('TITLE_MENU');
  const [roomConfig, setRoomConfig] = useState({
    roomName: 'قاعة الماس',
    roomNumber: 'RM-402',
    gameNumber: 'G-01',
    maxPlayers: 4,
    isPrivate: false,
    freeParkingPotEnabled: true,
  });
  const [playerConfigs, setPlayerConfigs] = useState<PlayerSetupConfig[]>(DEFAULT_PLAYERS_AR);

  const gameRef = useRef<MonopolyGame | null>(null);
  const hopTimerRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const [selectedLandIndex, setSelectedLandIndex] = useState<number>(1);
  const [rightTab, setRightTab] = useState<'deed' | 'portfolio' | 'ledger'>('deed');
  const [isRolling, setIsRolling] = useState(false);
  const [animatedTokenPos, setAnimatedTokenPos] = useState<{
    playerId: string;
    position: number;
  } | null>(null);
  const [muted, setMuted] = useState(false);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const [playMode, setPlayMode] = useState<'local' | 'online'>('local');
  const { data: authSession, mutate: mutateAuthSession } = useSWR<{
    user: AuthUser;
    accessToken: string;
  } | null>('manopoly-auth-session', () => manopolyApi.refreshSession(), {
    shouldRetryOnError: false,
  });
  const authUser = authSession?.user ?? null;
  const accessToken = authSession?.accessToken ?? null;
  const [onlineGame, setOnlineGame] = useState<OnlineGameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myPlayerToken, setMyPlayerToken] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceInfo>({
    onlinePlayerIds: [],
    spectatorCount: 0,
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const socketHandleRef = useRef<GameSocketHandle | null>(null);

  const t = UI_TEXT[lang];

  useEffect(() => {
    if (!onlineGame?.id || (!myPlayerToken && !isSpectator)) {
      setSocketConnected(false);
      socketHandleRef.current = null;
      return;
    }
    const handle = connectGameSocket(
      onlineGame.id,
      isSpectator ? null : myPlayerToken,
      (nextState) => {
        setOnlineGame(nextState);
        if (nextState.status === 'ACTIVE' || nextState.status === 'FINISHED') {
          setViewState('ONLINE_PLAYING');
        }
      },
      (connected) => {
        setSocketConnected(connected);
      },
      (nextPresence) => {
        setPresence(nextPresence);
      },
      (msg) => {
        setChatMessages((prev) => [...prev.slice(-99), msg]);
      }
    );
    socketHandleRef.current = handle;
    return () => {
      handle.disconnect();
      socketHandleRef.current = null;
    };
  }, [onlineGame?.id, myPlayerToken, isSpectator]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t.brand;
  }, [lang, t.brand]);

  const toggleLanguage = () => {
    const nextLang: Language = lang === 'ar' ? 'en' : 'ar';
    setLang(nextLang);
    // Sync unmodified default lobby strings cleanly
    if (nextLang === 'en') {
      if (roomConfig.roomName === 'قاعة الماس') {
        setRoomConfig((prev) => ({ ...prev, roomName: 'Mayfair Parlor' }));
      }
      setPlayerConfigs((prev) =>
        prev.map((p, idx) =>
          p.name === DEFAULT_PLAYERS_AR[idx]?.name
            ? { ...p, name: DEFAULT_PLAYERS_EN[idx].name }
            : p
        )
      );
    } else {
      if (roomConfig.roomName === 'Mayfair Parlor') {
        setRoomConfig((prev) => ({ ...prev, roomName: 'قاعة الماس' }));
      }
      setPlayerConfigs((prev) =>
        prev.map((p, idx) =>
          p.name === DEFAULT_PLAYERS_EN[idx]?.name
            ? { ...p, name: DEFAULT_PLAYERS_AR[idx].name }
            : p
        )
      );
    }
  };

  const forceRender = useCallback(() => setTick((tick) => tick + 1), []);

  const clearHopTimer = () => {
    if (hopTimerRef.current !== null) {
      window.clearInterval(hopTimerRef.current);
      hopTimerRef.current = null;
    }
  };

  const animateTokenHop = useCallback(
    (playerId: string, fromPos: number, steps: number, finalPos: number) => {
      clearHopTimer();
      if (steps <= 0 || steps > 12) {
        setAnimatedTokenPos(null);
        setSelectedLandIndex(finalPos);
        forceRender();
        return;
      }

      let currentStep = 1;
      setAnimatedTokenPos({ playerId, position: (fromPos + 1) % 40 });

      hopTimerRef.current = window.setInterval(() => {
        currentStep += 1;
        if (currentStep >= steps) {
          clearHopTimer();
          setAnimatedTokenPos(null);
          setSelectedLandIndex(finalPos);
          forceRender();
        } else {
          setAnimatedTokenPos({ playerId, position: (fromPos + currentStep) % 40 });
        }
      }, 65);
    },
    [forceRender]
  );

  useEffect(() => () => clearHopTimer(), []);

  const startNewGame = (overrideGameNumber?: string) => {
    clearHopTimer();
    setAnimatedTokenPos(null);
    const nextGameNumber = overrideGameNumber ?? roomConfig.gameNumber;
    const roomInfo = new GameAndRoomInfo(
      roomConfig.roomName,
      roomConfig.roomNumber,
      nextGameNumber,
      roomConfig.maxPlayers,
      roomConfig.isPrivate,
      roomConfig.freeParkingPotEnabled
    );
    const instance = new MonopolyGame(roomInfo, playerConfigs);
    gameRef.current = instance;
    setSelectedLandIndex(0);
    setShowTradeModal(false);
    setViewState('PLAYING');
    forceRender();
  };

  const startRematchInRoom = () => {
    const numMatch = roomConfig.gameNumber.match(/\d+/);
    const nextNum = numMatch ? parseInt(numMatch[0], 10) + 1 : 2;
    const nextGameStr = `G-${String(nextNum).padStart(2, '0')}`;
    setRoomConfig((prev) => ({ ...prev, gameNumber: nextGameStr }));
    startNewGame(nextGameStr);
  };

  const game = gameRef.current;

  // Automated AI Bot Turn & Auction Loop
  useEffect(() => {
    if (viewState !== 'PLAYING' || !game || animatedTokenPos !== null || game.pendingTrade) return;

    if (game.checkGameOver()) {
      soundFX.victoryFanfare();
      setViewState('GAME_OVER');
      return;
    }

    const activeAuctionBidder = game.auctionAction.getCurrentBidder();
    const isBotAuctionTurn = game.auctionAction.isOpen && activeAuctionBidder?.isBot;
    const isBotMainTurn = !game.auctionAction.isOpen && game.whoseTurn.currentPlayer.isBot;

    if (!isBotAuctionTurn && !isBotMainTurn) return;

    const timer = window.setTimeout(() => {
      const currentGame = gameRef.current;
      if (!currentGame) return;

      const prevPhase = currentGame.whoseTurn.phase;
      const prevPlayer = currentGame.whoseTurn.currentPlayer;
      const prevPos = prevPlayer.position;

      currentGame.playStep();

      if (prevPhase === TurnPhase.ROLL_DICE && !currentGame.auctionAction.isOpen) {
        soundFX.diceRoll();
        if (!prevPlayer.inJail && currentGame.lastRollMovedBy > 0 && prevPlayer.position !== prevPos) {
          animateTokenHop(prevPlayer.id, prevPos, currentGame.lastRollMovedBy, prevPlayer.position);
        } else {
          setSelectedLandIndex(currentGame.whoseTurn.currentPlayer.position);
        }
      }
      if (currentGame.checkGameOver()) {
        soundFX.victoryFanfare();
        setViewState('GAME_OVER');
      }
      forceRender();
    }, 620);

    return () => window.clearTimeout(timer);
  });

  // Human Action Handlers
  const handleRollDice = useCallback(() => {
    const currentGame = gameRef.current;
    if (!currentGame || animatedTokenPos !== null) return;
    setIsRolling(true);
    soundFX.diceRoll();
    window.setTimeout(() => setIsRolling(false), 180);

    const player = currentGame.whoseTurn.currentPlayer;
    const result = currentGame.rollDiceAndMove();
    if (currentGame.lastDrawnCard) {
      soundFX.cardFlip();
    }

    if (result.moved && !result.sentToJail) {
      animateTokenHop(player.id, result.fromPos, currentGame.lastRollMovedBy, result.toPos);
    } else {
      setSelectedLandIndex(currentGame.whoseTurn.currentPlayer.position);
    }

    if (currentGame.checkGameOver()) {
      soundFX.victoryFanfare();
      setViewState('GAME_OVER');
    }
    forceRender();
  }, [animateTokenHop, animatedTokenPos, forceRender]);

  const handleEndTurn = useCallback(() => {
    const currentGame = gameRef.current;
    if (!currentGame || animatedTokenPos !== null) return;
    currentGame.endTurn();
    setSelectedLandIndex(currentGame.whoseTurn.currentPlayer.position);
    forceRender();
  }, [animatedTokenPos, forceRender]);

  // Spacebar shortcut for Roll Dice / End Turn
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (showBlueprint || showRules || showTradeModal || viewState !== 'PLAYING') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;

      const currentGame = gameRef.current;
      if (!currentGame || currentGame.auctionAction.isOpen || currentGame.pendingTrade) return;
      const player = currentGame.whoseTurn.currentPlayer;
      if (player.isBot) return;

      if (currentGame.whoseTurn.phase === TurnPhase.ROLL_DICE && !player.inJail) {
        e.preventDefault();
        handleRollDice();
      } else if (currentGame.whoseTurn.phase === TurnPhase.MANAGE_ASSETS) {
        e.preventDefault();
        handleEndTurn();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEndTurn, handleRollDice, showBlueprint, showRules, showTradeModal, viewState]);

  const handleBuyLand = () => {
    if (!game) return;
    if (game.buyCurrentLand()) {
      soundFX.cashChime();
    }
    forceRender();
  };

  const handleStartAuction = () => {
    if (!game) return;
    game.declineAndStartAuction();
    soundFX.alertWarning();
    forceRender();
  };

  const handlePlaceBid = (player: Player, amount: number) => {
    if (!game) return;
    if (game.placeAuctionBid(player, amount)) {
      soundFX.cashChime();
    }
    forceRender();
  };

  const handlePassAuction = (player: Player) => {
    if (!game) return;
    game.passAuctionTurn(player);
    forceRender();
  };

  const handleUseJailFreeCard = () => {
    if (!game) return;
    if (game.useJailFreeCard()) {
      soundFX.cardFlip();
    }
    forceRender();
  };

  const handlePayJailFine = () => {
    if (!game) return;
    if (game.payJailFine()) {
      soundFX.cashChime();
    }
    forceRender();
  };

  const handleAttemptJailEscape = () => {
    if (!game || animatedTokenPos !== null) return;
    soundFX.diceRoll();
    const player = game.whoseTurn.currentPlayer;
    const prevPos = player.position;
    const escaped = game.attemptJailEscapeRoll();
    if (escaped && player.position !== prevPos) {
      animateTokenHop(player.id, prevPos, game.dice.total, player.position);
    } else {
      setSelectedLandIndex(game.whoseTurn.currentPlayer.position);
    }
    if (game.checkGameOver()) {
      soundFX.victoryFanfare();
      setViewState('GAME_OVER');
    }
    forceRender();
  };

  const handlePayDebt = () => {
    if (!game) return;
    if (game.payPendingDebt()) {
      soundFX.cashChime();
    }
    forceRender();
  };

  const handleDeclareBankruptcy = () => {
    if (!game) return;
    soundFX.alertWarning();
    game.declareBankruptcy();
    if (game.checkGameOver()) {
      soundFX.victoryFanfare();
      setViewState('GAME_OVER');
    }
    forceRender();
  };

  const handleBuildHouse = (land: Land) => {
    if (!game) return;
    if (game.buildHouseOnLand(land)) soundFX.buildThud();
    forceRender();
  };

  const handleBuildHotel = (land: Land) => {
    if (!game) return;
    if (game.buildHotelOnLand(land)) soundFX.buildThud();
    forceRender();
  };

  const handleDemolishHouse = (land: Land) => {
    if (!game) return;
    if (game.demolishHouseOnLand(land)) soundFX.cashChime();
    forceRender();
  };

  const handleDemolishHotel = (land: Land) => {
    if (!game) return;
    if (game.demolishHotelOnLand(land)) soundFX.cashChime();
    forceRender();
  };

  const handleMortgage = (land: Land) => {
    if (!game) return;
    if (game.mortgageProperty(land)) soundFX.cashChime();
    forceRender();
  };

  const handleRedeem = (land: Land) => {
    if (!game) return;
    if (game.redeemProperty(land)) soundFX.cashChime();
    forceRender();
  };

  const handleSellToPlayer = (seller: Player, buyer: Player, land: Land, price: number) => {
    if (!game) return;
    if (game.sellPropertyToPlayer(seller, buyer, land, price)) soundFX.cashChime();
    forceRender();
  };

  const handleProposeTrade = (offer: PendingTradeOffer) => {
    if (!game) return { status: 'declined' as const, reason: 'Invalid players selected.' };
    const result = game.proposeTrade(offer);
    if (result.status === 'accepted') {
      soundFX.cashChime();
    }
    forceRender();
    return result;
  };

  const toggleMute = () => {
    const next = !muted;
    soundFX.muted = next;
    setMuted(next);
  };

  return (
    <div className="min-h-screen table-felt-surface text-slate-900 flex flex-col">
      {/* Three-Zone Top Bar Contract */}
      <header className="bg-[#09281F]/95 border-b border-emerald-900/80 px-6 py-3.5 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => setViewState('TITLE_MENU')}
          className="text-lg font-bold tracking-tight text-[#F7F3E9] hover:text-amber-200 transition-colors whitespace-nowrap shrink-0"
          style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
        >
          {t.brand}
        </button>

        <nav className="flex items-center gap-4 md:gap-6 text-sm font-medium text-emerald-100/85">
          <button
            type="button"
            onClick={() => setViewState('TITLE_MENU')}
            className="hidden md:inline-block hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t.navRoomSetup}
          </button>
          <button
            type="button"
            onClick={() => {
              if (onlineGame && (onlineGame.status === 'ACTIVE' || onlineGame.status === 'FINISHED')) {
                setViewState('ONLINE_PLAYING');
              } else if (game) {
                setViewState('PLAYING');
              }
            }}
            className="hidden md:inline-block hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t.navBoardTable}
          </button>
          <button
            type="button"
            onClick={() => setShowBlueprint(true)}
            className="hidden md:inline-block hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t.navBlueprint}
          </button>
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="hidden md:inline-block hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t.navRules}
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 text-amber-200 hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            <Globe size={14} />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </nav>

        <div className="shrink-0">
          {viewState === 'TITLE_MENU' ? (
            playMode === 'local' ? (
              <button
                type="button"
                onClick={() => startNewGame()}
                className="px-4 py-2 rounded-lg bg-[#F7F3E9] hover:bg-white text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {t.startMatch}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPlayMode('local')}
                className="px-4 py-2 rounded-lg bg-[#F7F3E9] hover:bg-white text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {lang === 'ar' ? 'الوضع المحلي' : 'Local Mode'}
              </button>
            )
          ) : viewState === 'ONLINE_PLAYING' ? (
            <button
              type="button"
              onClick={() => {
                setOnlineGame(null);
                setMyPlayerId(null);
                setMyPlayerToken(null);
                setIsSpectator(false);
                setChatMessages([]);
                setPresence({ onlinePlayerIds: [], spectatorCount: 0 });
                setViewState('TITLE_MENU');
              }}
              className="px-4 py-2 rounded-lg bg-[#F7F3E9] hover:bg-white text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {t.returnLobby}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRematchInRoom}
              className="px-4 py-2 rounded-lg bg-[#F7F3E9] hover:bg-white text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {t.newGame}
            </button>
          )}
        </div>
      </header>

      {viewState === 'TITLE_MENU' && (
        <>
          <div className="max-w-6xl w-full mx-auto px-6 pt-6">
            <div className="inline-flex items-center gap-1 p-1 bg-[#09281F]/80 border border-emerald-900 rounded-lg">
              <button
                type="button"
                onClick={() => setPlayMode('local')}
                className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                  playMode === 'local'
                    ? 'bg-[#FBF9F4] text-slate-900 shadow-xs'
                    : 'text-emerald-100/80 hover:text-white'
                }`}
              >
                <Users size={14} />
                {lang === 'ar' ? 'طاولة محلية (روبوتات / نفس الجهاز)' : 'Local Tabletop (AI & Pass-and-Play)'}
              </button>
              <button
                type="button"
                onClick={() => setPlayMode('online')}
                className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                  playMode === 'online'
                    ? 'bg-[#FBF9F4] text-slate-900 shadow-xs'
                    : 'text-emerald-100/80 hover:text-white'
                }`}
              >
                <Wifi size={14} />
                {lang === 'ar' ? 'لعب جماعي أونلاين (خادم حي)' : 'Online Multiplayer (Live Server)'}
              </button>
            </div>
          </div>

          {playMode === 'local' ? (
            <TitleLobby
              lang={lang}
              roomConfig={roomConfig}
              onChangeRoom={setRoomConfig}
              players={playerConfigs}
              onChangePlayers={setPlayerConfigs}
              onStartGame={() => startNewGame()}
            />
          ) : (
            <main className="max-w-6xl w-full mx-auto px-6 py-8">
              <Suspense fallback={<p role="status" className="text-center text-emerald-100">جارٍ تحميل اللعب الجماعي…</p>}>
              <OnlineLobbyPanel
                lang={lang}
                authUser={authUser}
                accessToken={accessToken}
                onAuthChange={(user, token) => {
                  void mutateAuthSession(user && token ? { user, accessToken: token } : null, false);
                }}
                activeGame={onlineGame}
                myPlayerId={myPlayerId}
                myPlayerToken={myPlayerToken}
                socketConnected={socketConnected}
                onEnterGame={(nextGame, pid, ptok) => {
                  setIsSpectator(false);
                  setChatMessages([]);
                  setPresence({ onlinePlayerIds: [], spectatorCount: 0 });
                  setOnlineGame(nextGame);
                  setMyPlayerId(pid);
                  setMyPlayerToken(ptok);
                  if (nextGame.status === 'ACTIVE' || nextGame.status === 'FINISHED') {
                    setViewState('ONLINE_PLAYING');
                  }
                }}
                onSpectateGame={(nextGame) => {
                  setIsSpectator(true);
                  setChatMessages([]);
                  setPresence({ onlinePlayerIds: [], spectatorCount: 0 });
                  setMyPlayerId(null);
                  setMyPlayerToken(null);
                  setOnlineGame(nextGame);
                  setViewState('ONLINE_PLAYING');
                }}
                onLeaveRoom={() => {
                  setOnlineGame(null);
                  setMyPlayerId(null);
                  setMyPlayerToken(null);
                  setIsSpectator(false);
                  setChatMessages([]);
                }}
                onGameStateUpdate={(nextGame) => {
                  setOnlineGame(nextGame);
                  if (nextGame.status === 'ACTIVE' || nextGame.status === 'FINISHED') {
                    setViewState('ONLINE_PLAYING');
                  }
                }}
              />
              </Suspense>
            </main>
          )}
        </>
      )}

      {viewState === 'ONLINE_PLAYING' && onlineGame && ((myPlayerId && myPlayerToken) || isSpectator) && (
        <Suspense fallback={<p role="status" className="p-6 text-center">جارٍ تحميل اللعبة…</p>}>
        <OnlineGameView
          lang={lang}
          game={onlineGame}
          myPlayerId={myPlayerId}
          myPlayerToken={myPlayerToken}
          isSpectator={isSpectator}
          socketConnected={socketConnected}
          presence={presence}
          chatMessages={chatMessages}
          onSendChat={async (text) => {
            if (!socketHandleRef.current) return false;
            return socketHandleRef.current.sendChat(text);
          }}
          onGameStateUpdate={(nextGame) => setOnlineGame(nextGame)}
          onExitGame={() => {
            setOnlineGame(null);
            setMyPlayerId(null);
            setMyPlayerToken(null);
            setIsSpectator(false);
            setChatMessages([]);
            setPresence({ onlinePlayerIds: [], spectatorCount: 0 });
            setViewState('TITLE_MENU');
          }}
        />
        </Suspense>
      )}

      {(viewState === 'PLAYING' || viewState === 'GAME_OVER') && game && (
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-4 grid grid-cols-1 xl:grid-cols-[290px_1fr_330px] gap-4 items-start">
          {/* Left Rail: Players Roster + Bank Supply */}
          <aside className="space-y-4">
            <div className="bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h2
                  className="text-base font-bold text-slate-900"
                  style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
                >
                  {t.seatedPlayers}
                </h2>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors"
                  title={
                    muted
                      ? lang === 'ar'
                        ? 'تشغيل المؤثرات الصوتية'
                        : 'Unmute sound effects'
                      : lang === 'ar'
                      ? 'كتم المؤثرات الصوتية'
                      : 'Mute sound effects'
                  }
                  aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>

              <div className="space-y-2.5">
                {game.players.map((p) => {
                  const isActive = p.id === game.whoseTurn.currentPlayer.id && !p.isEliminated;
                  const props = game.getPlayerProperties(p);
                  const netWorth = game.calculatePlayerNetWorth(p);
                  const tile = game.boardLands[p.position];

                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        p.isEliminated
                          ? 'bg-slate-100 border-slate-200 opacity-55'
                          : isActive
                          ? 'bg-white border-emerald-700 ring-1 ring-emerald-700/30 shadow-xs'
                          : 'bg-white/80 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${p.accentColor}18` }}
                          >
                            <TokenIcon tokenName={p.tokenName} color={p.accentColor} size={15} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {p.isEliminated
                                ? t.bankrupt
                                : p.inJail
                                ? t.inJail
                                : isActive
                                ? t.activeTurn
                                : p.isBot
                                ? t.aiBot
                                : t.human}
                              {' · '}
                              {getTileName(tile.index, tile.name, lang)}
                            </div>
                          </div>
                        </div>

                        <div className="text-end shrink-0">
                          <div dir="ltr" className="text-sm font-mono font-bold tabular-nums text-slate-900">
                            ${p.wallet.amount.toLocaleString()}
                          </div>
                          <div dir="ltr" className="text-[10px] font-mono tabular-nums text-slate-500">
                            {lang === 'ar' ? 'الصافي' : 'NW'} ${netWorth.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {p.jailFreeCards.length > 0 && !p.isEliminated && (
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-sky-800">
                          <KeyRound size={11} />
                          <span>
                            {p.jailFreeCards.length}× {t.jailFreeHeld}
                          </span>
                        </div>
                      )}

                      {p.inJail && !p.isEliminated && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                          <Lock size={11} />
                          <span>
                            {t.jailTurn} {p.jailTurns}/{game.jail.maxAttempts}
                          </span>
                        </div>
                      )}

                      {p.isEliminated && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                          <Skull size={11} />
                          <span>{t.eliminated}</span>
                        </div>
                      )}

                      {props.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                          {props.map((owned) => (
                            <button
                              key={owned.index}
                              type="button"
                              onClick={() => {
                                setSelectedLandIndex(owned.index);
                                setRightTab('deed');
                              }}
                              title={`${getTileName(owned.index, owned.name, lang)}${
                                owned.isMortgaged ? ` (${t.mortgagedBadge})` : ''
                              }`}
                              className={`w-4 h-3 rounded-[2px] border border-black/15 transition-transform hover:scale-110 ${
                                owned.isMortgaged ? 'opacity-35' : ''
                              }`}
                              style={{ backgroundColor: owned.groupColor }}
                            />
                          ))}
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
                <span className="text-slate-600">{t.bankCash}</span>
                <span dir="ltr" className="font-mono font-semibold tabular-nums text-slate-900">
                  ${game.bank.bankMoney.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t.availHouses}</span>
                <span dir="ltr" className="font-mono font-semibold tabular-nums text-slate-900">
                  {game.bank.availableHouses} / 32
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t.availHotels}</span>
                <span dir="ltr" className="font-mono font-semibold tabular-nums text-slate-900">
                  {game.bank.availableHotels} / 12
                </span>
              </div>
            </div>
          </aside>

          {/* Center Focal Anchor: 11x11 Board */}
          <section className="flex flex-col items-center justify-center">
            <BoardView
              lang={lang}
              game={game}
              selectedLandIndex={selectedLandIndex}
              animatedTokenPos={animatedTokenPos}
              onSelectLand={(idx) => {
                setSelectedLandIndex(idx);
                setRightTab('deed');
              }}
              onRollDice={handleRollDice}
              onBuyLand={handleBuyLand}
              onStartAuction={handleStartAuction}
              onPlaceBid={handlePlaceBid}
              onPassAuction={handlePassAuction}
              onUseJailFreeCard={handleUseJailFreeCard}
              onPayJailFine={handlePayJailFine}
              onAttemptJailEscape={handleAttemptJailEscape}
              onPayDebt={handlePayDebt}
              onDeclareBankruptcy={handleDeclareBankruptcy}
              onOpenTrade={() => setShowTradeModal(true)}
              onEndTurn={handleEndTurn}
              isRolling={isRolling}
            />
          </section>

          {/* Right Rail: Property Deed | Portfolio | Full Ledger */}
          <aside className="bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-4 shadow-sm flex flex-col max-h-[736px]">
            <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg mb-4 shrink-0">
              <button
                type="button"
                onClick={() => setRightTab('deed')}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  rightTab === 'deed'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.tabDeed}
              </button>
              <button
                type="button"
                onClick={() => setRightTab('portfolio')}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  rightTab === 'portfolio'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.tabPortfolio}
              </button>
              <button
                type="button"
                onClick={() => setRightTab('ledger')}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  rightTab === 'ledger'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.tabLedger} ({game.logs.length})
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar pe-0.5 flex-1">
              {rightTab === 'deed' ? (
                <DeedInspector
                  lang={lang}
                  game={game}
                  land={game.boardLands[selectedLandIndex] ?? game.boardLands[0]}
                  onBuildHouse={handleBuildHouse}
                  onBuildHotel={handleBuildHotel}
                  onDemolishHouse={handleDemolishHouse}
                  onDemolishHotel={handleDemolishHotel}
                  onMortgage={handleMortgage}
                  onRedeem={handleRedeem}
                  onSellToPlayer={handleSellToPlayer}
                />
              ) : rightTab === 'portfolio' ? (
                <PortfolioManager
                  lang={lang}
                  game={game}
                  onSelectLand={(idx) => {
                    setSelectedLandIndex(idx);
                    setRightTab('deed');
                  }}
                  onBuildHouse={handleBuildHouse}
                  onBuildHotel={handleBuildHotel}
                  onDemolishHouse={handleDemolishHouse}
                  onMortgage={handleMortgage}
                  onRedeem={handleRedeem}
                />
              ) : (
                <div className="space-y-2">
                  {game.logs.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-white rounded-md border border-slate-200 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold" style={{ color: entry.playerColor }}>
                          {entry.playerName}
                        </span>
                        <span dir="ltr" className="font-mono tabular-nums">
                          {lang === 'ar' ? `د${entry.turn}` : `T${entry.turn}`} · {entry.timestamp}
                        </span>
                      </div>
                      <p className="text-slate-800 leading-snug">
                        {translateGameText(entry.message, lang)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </main>
      )}

      {/* Two-Way Trade Proposal Modal */}
      {showTradeModal && game && (
        <TradeModal
          lang={lang}
          game={game}
          proposer={game.whoseTurn.currentPlayer}
          onClose={() => setShowTradeModal(false)}
          onPropose={handleProposeTrade}
        />
      )}

      {/* Incoming Trade Confirmation for Human-to-Human Deals */}
      {game?.pendingTrade && (
        <IncomingTradeModal
          lang={lang}
          game={game}
          onAccept={() => {
            game.acceptPendingTrade();
            soundFX.cashChime();
            forceRender();
          }}
          onDecline={() => {
            game.declinePendingTrade();
            forceRender();
          }}
        />
      )}

      {/* Victory Modal */}
      {viewState === 'GAME_OVER' && game?.winner && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.matchComplete}
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-amber-300 max-w-lg w-full p-7 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                <Trophy size={24} />
              </div>
              <div>
                <p className="text-xs font-medium text-amber-800">
                  {t.matchComplete} · <span dir="ltr">{game.roomAndGameInfo.getSessionCode()}</span>
                </p>
                <h2
                  className="text-2xl font-bold text-slate-900"
                  style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
                >
                  {game.winner.winningPlayer.name} {t.winsLabel}
                </h2>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {translateGameText(game.winner.announceWinner(), lang)}
            </p>

            {game.losers.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2 text-xs">
                <div className="font-semibold text-slate-800 border-b border-slate-100 pb-1.5">
                  {t.elimStandings}
                </div>
                {game.losers.map((l, idx) => (
                  <div key={idx} className="flex justify-between text-slate-600">
                    <span>{l.bankruptPlayer.name}</span>
                    <span className="font-mono tabular-nums">
                      {t.bankruptOnTurn} {l.turnEliminated}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setViewState('TITLE_MENU')}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
              >
                {t.returnLobby}
              </button>
              <button
                type="button"
                onClick={startRematchInRoom}
                className="px-5 py-2.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <RotateCcw size={14} />
                {t.playAgain}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Blueprint Modal */}
      {showBlueprint && (
        <ClassBlueprintModal lang={lang} game={game} onClose={() => setShowBlueprint(false)} />
      )}

      {/* Rules Modal */}
      {showRules && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.rulesTitle}
        >
          <div className="bg-[#FBF9F4] rounded-xl border border-slate-300 max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2
                className="text-xl font-bold text-slate-900"
                style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
              >
                {t.rulesTitle}
              </h2>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70"
                aria-label={t.cancelBtn}
              >
                <X size={18} />
              </button>
            </div>
            {lang === 'ar' ? (
              <div className="text-xs text-slate-700 space-y-2.5 leading-relaxed">
                <p>
                  <strong>مراحل الدور:</strong> رمي النرد ← تنفيذ الخانة ← شراء أو مزاد ← إدارة الممتلكات ← إنهاء الدور (أو تسوية الدين عند نقص السيولة). اضغط <kbd className="px-1.5 py-0.5 rounded bg-slate-200 font-mono" dir="ltr">Space</kbd> لرمي النرد أو إنهاء الدور.
                </p>
                <p>
                  <strong>السجن وبطاقة الخروج المجاني:</strong> رمي الدبل 3 مرات متتالية يُرسلك للسجن. يمكنك الخروج عبر بطاقة الخروج المجاني، أو دفع كفالة $50، أو محاولة رمي دبل (حد أقصى 3 محاولات، بعدها تُدفع الكفالة وتتحرك بمقدار النرد).
                </p>
                <p>
                  <strong>قاعدة البناء المتوازن:</strong> امتلك جميع صكوك المجموعة اللونّية دون رهن لتتمكن من بناء المنازل بالتساوي (حتى 4 منازل ثم فندق واحد). استخدم تبويب <strong>المحفظة</strong> لإدارة جميع مجموعاتك بسهولة.
                </p>
                <p>
                  <strong>التداول والمزادات:</strong> رفض شراء عقار متاح يفتح مزاداً مباشراً. استخدم زر <strong>مبادلة</strong> لاقتراح صفقات عقارات ونقود وبطاقات سجن مع اللاعبين أو الروبوتات.
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-700 space-y-2.5 leading-relaxed">
                <p>
                  <strong>Turn Phases:</strong> Roll Dice → Resolve Landing → Buy or Auction → Manage Assets → End Turn (or Resolve Debt if cash is short). Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 font-mono">Space</kbd> to roll dice or end your turn.
                </p>
                <p>
                  <strong>Jail &amp; Get Out of Jail Free:</strong> Rolling 3 consecutive doubles sends you to Jail. Exit via a Get Out of Jail Free card, paying $50 bail, or rolling doubles (max 3 attempts, after which $50 bail is paid and you move by the roll).
                </p>
                <p>
                  <strong>Even Building Rule:</strong> Own all deeds in a color group with none mortgaged to build houses evenly (up to 4 houses, then 1 Hotel). Use the <strong>Portfolio</strong> tab to manage all your groups in one place.
                </p>
                <p>
                  <strong>Trading &amp; Auctions:</strong> Declining an unowned space opens a live auction. Use <strong>Trade</strong> to propose multi-property, cash, and Jail-card deals with humans or AI bots.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

