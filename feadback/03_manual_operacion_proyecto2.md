# Manual Breve de Operación — Estación Clasificadora por Banda (Proyecto 2)

**Dirigido a:** Operadores de línea y personal no técnico  
**Equipo:** Estación `STN-02` — Banda Transportadora con Clasificación Automática (Cat A / Cat B)

---

## 1. Descripción General para el Operador

Esta estación transporta piezas sobre una banda motriz, identifica automáticamente si pertenecen al **Lote A (piezas metálicas/altas)** o al **Lote B (piezas de polímero/bajas)**, y las empuja mediante cilindros neumáticos hacia su contenedor correspondiente mientras lleva el conteo en pantalla.

### Indicadores Luminosos (Torreta de Señalización)
| Color en Torreta | Significado | Estado de la Máquina |
| :---: | :--- | :--- |
| **Ámbar (Fijo)** | **EN ESPERA (`STOP`)** | La máquina está energizada y segura, pero la banda está detenida. |
| **Verde (Fijo)** | **EN MARCHA (`RUN`)** | La banda está girando y lista para recibir y clasificar piezas. |
| **Rojo (Parpadeante + Sirena)** | **ALARMA DE ATASCO** | Ocurrió una obstrucción en la banda. La banda se detuvo automáticamente por seguridad. |

---

## 2. Cómo Encender y Arrancar la Línea

1. **Verifique el área de trabajo:** Asegúrese de que no haya piezas obstruidas sobre la banda ni herramientas cerca de los cilindros neumáticos (`Y1` y `Y2`).
2. **Verifique la torreta:** Debe encontrarse en **Ámbar (`STOP`)** y la pantalla de estado debe indicar *"Sistema detenido. Presione MARCHA"*.
3. **Presione el botón verde `MARCHA LÍNEA` (`I1`):**
   * La torreta cambiará a **Verde (`RUN`)**.
   * El motor de la banda comenzará a girar de forma continua.
   * Ya puede colocar piezas en la zona de carga (al inicio de la banda, antes del primer sensor `B1`).

---

## 3. Operación Normal y Lectura de Contadores

* **Ingreso de piezas:** Coloque las piezas una por una al inicio de la banda.
* **Clasificación automática:**
  * Las piezas de **Categoría A** se desvían hacia el **Colector 01 (Azul/Cian)**.
  * Las piezas de **Categoría B** continúan hasta el segundo punto y se desvían hacia el **Colector 02 (Ámbar/Naranja)**.
* **Consulta de producción:** En los visores digitales de cada colector (`UNIDADES 0000`) se muestra el total acumulado de cada categoría.
* **Reinicio de conteo (Cambio de turno o lote):** Si desea empezar un nuevo lote desde cero, presione el botón **`RESET LOTE`** para poner ambos contadores en `0000`.
* **Detención controlada:** Para pausar o apagar la línea al finalizar el turno, presione el botón rojo **`PARO / REARME` (`I2`)**. La banda se detendrá de forma inmediata conservando los contadores del turno.

---

## 4. Qué Hacer Ante una Alarma de Atasco

Si una pieza se queda trabada en la banda más de **5 segundos** o activa el sensor de obstrucción, el sistema activará la **Alarma de Atasco**:
* **Qué observará:** La banda se detiene por completo, la torreta parpadea en **Rojo**, suena la sirena de aviso y la pantalla muestra un mensaje rojo de **`FALLA / ATASCO ENCLAVADO`**.

> ⚠️ **Importante:** Por seguridad, el botón verde de **`MARCHA`** quedará bloqueado mientras exista la alarma. No intente forzar el arranque sin revisar la banda.

### Pasos para Restablecer el Sistema:
1. *(Opcional en HMI)* Si desea silenciar temporalmente el sonido mientras atiende la falla, utilice el botón **`AUDIO H1: SILENCIADO`** en la esquina superior derecha.
2. **Inspeccione la banda físicamente** y retire la pieza caída, cruzada o atascada. Verifique que ningún objeto esté bloqueando los sensores ópticos ni el sensor de atasco (`I6`).
3. **Presione el botón rojo `PARO / REARME` (`I2`):**
   * La sirena se apagará inmediatamente.
   * La torreta roja volverá a **Ámbar (`STOP`)**.
4. **Presione nuevamente el botón verde `MARCHA LÍNEA` (`I1`)** para reanudar la producción normal.
