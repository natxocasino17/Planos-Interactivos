# 📐 Planos Interactivos

Web para **visualizar y delimitar propiedades inmobiliarias** sobre planos de planta o
fotos aéreas. Permite trazar los linderos de un terreno punto por punto, ajustarlos
arrastrando las esquinas, darles color/estilo y etiquetar cada lado con su medida.

El editor es una **web estática** (HTML + CSS + JavaScript puro con HTML5 Canvas).
Además incluye un módulo opcional de **IA** que lee la escritura (PDF) con **Claude
Opus 4.8** y genera automáticamente los linderos para que solo tengas que ajustarlos
sobre la foto.

## 🤖 IA: generar linderos desde la escritura (PDF)

Flujo: subes la **foto/plano** y la **escritura en PDF** → pulsas *"Generar linderos con
IA"* → Claude lee la escritura, extrae cada lindero (orientación, longitud en metros y
con quién linda) y dibuja el perímetro → tú lo **arrastras, escalas y giras** para
encajarlo en la foto y afinas los vértices.

> ⚠️ **Importante:** una escritura describe la *forma y medidas* del terreno, pero casi
> nunca dónde está exactamente sobre tu foto (escala, posición, rotación). Por eso la IA
> **propone** el polígono y tú lo **anclas**. Solo sería 100% automático si la escritura
> trae coordenadas GPS/UTM y la foto está georreferenciada.

### Arquitectura del módulo IA

- `api/analizar-escritura.js` — función **serverless** (Vercel). Recibe el PDF en base64,
  llama a Claude con **salida estructurada** (JSON Schema) y devuelve los linderos.
- La **API key vive solo en el servidor** (variable de entorno `ANTHROPIC_API_KEY`),
  nunca en el navegador.
- El front (`app.js`) reconstruye el polígono encadenando los rumbos + distancias.

### Desplegar el backend (Vercel)

1. En [vercel.com](https://vercel.com) → *Add New Project* → importa este repositorio.
2. En *Settings → Environment Variables* añade `ANTHROPIC_API_KEY` con tu clave de
   [console.anthropic.com](https://console.anthropic.com).
3. Deploy. La web + la IA quedan en tu enlace `…vercel.app`.

> El enlace de **GitHub Pages** sigue sirviendo el editor manual, pero la IA solo
> funciona en el despliegue de **Vercel** (es quien tiene el backend con la clave).

Es una **web estática** en su núcleo: el editor no requiere instalación ni compilación.

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
