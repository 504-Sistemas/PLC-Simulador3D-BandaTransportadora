import { useEffect, useState, useRef, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import { LocalPlcEngine } from '../services/localPlcEngine';

// Coincide 1 a 1 con ConveyorPlcState.cs de tu backend en C#
export interface ConveyorPlcState {
  i1_Marcha: boolean;
  i2_Paro: boolean;
  i3_SensorPresenciaInicio: boolean;
  i4_SensorClasificacionA: boolean;
  i5_SensorClasificacionB: boolean;
  i6_SensorAtasco: boolean;

  q1_MotorBanda: boolean;
  q2_DesviadorCarrilA: boolean;
  q3_DesviadorCarrilB: boolean;
  q4_AlarmaAtasco: boolean;

  contadorCategoriaA: number;
  contadorCategoriaB: number;
  totalClasificadas: number;

  tiempoMaximoTransitoSeg: number;
  tiempoActualTransitoSeg: number;
  tiempoPulsoDesviadorSeg: number;
  tiempoActualDesviadorSeg: number;

  estadoActual: number;
  mensajeHmi: string;
}

export type PlcConnectionMode = 'signalr' | 'standalone';

function resolveHubUrl(customHubUrl?: string): string | null {
  if (customHubUrl) return customHubUrl;

  const envHubUrl = (import.meta.env.VITE_PLC_HUB_URL as string | undefined)?.trim();
  if (envHubUrl) return envHubUrl;

  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:5000/plchub';
  }

  // En despliegues públicos (ej. Vercel HTTPS) sin backend externo configurado,
  // arranca directamente en modo SoftPLC autónomo en el navegador.
  return null;
}

export function usePlcSignalR(customHubUrl?: string) {
  const hubUrl = resolveHubUrl(customHubUrl);
  const [plcState, setPlcState] = useState<ConveyorPlcState | null>(null);
  const [isSignalrConnected, setIsSignalrConnected] = useState(false);
  const [mode, setMode] = useState<PlcConnectionMode>('standalone');

  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const localEngineRef = useRef<LocalPlcEngine | null>(null);
  const signalrActiveRef = useRef(false);

  useEffect(() => {
    // 1. Iniciar motor SoftPLC autónomo en navegador para disponibilidad inmediata
    const localEngine = new LocalPlcEngine();
    localEngineRef.current = localEngine;
    signalrActiveRef.current = false;

    const unsubscribeLocal = localEngine.subscribe((state) => {
      if (!signalrActiveRef.current) {
        setPlcState(state);
      }
    });

    if (!hubUrl) {
      return () => {
        unsubscribeLocal();
        localEngine.stop();
      };
    }

    // 2. Intentar enlace con Backend C# por SignalR si estamos en local o hay VITE_PLC_HUB_URL
    let disposed = false;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .configureLogging(signalR.LogLevel.None)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    connectionRef.current = connection;

    connection.on('ReceivePlcState', (state: ConveyorPlcState) => {
      if (!disposed) {
        signalrActiveRef.current = true;
        setPlcState(state);
      }
    });

    connection.onreconnecting(() => {
      if (!disposed) {
        signalrActiveRef.current = false;
        setIsSignalrConnected(false);
        setMode('standalone');
      }
    });

    connection.onreconnected(() => {
      if (!disposed) {
        signalrActiveRef.current = true;
        setIsSignalrConnected(true);
        setMode('signalr');
      }
    });

    connection.onclose(() => {
      if (!disposed) {
        signalrActiveRef.current = false;
        setIsSignalrConnected(false);
        setMode('standalone');
      }
    });

    connection
      .start()
      .then(() => {
        if (!disposed) {
          signalrActiveRef.current = true;
          setIsSignalrConnected(true);
          setMode('signalr');
        }
      })
      .catch(() => {
        if (!disposed) {
          signalrActiveRef.current = false;
          setIsSignalrConnected(false);
          setMode('standalone');
        }
      });

    return () => {
      disposed = true;
      signalrActiveRef.current = false;
      connectionRef.current = null;
      unsubscribeLocal();
      localEngine.stop();
      connection.stop().catch(() => {});
    };
  }, [hubUrl]);

  // Envía señales de sensores o botones (I1..I6) al PLC (Backend SignalR o Motor Local)
  const sendSensorSignal = useCallback(async (inputCode: string, value: boolean) => {
    if (
      signalrActiveRef.current &&
      connectionRef.current?.state === signalR.HubConnectionState.Connected
    ) {
      await connectionRef.current.invoke('SendSensorSignal', inputCode, value);
    } else if (localEngineRef.current) {
      localEngineRef.current.setInput(inputCode, value);
    }
  }, []);

  // Reinicia los contadores de piezas en el PLC activo
  const resetCounters = useCallback(async () => {
    if (
      signalrActiveRef.current &&
      connectionRef.current?.state === signalR.HubConnectionState.Connected
    ) {
      await connectionRef.current.invoke('ResetCounters');
    } else if (localEngineRef.current) {
      localEngineRef.current.resetCounters();
    }
  }, []);

  return {
    plcState,
    connected: isSignalrConnected || mode === 'standalone',
    isSignalrConnected,
    mode,
    sendSensorSignal,
    resetCounters,
  };
}