namespace SoftPlc.Models;

public enum EstadoBanda
{
    Detenido,
    EnMarchaEsperando,
    PiezaEnTransito,
    ClasificandoCarrilA,
    ClasificandoCarrilB,
    AlarmaAtasco
}

public class ConveyorPlcState
{
    // --- ENTRADAS DIGITALES (I) ---
    public bool I1_Marcha { get; set; }
    public bool I2_Paro { get; set; }
    public bool I3_SensorPresenciaInicio { get; set; }
    public bool I4_SensorClasificacionA { get; set; }
    public bool I5_SensorClasificacionB { get; set; }
    public bool I6_SensorAtasco { get; set; }

    // --- SALIDAS DIGITALES (Q) ---
    public bool Q1_MotorBanda { get; set; }
    public bool Q2_DesviadorCarrilA { get; set; }
    public bool Q3_DesviadorCarrilB { get; set; }
    public bool Q4_AlarmaAtasco { get; set; }

    // --- CONTADORES ASCENDENTES (Bloques Cnt en LOGO!) ---
    public int ContadorCategoriaA { get; set; } = 0;
    public int ContadorCategoriaB { get; set; } = 0;
    public int TotalClasificadas => ContadorCategoriaA + ContadorCategoriaB;

    // --- TEMPORIZADORES TON (Bloques TON en LOGO!) ---
    // TON 1: Supervisión de tránsito (detecta si una pieza tarda demasiado y se atasca)
    public double TiempoMaximoTransitoSeg { get; set; } = 5.0;
    public double TiempoActualTransitoSeg { get; set; } = 0.0;

    // TON 2: Tiempo que dura extendido el cilindro neumático empujando la pieza
    public double TiempoPulsoDesviadorSeg { get; set; } = 1.0;
    public double TiempoActualDesviadorSeg { get; set; } = 0.0;

    // --- ESTADO GENERAL PARA LA MAQUETA ---
    public EstadoBanda EstadoActual { get; set; } = EstadoBanda.Detenido;
    public string MensajeHmi { get; set; } = "Sistema detenido. Presione MARCHA (I1) para arrancar la banda.";
}