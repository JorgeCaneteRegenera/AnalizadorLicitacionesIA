// ============================================================
// RUN SERVICE - Ejecuta el analisis con callbacks de progreso
// ============================================================

import { loadConfig, isConfigured } from './config-manager.js';
import { downloadMonthlyZip, processZipBuffer } from './zip-service.js';
import { filterRelevantEntries } from './filter-service.js';
import { parseTenderWithAI, generateEmailSummary } from './gemini-service.js';
import { sendEmail } from './email-service.js';
import { loadHistory, saveHistory } from './history-manager.js';
import { saveResults, getAllResultIds } from './results-manager.js';

const STEP_TOTAL = 5;

function nowEs() {
  return new Date().toLocaleString('es-ES');
}

export async function runAnalysis({
  testMode = false,
  onLog,
  onStep,
  onProgress,
  onTender,
  onFinish,
  onError,
} = {}) {
  const startTime = Date.now();
  const log = (msg) => onLog && onLog(msg);
  const step = (idx, label) => onStep && onStep({ step: idx, total: STEP_TOTAL, label });
  const progress = (current, total) => onProgress && onProgress({ current, total });

  try {
    log('==========================================================');
    log('  ANALIZADOR DE LICITACIONES PUBLICAS - REGENERA');
    log(`  ${nowEs()}`);
    log('==========================================================');

    const config = loadConfig();
    if (!isConfigured(config)) {
      throw new Error('La aplicacion no esta configurada. Ejecuta "configurar.bat".');
    }

    log(`[CONFIG] API Gemini: ...${config.geminiApiKey.slice(-6)}`);
    log(`[CONFIG] SMTP: ${config.emailConfig.smtp.user}`);
    log(`[CONFIG] Destinatarios: ${config.emailConfig.recipients.join(', ')}`);

    step(1, 'Descargando datos de PLACSP');
    const { buffer, dateStr } = await downloadMonthlyZip();

    step(2, 'Procesando archivo ZIP');
    const allEntries = await processZipBuffer(buffer);

    step(3, 'Filtrando licitaciones relevantes');
    const processedHistory = loadHistory();
    const resultIds = getAllResultIds();
    for (const id of resultIds) processedHistory.add(id);
    const relevantMap = filterRelevantEntries(allEntries, processedHistory, config);

    if (relevantMap.size === 0) {
      log('No hay licitaciones nuevas hoy.');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const payload = { dateStr, tenders: [], elapsed };
      onFinish && onFinish(payload);
      return payload;
    }

    step(4, `Analizando ${relevantMap.size} licitaciones con Gemini`);
    const tenders = [];
    let i = 0;
    const total = relevantMap.size;

    for (const [id, xmlEntry] of relevantMap) {
      i++;
      progress(i, total);
      log(`Analizando ${i}/${total}: ${id.substring(0, 30)}...`);
      const tender = await parseTenderWithAI(xmlEntry, config.geminiApiKey);
      if (tender) {
        tenders.push(tender);
        onTender && onTender(tender);
        log(`OK: ${tender.title}`);
      } else {
        log(`FALLO: ${id}`);
      }

      const pauseMs = (config.filters?.apiPauseSeconds || 3) * 1000;
      if (i < total) await new Promise(r => setTimeout(r, pauseMs));
    }

    if (tenders.length === 0) {
      throw new Error('Ninguna licitacion pudo ser analizada. Revisa la API key.');
    }

    tenders.sort((a, b) => (b.budget || 0) - (a.budget || 0));

    step(5, 'Generando resumen y enviando email');
    const htmlSummary = await generateEmailSummary(tenders, dateStr, config.geminiApiKey);

    if (testMode) {
      log('[TEST] Modo test: no se envia email.');
    } else {
      await sendEmail(htmlSummary, dateStr, config);
      const newIds = tenders.map(t => t.id);
      saveHistory(newIds);
      saveResults(tenders, dateStr);
      log(`[RESULTADOS] Guardadas ${tenders.length} licitaciones en data/results.json`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const payload = { dateStr, tenders, elapsed, testMode };
    onFinish && onFinish(payload);
    return payload;
  } catch (error) {
    onError && onError(error);
    throw error;
  }
}
