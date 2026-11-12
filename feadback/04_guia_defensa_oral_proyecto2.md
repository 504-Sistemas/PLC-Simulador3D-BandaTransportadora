# Guía de Defensa Oral y Demostración — Proyecto 2

**Objetivo:** Asegurar el **10% de Defensa Oral** y destacar ante el **Ing. Carlos Perdomo** demostrando dominio individual de la lógica PLC (FBD) y de la arquitectura del Gemelo Digital por cada integrante del grupo.

---

## 1. Aclaración Técnica Clave (Si preguntan por la conexión directa con LOGO!Soft Comfort)

Si el docente consulta por qué el sistema interactivo 3D/2D no se conecta directamente al simulador de **LOGO!Soft Comfort**, la respuesta técnica exacta es:

> *"El simulador offline (`F9`) de **LOGO!Soft Comfort** es un entorno cerrado tipo sandbox que emula la lógica interna en memoria, pero **no abre puertos de red externos** (ni TCP `502` de Modbus TCP ni TCP `102` del protocolo Siemens S7). Esas interfaces de red solo se activan al descargar el programa a un módulo físico **LOGO! 8 (FS04 o superior)**. Para resolver esto sin depender del hardware físico en la presentación digital, implementamos una **arquitectura dual**: la lógica FBD completa validada en el archivo `.lsc` de LOGO!Soft Comfort, y una réplica exacta en un **SoftPLC (.NET 10)** con ciclo de scan de `100 ms` conectado por WebSockets (SignalR) a una maqueta HMI 3D/2D."*

*(Nota adicional por si preguntan: si la universidad prestara un **LOGO! 8 físico** con Ethernet, bastaría con sustituir `ConveyorPlcService.cs` por un cliente Modbus TCP / S7 apuntando a la IP del LOGO! para que la maqueta 3D responda al PLC real sin cambiar el Frontend).*

---

## 2. Guion Recomendado para la Demostración en Vivo (5–7 minutos)

### Parte A: Lógica FBD en LOGO!Soft Comfort (`2 min`)
1. Mostrar el esquema FBD abierto en **LOGO!Soft Comfort**.
2. Señalar los 4 bloques clave: Relé `RS` de Marcha/Paro (`Q1`), Watchdog `TON` de `5.0 s` (`B005`), Relés de barrido/pulso `1.0 s` (`Q2`, `Q3`) y Contadores (`C1`, `C2`).
3. Ejecutar una simulación rápida (`F3`):
   * `I1` $\rightarrow$ `I3` $\rightarrow$ `I4` (sube `C1`)
   * `I3` $\rightarrow$ dejar correr `5.0 s` $\rightarrow$ dispara `Q4` y corta `Q1` $\rightarrow$ rearmar con `I2`.

### Parte B: Maqueta Interactiva Gemelo Digital 3D/2D (`3–4 min`)
*(Asegurarse de tener corriendo el Backend `:5000` y Frontend `:5173` antes de pasar al frente)*
1. Mostrar la pantalla en **`DUAL 3D+2D`** (para que el docente vea el sinóptico P&ID y el gemelo 3D sincronizados) o empezar en **`VISTA 3D`** girando con el mouse.
2. Presionar **`[ I ] MARCHA LÍNEA (I1)`**: mostrar cómo la torreta pasa a **Verde**, el motor `M1 [Q1]` empieza a girar y la bornera `DO Q1` marca `ENERGIZADO [1]`.
3. Inyectar **Lote A** y **Lote B**:
   * Señalar cómo el haz láser `B1 [I3]` cambia de rojo a verde, sube la barra del **`TON B001 [WATCHDOG]`**, luego `B2 [I4]` / `B3 [I5]` activan el pistón `Y1` / `Y2` durante `1.0 s` (sonido neumático) y las piezas se apilan en cada colector incrementando `B003` y `B004`.
4. Probar la **Condición de Falla** con **`[ENSAYO FALLA] Obstrucción en Banda`**:
   * Dejar que la pieza se trabe a mitad de camino, mostrar el Watchdog subiendo hasta **`5.0 s`**, observar cómo se detiene `Q1`, parpadea la torreta roja y suena la alarma **`Q4`** (`ALM-99`).
   * Intentar presionar **`MARCHA`** (no arranca por enclavamiento de seguridad) $\rightarrow$ presionar **`[ O ] PARO / REARME (I2)`** $\rightarrow$ demostrar el restablecimiento seguro.

---

## 3. Distribución Sugerida por Integrantes

| Rol Sugerido | Qué Domina y Explica en la Defensa |
| :--- | :--- |
| **Integrante 1 (Arquitectura e I/O)** | Explica la tabla de direccionamiento (`I1`–`I6`, `Q1`–`Q4`), el flujo general de la estación y la máquina de estados. |
| **Integrante 2 (Lógica FBD en LOGO!)** | Explica los bloques `RS` de marcha/paro, la secuencia `I3 -> I4/I5`, los pulsos de `1.0 s` (`Q2/Q3`) y los contadores independientes `C1/C2`. |
| **Integrante 3 (Seguridad y Fallas)** | Explica el **Watchdog `TON 5.0 s`**, el sensor `I6`, el uso de la Marca `M1` para evitar recursión en LOGO! y el enclavamiento de rearme (`I2 AND NOT I6`). |
| **Integrante 4 (Gemelo Digital SoftPLC)** | Explica el ciclo de scan de `100 ms` en C# (`.NET 10`), la comunicación en tiempo real vía **SignalR** y la sincronización con el **HMI 3D/2D**. |

---

## 4. Banco de Preguntas Frecuentes del Docente (Con Respuesta Lista)

1. **¿Qué bloque usaron para que la banda siga andando después de soltar el pulsador de Marcha (`I1`)?**  
   *R:* Un **Relé Autoenclavador (`RS`)**. El pulsador `I1` es momentáneo (NA), así que el bloque `RS` memoriza el estado `1` en `Q1` hasta que llega una señal de Reset (`I2` Paro o `M1` Falla).

2. **¿Cómo detecta el PLC un atasco si el sensor físico `I6` no está en ese punto exacto?**  
   *R:* Con un **temporizador Watchdog (`TON` de `5.0 s`)** disparado cuando la pieza pasa por el sensor inicial `I3`. Si la pieza tarda más de lo normal en llegar a `I4` o `I5`, `TON` alcanza `5.0 s` y dispara la alarma `Q4`, apagando `Q1`.

3. **¿Por qué los desviadores `Q2` y `Q3` usan un temporizador de `1.0 s` en lugar de quedar encendidos?**  
   *R:* Porque un cilindro neumático solo necesita extenderse brevemente para empujar la pieza al carril; si quedara extendido todo el tiempo, bloquearía las piezas siguientes en la banda.

4. **¿Qué pasa si alguien presiona `MARCHA (I1)` mientras la alarma de atasco (`Q4`) está encendida?**  
   *R:* No arranca, porque la entrada `S` del bloque de marcha tiene una compuerta **`AND` con `NOT M1 (Falla)`** (y en C#, el estado `AlarmaAtasco` ignora `I1`). Primero se debe retirar el atasco (`I6 = 0`) y presionar **`PARO / REARME (I2)`**.

5. **¿Por qué al presionar `PARO (I2)` no se borran los contadores `C1` y `C2`?**  
   *R:* Porque en una línea industrial detener la banda por pausa o falla no debe borrar el conteo de producción del turno; los contadores tienen su propia entrada independiente de reset (`I7` / botón `RESET LOTE`).

6. **¿Por qué usaron Marcas (`M1`, `M2`) en el diagrama FBD de LOGO!Soft Comfort?**  
   *R:* Porque LOGO!Soft Comfort no permite conectar directamente la salida de un bloque posterior hacia la entrada de un bloque anterior (recursión) sin pasar por una marca (`M`) o salida (`Q`), que sincroniza la realimentación al siguiente ciclo de scan.

7. **¿Cómo garantizan que el SoftPLC en C# se comporta como un PLC real y no como una app web normal?**  
   *R:* Porque `ConveyorPlcService` corre como un `BackgroundService` con un `PeriodicTimer` fijo de **`100 ms`** simulando el **Scan Cycle** determinístico de un PLC: lee entradas, evalúa toda la máquina de estados, actualiza salidas y luego transmite el snapshot por SignalR.

8. **¿Qué pasaría si activan manualmente `I4` o `I5` sin que la banda haya pasado por `I3`?**  
   *R:* Gracias al control secuencial (`AND` con `M2 Pieza_En_Transito` en LOGO! y el estado `PiezaEnTransito` en C#), no se activan falsos empujes ni conteos fantasma si no entró una pieza válida por `I3` estando la banda en marcha.
