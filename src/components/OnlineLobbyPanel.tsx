import React, { useCallback, useEffect, useState } from 'react';
import {
  ApiClientError,
  manopolyApi,
  type AuthUser,
  type OnlineGameState,
  type OpenRoomSummary,
} from '../api/manopolyClient';
import type { Language } from '../i18n/translations';
import {
  Users,
  PlusCircle,
  LogIn,
  RefreshCw,
  Copy,
  Check,
  Play,
  LogOut,
  ShieldCheck,
  UserCheck,
  Wifi,
  Eye,
} from 'lucide-react';

interface OnlineLobbyPanelProps {
  lang: Language;
  authUser: AuthUser | null;
  accessToken: string | null;
  onAuthChange: (user: AuthUser | null, token: string | null) => void;
  activeGame: OnlineGameState | null;
  myPlayerId: string | null;
  myPlayerToken: string | null;
  socketConnected: boolean;
  onEnterGame: (game: OnlineGameState, playerId: string, playerToken: string) => void;
  onSpectateGame: (game: OnlineGameState) => void;
  onLeaveRoom: () => void;
  onGameStateUpdate: (game: OnlineGameState) => void;
}

export const OnlineLobbyPanel: React.FC<OnlineLobbyPanelProps> = ({
  lang,
  authUser,
  accessToken,
  onAuthChange,
  activeGame,
  myPlayerId,
  myPlayerToken,
  socketConnected,
  onEnterGame,
  onSpectateGame,
  onLeaveRoom,
  onGameStateUpdate,
}) => {
  const isAr = lang === 'ar';

  const [playerName, setPlayerName] = useState(
    authUser?.username ?? (isAr ? 'لاعب ١' : 'Player 1')
  );
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [freeParkingPot, setFreeParkingPot] = useState(true);
  const [auctionOnDecline, setAuctionOnDecline] = useState(true);
  const [allowSpectators, setAllowSpectators] = useState(true);

  const [joinCode, setJoinCode] = useState('');
  const [openRooms, setOpenRooms] = useState<OpenRoomSummary[]>([]);
  const [spectatableRooms, setSpectatableRooms] = useState<OpenRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Optional account login/register
  const [authMode, setAuthMode] = useState<'none' | 'login' | 'register'>('none');
  const [loginInput, setLoginInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    if (authUser && !playerName.trim()) {
      setPlayerName(authUser.username);
    }
  }, [authUser, playerName]);

  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await manopolyApi.listOpenRooms();
      setOpenRooms(res.games);
      setSpectatableRooms(res.activeSpectatableGames ?? []);
    } catch {
      // Keep previous list if transient error
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (!activeGame) {
      void refreshRooms();
    }
  }, [activeGame, refreshRooms]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (authMode === 'register') {
        const res = await manopolyApi.register({
          email: emailInput.trim(),
          username: usernameInput.trim(),
          password: passwordInput,
        });
        onAuthChange(res.user, res.accessToken);
        setPlayerName(res.user.username);
        setAuthMode('none');
      } else if (authMode === 'login') {
        const res = await manopolyApi.login({
          login: loginInput.trim(),
          password: passwordInput,
        });
        onAuthChange(res.user, res.accessToken);
        setPlayerName(res.user.username);
        setAuthMode('none');
      }
      setPasswordInput('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await manopolyApi.logout();
    } catch {
      // Ignore network error on logout
    }
    onAuthChange(null, null);
  };

  const handleSpectateRoom = async (roomId: string) => {
    setError(null);
    setBusy(true);
    try {
      const res = await manopolyApi.getGame(roomId);
      onSpectateGame(res.game);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveWaitingRoom = async () => {
    if (activeGame && myPlayerToken) {
      setBusy(true);
      try {
        await manopolyApi.leaveGame(activeGame.id, myPlayerToken);
      } catch {
        // Still leave UI cleanly
      } finally {
        setBusy(false);
      }
    }
    onLeaveRoom();
  };

  const handleCreateRoom = async () => {
    const cleanName = playerName.trim();
    if (cleanName.length < 2) {
      setError(isAr ? 'الاسم يجب أن يكون حرفين على الأقل.' : 'Name must be at least 2 characters.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await manopolyApi.createRoom(
        {
          name: cleanName,
          settings: {
            maxPlayers,
            freeParkingPot,
            auctionOnDecline,
            allowSpectators,
          },
        },
        accessToken
      );
      onEnterGame(res.game, res.player.id, res.player.token);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async (targetIdOrCode: string) => {
    const cleanName = playerName.trim();
    const code = targetIdOrCode.trim();
    if (cleanName.length < 2) {
      setError(isAr ? 'الاسم يجب أن يكون حرفين على الأقل.' : 'Name must be at least 2 characters.');
      return;
    }
    if (!code) {
      setError(isAr ? 'أدخل رمز الغرفة أولاً.' : 'Enter a room code first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await manopolyApi.joinRoom(code, cleanName, accessToken);
      onEnterGame(res.game, res.player.id, res.player.token);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStartMatch = async () => {
    if (!activeGame || !myPlayerToken) return;
    setError(null);
    setBusy(true);
    try {
      const res = await manopolyApi.mutate(activeGame.id, 'start', myPlayerToken);
      onGameStateUpdate(res.state);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copyRoomCode = () => {
    if (!activeGame) return;
    void navigator.clipboard?.writeText(activeGame.code);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  if (activeGame && activeGame.status === 'WAITING') {
    const isHost = activeGame.players[0]?.id === myPlayerId;
    return (
      <div className="bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-7 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 mb-1">
              <Wifi size={14} className={socketConnected ? 'text-emerald-600' : 'text-amber-600'} />
              <span>
                {socketConnected
                  ? isAr
                    ? 'متصل بالغرفة لحظياً (Socket.IO)'
                    : 'Live room connected (Socket.IO)'
                  : isAr
                  ? 'جاري الاتصال بالغرفة...'
                  : 'Connecting to room...'}
              </span>
            </div>
            <h2
              className="text-2xl font-bold text-slate-900"
              style={{ fontFamily: isAr ? undefined : 'var(--font-display)' }}
            >
              {isAr ? 'غرفة الانتظار أونلاين' : 'Online Waiting Room'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 flex items-center gap-2">
              <span className="text-xs text-slate-500">{isAr ? 'رمز الغرفة:' : 'Room Code:'}</span>
              <span dir="ltr" className="font-mono font-bold text-base text-slate-900 tracking-wider">
                {activeGame.code}
              </span>
              <button
                type="button"
                onClick={copyRoomCode}
                className="p-1 rounded hover:bg-slate-100 text-slate-600"
                title={isAr ? 'نسخ الرمز' : 'Copy code'}
              >
                {copiedCode ? <Check size={14} className="text-emerald-700" /> : <Copy size={14} />}
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleLeaveWaitingRoom}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
            >
              <LogOut size={14} />
              {isAr ? 'مغادرة' : 'Leave'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-900">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users size={15} className="text-emerald-800" />
              {isAr ? 'اللاعبون المنضمون' : 'Seated Players'} ({activeGame.players.length}/
              {activeGame.settings.maxPlayers})
            </h3>
            <div className="space-y-2">
              {activeGame.players.map((p, idx) => (
                <div
                  key={p.id}
                  className="bg-white rounded-lg border border-slate-200 px-3.5 py-2.5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                    {p.id === myPlayerId && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                        {isAr ? 'أنت' : 'You'}
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                        {isAr ? 'المضيف' : 'Host'}
                      </span>
                    )}
                  </div>
                  <span dir="ltr" className="text-xs font-mono text-slate-600">
                    ${p.cash.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2 text-xs text-slate-700">
              <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                {isAr ? 'إعدادات المباراة' : 'Match Settings'}
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'الحد الأقصى للاعبين' : 'Max Players'}</span>
                <span className="font-mono font-semibold">{activeGame.settings.maxPlayers}</span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'الرصيد الابتدائي' : 'Starting Cash'}</span>
                <span dir="ltr" className="font-mono font-semibold">
                  ${activeGame.settings.startingCash}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'صندوق المواقف المجانية' : 'Free Parking Pot'}</span>
                <span className="font-semibold">
                  {activeGame.settings.freeParkingPot
                    ? isAr
                      ? 'مفعّل'
                      : 'Enabled'
                    : isAr
                    ? 'معطّل'
                    : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'مزاد عند رفض الشراء' : 'Auction on Decline'}</span>
                <span className="font-semibold">
                  {activeGame.settings.auctionOnDecline
                    ? isAr
                      ? 'إلزامي'
                      : 'Mandatory'
                    : isAr
                    ? 'معطّل'
                    : 'Off'}
                </span>
              </div>
              <p className="pt-2 text-[11px] text-slate-500 leading-relaxed">
                {isAr
                  ? `شارك رمز الغرفة (${activeGame.code}) مع صديق أو افتح تبويباً جديداً للانضمام قبل بدء المباراة.`
                  : `Share room code (${activeGame.code}) with a friend or open another browser tab to join before starting.`}
              </p>
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={busy || activeGame.players.length < 2}
                onClick={handleStartMatch}
                className="w-full py-3 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Play size={16} />
                {activeGame.players.length < 2
                  ? isAr
                    ? 'بانتظار انضمام لاعب ثانٍ على الأقل...'
                    : 'Waiting for at least 2 players...'
                  : isAr
                  ? 'بدء المباراة الآن'
                  : 'Start Online Match'}
              </button>
            ) : (
              <div className="py-3 px-4 rounded-lg bg-slate-100 text-center text-xs font-semibold text-slate-700">
                {isAr ? 'بانتظار المضيف لبدء المباراة...' : 'Waiting for the host to start the match...'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-900">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Player Identity, Account (Optional) & Create Room */}
        <section className="lg:col-span-5 bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2
                className="text-xl font-bold text-slate-900"
                style={{ fontFamily: isAr ? undefined : 'var(--font-display)' }}
              >
                {isAr ? 'إنشاء غرفة أونلاين' : 'Create Online Room'}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {isAr
                  ? 'غرفة حية مدعومة بخادم Express وSocket.IO'
                  : 'Live server-authoritative room via Express & Socket.IO'}
              </p>
            </div>
            <ShieldCheck size={20} className="text-emerald-800 shrink-0" />
          </div>

          {/* Optional Account Bar */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2.5">
            {authUser ? (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                  <UserCheck size={15} className="text-emerald-700" />
                  <span>{authUser.username}</span>
                  <span className="text-slate-400 font-normal">({authUser.email})</span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-slate-500 hover:text-rose-700 font-medium"
                >
                  {isAr ? 'تسجيل خروج' : 'Sign out'}
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    {isAr ? 'اللعب كضيف متاح فوراً (الحساب اختياري)' : 'Guest play ready (Account optional)'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode(authMode === 'login' ? 'none' : 'login')}
                      className="font-semibold text-emerald-800 hover:underline"
                    >
                      {isAr ? 'دخول' : 'Sign in'}
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAuthMode(authMode === 'register' ? 'none' : 'register')}
                      className="font-semibold text-emerald-800 hover:underline"
                    >
                      {isAr ? 'حساب جديد' : 'Register'}
                    </button>
                  </div>
                </div>

                {authMode !== 'none' && (
                  <form onSubmit={handleAuthSubmit} className="space-y-2 pt-2 border-t border-slate-100">
                    {authMode === 'register' ? (
                      <>
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="email@example.com"
                          className="w-full px-3 py-1.5 rounded border border-slate-300 text-xs"
                        />
                        <input
                          type="text"
                          required
                          dir="ltr"
                          value={usernameInput}
                          onChange={(e) => setUsernameInput(e.target.value)}
                          placeholder="username (3-24 chars)"
                          className="w-full px-3 py-1.5 rounded border border-slate-300 text-xs"
                        />
                      </>
                    ) : (
                      <input
                        type="text"
                        required
                        dir="ltr"
                        value={loginInput}
                        onChange={(e) => setLoginInput(e.target.value)}
                        placeholder={isAr ? 'البريد أو اسم المستخدم' : 'Email or username'}
                        className="w-full px-3 py-1.5 rounded border border-slate-300 text-xs"
                      />
                    )}
                    <input
                      type="password"
                      required
                      minLength={authMode === 'register' ? 10 : 1}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder={
                        authMode === 'register'
                          ? isAr
                            ? 'كلمة المرور (10+ أحرف)'
                            : 'Password (10+ chars)'
                          : isAr
                          ? 'كلمة المرور'
                          : 'Password'
                      }
                      className="w-full px-3 py-1.5 rounded border border-slate-300 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {authMode === 'register'
                        ? isAr
                          ? 'إنشاء حساب'
                          : 'Create Account'
                        : isAr
                        ? 'تسجيل الدخول'
                        : 'Sign In'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'اسمك داخل الطاولة' : 'Your Display Name'}
              </label>
              <input
                type="text"
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الحد الأقصى للاعبين (2–8)' : 'Max Players (2–8)'}
              </label>
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                {[2, 4, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxPlayers(n)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      maxPlayers === n
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                <span className="font-medium text-slate-800">
                  {isAr ? 'صندوق المواقف المجانية (الضرائب)' : 'Free Parking Tax Pot'}
                </span>
                <input
                  type="checkbox"
                  checked={freeParkingPot}
                  onChange={(e) => setFreeParkingPot(e.target.checked)}
                  className="accent-emerald-700"
                />
              </label>
              <label className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                <span className="font-medium text-slate-800">
                  {isAr ? 'مزاد إلزامي عند رفض الشراء' : 'Mandatory Auction on Decline'}
                </span>
                <input
                  type="checkbox"
                  checked={auctionOnDecline}
                  onChange={(e) => setAuctionOnDecline(e.target.checked)}
                  className="accent-emerald-700"
                />
              </label>
              <label className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                <span className="font-medium text-slate-800">
                  {isAr ? 'السماح بالمشاهدين' : 'Allow Spectators'}
                </span>
                <input
                  type="checkbox"
                  checked={allowSpectators}
                  onChange={(e) => setAllowSpectators(e.target.checked)}
                  className="accent-emerald-700"
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleCreateRoom}
            className="w-full py-3 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-colors"
          >
            <PlusCircle size={16} />
            {isAr ? 'إنشاء غرفة أونلاين' : 'Create Online Room'}
          </button>
        </section>

        {/* Right: Join by Code + Open Rooms List */}
        <section className="lg:col-span-7 bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-6 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2
                  className="text-xl font-bold text-slate-900"
                  style={{ fontFamily: isAr ? undefined : 'var(--font-display)' }}
                >
                  {isAr ? 'الانضمام لغرفة قائمة' : 'Join an Existing Room'}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isAr
                    ? 'أدخل رمز الغرفة أو اختر من الغرف المتاحة بالأسفل'
                    : 'Enter a room code or pick an open waiting room below'}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshRooms}
                disabled={loadingRooms}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <RefreshCw size={13} className={loadingRooms ? 'animate-spin' : ''} />
                {isAr ? 'تحديث' : 'Refresh'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder={isAr ? 'رمز الغرفة (مثال: A1B2C3) أو المعرف' : 'Room code (e.g. A1B2C3) or ID'}
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => handleJoinRoom(joinCode)}
                className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                <LogIn size={15} />
                {isAr ? 'انضمام' : 'Join'}
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700">
                {isAr ? 'الغرف المفتوحة بانتظار اللاعبين' : 'Open Waiting Rooms'} ({openRooms.length})
              </div>
              {openRooms.length === 0 ? (
                <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-xs text-slate-500">
                  {isAr
                    ? 'لا توجد غرف مفتوحة حالياً. أنشئ غرفة جديدة من اللوحة المجاورة!'
                    : 'No waiting rooms available right now. Create a new room on the left!'}
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pe-1">
                  {openRooms.map((room) => (
                    <div
                      key={room.id}
                      className="bg-white rounded-lg border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="font-mono font-bold text-sm text-slate-900">
                            {room.code}
                          </span>
                          <span className="text-xs text-slate-500">
                            · {room.players.length}/{room.maxPlayers} {isAr ? 'لاعبين' : 'players'}
                          </span>
                          {room.freeParkingPot && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                              {isAr ? 'صندوق المواقف' : 'Parking Pot'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {room.players.map((p) => p.displayName).join(' · ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy || room.players.length >= room.maxPlayers}
                        onClick={() => handleJoinRoom(room.id)}
                        className="px-4 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                      >
                        {isAr ? 'دخول الغرفة' : 'Join Room'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {spectatableRooms.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Eye size={13} className="text-sky-700" />
                  {isAr ? 'مباريات جارية متاحة للمشاهدة' : 'Live Matches (Spectate)'} (
                  {spectatableRooms.length})
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pe-1">
                  {spectatableRooms.map((room) => (
                    <div
                      key={room.id}
                      className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="font-mono font-bold text-xs text-slate-900">
                            {room.code}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-semibold">
                            {isAr ? 'جارية الآن' : 'LIVE'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {room.players.map((p) => p.displayName).join(' · ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSpectateRoom(room.id)}
                        className="px-3.5 py-1.5 rounded-lg border border-sky-700 text-sky-900 hover:bg-sky-50 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Eye size={13} />
                        {isAr ? 'مشاهدة' : 'Spectate'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 text-xs text-slate-600">
            {isAr
              ? 'جميع الرميات والصفقات والمزادات وإدارة العقارات يتم التحقق منها وحفظها في الخادم لحظياً.'
              : 'All dice rolls, trades, auctions, and property management actions are validated and persisted on the server in real time.'}
          </div>
        </section>
      </div>
    </div>
  );
};
