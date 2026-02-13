// ============================================================
// SERVICIO GEMINI - Analisis con IA de licitaciones
// ============================================================

import { GoogleGenAI, Type } from '@google/genai';
import { trackApiCall, canMakeApiCall } from './usage-tracker.js';

// Modelo a usar - gemini-2.5-flash es el mejor balance calidad/coste
const MODEL = 'gemini-2.5-flash';

const tenderSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: "Numero de Expediente." },
    title: { type: Type.STRING, description: "Titulo de la licitacion." },
    summary: { type: Type.STRING, description: "Resumen de la licitacion." },
    publicationDate: { type: Type.STRING, description: "Fecha de publicacion." },
    contractingAuthority: { type: Type.STRING, description: "Organo de contratacion." },
    province: { type: Type.STRING, description: "Provincia del LUGAR DE EJECUCION." },
    budget: { type: Type.NUMBER, description: "Presupuesto base (sin impuestos)." },
    currency: { type: Type.STRING, description: "Moneda (EUR)." },
    deadline: { type: Type.STRING, description: "Fecha fin de presentacion." },
    link: { type: Type.STRING, description: "Enlace a la licitacion." },
    cpvCodes: { type: Type.ARRAY, items: { type: Type.STRING } },
    status: { type: Type.STRING },
    executionPeriod: { type: Type.STRING },
    procedure: { type: Type.STRING },
    awardCriteria: { type: Type.STRING },
    provisionalGuarantee: { type: Type.STRING },
    solvency: { type: Type.STRING },
  },
  required: ["id", "title", "summary", "contractingAuthority", "province", "link", "cpvCodes", "status"],
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extrae el tiempo de espera sugerido por Gemini en un error 429
 */
function extractRetryDelay(error) {
  try {
    const errObj = JSON.parse(error.message);
    const retryInfo = errObj?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
    if (retryInfo?.retryDelay) {
      const secs = parseInt(retryInfo.retryDelay);
      return (secs + 2) * 1000; // Sumar 2 segundos de margen
    }
  } catch {}
  return null;
}

function extractDateManually(xml) {
  const noticeBlocks = xml.match(/<cac-place-ext:ValidNoticeInfo>[\s\S]*?<\/cac-place-ext:ValidNoticeInfo>/g);
  if (!noticeBlocks) return null;
  let latestDate = "";
  for (const block of noticeBlocks) {
    if (!block.match(/<cac-place-ext:NoticeTypeCode[^>]*>DOC_CN<\/cac-place-ext:NoticeTypeCode>/)) continue;
    const dateMatch = block.match(/<cbc:IssueDate>\s*(\d{4}-\d{2}-\d{2})\s*<\/cbc:IssueDate>/);
    if (dateMatch && dateMatch[1] > latestDate) latestDate = dateMatch[1];
  }
  return latestDate || null;
}

function extractBudgetManually(xml) {
  const match = xml.match(/<cbc:TaxExclusiveAmount[^>]*>\s*([\d.]+)\s*<\/cbc:TaxExclusiveAmount>/) ||
                xml.match(/<cbc:EstimatedOverallContractAmount[^>]*>\s*([\d.]+)\s*<\/cbc:EstimatedOverallContractAmount>/);
  return match ? parseFloat(match[1]) : null;
}

function extractIdManually(xml) {
  const titleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  const expMatch = title.match(/Expediente:\s*([^\s<,]+)/i);
  if (expMatch) return expMatch[1].trim();
  const idTagMatch = xml.match(/<id>(.*?)<\/id>/);
  if (idTagMatch) {
    const parts = idTagMatch[1].trim().split('/');
    return parts[parts.length - 1] || idTagMatch[1].trim();
  }
  return `gen-${Math.random()}`;
}

/**
 * Analiza una entrada XML con Gemini y extrae datos estructurados
 */
export async function parseTenderWithAI(xmlEntry, apiKey) {
  const maxRetries = 5;
  const manualDate = extractDateManually(xmlEntry);
  const manualBudget = extractBudgetManually(xmlEntry);
  const manualId = extractIdManually(xmlEntry);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!canMakeApiCall()) {
        console.error(`[GEMINI] LIMITE DIARIO ALCANZADO. Licitacion ${manualId} no analizada.`);
        return null;
      }

      const ai = new GoogleGenAI({ apiKey });
      const callCount = trackApiCall();
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `Analiza este XML y extrae los datos tecnicos.
                IMPORTANTE: Prioriza la provincia del lugar de ejecucion, no la sede del organo.
                XML:\n${xmlEntry}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: tenderSchema,
        },
      });

      if (callCount % 50 === 0) {
        console.log(`[GEMINI] Uso API hoy: ${callCount}/1.000 peticiones`);
      }

      const parsed = JSON.parse(response.text.trim());
      return {
        ...parsed,
        id: manualId,
        budget: manualBudget !== null ? manualBudget : (parsed.budget || 0),
        publicationDate: manualDate || parsed.publicationDate || new Date().toISOString().split('T')[0]
      };
    } catch (error) {
      const retryDelay = extractRetryDelay(error);
      const is429 = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');

      if (attempt < maxRetries) {
        const waitMs = retryDelay || (is429 ? 20000 * attempt : 3000 * attempt);
        const waitSec = Math.round(waitMs / 1000);
        if (is429) {
          console.log(`[GEMINI] Rate limit - esperando ${waitSec}s antes de reintentar (${attempt}/${maxRetries})...`);
        } else {
          console.log(`[GEMINI] Reintento ${attempt}/${maxRetries} (esperando ${waitSec}s)...`);
        }
        await sleep(waitMs);
      } else {
        console.error(`[GEMINI] Fallo definitivo analizando licitacion: ${manualId}`);
        return null;
      }
    }
  }
  return null;
}

/**
 * Genera un resumen HTML profesional para email
 */
export async function generateEmailSummary(tenders, dateStr, apiKey) {
  if (tenders.length === 0) return "No hay licitaciones nuevas.";

  const simplifiedTenders = tenders.map(t => ({
    titulo: t.title,
    organismo: t.contractingAuthority,
    provincia: t.province,
    presupuesto: t.budget,
    fecha_publicacion: t.publicationDate,
    plazo_presentacion: t.deadline,
    plazo_ejecucion: t.executionPeriod,
    cpv: t.cpvCodes?.join(', '),
    enlace: t.link
  }));

  const prompt = `Genera un resumen profesional en HTML para un email informativo de licitaciones publicas.
  Fecha de datos: ${dateStr}

  INSTRUCCIONES DE FORMATO:
  - Usa HTML con estilos inline para que se vea bien en clientes de email
  - Para cada licitacion, crea un bloque con borde y padding
  - Incluye: Titulo (en negrita), Organismo, Provincia, Presupuesto (formateado con EUR),
    Fecha publicacion, Codigos CPV, Plazo para presentar ofertas, Plazo de ejecucion,
    Enlace al expediente (como link clickable)
  - Al inicio pon un resumen: "Se han encontrado X licitaciones relevantes para REGENERA"
  - Usa colores corporativos suaves: azul (#1e40af) para titulos, gris claro (#f8fafc) para fondo de bloques

  Licitaciones:
  ${JSON.stringify(simplifiedTenders, null, 2)}`;

  // Reintentos con espera para el resumen tambien
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!canMakeApiCall()) {
        throw new Error("LIMITE DIARIO DE API ALCANZADO. Reintenta manana.");
      }
      const ai = new GoogleGenAI({ apiKey });
      trackApiCall();
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
      });
      return response.text || "Error al generar resumen.";
    } catch (error) {
      const is429 = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');
      if (is429 && attempt < maxRetries) {
        const retryDelay = extractRetryDelay(error) || 20000 * attempt;
        const waitSec = Math.round(retryDelay / 1000);
        console.log(`[GEMINI] Rate limit en resumen - esperando ${waitSec}s (${attempt}/${maxRetries})...`);
        await sleep(retryDelay);
      } else {
        throw new Error("Error de IA al generar resumen: " + error.message);
      }
    }
  }
}
