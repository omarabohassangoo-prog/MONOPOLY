class SoundEffects {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.08, delay = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public diceRoll(): void {
    this.playTone(220, 0.06, 'triangle', 0.06, 0);
    this.playTone(290, 0.06, 'triangle', 0.05, 0.06);
    this.playTone(340, 0.08, 'triangle', 0.06, 0.12);
  }

  public cashChime(): void {
    this.playTone(660, 0.12, 'sine', 0.07, 0);
    this.playTone(880, 0.18, 'sine', 0.07, 0.08);
  }

  public buildThud(): void {
    this.playTone(180, 0.09, 'triangle', 0.09, 0);
    this.playTone(260, 0.11, 'sine', 0.06, 0.06);
  }

  public cardFlip(): void {
    this.playTone(440, 0.08, 'sine', 0.05, 0);
    this.playTone(554, 0.12, 'sine', 0.05, 0.05);
  }

  public alertWarning(): void {
    this.playTone(280, 0.14, 'sawtooth', 0.04, 0);
    this.playTone(220, 0.2, 'sawtooth', 0.04, 0.12);
  }

  public victoryFanfare(): void {
    this.playTone(523.25, 0.14, 'triangle', 0.08, 0);
    this.playTone(659.25, 0.14, 'triangle', 0.08, 0.12);
    this.playTone(783.99, 0.14, 'triangle', 0.08, 0.24);
    this.playTone(1046.5, 0.35, 'triangle', 0.1, 0.36);
  }
}

export const soundFX = new SoundEffects();
