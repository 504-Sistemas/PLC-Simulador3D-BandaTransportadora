// Sintetizador de audio industrial (Web Audio API) sin dependencias externas
// Genera alarma bitonal tipo baliza industrial (Q4) y descarga neumática (Q2/Q3)

class IndustrialAudioEngine {
  private ctx: AudioContext | null = null;
  private alarmInterval: number | null = null;
  private isMuted = false;

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAlarmSiren();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Dispara un pulso bitonal de sirena industrial (880Hz -> 620Hz)
  private playSirenCycle() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(620, now + 0.22);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.setValueAtTime(0.18, now + 0.42);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.47);
  }

  // Inicia el bucle de alarma cuando Q4_AlarmaAtasco == true
  public startAlarmSiren() {
    if (this.alarmInterval !== null || this.isMuted) return;
    this.playSirenCycle();
    this.alarmInterval = window.setInterval(() => {
      if (this.isMuted) {
        this.stopAlarmSiren();
        return;
      }
      this.playSirenCycle();
    }, 520);
  }

  // Detiene inmediatamente la sirena cuando Q4_AlarmaAtasco == false
  public stopAlarmSiren() {
    if (this.alarmInterval !== null) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  // Sonido corto de electroválvula / cilindro neumático (Q2 / Q3)
  public playPneumaticPulse() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Ruido blanco filtrado para simular escape de aire comprimido + clic de solenoide
    const bufferSize = ctx.sampleRate * 0.14;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(1.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
  }
}

export const industrialAudio = new IndustrialAudioEngine();
