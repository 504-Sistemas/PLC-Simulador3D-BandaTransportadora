// Sintetizador de audio industrial (Web Audio API) sin dependencias externas
// Genera:
// 1. Sonido de motor de banda (Q1): aceleración al encender, hum continuo y desaceleración por inercia al apagar
// 2. Alarma bitonal tipo baliza industrial (Q4)
// 3. Descarga neumática de cilindros desviadores (Q2 / Q3)

interface ActiveMotorSession {
  osc: OscillatorNode;
  oscSub: OscillatorNode;
  noise: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  masterGain: GainNode;
  stopTimer: number | null;
}

class IndustrialAudioEngine {
  private ctx: AudioContext | null = null;
  private alarmInterval: number | null = null;
  private motorSession: ActiveMotorSession | null = null;
  private isMuted = false;

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      this.stopConveyorMotor(true);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public isMotorRunning(): boolean {
    return this.motorSession !== null;
  }

  // =========================================================================
  // 1. MOTOR DE LA BANDA TRANSPORTADORA (Q1)
  // =========================================================================

  /**
   * Arranca el sonido del motor eléctrico y rodillos con rampa de aceleración suave.
   */
  public startConveyorMotor() {
    if (this.isMuted) return;

    // Si ya está sonando, cancelamos cualquier temporizador de apagado previo
    if (this.motorSession) {
      if (this.motorSession.stopTimer !== null) {
        window.clearTimeout(this.motorSession.stopTimer);
        this.motorSession.stopTimer = null;
      }
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1.1 Master gain del motor
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.09, now + 0.55);

    // 1.2 Oscilador principal (armónico de par motor a 58 Hz)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(24, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.55);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.7, now);
    osc.connect(oscGain);
    oscGain.connect(masterGain);

    // 1.3 Subarmónico (segundo armónico para el campo magnético del estator a 116 Hz)
    const oscSub = ctx.createOscillator();
    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(48, now);
    oscSub.frequency.exponentialRampToValueAtTime(116, now + 0.55);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.25, now);
    oscSub.connect(subGain);
    subGain.connect(masterGain);

    // 1.4 Ruido de fricción de banda de goma y rodillos mecánicos en continuo
    const bufferSize = ctx.sampleRate * 2.0;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, now);
    filter.frequency.exponentialRampToValueAtTime(290, now + 0.55);
    filter.Q.setValueAtTime(1.2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);

    // 1.5 Conectar al destino de audio
    masterGain.connect(ctx.destination);

    // Iniciar fuentes
    osc.start(now);
    oscSub.start(now);
    noise.start(now);

    this.motorSession = {
      osc,
      oscSub,
      noise,
      filter,
      masterGain,
      stopTimer: null,
    };
  }

  /**
   * Detiene el motor con rampa de frenado por inercia mecánica (~0.75s) o instantáneo.
   */
  public stopConveyorMotor(immediate = false) {
    if (!this.motorSession) return;

    const session = this.motorSession;
    this.motorSession = null;

    if (session.stopTimer !== null) {
      window.clearTimeout(session.stopTimer);
      session.stopTimer = null;
    }

    const ctx = this.ctx;
    if (!ctx || immediate) {
      try {
        session.osc.stop();
        session.oscSub.stop();
        session.noise.stop();
        session.masterGain.disconnect();
      } catch {
        // Ignorar si ya estaban detenidos
      }
      return;
    }

    const now = ctx.currentTime;
    const rampDuration = 0.75;

    // Rampa de desaceleración: tono cayendo y volumen a 0
    try {
      session.osc.frequency.cancelScheduledValues(now);
      session.osc.frequency.setValueAtTime(session.osc.frequency.value, now);
      session.osc.frequency.exponentialRampToValueAtTime(16, now + rampDuration);

      session.oscSub.frequency.cancelScheduledValues(now);
      session.oscSub.frequency.setValueAtTime(session.oscSub.frequency.value, now);
      session.oscSub.frequency.exponentialRampToValueAtTime(32, now + rampDuration);

      session.filter.frequency.cancelScheduledValues(now);
      session.filter.frequency.setValueAtTime(session.filter.frequency.value, now);
      session.filter.frequency.exponentialRampToValueAtTime(70, now + rampDuration);

      session.masterGain.gain.cancelScheduledValues(now);
      session.masterGain.gain.setValueAtTime(Math.max(session.masterGain.gain.value, 0.0001), now);
      session.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + rampDuration);

      session.osc.stop(now + rampDuration + 0.05);
      session.oscSub.stop(now + rampDuration + 0.05);
      session.noise.stop(now + rampDuration + 0.05);

      session.stopTimer = window.setTimeout(() => {
        try {
          session.masterGain.disconnect();
        } catch {
          // Ya desconectado
        }
      }, (rampDuration + 0.1) * 1000);
    } catch {
      // Si el contexto ya fue cerrado
    }
  }

  // =========================================================================
  // 2. ALARMA DE ATASCO / BALIZA INDUSTRIAL (Q4)
  // =========================================================================

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

  public stopAlarmSiren() {
    if (this.alarmInterval !== null) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  // =========================================================================
  // 3. PISTONES ELECTRONEUMÁTICOS (Q2 / Q3)
  // =========================================================================

  public playPneumaticPulse() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
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
