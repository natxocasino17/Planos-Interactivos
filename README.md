# 📐 Planos Interactivos

Web para **visualizar y delimitar propiedades inmobiliarias** sobre planos de planta o
fotos aéreas. Permite trazar los linderos de un terreno punto por punto, ajustarlos
arrastrando las esquinas, darles color/estilo y etiquetar cada lado con su medida.

Es una **web estática** (HTML + CSS + JavaScript puro con HTML5 Canvas). El núcleo
**no requiere instalación, compilación, servidor ni claves**, y funciona en GitHub Pages.

## 📐 Detectar linderos desde la escritura (gratis, en el navegador)

Flujo: subes la **foto/plano** y la **escritura en PDF** (o `.txt`) → pulsas *"Detectar
linderos del documento"* → la web lee el texto **dentro del propio navegador** y dibuja
el perímetro. Luego lo **arrastras, escalas y giras** para encajarlo en la foto y afinas
los vértices.

Dos casos:

1. **Con coordenadas (UTM):** si la escritura trae coordenadas, el perímetro se dibuja
   con su **forma, orientación y medidas EXACTAS** (no aproximadas).
2. **Sin coordenadas:** se reconstruye por **rumbos** (Norte/Sur/Este…) + **longitudes en
   metros** (entiende cifras y números escritos con letra, p. ej. *"treinta y cinco
   metros"*). La forma es aproximada y tú la ajustas sobre la foto.

Tecnología: [pdf.js](https://mozilla.github.io/pdf.js/) (lectura del PDF en el navegador)
+ un analizador de texto en `app.js`. **Sin coste, sin tokens, sin backend.**

> ⚠️ **Limitaciones honestas:** solo lee PDFs **con texto** (digitales); si es **escaneado**
> (solo imagen) no hay texto que extraer — pega el texto a mano en el recuadro. Con
> redacciones poco habituales el analizador puede no detectar algún lado.

### (Opcional) Modo avanzado con IA — `api/` + Vercel

Para escrituras escaneadas o con redacción compleja, el repo incluye un backend opcional
(`api/analizar-escritura.js`) que usa **Claude Opus 4.8** para leer el PDF. Requiere
desplegar en Vercel y una API key (`ANTHROPIC_API_KEY`). **No es necesario** para el modo
gratuito anterior; queda como alternativa para casos difíciles.

## ▶️ Cómo abrirla

Opción rápida: doble clic en `index.html` (se abre en el navegador).

Opción recomendada (evita restricciones de `file://` en algunos navegadores), desde la carpeta del proyecto:

```bash
python3 -m http.server 8080
# y abre http://localhost:8080
```

## 🧰 Funcionalidades

**Lienzo interactivo**
- ✏️ **Dibujar**: clic para colocar vértices que se unen con líneas. Clic en el punto
  verde inicial (o `Enter`) para cerrar el perímetro. `Esc` cancela.
- 🖱️ **Seleccionar / mover**: arrastra cualquier vértice para reubicarlo sobre la foto;
  arrastra el interior para mover todo el lindero.
- ✂️ **Borrar**: clic en un vértice para quitarlo; clic en una línea para abrir el perímetro.
- 🔍 **Zoom** (rueda del ratón o botones `＋ / －`) y **Pan** (`Espacio` + arrastrar, o
  arrastrar el fondo). Las líneas se mantienen ancladas a la imagen.

**Personalización (panel derecho)**
- Color del perímetro (selector + paleta rápida).
- Grosor y tipo de línea (sólida, discontinua, punteada).
- Relleno translúcido del terreno con color y opacidad regulables.
- **Color por línea individual** (ej. *Norte* en rojo, *Sur* en azul).
- **Etiquetas flotantes** por lado (ej. *"35 metros"*).

**Capas / Linderos (panel izquierdo)**
- Lista de linderos; al pasar el cursor se resalta en el lienzo.
- Icono 👁 para mostrar/ocultar y 🗑 para eliminar.
- Renombrado en vivo desde el panel de estilo.

**Carga de documentos**
- Imagen (plano o foto aérea) por arrastrar-y-soltar.
- Escritura / descripción legal en `.txt` (se muestra como referencia).
- Plano de ejemplo generado por defecto para probar sin subir nada.

**Persistencia**
- 💾 **Exportar** / 📂 **Importar** el proyecto como JSON (coordenadas + estilos).

## 🗂️ Estructura

```
index.html   · estructura y paneles
styles.css   · diseño tipo software profesional (tema oscuro)
app.js       · motor del Canvas: render, hit-testing, herramientas, paneles
```

---

## 🏛️ Notas de arquitectura para producción

**1. ¿Qué biblioteca de canvas usar?**

Para el prototipo se eligió **HTML5 Canvas puro** (cero dependencias, máximo control y
rendimiento, ideal para una web ligera que solo se abre en el navegador).

Para **producción** la recomendación es **Konva.js** (o `react-konva` si el front es React):

- Aporta un **scene-graph** con detección de impactos (hit-graph) por objeto, eventos por
  forma, `draggable` nativo y agrupación en capas — justo lo que pide *agregar/quitar/arrastrar*
  vértices con precisión, sin reimplementar el *hit-testing* a mano.
- Más **ligero y orientado a interactividad** que Fabric.js (Fabric brilla en edición tipo
  "diseño gráfico" pero pesa más y trae funciones que aquí sobran).
- **SVG nativo** es excelente en precisión y accesibilidad, pero degrada con muchos nodos
  (cientos de vértices/etiquetas) por la presión sobre el DOM; Canvas/Konva escala mejor.

Regla práctica: **Canvas/Konva** si esperas muchos elementos, zoom intensivo o imágenes
grandes; **SVG** si priorizas pocos elementos, exportación vectorial y accesibilidad.

**2. ¿Cómo persistir coordenadas y estilos para recargarlos idénticos?**

Guardar una **representación geométrica + estilo desacoplada del render**, no píxeles:

```jsonc
{
  "propiedadId": "uuid",
  "imagen": { "url": "...", "anchoPx": 1280, "altoPx": 860 },
  "linderos": [
    {
      "id": "uuid",
      "nombre": "Lindero Norte",
      "puntos": [{ "x": 120.5, "y": 80.0 }],   // en coords de la imagen, NO de pantalla
      "cerrado": true,
      "estilo": { "color": "#ef4444", "grosor": 3, "tipoLinea": "solid",
                  "relleno": true, "colorRelleno": "#ef4444", "opacidad": 0.18 },
      "aristas": { "0": { "color": "#3b82f6", "etiqueta": "35 m" } }
    }
  ]
}
```

Claves de diseño:

- **Coordenadas en el sistema de la imagen** (px del original o, mejor, **normalizadas 0–1**
  respecto a ancho/alto). Así son independientes del zoom, del tamaño de pantalla y del
  *device-pixel-ratio*, y se recargan exactamente igual. El zoom/pan es solo una transformación
  de vista que **no** se persiste (o se guarda aparte como preferencia de la sesión).
- **Modelo en JSONB** en PostgreSQL (con PostGIS si se necesitan consultas espaciales:
  área, intersección, distancias reales) o en cualquier documento NoSQL.
- **Versionar el esquema** (`"version": 1`) para migraciones futuras.
- Para georreferenciación real, guardar además la **matriz de transformación imagen→coordenadas
  geográficas** (lat/long) y los metadatos del plano.

> El botón **Exportar** de esta web ya produce un JSON con exactamente esta filosofía
> (coordenadas en espacio imagen + estilos), e **Importar** lo reconstruye idéntico.
