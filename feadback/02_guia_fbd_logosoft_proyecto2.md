# Guía Paso a Paso en LOGO!Soft Comfort (FBD) — Proyecto 2

Esta guía detalla **exactamente qué bloques arrastrar y cómo conectar cada patilla** dentro de **Siemens LOGO!Soft Comfort** (en modo **Diagrama de Funciones / FBD**) para replicar la misma lógica del Gemelo Digital y cumplir con el **35% de Lógica FBD** y el **15% de Simulación** de la rúbrica.

---

## 1. Configuración Inicial del Proyecto en LOGO!Soft Comfort

1. Abre **LOGO!Soft Comfort**.
2. Crea un nuevo esquema: **Archivo $\rightarrow$ Nuevo $\rightarrow$ Diagrama de funciones (FBD)**.
3. En **Archivo $\rightarrow$ Propiedades $\rightarrow$ Nombres de E/S** (*I/O Names*), asigna las etiquetas exactamente igual que la tabla I/O oficial:
   * `I1`: `Marcha` *(Configurar en simulación como **Pulsador NA**)*
   * `I2`: `Paro_Rearme` *(Configurar en simulación como **Pulsador NA** para la lógica positiva de paro/reset)*
   * `I3`: `Sensor_Inicio` *(Pulsador NA)*
   * `I4`: `Sensor_Cat_A` *(Pulsador NA)*
   * `I5`: `Sensor_Cat_B` *(Pulsador NA)*
   * `I6`: `Sensor_Atasco` *(Interruptor NA, para poder dejarlo enclavado y probar el bloqueo)*
   * `I7`: `Reset_Contadores` *(Pulsador NA — Opcional para limpiar `C1` y `C2`)*
   * `Q1`: `Motor_Banda`
   * `Q2`: `Desviador_A`
   * `Q3`: `Desviador_B`
   * `Q4`: `Alarma_Atasco`

> **Nota clave sobre recursión en LOGO!Soft Comfort:**  
> En LOGO! FBD no puedes conectar la salida de un bloque directamente hacia atrás a la entrada de un bloque anterior sin pasar por una **Marca (`M`)** o **Salida (`Q`)**. Por eso utilizaremos **`M1`** (Falla Activa) y **`M2`** (Pieza en Tránsito) en los puntos de realimentación.

---

## 2. Lista de Bloques y Cableado Patilla por Patilla

Organiza tu lienzo en **4 zonas horizontales** (de arriba hacia abajo) para que quede limpio y fácil de explicar en la defensa oral:

### Zona A — Control de Marcha, Paro y Motor de Banda (`Q1`)
1. Arrastra una compuerta **`AND`** (`B001_AND_RUN`):
   * **Entrada 1:** `I1` (Marcha)
   * **Entrada 2:** `M1` (**Haz clic derecho en la patilla e inviértela** para que quede como `NOT M1` — impide arrancar si hay alarma activa).
2. Arrastra una compuerta **`OR`** (`B002_OR_STOP`):
   * **Entrada 1:** `I2` (Paro / Rearme)
   * **Entrada 2:** `M1` (Falla Activa — detiene el motor si ocurre un atasco).
3. Arrastra un **Relé Autoenclavador (`SF` $\rightarrow$ Latching Relay)** (`SF01`):
   * **Pin `S` (Set):** Salida de `B001_AND_RUN`
   * **Pin `R` (Reset):** Salida de `B002_OR_STOP`
   * **Salida de `SF01`:** Conéctala directamente a la salida **`Q1` (`Motor_Banda`)**.

---

### Zona B — Memoria de Pieza en Tránsito y Watchdog de Atasco (`TON` + `Q4`)
1. Arrastra una compuerta **`AND`** (`B003_AND_INICIO`):
   * **Entrada 1:** `I3` (Sensor Presencia Inicio)
   * **Entrada 2:** **`Q1`** (solo inicia tránsito si el motor de banda está encendido).
2. Arrastra una compuerta **`OR`** (`B004_OR_FIN_TRN`):
   * **Entrada 1:** **`Q2`** (Desviador A se activó — así garantizamos que `M2` se apaga en el ciclo siguiente sin competir en el mismo scan con `I4`)
   * **Entrada 2:** **`Q3`** (Desviador B se activó)
   * **Entrada 3:** `I2` (Operador presionó Paro/Rearme)
   * **Entrada 4:** `M1` (Ocurrió falla)
3. Arrastra un **Relé Autoenclavador (`SF` $\rightarrow$ Latching Relay)** (`SF02`):
   * **Pin `S` (Set):** Salida de `B003_AND_INICIO`
   * **Pin `R` (Reset):** Salida de `B004_OR_FIN_TRN`
   * **Salida de `SF02`:** Conéctala a la Marca **`M2` (`Pieza_En_Transito`)**.
4. Arrastra un **Retardo a la conexión (`SF` $\rightarrow$ On-Delay / `TON`)** (`B005_TON_WATCHDOG`):
   * **Pin `Trg`:** Salida de `M2` (`Pieza_En_Transito`).
   * **Doble clic al bloque `B005`:** Configura tiempo **`T = 05:00 s`** (`5.0 segundos`).
5. Arrastra una compuerta **`OR`** (`B006_OR_FALLA`):
   * **Entrada 1:** Salida de `B005_TON_WATCHDOG` (superó 5 segundos sin llegar a `I4` ni `I5`).
   * **Entrada 2:** `I6` (Sensor físico de atasco).
6. Arrastra una compuerta **`AND`** (`B007_AND_REARME`):
   * **Entrada 1:** `I2` (Paro / Rearme)
   * **Entrada 2:** `I6` (**Haz clic derecho en la patilla e inviértela** `NOT I6` — obliga a retirar el atasco físico antes de poder borrar la alarma).
7. Arrastra un **Relé Autoenclavador (`SF` $\rightarrow$ Latching Relay)** (`SF03`):
   * **Pin `S` (Set):** Salida de `B006_OR_FALLA`
   * **Pin `R` (Reset):** Salida de `B007_AND_REARME`
   * **Salida de `SF03`:** Conéctala a **`Q4` (`Alarma_Atasco`)** y también en paralelo a la Marca **`M1` (`Falla_Activa`)**.

---

### Zona C — Clasificación Selectiva y Actuadores Desviadores (`Q2` y `Q3`)
Para garantizar un **control secuencial estricto** (como pide la guía del curso), una pieza solo debe clasificarse si la banda está en marcha (`Q1 = 1`), no hay alarma (`M1 = 0`) y previamente entró por `I3` (`M2 = 1`).

1. **Rama Categoría A (`Q2`):**
   * Arrastra una compuerta **`AND`** (`B008_AND_CAT_A`):
     * **Entrada 1:** `I4` (Sensor Cat A)
     * **Entrada 2:** `M2` (Había una pieza en tránsito)
     * **Entrada 3:** `Q1` (Banda encendida y sin alarma)
   * Arrastra un **Retardo a la desconexión (`SF` $\rightarrow$ *Off-delay* / `TOF`)** (`B009_TOF_A`):
     * **Pin `Trg`:** Salida de `B008_AND_CAT_A`
     * **Pin `R` (Reset):** Salida de `B002_OR_STOP` *(si presionan Paro o salta Falla, corta el cilindro al instante).*
     * **Doble clic al bloque:** Configura **`T = 01:00 s`** (`1.0 s`). *(Como `Q2` resetea `M2` al ciclo siguiente, `B008` genera un pulso limpio de 1 ciclo y `TOF` mantiene el pistón extendido exactamente `1.0 s` aunque hayas dejado pulsado `I4`).*
     * **Salida de `B009`:** Conéctala a **`Q2` (`Desviador_A`)**.

2. **Rama Categoría B (`Q3`):**
   * Arrastra una compuerta **`AND`** (`B010_AND_CAT_B`):
     * **Entrada 1:** `I5` (Sensor Cat B)
     * **Entrada 2:** `M2` (Había una pieza en tránsito)
     * **Entrada 3:** `Q1` (Banda encendida y sin alarma)
   * Arrastra otro **Retardo a la desconexión (`SF` $\rightarrow$ *Off-delay* / `TOF`)** (`B011_TOF_B`):
     * **Pin `Trg`:** Salida de `B010_AND_CAT_B`
     * **Pin `R` (Reset):** Salida de `B002_OR_STOP`
     * **Doble clic al bloque:** Configura **`T = 01:00 s`** (`1.0 s`).
     * **Salida de `B011`:** Conéctala a **`Q3` (`Desviador_B`)**.

---

### Zona D — Contadores Independientes por Categoría (`C1` y `C2`) y Pantalla LCD
1. **Contador Categoría A (`B012_CNT_A`):**
   * Arrastra un **Contador adelante/atrás (`SF` $\rightarrow$ Up/Down Counter)**.
   * **Pin `Cnt`:** Salida de `B008_AND_CAT_A` (cuenta `+1` cada vez que se detecta y desvía una pieza A).
   * **Pin `Dir`:** Sin conectar (`0` = conteo ascendente).
   * **Pin `R`:** Conéctalo a `I7` (`Reset_Contadores`, si lo incluiste) o déjalo sin conectar.
2. **Contador Categoría B (`B013_CNT_B`):**
   * Arrastra otro **Contador adelante/atrás**.
   * **Pin `Cnt`:** Salida de `B010_AND_CAT_B`.
   * **Pin `Dir`:** Sin conectar.
   * **Pin `R`:** `I7` (o sin conectar).
3. **Texto de Aviso en Pantalla LCD (`B014_TEXTO`) *(Muy recomendado para la captura de evidencia)*:**
   * Arrastra un bloque **Texto de aviso (`SF` $\rightarrow$ Message Text)**.
   * **Pin `En`:** Conecta una constante **`hi` (High = 1)** para que la pantalla siempre muestre el monitoreo.
   * En las propiedades del mensaje, inserta los valores actuales (`Cnt`) de `B012_CNT_A` y `B013_CNT_B` y el tiempo transcurrido (`Ta`) de `B005_TON_WATCHDOG`. Así durante la simulación verás en pantalla:
     ```text
     BANDA CLASIFICADORA
     CAT A: [B012 Cnt]
     CAT B: [B013 Cnt]
     WATCHDOG: [B005 Ta]
     ```

---

## 3. Protocolo de Simulación en LOGO!Soft Comfort (`F9`) para Grabar Evidencia

Presiona **`F3`** (o el ícono de **Simulación** / `Herramientas -> Simulación`) y sigue exactamente esta secuencia para capturar el video o capturas de la rúbrica (`15%`):

### Prueba 1: Ciclo Completo de Operación Normal
1. Haz clic derecho en las entradas `I1`, `I2`, `I3`, `I4`, `I5` en la barra inferior del simulador $\rightarrow$ **Parámetros de simulación** $\rightarrow$ ponlas como **Pulsador (contacto normalmente abierto)**, y deja `I6` como **Interruptor**.
2. Pulsa **`I1`** $\rightarrow$ verifica que se enciende la bombilla **`Q1`**.
3. Pulsa **`I3`** (pieza entra) $\rightarrow$ verás que `M2` se enciende y el temporizador `B005` empieza a contar (`0.1s, 0.2s...`).
4. Antes de llegar a `5.0 s`, pulsa **`I4`** (Pieza Tipo A) $\rightarrow$ verás que **`Q2`** se enciende durante `1.0 s`, el contador **`B012 (CAT A)`** sube a **`1`**, y `B005` vuelve a `0.0 s`.
5. Pulsa **`I3`** de nuevo, y antes de `5.0 s` pulsa **`I5`** (Pieza Tipo B) $\rightarrow$ **`Q3`** se enciende `1.0 s` y **`B013 (CAT B)`** sube a **`1`**.

### Prueba 2: Condición de Falla (Atasco por Tiempo y Sensor Físico)
1. Con `Q1` encendido, pulsa **`I3`** y **NO** pulses ni `I4` ni `I5`.
2. Deja que el reloj de `B005_TON_WATCHDOG` llegue a **`5.0 s`**.
3. Al llegar a `5.0 s`, observa que:
   * **`Q1`** se apaga inmediatamente (seguridad).
   * **`Q4`** (Alarma) se enciende y queda enclavada.
   * Si intentas pulsar `I1`, el sistema **no arranca**.
4. Pulsa **`I2`** (Rearme) $\rightarrow$ `Q4` se apaga y el sistema queda listo para volver a arrancar con `I1`.
5. *(Opcional)* Activa el interruptor **`I6`** para demostrar el atasco físico inmediato: intenta pulsar `I2` con `I6` todavía en `1` y comprueba que **no permite rearmar** hasta que pongas `I6 = 0` y vuelvas a pulsar `I2`.
