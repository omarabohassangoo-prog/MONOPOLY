export type GameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type PlayerStatus = 'ACTIVE' | 'BANKRUPT' | 'LEFT';
export type PropertyKind = 'PROPERTY' | 'RAILROAD' | 'UTILITY';
export type TurnPhase = 'ROLL' | 'ACTION' | 'RESOLVING' | 'JAIL' | 'AUCTION' | 'TRADE' | 'FINISHED';

export interface Player {
  id: string;
  userId?: string;
  name: string;
  token: string;
  color: string;
  cash: number;
  position: number;
  status: PlayerStatus;
  jailTurns: number;
  getOutOfJailCards: number;
  jailCardDecks?: ('CHANCE' | 'COMMUNITY')[];
  hasRolledThisTurn?: boolean;
}

export interface Square {
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

export interface OwnedAsset {
  squareId: number;
  ownerId: string;
  houses: number;
  hotels: number;
  mortgaged: boolean;
}

export interface GameSettings {
  maxPlayers: number;
  startingCash: number;
  passGoSalary: number;
  freeParkingPot: boolean;
  auctionOnDecline: boolean;
  turnTimeoutSeconds: number;
  allowSpectators: boolean;
  ruleset: 'CLASSIC' | 'CUSTOM';
}

export interface Card {
  id: string;
  type:
    | 'CASH'
    | 'MOVE'
    | 'JAIL'
    | 'REPAIRS'
    | 'GET_OUT_OF_JAIL'
    | 'MOVE_NEXT_RAILROAD'
    | 'MOVE_NEXT_UTILITY'
    | 'BACK_THREE'
    | 'PAY_EACH_PLAYER'
    | 'COLLECT_EACH_PLAYER';
  amount?: number;
  position?: number;
  message: string;
}

export interface PendingMortgageDecision {
  creditorId: string;
  squareId: number;
  fee: number;
  principal: number;
}

export interface GameState {
  id: string;
  code: string;
  status: GameStatus;
  players: Player[];
  currentPlayerIndex: number;
  round: number;
  board: Square[];
  assets: OwnedAsset[];
  doublesCount: number;
  turnPhase: TurnPhase;
  winnerId?: string;
  version: number;
  eventSequence: number;
  processedActionIds: string[];
  settings: GameSettings;
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
    chance: Card[];
    community: Card[];
    chanceDiscard: Card[];
    communityDiscard: Card[];
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
