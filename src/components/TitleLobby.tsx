import React from 'react';
import { AVAILABLE_TOKENS, TokenIcon } from './TokenAndDice';
import { PLAYER_ACCENT_COLORS } from '../engine/player';
import { PlayerSetupConfig } from '../engine/types';
import { GameAndRoomInfo } from '../engine/MonopolyGame';
import { getTokenLabel, Language, UI_TEXT } from '../i18n/translations';
import { Lock, Globe, Users, Bot, User, Play } from 'lucide-react';

interface TitleLobbyProps {
  lang: Language;
  roomConfig: {
    roomName: string;
    roomNumber: string;
    gameNumber: string;
    maxPlayers: number;
    isPrivate: boolean;
    freeParkingPotEnabled: boolean;
  };
  onChangeRoom: (next: TitleLobbyProps['roomConfig']) => void;
  players: PlayerSetupConfig[];
  onChangePlayers: (next: PlayerSetupConfig[]) => void;
  onStartGame: () => void;
}

export const TitleLobby: React.FC<TitleLobbyProps> = ({
  lang,
  roomConfig,
  onChangeRoom,
  players,
  onChangePlayers,
  onStartGame,
}) => {
  const t = UI_TEXT[lang];
  const previewRoom = new GameAndRoomInfo(
    roomConfig.roomName,
    roomConfig.roomNumber,
    roomConfig.gameNumber,
    roomConfig.maxPlayers,
    roomConfig.isPrivate,
    roomConfig.freeParkingPotEnabled
  );

  const enabledCount = players.filter((p) => p.enabled).length;

  const updatePlayer = (playerNumber: 1 | 2 | 3 | 4, patch: Partial<PlayerSetupConfig>) => {
    const next = players.map((p) => (p.playerNumber === playerNumber ? { ...p, ...patch } : p));
    onChangePlayers(next);
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Column: Room & Rules Setup */}
        <section className="lg:col-span-5 bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-7 flex flex-col justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-emerald-800 tracking-wide mb-2">
              {t.lobbyKicker} · <span dir="ltr">{previewRoom.getSessionCode()}</span>
            </p>
            <h1
              className="text-3xl font-bold text-slate-900 leading-tight mb-3"
              style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)', textWrap: 'balance' }}
            >
              {t.brand}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {t.lobbySubtitle}
            </p>

            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t.roomName}
                </label>
                <input
                  type="text"
                  value={roomConfig.roomName}
                  onChange={(e) => onChangeRoom({ ...roomConfig, roomName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t.roomNumber}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={roomConfig.roomNumber}
                    onChange={(e) => onChangeRoom({ ...roomConfig, roomNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t.gameNumber}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={roomConfig.gameNumber}
                    onChange={(e) => onChangeRoom({ ...roomConfig, gameNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t.maxPlayers}
                  </label>
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    {[2, 3, 4].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => {
                          onChangeRoom({ ...roomConfig, maxPlayers: count });
                          const nextPlayers = players.map((p) => ({
                            ...p,
                            enabled: p.playerNumber <= count,
                          }));
                          onChangePlayers(nextPlayers);
                        }}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                          roomConfig.maxPlayers === count
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {count} {t.seats}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t.roomAccess}
                  </label>
                  <button
                    type="button"
                    onClick={() => onChangeRoom({ ...roomConfig, isPrivate: !roomConfig.isPrivate })}
                    className="w-full py-2.5 px-3 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    {roomConfig.isPrivate ? (
                      <>
                        <Lock size={14} className="text-amber-700" />
                        {t.privateRoom}
                      </>
                    ) : (
                      <>
                        <Globe size={14} className="text-emerald-700" />
                        {t.openRoom}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t.freeParkingRule}
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onChangeRoom({ ...roomConfig, freeParkingPotEnabled: false })}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      !roomConfig.freeParkingPotEnabled
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.officialZero}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeRoom({ ...roomConfig, freeParkingPotEnabled: true })}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      roomConfig.freeParkingPotEnabled
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.taxPotJackpot}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800">{t.coreRulesTitle}</p>
            <p>{t.coreRulesLine1}</p>
            <p>{t.coreRulesLine2}</p>
            <p>{t.coreRulesLine3}</p>
          </div>
        </section>

        {/* Right Column: Player Seats & Launch */}
        <section className="lg:col-span-7 bg-[#FBF9F4] rounded-xl border border-[#DFD8C8] p-7 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2
                  className="text-xl font-bold text-slate-900"
                  style={{ fontFamily: lang === 'ar' ? undefined : 'var(--font-display)' }}
                >
                  {t.seatedPlayers} ({enabledCount}/{roomConfig.maxPlayers})
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {t.configurePlayersHint}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Users size={15} />
                <span className="tabular-nums">{t.eachCash}</span>
              </div>
            </div>

            <div className="space-y-3">
              {players.map((seat) => {
                const color = PLAYER_ACCENT_COLORS[seat.playerNumber];
                const disabledByMax = seat.playerNumber > roomConfig.maxPlayers;
                return (
                  <div
                    key={seat.playerNumber}
                    className={`rounded-lg border p-4 transition-colors ${
                      seat.enabled && !disabledByMax
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-100/70 border-slate-200/70 opacity-60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: `${color}15`,
                          borderColor: `${color}40`,
                        }}
                      >
                        <TokenIcon tokenName={seat.tokenName} color={color} size={18} />
                      </div>

                      <div className="flex-1 min-w-[160px]">
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          <span className="font-semibold" style={{ color }}>
                            {t.playerLabel} {seat.playerNumber}
                          </span>
                          <span>·</span>
                          <span>{seat.isBot ? t.autoOpponent : t.humanPlayer}</span>
                        </div>
                        <input
                          type="text"
                          disabled={!seat.enabled || disabledByMax}
                          value={seat.name}
                          onChange={(e) =>
                            updatePlayer(seat.playerNumber, { name: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-sm font-medium text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="w-40">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          {t.boardToken}
                        </label>
                        <select
                          disabled={!seat.enabled || disabledByMax}
                          value={seat.tokenName}
                          onChange={(e) =>
                            updatePlayer(seat.playerNumber, { tokenName: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        >
                          {AVAILABLE_TOKENS.map((tok) => (
                            <option key={tok} value={tok}>
                              {getTokenLabel(tok, lang)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 pt-4 sm:pt-0">
                        <button
                          type="button"
                          disabled={!seat.enabled || disabledByMax}
                          onClick={() =>
                            updatePlayer(seat.playerNumber, { isBot: !seat.isBot })
                          }
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                            seat.isBot
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {seat.isBot ? <Bot size={14} /> : <User size={14} />}
                          {seat.isBot ? t.aiBot : t.human}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-600">
              {t.sessionReady}: <span dir="ltr" className="font-mono font-semibold text-slate-800">{previewRoom.getSessionCode()}</span>
            </p>
            <button
              type="button"
              onClick={onStartGame}
              disabled={enabledCount < 2}
              className="px-6 py-3 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play size={16} />
              {t.startGameBtn}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
};
