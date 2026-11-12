import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ConveyorPlcState } from '../hooks/usePlcSignalR';
import type { AnimatedPiece } from '../types/simulation';

interface Conveyor3DStageProps {
  plcState: ConveyorPlcState | null;
  piece: AnimatedPiece | null;
  sensorI3Active: boolean;
  sensorI4Active: boolean;
  sensorI5Active: boolean;
}

type CameraPreset = 'iso' | 'top' | 'front' | 'diverters';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  iso: { pos: [1.2, 5.9, 10.8], target: [0.0, 0.75, 0.85], label: 'ISO 3/4' },
  top: { pos: [0.0, 12.2, 1.2], target: [0.0, 0.7, 0.8], label: 'PLANTA' },
  front: { pos: [0.0, 2.5, 11.4], target: [0.0, 0.95, 0.4], label: 'FRONTAL' },
  diverters: { pos: [1.3, 3.6, 6.2], target: [1.2, 0.9, 0.95], label: 'ESTACIÓN A/B' },
};

// Mapea xPercent (0..100) al eje X mundial de Three.js (-6.0..+6.0)
function percentToWorldX(percent: number): number {
  return ((percent - 50) / 50) * 6.0;
}

function createBeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#141920';
    ctx.fillRect(0, 0, 256, 256);

    // Pista central con ligero desgaste de rodaje
    ctx.fillStyle = '#1a222c';
    ctx.fillRect(0, 32, 256, 192);

    // Nervaduras transversales de tracción
    ctx.fillStyle = '#283342';
    ctx.fillRect(0, 0, 24, 256);
    ctx.fillRect(128, 0, 24, 256);

    // Borde iluminado sutil en cada nervadura para lectura clara del movimiento
    ctx.fillStyle = '#384659';
    ctx.fillRect(22, 0, 4, 256);
    ctx.fillRect(150, 0, 4, 256);

    // Guías laterales de caucho
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 256, 14);
    ctx.fillRect(0, 242, 256, 14);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(16, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#eab308';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#111827';
    for (let i = -128; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i - 112, 128);
      ctx.lineTo(i - 128, 128);
      ctx.closePath();
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStationSignTexture(title: string, subtitle: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 152);

    ctx.fillStyle = accent;
    ctx.fillRect(8, 8, 496, 36);

    ctx.fillStyle = '#090b0e';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(title, 22, 33);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(subtitle, 22, 106);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface CylinderAssembly {
  rodAndPlate: THREE.Group;
  housingMat: THREE.MeshStandardMaterial;
  extension: number;
}

interface SensorAssembly {
  ledMat: THREE.MeshStandardMaterial;
  beamMat: THREE.MeshBasicMaterial;
}

export function Conveyor3DStage({
  plcState,
  piece,
  sensorI3Active,
  sensorI4Active,
  sensorI5Active,
}: Conveyor3DStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPreset>('iso');

  // Refs para leer el último estado del PLC y pieza a 60 FPS sin recrear la escena WebGL
  const plcRef = useRef(plcState);
  const pieceRef = useRef(piece);
  const sensorsRef = useRef({ i3: sensorI3Active, i4: sensorI4Active, i5: sensorI5Active });
  const cameraMoveRef = useRef<((preset: CameraPreset) => void) | null>(null);

  useEffect(() => {
    plcRef.current = plcState;
  }, [plcState]);

  useEffect(() => {
    pieceRef.current = piece;
  }, [piece]);

  useEffect(() => {
    sensorsRef.current = { i3: sensorI3Active, i4: sensorI4Active, i5: sensorI5Active };
  }, [sensorI3Active, sensorI4Active, sensorI5Active]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 420;

    // 1. Escena, Cámara y Renderizador WebGL
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b0f);
    scene.fog = new THREE.FogExp2(0x080b0f, 0.022);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.iso.pos);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute(
      'aria-label',
      'Gemelo digital 3D de la banda transportadora clasificadora con actuadores neumáticos y sensores'
    );
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.iso.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 4.2;
    controls.maxDistance = 19;
    controls.update();

    cameraMoveRef.current = (preset: CameraPreset) => {
      const cfg = CAMERA_PRESETS[preset];
      camera.position.set(...cfg.pos);
      controls.target.set(...cfg.target);
      controls.update();
    };

    // Recursos rastreados para liberación limpia en StrictMode / unmount
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(res: T): T => {
      disposables.push(res);
      return res;
    };

    // 2. Iluminación Industrial
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.45);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 1.15);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(5, 11, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-7, 5, -6);
    scene.add(rimLight);

    // 3. Piso Industrial y Retícula CAD
    const floorMat = track(
      new THREE.MeshStandardMaterial({ color: 0x0b0f15, roughness: 0.88, metalness: 0.15 })
    );
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(34, 24)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(28, 40, 0x0f766e, 0x17202b);
    grid.position.y = 0.005;
    scene.add(grid);

    // Materiales industriales compartidos
    const aluminumMat = track(
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.78, roughness: 0.3 })
    );
    const darkSteelMat = track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.68, roughness: 0.42 })
    );
    const chromeMat = track(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.96, roughness: 0.12 })
    );
    const rubberMat = track(
      new THREE.MeshStandardMaterial({ color: 0x0f1419, metalness: 0.1, roughness: 0.9 })
    );
    const siemensTealMat = track(
      new THREE.MeshStandardMaterial({ color: 0x008b8b, metalness: 0.45, roughness: 0.38 })
    );
    const hazardTex = track(createHazardTexture());
    const hazardMat = track(
      new THREE.MeshStandardMaterial({ map: hazardTex, metalness: 0.25, roughness: 0.5 })
    );

    // 4. Estructura de la Banda Transportadora (Perfil Bosch Rexroth)
    const conveyorGroup = new THREE.Group();
    scene.add(conveyorGroup);

    // Largueros laterales (X: -5.6 a +5.6)
    const railGeo = track(new THREE.BoxGeometry(11.3, 0.22, 0.1));
    [-0.82, 0.82].forEach((zPos) => {
      const rail = new THREE.Mesh(railGeo, aluminumMat);
      rail.position.set(0, 0.9, zPos);
      rail.castShadow = true;
      rail.receiveShadow = true;
      conveyorGroup.add(rail);
    });

    // Barandas de contención superior (con aberturas en Estación A x=-0.24 y Estación B x=2.88)
    const createGuideSegment = (xStart: number, xEnd: number, zPos: number) => {
      const len = xEnd - xStart;
      const seg = new THREE.Mesh(track(new THREE.BoxGeometry(len, 0.11, 0.04)), darkSteelMat);
      seg.position.set((xStart + xEnd) / 2, 1.07, zPos);
      seg.castShadow = true;
      conveyorGroup.add(seg);
    };

    // Baranda frontal (con puertas de descarga para Y1 y Y2)
    createGuideSegment(-5.55, -0.84, 0.77);
    createGuideSegment(0.36, 2.28, 0.77);
    createGuideSegment(3.48, 5.55, 0.77);

    // Baranda trasera (con aberturas para vástagos de Y1 y Y2)
    createGuideSegment(-5.55, -0.84, -0.77);
    createGuideSegment(0.36, 2.28, -0.77);
    createGuideSegment(3.48, 5.55, -0.77);

    // Patas industriales + zapatas niveladoras (4 pares)
    const legGeo = track(new THREE.BoxGeometry(0.14, 0.88, 0.14));
    const footGeo = track(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 16));
    const braceGeo = track(new THREE.BoxGeometry(0.1, 0.1, 1.62));
    [-4.8, -1.6, 1.6, 4.8].forEach((xLeg) => {
      [-0.78, 0.78].forEach((zLeg) => {
        const leg = new THREE.Mesh(legGeo, aluminumMat);
        leg.position.set(xLeg, 0.44, zLeg);
        leg.castShadow = true;
        leg.receiveShadow = true;
        conveyorGroup.add(leg);

        const foot = new THREE.Mesh(footGeo, rubberMat);
        foot.position.set(xLeg, 0.03, zLeg);
        conveyorGroup.add(foot);
      });

      const brace = new THREE.Mesh(braceGeo, darkSteelMat);
      brace.position.set(xLeg, 0.35, 0);
      conveyorGroup.add(brace);
    });

    // Superficie móvil de la banda
    const beltTex = track(createBeltTexture());
    const beltMat = track(
      new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.78, metalness: 0.12 })
    );
    const beltMesh = new THREE.Mesh(track(new THREE.BoxGeometry(11.2, 0.12, 1.44)), beltMat);
    beltMesh.position.set(0, 0.94, 0);
    beltMesh.receiveShadow = true;
    conveyorGroup.add(beltMesh);

    // Rodillos extremos (Motriz -X y Tensor +X)
    const rollerGeo = track(new THREE.CylinderGeometry(0.22, 0.22, 1.56, 24));
    const hubGeo = track(new THREE.CylinderGeometry(0.08, 0.08, 1.82, 16));
    const driveRoller = new THREE.Group();
    driveRoller.position.set(-5.65, 0.9, 0);
    const driveDrum = new THREE.Mesh(rollerGeo, darkSteelMat);
    driveDrum.rotation.x = Math.PI / 2;
    driveDrum.castShadow = true;
    const driveHub = new THREE.Mesh(hubGeo, chromeMat);
    driveHub.rotation.x = Math.PI / 2;
    driveRoller.add(driveDrum, driveHub);
    conveyorGroup.add(driveRoller);

    const idlerRoller = new THREE.Group();
    idlerRoller.position.set(5.65, 0.9, 0);
    const idlerDrum = new THREE.Mesh(rollerGeo, darkSteelMat);
    idlerDrum.rotation.x = Math.PI / 2;
    idlerDrum.castShadow = true;
    const idlerHub = new THREE.Mesh(hubGeo, chromeMat);
    idlerHub.rotation.x = Math.PI / 2;
    idlerRoller.add(idlerDrum, idlerHub);
    conveyorGroup.add(idlerRoller);

    // Motorreductor AC M1 [Q1] acoplado al rodillo motriz
    const motorGroup = new THREE.Group();
    motorGroup.position.set(-5.65, 0.9, 1.24);
    const motorBody = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 20)),
      siemensTealMat
    );
    motorBody.rotation.x = Math.PI / 2;
    motorBody.castShadow = true;
    const motorTermBox = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.26, 0.18, 0.28)),
      darkSteelMat
    );
    motorTermBox.position.set(0, 0.28, 0);
    const motorLedMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: 0x10b981,
        emissiveIntensity: 0,
      })
    );
    const motorLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 12, 12)), motorLedMat);
    motorLed.position.set(0, 0.39, 0);

    // Ventilador trasero visible para mostrar giro de M1
    const motorFan = new THREE.Group();
    motorFan.position.set(0, 0, 0.34);
    const bladeGeo = track(new THREE.BoxGeometry(0.44, 0.06, 0.03));
    const blade1 = new THREE.Mesh(bladeGeo, chromeMat);
    const blade2 = new THREE.Mesh(bladeGeo, chromeMat);
    blade2.rotation.z = Math.PI / 2;
    motorFan.add(blade1, blade2);

    motorGroup.add(motorBody, motorTermBox, motorLed, motorFan);
    conveyorGroup.add(motorGroup);

    // 5. Sensores Fotoeléctricos (B1 [I3], B2 [I4], B3 [I5]) con haces láser
    const createPhotoSensor = (xPos: number): SensorAssembly => {
      const group = new THREE.Group();
      group.position.set(xPos, 1.15, 0);

      // Cuerpo emisor frontal + soporte
      const housing = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.16, 0.18)), darkSteelMat);
      housing.position.set(0, 0.04, 0.88);
      housing.castShadow = true;

      // Receptor / Reflector opuesto
      const reflector = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.14, 0.08)), aluminumMat);
      reflector.position.set(0, 0.04, -0.84);

      const ledMat = track(
        new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x10b981,
          emissiveIntensity: 0.1,
        })
      );
      const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.035, 10, 10)), ledMat);
      led.position.set(0, 0.14, 0.88);

      const beamMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.42,
        })
      );
      const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 1.66, 8)), beamMat);
      beam.rotation.x = Math.PI / 2;
      beam.position.set(0, 0.04, 0.02);

      group.add(housing, reflector, led, beam);
      scene.add(group);
      return { ledMat, beamMat };
    };

    const sensorI3 = createPhotoSensor(percentToWorldX(18));
    const sensorI4 = createPhotoSensor(percentToWorldX(48));
    const sensorI5 = createPhotoSensor(percentToWorldX(74));

    // 6. Actuadores Neumáticos Festo (Y1 [Q2] en x=-0.24, Y2 [Q3] en x=+2.88)
    const createPneumaticCylinder = (xPos: number): CylinderAssembly => {
      const unit = new THREE.Group();
      unit.position.set(xPos, 1.24, -1.75);

      // Pedestal de soporte detrás de la banda
      const pedestal = new THREE.Mesh(track(new THREE.BoxGeometry(0.44, 1.24, 0.56)), darkSteelMat);
      pedestal.position.set(0, -0.62, -0.2);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;

      // Camisa del cilindro (local z: -0.86 a +0.46)
      const housingMat = track(
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          metalness: 0.72,
          roughness: 0.32,
          emissive: 0xf59e0b,
          emissiveIntensity: 0,
        })
      );
      const barrel = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.3, 1.32)), housingMat);
      barrel.position.set(0, 0, -0.2);
      barrel.castShadow = true;

      // Racores neumáticos celestes
      const fittingMat = track(
        new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.5, roughness: 0.3 })
      );
      const fit1 = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12)), fittingMat);
      fit1.position.set(0, 0.19, -0.65);
      const fit2 = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12)), fittingMat);
      fit2.position.set(0, 0.19, 0.28);

      // Conjunto móvil (vástago cromado + paleta empujadora)
      const rodAndPlate = new THREE.Group();
      const rod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.055, 1.72, 16)), chromeMat);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(0, 0, 0.03);
      rod.castShadow = true;

      const plate = new THREE.Mesh(track(new THREE.BoxGeometry(0.78, 0.26, 0.09)), hazardMat);
      plate.position.set(0, 0, 0.89);
      plate.castShadow = true;

      rodAndPlate.add(rod, plate);
      unit.add(pedestal, barrel, fit1, fit2, rodAndPlate);
      scene.add(unit);

      return { rodAndPlate, housingMat, extension: 0 };
    };

    const cylA = createPneumaticCylinder(percentToWorldX(48));
    const cylB = createPneumaticCylinder(percentToWorldX(74));

    // 7. Rampas Inclinadas y Tolvas Colectoras (Carril A y Carril B)
    const createDischargeStation = (
      xPos: number,
      title: string,
      subtitle: string,
      accentHex: number,
      accentCss: string
    ) => {
      const station = new THREE.Group();
      station.position.set(xPos, 0, 0);

      // Rampa inclinada desde borde de la banda (z=0.82, y=0.92) hacia tolva (z=1.9, y=0.45)
      const ramp = new THREE.Mesh(track(new THREE.BoxGeometry(1.16, 0.06, 1.24)), aluminumMat);
      ramp.position.set(0, 0.68, 1.38);
      ramp.rotation.x = 0.39;
      ramp.receiveShadow = true;
      ramp.castShadow = true;
      station.add(ramp);

      // Guías laterales de la rampa
      const rampSideGeo = track(new THREE.BoxGeometry(0.05, 0.18, 1.24));
      [-0.58, 0.58].forEach((rx) => {
        const rs = new THREE.Mesh(rampSideGeo, darkSteelMat);
        rs.position.set(rx, 0.76, 1.38);
        rs.rotation.x = 0.39;
        station.add(rs);
      });

      // Tolva colectora industrial (z = 2.45)
      const binGroup = new THREE.Group();
      binGroup.position.set(0, 0, 2.52);

      const binWallMat = track(
        new THREE.MeshStandardMaterial({ color: 0x161d26, metalness: 0.5, roughness: 0.55 })
      );
      const binTrimMat = track(
        new THREE.MeshStandardMaterial({
          color: accentHex,
          emissive: accentHex,
          emissiveIntensity: 0.2,
          roughness: 0.35,
        })
      );

      const binBase = new THREE.Mesh(track(new THREE.BoxGeometry(1.48, 0.08, 1.36)), binWallMat);
      binBase.position.y = 0.04;
      binBase.receiveShadow = true;

      const frontWall = new THREE.Mesh(track(new THREE.BoxGeometry(1.48, 0.56, 0.08)), binWallMat);
      frontWall.position.set(0, 0.28, 0.64);
      frontWall.castShadow = true;

      const backWall = new THREE.Mesh(track(new THREE.BoxGeometry(1.48, 0.38, 0.08)), binWallMat);
      backWall.position.set(0, 0.19, -0.64);

      const leftWall = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.56, 1.36)), binWallMat);
      leftWall.position.set(-0.7, 0.28, 0);

      const rightWall = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.56, 1.36)), binWallMat);
      rightWall.position.set(0.7, 0.28, 0);

      // Tira luminosa de identificación en el borde frontal de la tolva
      const trim = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.06, 0.1)), binTrimMat);
      trim.position.set(0, 0.57, 0.64);

      // Placa identificadora frontal
      const signTex = track(createStationSignTexture(title, subtitle, accentCss));
      const signMat = track(new THREE.MeshBasicMaterial({ map: signTex }));
      const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(1.26, 0.38)), signMat);
      sign.position.set(0, 0.29, 0.685);

      binGroup.add(binBase, frontWall, backWall, leftWall, rightWall, trim, sign);
      station.add(binGroup);

      // Piezas pre-alojadas apilables dentro de la tolva (hasta 12 unidades visibles)
      const stackMeshes: THREE.Mesh[] = [];
      const itemGeo = track(new THREE.BoxGeometry(0.32, 0.2, 0.32));
      const itemMat = track(
        new THREE.MeshStandardMaterial({
          color: accentHex,
          metalness: accentHex === 0x0ea5e9 ? 0.72 : 0.22,
          roughness: 0.35,
        })
      );

      for (let i = 0; i < 12; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3) % 2;
        const layer = Math.floor(i / 6);
        const m = new THREE.Mesh(itemGeo, itemMat);
        m.position.set(-0.38 + col * 0.38, 0.18 + layer * 0.21, -0.22 + row * 0.42);
        m.castShadow = true;
        m.visible = false;
        binGroup.add(m);
        stackMeshes.push(m);
      }

      scene.add(station);
      return stackMeshes;
    };

    const binAStack = createDischargeStation(
      percentToWorldX(48),
      'COLECTOR 01 // CAT-A',
      'LOTE METÁLICO',
      0x0ea5e9,
      '#38bdf8'
    );
    const binBStack = createDischargeStation(
      percentToWorldX(74),
      'COLECTOR 02 // CAT-B',
      'LOTE POLÍMERO',
      0xf59e0b,
      '#fbbf24'
    );

    // 8. Gabinete PLC LOGO! 24CE + Torreta Andon 3 Colores (H1 [Q4])
    const cabinetGroup = new THREE.Group();
    cabinetGroup.position.set(-4.35, 0, -1.68);

    const cabinetBody = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.1, 1.55, 0.65)),
      track(new THREE.MeshStandardMaterial({ color: 0x3b4554, metalness: 0.55, roughness: 0.45 }))
    );
    cabinetBody.position.y = 0.775;
    cabinetBody.castShadow = true;
    cabinetBody.receiveShadow = true;

    const cabinetPlate = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.95, 0.32)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(createStationSignTexture('SIEMENS LOGO! 24CE', 'CPU STN-02 // Q1-Q4', '#00cccc')),
        })
      )
    );
    cabinetPlate.position.set(0, 1.25, 0.33);

    // Mástil y Torreta Luminosa Andon
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12)), chromeMat);
    pole.position.set(0.32, 1.9, 0);

    const redMat = track(
      new THREE.MeshStandardMaterial({ color: 0x450a0a, emissive: 0xef4444, emissiveIntensity: 0 })
    );
    const amberMat = track(
      new THREE.MeshStandardMaterial({ color: 0x451a03, emissive: 0xf59e0b, emissiveIntensity: 0 })
    );
    const greenMat = track(
      new THREE.MeshStandardMaterial({ color: 0x052e16, emissive: 0x10b981, emissiveIntensity: 0 })
    );

    const segGeo = track(new THREE.CylinderGeometry(0.095, 0.095, 0.16, 18));
    const greenSeg = new THREE.Mesh(segGeo, greenMat);
    greenSeg.position.set(0.32, 2.3, 0);
    const amberSeg = new THREE.Mesh(segGeo, amberMat);
    amberSeg.position.set(0.32, 2.47, 0);
    const redSeg = new THREE.Mesh(segGeo, redMat);
    redSeg.position.set(0.32, 2.64, 0);
    const capSeg = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.098, 0.098, 0.04, 18)),
      darkSteelMat
    );
    capSeg.position.set(0.32, 2.74, 0);

    const andonLight = new THREE.PointLight(0x10b981, 0, 7.5);
    andonLight.position.set(0.32, 2.75, 0.25);

    cabinetGroup.add(cabinetBody, cabinetPlate, pole, greenSeg, amberSeg, redSeg, capSeg, andonLight);
    scene.add(cabinetGroup);

    // 9. Pieza Activa sobre la Banda (Cat A / Cat B / Atascada)
    const activePieceGroup = new THREE.Group();
    activePieceGroup.visible = false;

    const crateMatA = track(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.72, roughness: 0.26 })
    );
    const crateMatB = track(
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.22, roughness: 0.45 })
    );
    const crateMatJam = track(
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        emissive: 0xef4444,
        emissiveIntensity: 0.65,
        roughness: 0.4,
      })
    );

    const crateMeshA = new THREE.Mesh(track(new THREE.BoxGeometry(0.66, 0.58, 0.62)), crateMatA);
    crateMeshA.position.y = 0.29;
    crateMeshA.castShadow = true;

    const crateMeshB = new THREE.Mesh(track(new THREE.BoxGeometry(0.54, 0.38, 0.54)), crateMatB);
    crateMeshB.position.y = 0.19;
    crateMeshB.castShadow = true;

    const crateCollar = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.08, 0.66)), hazardMat);
    crateCollar.position.y = 0.54;
    crateMeshA.add(crateCollar);

    activePieceGroup.add(crateMeshA, crateMeshB);
    scene.add(activePieceGroup);

    // 10. Loop de Animación a 60 FPS sincronizado con las salidas reales del PLC
    let visualX = percentToWorldX(8);
    let lastPieceId: number | null = null;
    let sortProgress = 0;
    let frameId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const elapsedSec = now / 1000;

      const currentPlc = plcRef.current;
      const currentPiece = pieceRef.current;
      const currentSensors = sensorsRef.current;

      const isRunning = Boolean(currentPlc?.q1_MotorBanda);
      const isAlarm = Boolean(currentPlc?.q4_AlarmaAtasco);

      // Banda y rodillos: velocidad física exacta = 1.728 units/s -> UV 2.468 tiles/s
      if (isRunning) {
        beltTex.offset.x -= 2.468 * dt;
        driveRoller.rotation.z -= 7.2 * dt;
        idlerRoller.rotation.z -= 7.2 * dt;
        motorFan.rotation.z -= 18 * dt;
      }
      motorLedMat.emissiveIntensity = isRunning ? 1.8 : 0.0;

      // Torreta Andon (Q4 / RUN / STOP)
      if (isAlarm) {
        const pulse = Math.sin(elapsedSec * 14) > 0 ? 1 : 0.15;
        redMat.emissiveIntensity = pulse * 3.0;
        amberMat.emissiveIntensity = 0;
        greenMat.emissiveIntensity = 0;
        andonLight.color.setHex(0xef4444);
        andonLight.intensity = pulse * 4.5;
      } else if (isRunning) {
        redMat.emissiveIntensity = 0;
        amberMat.emissiveIntensity = 0;
        greenMat.emissiveIntensity = 2.0;
        andonLight.color.setHex(0x10b981);
        andonLight.intensity = 1.5;
      } else {
        redMat.emissiveIntensity = 0;
        amberMat.emissiveIntensity = 1.5;
        greenMat.emissiveIntensity = 0;
        andonLight.color.setHex(0xf59e0b);
        andonLight.intensity = 0.8;
      }

      // Sensores ópticos B1, B2, B3
      const updateSensorVisual = (sensor: SensorAssembly, active: boolean) => {
        if (active) {
          sensor.beamMat.color.setHex(0x10b981);
          sensor.beamMat.opacity = 0.95;
          sensor.ledMat.emissiveIntensity = 2.5;
        } else {
          sensor.beamMat.color.setHex(0xef4444);
          sensor.beamMat.opacity = 0.35;
          sensor.ledMat.emissiveIntensity = 0.15;
        }
      };
      updateSensorVisual(sensorI3, currentSensors.i3);
      updateSensorVisual(sensorI4, currentSensors.i4);
      updateSensorVisual(sensorI5, currentSensors.i5);

      // Actuadores neumáticos Y1 [Q2] y Y2 [Q3]
      const updateCylinder = (cyl: CylinderAssembly, energized: boolean) => {
        if (energized) {
          cyl.extension = Math.min(1, cyl.extension + dt * 9.0);
        } else {
          cyl.extension = Math.max(0, cyl.extension - dt * 5.0);
        }
        cyl.rodAndPlate.position.z = cyl.extension * 1.26;
        cyl.housingMat.emissiveIntensity = energized ? 0.55 : 0;
      };
      updateCylinder(cylA, Boolean(currentPlc?.q2_DesviadorCarrilA));
      updateCylinder(cylB, Boolean(currentPlc?.q3_DesviadorCarrilB));

      // Pilas de cajas clasificadas dentro de las tolvas A y B
      const countA = currentPlc?.contadorCategoriaA ?? 0;
      const countB = currentPlc?.contadorCategoriaB ?? 0;
      for (let i = 0; i < binAStack.length; i++) {
        binAStack[i].visible = i < countA;
      }
      for (let i = 0; i < binBStack.length; i++) {
        binBStack[i].visible = i < countB;
      }

      // Cinemática 3D de la pieza activa
      if (!currentPiece) {
        activePieceGroup.visible = false;
        lastPieceId = null;
        sortProgress = 0;
      } else {
        activePieceGroup.visible = true;
        const isJammed = currentPiece.willJam && currentPiece.xPercent >= 33;

        if (currentPiece.id !== lastPieceId) {
          lastPieceId = currentPiece.id;
          visualX = percentToWorldX(currentPiece.xPercent);
          sortProgress = 0;
        }

        const targetX = percentToWorldX(currentPiece.xPercent);
        visualX = THREE.MathUtils.damp(visualX, targetX, 24, dt);

        crateMeshA.visible = currentPiece.category === 'A';
        crateMeshB.visible = currentPiece.category === 'B';
        crateMeshA.material = isJammed ? crateMatJam : crateMatA;
        crateMeshB.material = isJammed ? crateMatJam : crateMatB;

        if (currentPiece.sorted) {
          sortProgress = Math.min(1, sortProgress + dt * 1.65);
          const zSlide = THREE.MathUtils.lerp(0, 2.25, sortProgress);
          const yDrop = sortProgress < 0.3 ? 1.0 : THREE.MathUtils.lerp(1.0, 0.36, (sortProgress - 0.3) / 0.7);
          const tilt = sortProgress > 0.25 && sortProgress < 0.85 ? 0.28 : 0;
          activePieceGroup.position.set(visualX, yDrop, zSlide);
          activePieceGroup.rotation.set(tilt, 0, 0);
        } else {
          const jitter = isJammed ? Math.sin(elapsedSec * 45) * 0.014 : 0;
          activePieceGroup.position.set(visualX + jitter, 1.0, 0);
          activePieceGroup.rotation.set(0, 0, 0);
        }
      }

      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ResizeObserver para adaptar el canvas al contenedor sin recargar ni deformar la relación de aspecto
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      cameraMoveRef.current = null;
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handlePreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    cameraMoveRef.current?.(preset);
  };

  return (
    <div className="cad-viewport-3d-wrap">
      <div className="viewport-3d-hud-top">
        <div className="cam-preset-group" role="group" aria-label="Vistas de cámara 3D">
          {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`cam-preset-btn ${activePreset === key ? 'active' : ''}`}
              onClick={() => handlePreset(key)}
            >
              {CAMERA_PRESETS[key].label}
            </button>
          ))}
        </div>

        <div className="hud-3d-counters">
          <span className="hud-chip chip-a">
            CAT-A: <strong>{String(plcState?.contadorCategoriaA ?? 0).padStart(4, '0')}</strong>
          </span>
          <span className="hud-chip chip-b">
            CAT-B: <strong>{String(plcState?.contadorCategoriaB ?? 0).padStart(4, '0')}</strong>
          </span>
        </div>
      </div>

      <div ref={mountRef} className="cad-viewport-3d" />

      <div className="viewport-3d-hud-bottom">
        <span>WEBGL 3D DIGITAL TWIN // ESCALA 1:10</span>
        <span>ARRASTRAR: ROTAR 360° | RUEDA: ZOOM | CLIC DER.: DESPLAZAR</span>
      </div>
    </div>
  );
}
