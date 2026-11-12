using Microsoft.AspNetCore.SignalR;
using SoftPlc.Hubs;
using SoftPlc.Models;

namespace SoftPlc.Services;

public class ConveyorPlcService : BackgroundService
{
    private readonly IHubContext<PlcHub> _hubContext;
    private readonly object _lock = new();
    private readonly ConveyorPlcState _state = new();
    private const int ScanCycleMs = 100; // Ciclo de Scan del PLC: 100 ms (10 veces por segundo)

    public ConveyorPlcService(IHubContext<PlcHub> hubContext)
    {
        _hubContext = hubContext;
    }

    // Devuelve el estado actual cuando React se conecta
    public ConveyorPlcState GetStateSnapshot()
    {
        lock (_lock)
        {
            return _state;
        }
    }

    // Recibe las señales de los botones/sensores desde React
    public void SetInput(string inputCode, bool value)
    {
        lock (_lock)
        {
            switch (inputCode.ToUpperInvariant())
            {
                case "I1": _state.I1_Marcha = value; break;
                case "I2": _state.I2_Paro = value; break;
                case "I3": _state.I3_SensorPresenciaInicio = value; break;
                case "I4": _state.I4_SensorClasificacionA = value; break;
                case "I5": _state.I5_SensorClasificacionB = value; break;
                case "I6": _state.I6_SensorAtasco = value; break;
            }
        }
    }

    // Permite reiniciar los contadores desde la pantalla HMI
    public void ResetCounters()
    {
        lock (_lock)
        {
            _state.ContadorCategoriaA = 0;
            _state.ContadorCategoriaB = 0;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(ScanCycleMs));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            // 1. Ejecutar un ciclo de scan de 0.1 segundos
            EjecutarLogicaPlc(ScanCycleMs / 1000.0);

            // 2. Enviar el estado actualizado a React por WebSockets (SignalR)
            await _hubContext.Clients.All.SendAsync("ReceivePlcState", _state, stoppingToken);
        }
    }

    private void EjecutarLogicaPlc(double dt)
    {
        lock (_lock)
        {
            // --- 1. PRIORIDAD: DETECCIÓN DE ATASCO DIRECTO (Sensor I6) ---
            if (_state.I6_SensorAtasco)
            {
                DispararAlarmaAtasco("¡ALARMA (Q4)! Sensor de atasco físico (I6) activado. Banda detenida.");
                return;
            }

            // --- 2. BOTÓN DE PARO / RESET DE ALARMA (I2) ---
            if (_state.I2_Paro)
            {
                _state.I2_Paro = false; // Consumimos el pulso del botón
                _state.Q1_MotorBanda = false;
                _state.Q2_DesviadorCarrilA = false;
                _state.Q3_DesviadorCarrilB = false;
                _state.Q4_AlarmaAtasco = false;
                _state.TiempoActualTransitoSeg = 0;
                _state.TiempoActualDesviadorSeg = 0;
                _state.EstadoActual = EstadoBanda.Detenido;
                _state.MensajeHmi = "Sistema detenido y rearmado (I2). Presione MARCHA (I1).";
                return;
            }

            // --- 3. MÁQUINA DE ESTADOS DEL PROCESO DE CLASIFICACIÓN ---
            switch (_state.EstadoActual)
            {
                case EstadoBanda.Detenido:
                    _state.Q1_MotorBanda = false;
                    _state.Q2_DesviadorCarrilA = false;
                    _state.Q3_DesviadorCarrilB = false;

                    if (_state.I1_Marcha)
                    {
                        _state.I1_Marcha = false; // Consumimos el pulso de Marcha
                        _state.EstadoActual = EstadoBanda.EnMarchaEsperando;
                        _state.MensajeHmi = "Banda en movimiento (Q1). Esperando pieza en sensor de inicio (I3)...";
                    }
                    break;

                case EstadoBanda.EnMarchaEsperando:
                    _state.Q1_MotorBanda = true;
                    _state.Q2_DesviadorCarrilA = false;
                    _state.Q3_DesviadorCarrilB = false;
                    _state.TiempoActualTransitoSeg = 0;

                    // Si el sensor de inicio I3 detecta una pieza, iniciamos supervisión de tránsito
                    if (_state.I3_SensorPresenciaInicio)
                    {
                        _state.I3_SensorPresenciaInicio = false;
                        _state.EstadoActual = EstadoBanda.PiezaEnTransito;
                        _state.MensajeHmi = "Pieza detectada en I3. Avanzando hacia zona de clasificación...";
                    }
                    break;

                case EstadoBanda.PiezaEnTransito:
                    _state.Q1_MotorBanda = true;

                    // Temporizador TON de supervisión de tránsito (para detectar atasco por tiempo)
                    _state.TiempoActualTransitoSeg += dt;
                    if (_state.TiempoActualTransitoSeg >= _state.TiempoMaximoTransitoSeg)
                    {
                        DispararAlarmaAtasco($"¡ALARMA DE ATASCO (Q4)! La pieza superó el tiempo máximo de tránsito ({_state.TiempoMaximoTransitoSeg}s).");
                        break;
                    }

                    // Si llega al sensor de clasificación A (I4)
                    if (_state.I4_SensorClasificacionA)
                    {
                        _state.I4_SensorClasificacionA = false;
                        _state.TiempoActualTransitoSeg = 0;
                        _state.TiempoActualDesviadorSeg = 0;
                        _state.ContadorCategoriaA++; // Incrementa contador C1
                        _state.EstadoActual = EstadoBanda.ClasificandoCarrilA;
                        _state.MensajeHmi = "Pieza Tipo A detectada (I4). Activando cilindro desviador A (Q2)...";
                    }
                    // Si llega al sensor de clasificación B (I5)
                    else if (_state.I5_SensorClasificacionB)
                    {
                        _state.I5_SensorClasificacionB = false;
                        _state.TiempoActualTransitoSeg = 0;
                        _state.TiempoActualDesviadorSeg = 0;
                        _state.ContadorCategoriaB++; // Incrementa contador C2
                        _state.EstadoActual = EstadoBanda.ClasificandoCarrilB;
                        _state.MensajeHmi = "Pieza Tipo B detectada (I5). Activando cilindro desviador B (Q3)...";
                    }
                    break;

                case EstadoBanda.ClasificandoCarrilA:
                    _state.Q1_MotorBanda = true;
                    _state.Q2_DesviadorCarrilA = true; // Extiende pistón A
                    _state.Q3_DesviadorCarrilB = false;

                    _state.TiempoActualDesviadorSeg += dt;
                    if (_state.TiempoActualDesviadorSeg >= _state.TiempoPulsoDesviadorSeg)
                    {
                        _state.Q2_DesviadorCarrilA = false; // Retrae pistón A
                        _state.EstadoActual = EstadoBanda.EnMarchaEsperando;
                        _state.MensajeHmi = "Pieza A clasificada con éxito. Esperando siguiente pieza en I3...";
                    }
                    break;

                case EstadoBanda.ClasificandoCarrilB:
                    _state.Q1_MotorBanda = true;
                    _state.Q2_DesviadorCarrilA = false;
                    _state.Q3_DesviadorCarrilB = true; // Extiende pistón B

                    _state.TiempoActualDesviadorSeg += dt;
                    if (_state.TiempoActualDesviadorSeg >= _state.TiempoPulsoDesviadorSeg)
                    {
                        _state.Q3_DesviadorCarrilB = false; // Retrae pistón B
                        _state.EstadoActual = EstadoBanda.EnMarchaEsperando;
                        _state.MensajeHmi = "Pieza B clasificada con éxito. Esperando siguiente pieza en I3...";
                    }
                    break;

                case EstadoBanda.AlarmaAtasco:
                    // Enclavamiento de seguridad: motor apagado y alarma encendida hasta presionar Paro/Reset (I2)
                    _state.Q1_MotorBanda = false;
                    _state.Q2_DesviadorCarrilA = false;
                    _state.Q3_DesviadorCarrilB = false;
                    _state.Q4_AlarmaAtasco = true;
                    break;
            }
        }
    }

    private void DispararAlarmaAtasco(string motivo)
    {
        _state.EstadoActual = EstadoBanda.AlarmaAtasco;
        _state.Q1_MotorBanda = false;
        _state.Q2_DesviadorCarrilA = false;
        _state.Q3_DesviadorCarrilB = false;
        _state.Q4_AlarmaAtasco = true;
        _state.MensajeHmi = motivo;
    }
}