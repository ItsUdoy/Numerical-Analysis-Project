// ============================================================================
// WEB AUDIO SYNTHESIZER UTILITY FOR SMART WATER TANK SCADA (ZERO-DEPENDENCY)
// ============================================================================

class SoundManager {
  private ctx: AudioContext | null = null;
  private pumpOsc: OscillatorNode | null = null;
  private pumpGain: GainNode | null = null;
  private isMuted: boolean = true; // Default muted for smooth user onboarding

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.pumpGain && this.ctx) {
      this.pumpGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    return !this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  // Crisp micro-click for UI buttons
  public playClick() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {
      // AudioContext policy fallback
    }
  }

  // Alert sonic beep when threshold is hit
  public playAlertBeep(isWarning: boolean = false) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isWarning ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isWarning ? 750 : 1050, this.ctx.currentTime);
      osc.frequency.setValueAtTime(isWarning ? 950 : 1350, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch {}
  }

  // Pleasant success chime
  public playSuccess() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, this.ctx.currentTime + 0.16); // G5
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch {}
  }

  // Soft ambient low-frequency pump hum when pump is running
  public updatePumpSound(pumpRunning: boolean) {
    if (this.isMuted || !pumpRunning) {
      if (this.pumpGain && this.ctx) {
        this.pumpGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      return;
    }

    try {
      this.initCtx();
      if (!this.ctx) return;

      if (!this.pumpOsc) {
        this.pumpOsc = this.ctx.createOscillator();
        this.pumpGain = this.ctx.createGain();
        this.pumpOsc.type = 'triangle';
        this.pumpOsc.frequency.setValueAtTime(65, this.ctx.currentTime); // 65 Hz gentle hum
        this.pumpGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.pumpOsc.connect(this.pumpGain);
        this.pumpGain.connect(this.ctx.destination);
        this.pumpOsc.start();
      }

      if (this.pumpGain && this.ctx) {
        this.pumpGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      }
    } catch {}
  }
}

export const soundFx = new SoundManager();
