// =============================================================================
//  Función serverless (Vercel) — Análisis de escrituras con Claude
//  Recibe un PDF (la escritura) en base64, se lo pasa a Claude Opus 4.8 y
//  devuelve los linderos de la propiedad en datos estructurados, listos para
//  dibujarse sobre el plano en el front.
//
//  La API key vive SOLO aquí, en una variable de entorno secreta del hosting
//  (ANTHROPIC_API_KEY). Nunca se expone al navegador.
// =============================================================================
import Anthropic from "@anthropic-ai/sdk";

// Hasta 60s: leer y razonar sobre una escritura puede tardar.
export const config = { maxDuration: 60 };

// Esquema de la respuesta estructurada que exigimos a Claude.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    es_escritura: { type: "boolean" },
    resumen: { type: "string" },
    superficie_m2: { anyOf: [{ type: "number" }, { type: "null" }] },
    linderos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          orientacion: { type: "string" },                       // "Norte", "Sureste", ...
          azimut_grados: { anyOf: [{ type: "number" }, { type: "null" }] }, // N=0, E=90, S=180, O=270
          longitud_metros: { anyOf: [{ type: "number" }, { type: "null" }] },
          colinda_con: { type: "string" },
          cita_textual: { type: "string" },
        },
        required: ["orientacion", "azimut_grados", "longitud_metros", "colinda_con", "cita_textual"],
      },
    },
  },
  required: ["es_escritura", "resumen", "superficie_m2", "linderos"],
};

const PROMPT = `Eres un perito que lee escrituras de propiedades inmobiliarias en español.
Analiza el documento adjunto (es una escritura o descripción legal de un terreno) y extrae los LINDEROS del perímetro de la propiedad.

Para cada lindero (lado del terreno) indica:
- "orientacion": el punto cardinal tal como aparece (Norte, Sur, Este, Oeste, Noreste, Noroeste, Sureste, Suroeste).
- "azimut_grados": el rumbo en grados con Norte=0, Este=90, Sur=180, Oeste=270 (Noreste=45, Sureste=135, Suroeste=225, Noroeste=315). Si la escritura da un rumbo más preciso (p. ej. "N 45° E"), conviértelo a grados. Si no puedes determinarlo, usa null.
- "longitud_metros": la longitud del lado en METROS como número. Convierte números escritos con letra ("treinta y cinco metros" → 35). Si está en otra unidad (varas, pies), conviértela a metros y anótalo en cita_textual. Si no hay medida, usa null.
- "colinda_con": con qué o con quién linda ese lado (nombre del vecino, calle, río...). Cadena vacía si no consta.
- "cita_textual": el fragmento literal de la escritura del que sacaste este lindero.

También:
- "superficie_m2": superficie total del terreno en metros cuadrados si se indica (número), o null.
- "resumen": 1-2 frases describiendo la finca.
- "es_escritura": true si el documento realmente describe una propiedad con linderos; false si no (en ese caso devuelve linderos vacío y explica en resumen).

Devuelve EXCLUSIVAMENTE los datos estructurados. No inventes medidas que no aparezcan en el documento.`;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Usa POST." });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Falta la variable de entorno ANTHROPIC_API_KEY en el hosting. Añádela en la configuración del proyecto.",
    });
  }

  // El body llega como JSON: { pdf_base64, filename }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const pdfBase64 = body.pdf_base64;
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return res.status(400).json({ ok: false, error: "Falta 'pdf_base64' (la escritura en PDF)." });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ ok: false, error: "La IA no pudo procesar este documento." });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return res.status(502).json({ ok: false, error: "Respuesta vacía de la IA." });

    const data = JSON.parse(textBlock.text);
    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    const status = err?.status || 500;
    const msg =
      status === 401 ? "API key inválida (revisa ANTHROPIC_API_KEY)."
      : status === 429 ? "Límite de uso alcanzado, prueba de nuevo en un momento."
      : err?.message || "Error al llamar a la IA.";
    return res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, error: msg });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
