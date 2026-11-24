import { io, type Socket } from 'socket.io-client';

export type OnlineGameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type OnlinePlayerStatus = 'ACTIVE' | 'BANKRUPT' | 'LEFT';
export type OnlineTurnPhase = 'ROLL' | 'ACTION' | 'RESOLVING' | 'JAIL' | 'AUCTION' | 'TRADE' | 'FINISHED';

export interface OnlinePlayer {
  id: string;
  userId?: string;
  name: string;
  color: string;
  cash: number;
  position: number;
  status: OnlinePlayerStatus;
  jailTurns: number;
  getOutOfJailCards: number;
  hasRolledThisTurn?: boolean;
}

export interface OnlineSquare {
  id: number;
  name: string;
  type:
    | 'GO'
    | 'PROPERTY'
    | 'RAILROAD'
    | 'UTILITY'
    | 'TAX'
    | 'CHANCE'
    | 'COMMUNITY'
    | 'JAIL'
    | 'FREE_PARKING'
    | 'GO_TO_JAIL';
  price?: number;
  group?: string;
  rent?: number[];
  houseCost?: number;
  tax?: number;
}

export interface OnlineOwnedAsset {
  squareId: number;
  ownerId: string;
  houses: number;
  hotels: number;
  mortgaged: boolean;
}

export interface OnlineGameSettings {
  maxPlayers: number;
  startingCash: number;
  passGoSalary: number;
  freeParkingPot: boolean;
  auctionOnDecline: boolean;
  turnTimeoutSeconds: number;
  allowSpectators: boolean;
  ruleset: 'CLASSIC' | 'CUSTOM';
}

export interface PendingMortgageDecision {
  creditorId: string;
  squareId: number;
  fee: number;
  principal: number;
}

export interface OnlineGameState {
  id: string;
  code: string;
  status: OnlineGameStatus;
  players: OnlinePlayer[];
  currentPlayerIndex: number;
  round: number;
  board: OnlineSquare[];
  assets: OnlineOwnedAsset[];
  doublesCount: number;
  turnPhase: OnlineTurnPhase;
  winnerId?: string;
  version: number;
  eventSequence: number;
  settings: OnlineGameSettings;
  log: { at: string; type: string; message: string; data?: unknown }[];
  pendingAuction?: {
    squareId: number;
    highestBid: number;
    highestBidderId?: string;
    eligibleIds: string[];
    passedIds: string[];
    createdAt: string;
    expiresAt?: string;
  };
  pendingTrade?: {
    id: string;
    fromId: string;
    toId: string;
    cashFrom: number;
    cashTo: number;
    assetsFrom: number[];
    assetsTo: number[];
    expiresAt: string;
  };
  pendingDecision?: {
    kind: 'PURCHASE' | 'TAX' | 'RENT' | 'CARD';
    playerId: string;
    squareId?: number;
    amount?: number;
    creditorId?: string;
    deck?: 'CHANCE' | 'COMMUNITY';
  };
  pendingMortgageDecisions?: PendingMortgageDecision[];
  cardDecks?: {
    chanceCount: number;
    communityCount: number;
    chanceDiscardCount: number;
    communityDiscardCount: number;
  };
  freeParkingPot?: number;
  bankBuildings?: {
    housesRemaining: number;
    hotelsRemaining: number;
  };
  lastDice?: {
    die1: number;
    die2: number;
    total: number;
    isDouble: boolean;
  };
  turnStartedAt?: string;
  turnExpiresAt?: string;
}

export interface OpenRoomSummary {
  id: string;
  code: string;
  status: string;
  maxPlayers: number;
  freeParkingPot: boolean;
  allowSpectators?: boolean;
  createdAt: string;
  players: { displayName: string; color: string; status: string }[];
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface PresenceInfo {
  onlinePlayerIds: string[];
  spectatorCount: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  at: string;
}

export interface TransactionRecord {
  id: string;
  gameId: string;
  actorId: string | null;
  type: string;
  amount: number;
  details: { eventType?: string; message?: string; at?: string };
  createdAt: string;
}

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string | null;
    playerToken?: string | null;
    includeActionId?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }
  if (options.playerToken) {
    headers['x-player-token'] = options.playerToken;
  }
  if (options.includeActionId) {
    headers['x-action-id'] = crypto.randomUUID();
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(
      String(data?.error ?? 'REQUEST_FAILED'),
      String(data?.message ?? data?.error ?? `HTTP ${res.status}`),
      res.status
    );
  }
  return data as T;
}

export const manopolyApi = {
  register(payload: { email: string; username: string; password: string }) {
    return requestJson<{ user: AuthUser; accessToken: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: payload,
      }
    );
  },

  login(payload: { login: string; password: string }) {
    return requestJson<{ user: AuthUser; accessToken: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: payload,
      }
    );
  },

  getMe(accessToken: string) {
    return requestJson<{ user: AuthUser }>('/api/auth/me', { accessToken });
  },

  refreshSession() {
    return requestJson<{ user: AuthUser; accessToken: string }>('/api/auth/refresh', {
      method: 'POST',
    });
  },

  logout() {
    return requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: {},
    });
  },

  listOpenRooms() {
    return requestJson<{
      games: OpenRoomSummary[];
      activeSpectatableGames: OpenRoomSummary[];
    }>('/api/games');
  },

  createRoom(
    payload: {
      name: string;
      settings?: {
        maxPlayers?: number;
        freeParkingPot?: boolean;
        auctionOnDecline?: boolean;
        allowSpectators?: boolean;
      };
    },
    accessToken?: string | null
  ) {
    return requestJson<{ game: OnlineGameState; player: { id: string; token: string } }>(
      '/api/games',
      {
        method: 'POST',
        body: payload,
        accessToken,
      }
    );
  },

  joinRoom(gameIdOrCode: string, name: string, accessToken?: string | null) {
    return requestJson<{ game: OnlineGameState; player: { id: string; token: string } }>(
      `/api/games/${encodeURIComponent(gameIdOrCode)}/join`,
      {
        method: 'POST',
        body: { name },
        accessToken,
      }
    );
  },

  getGame(gameId: string, playerToken?: string | null) {
    return requestJson<{ game: OnlineGameState }>(`/api/games/${encodeURIComponent(gameId)}`, {
      playerToken,
    });
  },

  listTransactions(gameId: string, playerToken?: string | null) {
    return requestJson<{ transactions: TransactionRecord[] }>(
      `/api/games/${encodeURIComponent(gameId)}/transactions`,
      { playerToken }
    );
  },

  leaveGame(gameId: string, playerToken: string) {
    return this.mutate(gameId, 'leave', playerToken, {});
  },

  resolveMortgage(
    gameId: string,
    playerToken: string,
    squareId: number,
    unmortgageNow: boolean
  ) {
    return this.mutate(gameId, 'resolve-mortgage', playerToken, {
      squareId,
      unmortgageNow,
    });
  },

  mutate(
    gameId: string,
    action: string,
    playerToken: string,
    body?: unknown
  ): Promise<{ result: unknown; state: OnlineGameState }> {
    return requestJson<{ result: unknown; state: OnlineGameState }>(
      `/api/games/${encodeURIComponent(gameId)}/${action}`,
      {
        method: 'POST',
        body: body ?? {},
        playerToken,
        includeActionId: true,
      }
    );
  },
};

export interface GameSocketHandle {
  disconnect: () => void;
  sendChat: (text: string) => Promise<boolean>;
}

export function connectGameSocket(
  gameId: string,
  playerToken: string | null,
  onState: (state: OnlineGameState) => void,
  onStatus?: (connected: boolean, err?: string) => void,
  onPresence?: (presence: PresenceInfo) => void,
  onChat?: (msg: ChatMessage) => void
): GameSocketHandle {
  const socket: Socket = io({
    auth: playerToken ? { playerToken } : {},
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    const event = playerToken ? 'game:join' : 'game:spectate';
    socket.emit(event, { gameId }, (ack: { ok?: boolean; error?: string }) => {
      if (ack?.ok) {
        onStatus?.(true);
      } else {
        onStatus?.(false, ack?.error ?? 'JOIN_FAILED');
      }
    });
  });

  socket.on('connect_error', (err) => {
    onStatus?.(false, err.message);
  });

  socket.on('disconnect', () => {
    onStatus?.(false);
  });

  socket.on('game:state', (state: OnlineGameState) => {
    onState(state);
  });

  socket.on('game:presence', (presence: PresenceInfo) => {
    onPresence?.(presence);
  });

  socket.on('chat:message', (msg: ChatMessage) => {
    onChat?.(msg);
  });

  return {
    disconnect: () => {
      socket.emit('game:leave');
      socket.disconnect();
    },
    sendChat: (text: string) =>
      new Promise<boolean>((resolve) => {
        socket.emit('chat:send', { text }, (ack?: { ok?: boolean }) => {
          resolve(Boolean(ack?.ok));
        });
      }),
  };
}
