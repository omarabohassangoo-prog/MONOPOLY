import type { GameState } from './types.ts';

export function recordGameEvent(
  state: GameState,
  type: string,
  message: string,
  data?: unknown
): void {
  state.eventSequence = (state.eventSequence ?? 0) + 1;
  state.log.push({
    at: new Date().toISOString(),
    type,
    message,
    data,
  });
  if (state.log.length > 1000) {
    state.log.splice(0, state.log.length - 1000);
  }
}
