import { useEffect, useRef, useState } from 'react';
import { Conveyor2DStage } from './components/Conveyor2DStage';
import { Conveyor3DStage } from './components/Conveyor3DStage';
import { usePlcSignalR } from './hooks/usePlcSignalR';
import type { AnimatedPiece, ViewportMode } from './types/simulation';
import { industrialAudio } from './utils/industrialAudio';
import './App.css';

const STATE_CODES: Record<number, { code: string; label: string }> = {
  0: { code: 'STAT-00', label: 'STANDBY / DETENIDO' },
  1: { code: 'RUN-10', label: 'BANDA EN MARCHA' },
  2: { code: 'TRN-20', label: 'PIEZA EN TRÁNSITO' },
  3: { code: 'ACT-31', label: 'DESVÍO CARRIL A (Q2)' },
  4: { code: 'ACT-32', label: 'DESVÍO CARRIL B (Q3)' },
  5: { code: 'ALM-99', label: 'FALLA / ATASCO ENCLAVADO' },
};

function App() {
  const { plcState, connected, mode, sendSensorSignal, resetCounters } = usePlcSignalR();
  const [piece, setPiece] = useState<AnimatedPiece | null>(null);
  const [viewMode, setViewMode] = useState<ViewportMode>('3d');
  const [audioMuted, setAudioMuted] = useState(false);
  const [clock, setClock] = useState<string>(() =>
    new Date().toLocaleTimeString('es-HN', { hour12: false })
  );

  // Sincronizar sirena de alarma industrial con la salida Q4 del PLC
  useEffect(() => {
    if (plcState?.q4_AlarmaAtasco && !audioMuted) {
      industrialAudio.startAlarmSiren();
    } else {
      industrialAudio.stopAlarmSiren();
    }
    return () => {
      industrialAudio.stopAlarmSiren();
    };
  }, [plcState?.q4_AlarmaAtasco, audioMuted]);

  // Sonido de válvula electroneumática al extender Q2 o Q3
  const prevPistonRef = useRef({ q2: false, q3: false });
  useEffect(() => {
    const q2Now = Boolean(plcState?.q2_DesviadorCarrilA);
    const q3Now = Boolean(plcState?.q3_DesviadorCarrilB);
    if ((q2Now && !prevPistonRef.current.q2) || (q3Now && !prevPistonRef.current.q3)) {
      industrialAudio.playPneumaticPulse();
    }
    prevPistonRef.current = { q2: q2Now, q3: q3Now };
  }, [plcState?.q2_DesviadorCarrilA, plcState?.q3_DesviadorCarrilB]);

  const toggleAudioMute = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    industrialAudio.setMuted(nextMuted);
  };

  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString('es-HN', { hour12: false }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const spawnPiece = (category: 'A' | 'B', willJam = false) => {
    setPiece({
      id: Date.now(),
      category,
      willJam,
      xPercent: 8,
      yOffset: 0,
      triggeredI3: false,
      triggeredClassify: false,
      sorted: false,
    });
  };

  const plcRef = useRef(plcState);
  useEffect(() => {
    plcRef.current = plcState;
  }, [plcState]);

  const hasPiece = piece !== null;

  useEffect(() => {
    if (!hasPiece) return;

    const interval = setInterval(() => {
      const currentPlc = plcRef.current;
      if (!currentPlc) return;

      setPiece((current) => {
        if (!current) return null;

        if (currentPlc.q2_DesviadorCarrilA && current.category === 'A' && !current.sorted) {
          setTimeout(() => setPiece(null), 850);
          return { ...current, yOffset: 98, sorted: true };
        }
        if (currentPlc.q3_DesviadorCarrilB && current.category === 'B' && !current.sorted) {
          setTimeout(() => setPiece(null), 850);
          return { ...current, yOffset: 98, sorted: true };
        }

        if (current.sorted) return current;
        if (!currentPlc.q1_MotorBanda) return current;
        if (current.willJam && current.xPercent >= 33) return current;

        // Mantener centrada frente al pistón mientras el ciclo de scan (<=100ms) activa Q2/Q3
        if (current.triggeredClassify) return current;

        // Velocidad 1:1 con las nervaduras de la banda (~143 px/s: 2.1s a Estación A, 3.9s a Estación B)
        const nextX = current.xPercent + 0.72;

        if (!current.triggeredI3 && nextX >= 18) {
          sendSensorSignal('I3', true);
          return { ...current, xPercent: nextX, triggeredI3: true };
        }

        if (current.category === 'A' && !current.triggeredClassify && nextX >= 48) {
          sendSensorSignal('I4', true);
          return { ...current, xPercent: 48, triggeredClassify: true };
        }

        if (current.category === 'B' && !current.triggeredClassify && nextX >= 74) {
          sendSensorSignal('I5', true);
          return { ...current, xPercent: 74, triggeredClassify: true };
        }

        if (nextX > 92) return null;
        return { ...current, xPercent: nextX };
      });
    }, 50);

    return () => clearInterval(interval);
  }, [hasPiece, sendSensorSignal]);

  const currentStateMeta = STATE_CODES[plcState?.estadoActual ?? 0] ?? STATE_CODES[0];
  const watchdogRatio = plcState
    ? Math.min(100, (plcState.tiempoActualTransitoSeg / plcState.tiempoMaximoTransitoSeg) * 100)
    : 0;

  const sensorI3Active = Boolean(piece && Math.abs(piece.xPercent - 18) < 4.5);
  const sensorI4Active = Boolean(
    plcState?.q2_DesviadorCarrilA ||
      (piece && piece.category === 'A' && Math.abs(piece.xPercent - 48) < 3.5)
  );
  const sensorI5Active = Boolean(
    plcState?.q3_DesviadorCarrilB ||
      (piece && piece.category === 'B' && Math.abs(piece.xPercent - 74) < 3.5)
  );

  return (
    <div className="hmi-shell">
      {/* BARRA SUPERIOR SIEMENS SIMATIC */}
      <header className="simatic-topbar">
        <div className="brand-cluster">
          <div className="siemens-logo-badge">SIEMENS // SIMATIC HMI</div>
          <div className="station-title-block">
            <h1>STN-02: Línea de Clasificación Selectiva por Banda</h1>
            <div className="station-subtitle">
              <span>CPU: LOGO! 24CE (6ED1052-1CC08-0BA1)</span>
              <span>|</span>
              <span>CICLO SCAN: 100 ms</span>
              <span>|</span>
              <span>DISEÑO DIGITAL — PROYECTO 02</span>
            </div>
          </div>
        </div>

        <div className="telemetry-cluster">
          <div className="plc-mode-module">
            <span
              className={`mode-led ${
                plcState?.q4_AlarmaAtasco
                  ? 'fault'
                  : plcState?.q1_MotorBanda
                  ? 'run'
                  : 'stop'
              }`}
            />
            <span>
              MODO CPU:{' '}
              <strong>
                {plcState?.q4_AlarmaAtasco
                  ? 'FAULT / STOP'
                  : plcState?.q1_MotorBanda
                  ? 'RUN'
                  : 'STOP'}
              </strong>
            </span>
          </div>

          <div
            className={`comm-badge ${
              !connected ? 'offline' : mode === 'signalr' ? 'online' : 'standalone'
            }`}
          >
            <span>
              {!connected
                ? 'PLC LINK OFFLINE'
                : mode === 'signalr'
                ? 'PROFINET / WS :5000 ONLINE'
                : 'WEB SOFTPLC AUTÓNOMO'}
            </span>
          </div>

          <button
            type="button"
            className={`audio-toggle-btn ${audioMuted ? 'muted' : 'active'}`}
            onClick={toggleAudioMute}
          >
            {audioMuted ? 'AUDIO H1: SILENCIADO' : 'AUDIO H1: HABILITADO'}
          </button>

          <div className="plc-mode-module">
            <span>SYS TIME: {clock}</span>
          </div>
        </div>
      </header>

      <main className="hmi-workspace">
        {/* BARRA ANUNCIADORA ISA-101 Y SUPERVISIÓN WATCHDOG */}
        <section className={`annunciator-bar ${plcState?.q4_AlarmaAtasco ? 'alarm-active' : ''}`}>
          <div className="annunciator-code">
            {currentStateMeta.code} // {currentStateMeta.label}
          </div>
          <div className="annunciator-message">
            {plcState?.mensajeHmi ?? 'Inicializando enlace de telemetría con controlador SoftPLC...'}
          </div>
          <div className="watchdog-telemetry">
            <span>TON B001 [WATCHDOG TRÁNSITO]:</span>
            <div className="watchdog-meter">
              <div
                className={`watchdog-fill ${
                  watchdogRatio >= 95 ? 'crit' : watchdogRatio >= 65 ? 'warn' : ''
                }`}
                style={{ width: `${watchdogRatio}%` }}
              />
            </div>
            <strong>
              {plcState
                ? `${plcState.tiempoActualTransitoSeg.toFixed(1)}s / ${plcState.tiempoMaximoTransitoSeg.toFixed(1)}s`
                : '0.0s / 5.0s'}
            </strong>
          </div>
        </section>

        {/* GEMELO DIGITAL 3D + SINÓPTICO P&ID 2D */}
        <section className="synoptic-panel">
          <div className="panel-header-strip">
            <div className="panel-header-title">
              <span className="panel-index-tag">GEMELO DIGITAL // BANDA-01</span>
              <span>Planta Industrial 3D &amp; Sinóptico P&amp;ID 2D</span>
            </div>

            <div className="view-mode-switch" role="group" aria-label="Selector de visualización">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === '3d' ? 'active' : ''}`}
                onClick={() => setViewMode('3d')}
              >
                VISTA 3D
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === '2d' ? 'active' : ''}`}
                onClick={() => setViewMode('2d')}
              >
                SINÓPTICO 2D
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'dual' ? 'active' : ''}`}
                onClick={() => setViewMode('dual')}
              >
                DUAL 3D+2D
              </button>
            </div>

            <div className="feeder-controls">
              <span className="feeder-label">Alimentador de Línea:</span>
              <button
                className="ind-action-btn lot-a"
                disabled={!plcState?.q1_MotorBanda || piece !== null}
                onClick={() => spawnPiece('A', false)}
              >
                [INYECTAR LOTE A] Metálica / Alta
              </button>
              <button
                className="ind-action-btn lot-b"
                disabled={!plcState?.q1_MotorBanda || piece !== null}
                onClick={() => spawnPiece('B', false)}
              >
                [INYECTAR LOTE B] Polímero / Baja
              </button>
              <button
                className="ind-action-btn jam-sim"
                disabled={!plcState?.q1_MotorBanda || piece !== null}
                onClick={() => spawnPiece('A', true)}
              >
                [ENSAYO FALLA] Obstrucción en Banda
              </button>
              {piece && (
                <button className="ind-action-btn" onClick={() => setPiece(null)}>
                  [PURGAR PIEZA]
                </button>
              )}
            </div>
          </div>

          {(viewMode === '3d' || viewMode === 'dual') && (
            <Conveyor3DStage
              plcState={plcState}
              piece={piece}
              sensorI3Active={sensorI3Active}
              sensorI4Active={sensorI4Active}
              sensorI5Active={sensorI5Active}
            />
          )}

          {(viewMode === '2d' || viewMode === 'dual') && (
            <Conveyor2DStage
              plcState={plcState}
              piece={piece}
              sensorI3Active={sensorI3Active}
              sensorI4Active={sensorI4Active}
              sensorI5Active={sensorI5Active}
            />
          )}
        </section>

        {/* RACK INFERIOR DE 3 MÓDULOS INDUSTRIALES */}
        <section className="control-rack-grid">
          {/* MÓDULO 1: ESTACIÓN DE OPERADOR IEC 60947 */}
          <div className="rack-module">
            <div className="panel-header-strip">
              <div className="panel-header-title">
                <span className="panel-index-tag">PUPITRE OP-01</span>
                <span>Botonera de Mando y Simulación I/O</span>
              </div>
            </div>
            <div className="rack-body">
              <div className="iec-station-grid">
                <button
                  className="iec-pushbutton start-green"
                  onClick={() => sendSensorSignal('I1', true)}
                >
                  <span className="btn-symbol">[ I ]</span>
                  <span className="btn-title">MARCHA LÍNEA</span>
                  <span className="btn-addr">ENTRADA DIGITAL I1 (NA)</span>
                </button>

                <button
                  className="iec-pushbutton stop-red"
                  onClick={() => {
                    sendSensorSignal('I6', false);
                    sendSensorSignal('I2', true);
                    setPiece(null);
                  }}
                >
                  <span className="btn-symbol">[ O ]</span>
                  <span className="btn-title">PARO / REARME</span>
                  <span className="btn-addr">ENTRADA DIGITAL I2 (NC)</span>
                </button>

                <button
                  className={`iec-pushbutton fault-amber ${plcState?.i6_SensorAtasco ? 'latched' : ''}`}
                  onClick={() => sendSensorSignal('I6', !plcState?.i6_SensorAtasco)}
                >
                  <span className="btn-title">
                    {plcState?.i6_SensorAtasco ? 'LIBERAR ATASCO' : 'FORZAR ATASCO'}
                  </span>
                  <span className="btn-addr">SENSOR DE FALLA I6</span>
                </button>

                <button className="iec-pushbutton util-steel" onClick={resetCounters}>
                  <span className="btn-title">RESET LOTE</span>
                  <span className="btn-addr">CONTADORES B003/B004 = 0</span>
                </button>
              </div>

              <div className="commissioning-strip">
                <div className="strip-caption">
                  Forzado de Señales de Campo (Modo Comisionamiento Manual):
                </div>
                <div className="pulse-grid">
                  <button
                    className="terminal-pulse-btn"
                    onClick={() => sendSensorSignal('I3', true)}
                  >
                    PULSO I3 [INICIO]
                  </button>
                  <button
                    className="terminal-pulse-btn"
                    onClick={() => sendSensorSignal('I4', true)}
                  >
                    PULSO I4 [CAT-A]
                  </button>
                  <button
                    className="terminal-pulse-btn"
                    onClick={() => sendSensorSignal('I5', true)}
                  >
                    PULSO I5 [CAT-B]
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* MÓDULO 2: BORNERA DE ENTRADAS Y SALIDAS DEL PLC */}
          <div className="rack-module">
            <div className="panel-header-strip">
              <div className="panel-header-title">
                <span className="panel-index-tag">MÓDULO DIO</span>
                <span>Bornera 24VDC Entradas (I) / Salidas a Relé (Q)</span>
              </div>
            </div>
            <div className="rack-body">
              <div className="terminal-block-strip">
                <div className="terminal-pin">
                  <span>DI I1</span>
                  <div className={`pin-led ${plcState?.q1_MotorBanda ? 'high' : ''}`} />
                  <span>START</span>
                </div>
                <div className="terminal-pin">
                  <span>DI I2</span>
                  <div
                    className={`pin-led ${
                      !plcState?.q1_MotorBanda && !plcState?.q4_AlarmaAtasco ? 'high' : ''
                    }`}
                  />
                  <span>STOP</span>
                </div>
                <div className="terminal-pin">
                  <span>DI I3</span>
                  <div
                    className={`pin-led ${
                      sensorI3Active || plcState?.estadoActual === 2 ? 'high' : ''
                    }`}
                  />
                  <span>PRES</span>
                </div>
                <div className="terminal-pin">
                  <span>DI I4</span>
                  <div className={`pin-led ${sensorI4Active ? 'high' : ''}`} />
                  <span>CAT-A</span>
                </div>
                <div className="terminal-pin">
                  <span>DI I5</span>
                  <div className={`pin-led ${sensorI5Active ? 'high' : ''}`} />
                  <span>CAT-B</span>
                </div>
                <div className="terminal-pin">
                  <span>DI I6</span>
                  <div className={`pin-led ${plcState?.i6_SensorAtasco ? 'high-alarm' : ''}`} />
                  <span>FAULT</span>
                </div>
              </div>

              <table className="io-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Designación de Actuador</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>DO Q1</td>
                    <td>Contactor Motor Banda (M1)</td>
                    <td>
                      <span
                        className={`state-pill ${
                          plcState?.q1_MotorBanda ? 'energized' : 'deenergized'
                        }`}
                      >
                        {plcState?.q1_MotorBanda ? 'ENERGIZADO [1]' : 'ABIERTO [0]'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>DO Q2</td>
                    <td>Solenoide Desviador A (Y1)</td>
                    <td>
                      <span
                        className={`state-pill ${
                          plcState?.q2_DesviadorCarrilA ? 'energized' : 'deenergized'
                        }`}
                      >
                        {plcState?.q2_DesviadorCarrilA ? 'EXTENDIDO [1]' : 'RETRAÍDO [0]'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>DO Q3</td>
                    <td>Solenoide Desviador B (Y2)</td>
                    <td>
                      <span
                        className={`state-pill ${
                          plcState?.q3_DesviadorCarrilB ? 'energized' : 'deenergized'
                        }`}
                      >
                        {plcState?.q3_DesviadorCarrilB ? 'EXTENDIDO [1]' : 'RETRAÍDO [0]'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>DO Q4</td>
                    <td>Baliza / Sirena de Atasco (H1)</td>
                    <td>
                      <span
                        className={`state-pill ${
                          plcState?.q4_AlarmaAtasco ? 'tripped' : 'deenergized'
                        }`}
                      >
                        {plcState?.q4_AlarmaAtasco ? 'ALARMA ACTIVA [1]' : 'NORMAL [0]'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* MÓDULO 3: PARÁMETROS INTERNOS DE BLOQUES FBD */}
          <div className="rack-module">
            <div className="panel-header-strip">
              <div className="panel-header-title">
                <span className="panel-index-tag">MEMORIA FBD</span>
                <span>Temporizadores TON y Contadores de Lote</span>
              </div>
            </div>
            <div className="rack-body">
              <div className="fbd-block-list">
                <div className="fbd-card">
                  <div className="fbd-card-header">
                    <span>BLOQUE B001 // TON WATCHDOG TRÁNSITO</span>
                    <span>RET. CONEXIÓN</span>
                  </div>
                  <div className="fbd-card-metrics">
                    <span>PREAJUSTE (PT): 5.00 s</span>
                    <span>
                      ACTUAL (ET):{' '}
                      <span className="fbd-val">
                        {(plcState?.tiempoActualTransitoSeg ?? 0).toFixed(2)} s
                      </span>
                    </span>
                  </div>
                </div>

                <div className="fbd-card">
                  <div className="fbd-card-header">
                    <span>BLOQUE B002 // TON PULSO NEUMÁTICO</span>
                    <span>RET. CONEXIÓN</span>
                  </div>
                  <div className="fbd-card-metrics">
                    <span>PREAJUSTE (PT): 1.00 s</span>
                    <span>
                      ACTUAL (ET):{' '}
                      <span className="fbd-val">
                        {(plcState?.tiempoActualDesviadorSeg ?? 0).toFixed(2)} s
                      </span>
                    </span>
                  </div>
                </div>

                <div className="fbd-card">
                  <div className="fbd-card-header">
                    <span>BLOQUE B003 // CONTADOR CATEGORÍA A</span>
                    <span>UP/DOWN CNT</span>
                  </div>
                  <div className="fbd-card-metrics">
                    <span>SENSOR ASOCIADO: I4</span>
                    <span>
                      CONTEO (CNT):{' '}
                      <span className="fbd-val">{plcState?.contadorCategoriaA ?? 0} Pzas</span>
                    </span>
                  </div>
                </div>

                <div className="fbd-card">
                  <div className="fbd-card-header">
                    <span>BLOQUE B004 // CONTADOR CATEGORÍA B</span>
                    <span>UP/DOWN CNT</span>
                  </div>
                  <div className="fbd-card-metrics">
                    <span>SENSOR ASOCIADO: I5</span>
                    <span>
                      CONTEO (CNT):{' '}
                      <span className="fbd-val">{plcState?.contadorCategoriaB ?? 0} Pzas</span>
                    </span>
                  </div>
                </div>

                <div className="fbd-card">
                  <div className="fbd-card-header">
                    <span>RENDIMIENTO ACUMULADO DE LÍNEA</span>
                    <span>TOTAL TURNO</span>
                  </div>
                  <div className="fbd-card-metrics">
                    <span>PIEZAS PROCESADAS:</span>
                    <span className="fbd-val">{plcState?.totalClasificadas ?? 0} Unidades</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
