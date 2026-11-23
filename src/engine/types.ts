export enum TurnPhase {
  ROLL_DICE = 'ROLL_DICE',
  RESOLVE_LAND = 'RESOLVE_LAND',
  BUY_OR_AUCTION = 'BUY_OR_AUCTION',
  MANAGE_ASSETS = 'MANAGE_ASSETS',
  RESOLVE_DEBT = 'RESOLVE_DEBT',
  END_TURN = 'END_TURN',
}

export type TileKind =
  | 'GO'
  | 'PROPERTY'
  | 'RAILROAD'
  | 'UTILITY'
  | 'CHANCE'
  | 'DESTINY'
  | 'TAX'
  | 'JAIL'
  | 'FREE_PARKING'
  | 'GO_TO_JAIL';

export type CardEffectType =
  | 'COLLECT_BANK'
  | 'PAY_BANK'
  | 'PAY_FREE_PARKING'
  | 'ADVANCE_TO_TILE'
  | 'MOVE_RELATIVE'
  | 'GO_TO_JAIL'
  | 'REPAIRS'
  | 'COLLECT_FROM_PLAYERS'
  | 'PAY_EACH_PLAYER'
  | 'NEAREST_RAILROAD'
  | 'NEAREST_UTILITY'
  | 'GET_OUT_OF_JAIL_FREE';

export interface GameLogEntry {
  id: string;
  turn: number;
  playerName: string;
  playerColor: string;
  message: string;
  messageAr?: string;
  category: 'roll' | 'buy' | 'rent' | 'card' | 'build' | 'jail' | 'auction' | 'debt' | 'trade' | 'system';
  timestamp: string;
}

export interface PlayerSetupConfig {
  playerNumber: 1 | 2 | 3 | 4;
  name: string;
  tokenName: string;
  isBot: boolean;
  enabled: boolean;
}

export interface PendingTradeOffer {
  fromPlayerId: string;
  toPlayerId: string;
  offeredLandIndices: number[];
  offeredCash: number;
  offeredJailCards: number;
  requestedLandIndices: number[];
  requestedCash: number;
  requestedJailCards: number;
}
