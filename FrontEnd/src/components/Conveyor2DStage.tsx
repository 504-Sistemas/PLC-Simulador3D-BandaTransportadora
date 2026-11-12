import type { ConveyorPlcState } from '../hooks/usePlcSignalR';
import type { AnimatedPiece } from '../types/simulation';

interface Conveyor2DStageProps {
  plcState: ConveyorPlcState | null;
  piece: AnimatedPiece | null;
  sensorI3Active: boolean;
  sensorI4Active: boolean;
  sensorI5Active: boolean;
}

function formatCounter(val: number): string {
  return String(val).padStart(4, '0');
}

export function Conveyor2DStage({
  plcState,
  piece,
  sensorI3Active,
  sensorI4Active,
  sensorI5Active,
}: Conveyor2DStageProps) {
  return (
    <div className="cad-viewport">
      <div className="cad-scale-ruler">
        <span>X: 0 mm [ZONA CARGA]</span>
        <span>X: 450 mm [B1 / I3]</span>
        <span>X: 1150 mm [ESTACIÓN A / I4 / Q2]</span>
        <span>X: 1800 mm [ESTACIÓN B / I5 / Q3]</span>
        <span>X: 2400 mm [COLA]</span>
      </div>

      {/* Haces de luz óptica de los sensores */}
      <div className={`laser-beam ${sensorI3Active ? 'tripped' : ''}`} style={{ left: '18%' }} />
      <div className={`laser-beam ${sensorI4Active ? 'tripped' : ''}`} style={{ left: '48%' }} />
      <div className={`laser-beam ${sensorI5Active ? 'tripped' : ''}`} style={{ left: '74%' }} />

      {/* Actuador Neumático A (Q2) */}
      <div className="pneumatic-actuator" style={{ left: 'calc(48% - 74px)' }}>
        <div className={`cylinder-housing ${plcState?.q2_DesviadorCarrilA ? 'energized' : ''}`}>
          <span className="cyl-tag">CILINDRO Y1 [Q2]</span>
          <span className="cyl-sub">FESTO DSNU-25 // CAT-A</span>
        </div>
        <div className={`piston-shaft ${plcState?.q2_DesviadorCarrilA ? 'extended' : ''}`} />
        <div className="pusher-blade" />
      </div>

      {/* Actuador Neumático B (Q3) */}
      <div className="pneumatic-actuator" style={{ left: 'calc(74% - 74px)' }}>
        <div className={`cylinder-housing ${plcState?.q3_DesviadorCarrilB ? 'energized' : ''}`}>
          <span className="cyl-tag">CILINDRO Y2 [Q3]</span>
          <span className="cyl-sub">FESTO DSNU-25 // CAT-B</span>
        </div>
        <div className={`piston-shaft ${plcState?.q3_DesviadorCarrilB ? 'extended' : ''}`} />
        <div className="pusher-blade" />
      </div>

      {/* Motor Motriz Izquierdo (M1 / Q1) */}
      <div className="roller-housing drive-left">
        <div className={`roller-wheel ${plcState?.q1_MotorBanda ? 'spinning' : ''}`} />
        <span className="motor-tag">M1 [Q1]</span>
      </div>

      {/* Rodillo Tensor Derecho */}
      <div className="roller-housing idler-right">
        <div className={`roller-wheel ${plcState?.q1_MotorBanda ? 'spinning' : ''}`} />
        <span className="motor-tag">IDLER</span>
      </div>

      {/* Estructura de la Banda Transportadora */}
      <div className="conveyor-frame">
        <div className={`belt-surface ${plcState?.q1_MotorBanda ? 'running' : ''}`} />
      </div>

      {/* Pieza Industrial en Tránsito */}
      {piece && (
        <div
          className={`industrial-part cat-${piece.category} ${
            piece.willJam && piece.xPercent >= 33 ? 'jammed' : ''
          }`}
          style={{
            left: `calc(${piece.xPercent}% - 27px)`,
            top: `${145 + piece.yOffset}px`,
          }}
        >
          <span className="part-code">
            {piece.willJam && piece.xPercent >= 33 ? 'ERR-JAM' : `LOTE-${piece.category}`}
          </span>
          <span className="part-spec">
            {piece.category === 'A' ? 'METAL 80mm' : 'POLY 50mm'}
          </span>
        </div>
      )}

      {/* Sensores Fotoeléctricos Inferiores */}
      <div className="photo-sensor" style={{ left: '18%' }}>
        <span className={`sensor-lamp ${sensorI3Active ? 'on' : ''}`} />
        <span>B1 [I3: INICIO]</span>
      </div>

      <div className="photo-sensor" style={{ left: '48%' }}>
        <span className={`sensor-lamp ${sensorI4Active ? 'on' : ''}`} />
        <span>B2 [I4: DETECTOR A]</span>
      </div>

      <div className="photo-sensor" style={{ left: '74%' }}>
        <span className={`sensor-lamp ${sensorI5Active ? 'on' : ''}`} />
        <span>B3 [I5: DETECTOR B]</span>
      </div>

      {/* Tolva / Carril de Descarga A */}
      <div className="discharge-chute chute-a" style={{ left: 'calc(48% - 98px)' }}>
        <div className="chute-header">
          <span>COLECTOR 01 // CAT-A</span>
          <span>B003</span>
        </div>
        <div className="lcd-counter-display">
          <span className="lcd-label">UNIDADES</span>
          <span className="lcd-digits">{formatCounter(plcState?.contadorCategoriaA ?? 0)}</span>
        </div>
      </div>

      {/* Tolva / Carril de Descarga B */}
      <div className="discharge-chute chute-b" style={{ left: 'calc(74% - 98px)' }}>
        <div className="chute-header">
          <span>COLECTOR 02 // CAT-B</span>
          <span>B004</span>
        </div>
        <div className="lcd-counter-display">
          <span className="lcd-label">UNIDADES</span>
          <span className="lcd-digits">{formatCounter(plcState?.contadorCategoriaB ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}
