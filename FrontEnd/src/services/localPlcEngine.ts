import type { ConveyorPlcState } from '../hooks/usePlcSignalR';

/**
 * Motor de emulación SoftPLC en el navegador (Web Standalone).
 * Replica con exactitud el ciclo de scan (100 ms) y la máquina de estados
 * implementada en C# (ConveyorPlcService.cs) para permitir ejecución
 * 100% autónoma en Vercel sin depender de un servidor externo.
 */
export class LocalPlcEngine {
  private state: ConveyorPlcState = {
    i1_Marcha: false,
    i2_Paro: false,
    i3_SensorPresenciaInicio: false,
    i4_SensorClasificacionA: false,
    i5_SensorClasificacionB: false,
    i6_SensorAtasco: false,

    q1_MotorBanda: false,
    q2_DesviadorCarrilA: false,
    q3_DesviadorCarrilB: false,
    q4_AlarmaAtasco: false,

    contadorCategoriaA: 0,
    contadorCategoriaB: 0,
    totalClasificadas: 0,

    tiempoMaximoTransitoSeg: 5.0,
    tiempoActualTransitoSeg: 0.0,
    tiempoPulsoDesviadorSeg: 1.0,
    tiempoActualDesviadorSeg: 0.0,

    estadoActual: 0, // Detenido
    mensajeHmi: 'Sistema detenido. Presione MARCHA (I1) para arrancar la banda.',
  };

  private timer: number | null = null;
  private readonly listeners = new Set<(state: ConveyorPlcState) => void>();
  private readonly scanCycleMs = 100;

  constructor() {
    this.start();
  }

  public subscribe(listener: (state: ConveyorPlcState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      this.step(this.scanCycleMs / 1000.0);
    }, this.scanCycleMs);
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public setInput(inputCode: string, value: boolean): void {
    const code = inputCode.toUpperCase();
    switch (code) {
      case 'I1':
        this.state.i1_Marcha = value;
        break;
      case 'I2':
        this.state.i2_Paro = value;
        break;
      case 'I3':
        this.state.i3_SensorPresenciaInicio = value;
        break;
      case 'I4':
        this.state.i4_SensorClasificacionA = value;
        break;
      case 'I5':
        this.state.i5_SensorClasificacionB = value;
        break;
      case 'I6':
        this.state.i6_SensorAtasco = value;
        break;
    }
    this.broadcast();
  }

  public resetCounters(): void {
    this.state.contadorCategoriaA = 0;
    this.state.contadorCategoriaB = 0;
    this.state.totalClasificadas = 0;
    this.broadcast();
  }

  public getState(): ConveyorPlcState {
    return { ...this.state };
  }

  private triggerJamAlarm(reason: string): void {
    this.state.estadoActual = 5; // AlarmaAtasco
    this.state.q1_MotorBanda = false;
    this.state.q2_DesviadorCarrilA = false;
    this.state.q3_DesviadorCarrilB = false;
    this.state.q4_AlarmaAtasco = true;
    this.state.mensajeHmi = reason;
  }

  private step(dt: number): void {
    // --- 1. PRIORIDAD: SENSOR DE ATASCO FÍSICO (I6) ---
    if (this.state.i6_SensorAtasco) {
      this.triggerJamAlarm('¡ALARMA (Q4)! Sensor de atasco físico (I6) activado. Banda detenida.');
      this.broadcast();
      return;
    }

    // --- 2. BOTÓN DE PARO / REARME DE ALARMA (I2) ---
    if (this.state.i2_Paro) {
      this.state.i2_Paro = false; // Consumir el pulso
      this.state.q1_MotorBanda = false;
      this.state.q2_DesviadorCarrilA = false;
      this.state.q3_DesviadorCarrilB = false;
      this.state.q4_AlarmaAtasco = false;
      this.state.tiempoActualTransitoSeg = 0;
      this.state.tiempoActualDesviadorSeg = 0;
      this.state.estadoActual = 0; // Detenido
      this.state.mensajeHmi = 'Sistema detenido y rearmado (I2). Presione MARCHA (I1).';
      this.broadcast();
      return;
    }

    // --- 3. MÁQUINA DE ESTADOS DEL PROCESO DE CLASIFICACIÓN ---
    switch (this.state.estadoActual) {
      case 0: // Detenido
        this.state.q1_MotorBanda = false;
        this.state.q2_DesviadorCarrilA = false;
        this.state.q3_DesviadorCarrilB = false;
        if (this.state.i1_Marcha) {
          this.state.i1_Marcha = false;
          this.state.estadoActual = 1; // EnMarchaEsperando
          this.state.mensajeHmi = 'Banda en movimiento (Q1). Esperando pieza en sensor de inicio (I3)...';
        }
        break;

      case 1: // EnMarchaEsperando
        this.state.q1_MotorBanda = true;
        this.state.q2_DesviadorCarrilA = false;
        this.state.q3_DesviadorCarrilB = false;
        this.state.tiempoActualTransitoSeg = 0;
        if (this.state.i3_SensorPresenciaInicio) {
          this.state.i3_SensorPresenciaInicio = false;
          this.state.estadoActual = 2; // PiezaEnTransito
          this.state.mensajeHmi = 'Pieza detectada en I3. Avanzando hacia zona de clasificación...';
        }
        break;

      case 2: // PiezaEnTransito
        this.state.q1_MotorBanda = true;
        this.state.tiempoActualTransitoSeg += dt;

        // Supervisión Watchdog TON (Superación de tiempo máximo de tránsito)
        if (this.state.tiempoActualTransitoSeg >= this.state.tiempoMaximoTransitoSeg) {
          this.triggerJamAlarm(
            `¡ALARMA DE ATASCO (Q4)! La pieza superó el tiempo máximo de tránsito (${this.state.tiempoMaximoTransitoSeg.toFixed(1)}s).`
          );
          break;
        }

        // Detección en zona A
        if (this.state.i4_SensorClasificacionA) {
          this.state.i4_SensorClasificacionA = false;
          this.state.tiempoActualTransitoSeg = 0;
          this.state.tiempoActualDesviadorSeg = 0;
          this.state.contadorCategoriaA++;
          this.state.totalClasificadas = this.state.contadorCategoriaA + this.state.contadorCategoriaB;
          this.state.estadoActual = 3; // ClasificandoCarrilA
          this.state.mensajeHmi = 'Pieza Tipo A detectada (I4). Activando cilindro desviador A (Q2)...';
        }
        // Detección en zona B
        else if (this.state.i5_SensorClasificacionB) {
          this.state.i5_SensorClasificacionB = false;
          this.state.tiempoActualTransitoSeg = 0;
          this.state.tiempoActualDesviadorSeg = 0;
          this.state.contadorCategoriaB++;
          this.state.totalClasificadas = this.state.contadorCategoriaA + this.state.contadorCategoriaB;
          this.state.estadoActual = 4; // ClasificandoCarrilB
          this.state.mensajeHmi = 'Pieza Tipo B detectada (I5). Activando cilindro desviador B (Q3)...';
        }
        break;

      case 3: // ClasificandoCarrilA
        this.state.q1_MotorBanda = true;
        this.state.q2_DesviadorCarrilA = true;
        this.state.q3_DesviadorCarrilB = false;
        this.state.tiempoActualDesviadorSeg += dt;
        if (this.state.tiempoActualDesviadorSeg >= this.state.tiempoPulsoDesviadorSeg) {
          this.state.q2_DesviadorCarrilA = false;
          this.state.estadoActual = 1; // EnMarchaEsperando
          this.state.mensajeHmi = 'Pieza A clasificada con éxito. Esperando siguiente pieza en I3...';
        }
        break;

      case 4: // ClasificandoCarrilB
        this.state.q1_MotorBanda = true;
        this.state.q2_DesviadorCarrilA = false;
        this.state.q3_DesviadorCarrilB = true;
        this.state.tiempoActualDesviadorSeg += dt;
        if (this.state.tiempoActualDesviadorSeg >= this.state.tiempoPulsoDesviadorSeg) {
          this.state.q3_DesviadorCarrilB = false;
          this.state.estadoActual = 1; // EnMarchaEsperando
          this.state.mensajeHmi = 'Pieza B clasificada con éxito. Esperando siguiente pieza en I3...';
        }
        break;

      case 5: // AlarmaAtasco
        this.state.q1_MotorBanda = false;
        this.state.q2_DesviadorCarrilA = false;
        this.state.q3_DesviadorCarrilB = false;
        this.state.q4_AlarmaAtasco = true;
        break;
    }

    this.broadcast();
  }

  private broadcast(): void {
    const snapshot: ConveyorPlcState = { ...this.state };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
