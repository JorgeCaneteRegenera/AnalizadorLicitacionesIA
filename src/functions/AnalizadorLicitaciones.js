import { app } from '@azure/functions';
import { loadConfig, isConfigured } from '../config-manager.js';
import { downloadMonthlyZip, processZipBuffer } from '../zip-service.js';
import { filterRelevantEntries } from '../filter-service.js';
import { parseTenderWithAI, generateEmailSummary } from '../gemini-service.js';
import { sendEmail } from '../email-service.js';
import { loadHistory, saveHistory } from '../history-manager.js';
import { saveResults } from '../results-manager.js';

app.timer('AnalizadorLicitaciones', {
  // Todos los dias a las 08:00 hora de Espana
  schedule: '0 0 8 * * *',
  handler: async (myTimer, context) => {
    const startTime = Date.now();
    context.log('=== ANALIZADOR LICITACIONES REGENERA - INICIO ===');
    context.log('Hora:', new Date().toISOString());

    try {
      const config = loadConfig();
      if (!isConfigured(config)) {
        context.log('ERROR: Configuracion incompleta. Revisa config.json.');
        return;
      }
      context.log(`[CONFIG] Provider email: ${config.emailConfig.provider || 'Smtp'}`);
      context.log(`[CONFIG] Destinatarios: ${config.emailConfig.recipients.join(', ')}`);

      context.log('[PASO 1/5] Descargando ZIP de PLACSP...');
      const { buffer, dateStr } = await downloadMonthlyZip();

      context.log('[PASO 2/5] Procesando ZIP...');
      const allEntries = await processZipBuffer(buffer);
      context.log(`[ZIP] ${allEntries.length} entradas encontradas`);

      context.log('[PASO 3/5] Filtrando licitaciones relevantes...');
      const processedHistory = loadHistory();
      const relevantMap = filterRelevantEntries(allEntries, processedHistory, config);

      if (relevantMap.size === 0) {
        context.log('No hay licitaciones nuevas hoy. Todo al dia.');
        return;
      }

      context.log(`[PASO 4/5] Analizando ${relevantMap.size} licitaciones con Gemini...`);
      const tenders = [];
      let i = 0;
      const total = relevantMap.size;
      const pauseMs = (config.filters?.apiPauseSeconds || 3) * 1000;

      for (const [id, xml] of relevantMap) {
        i++;
        const tender = await parseTenderWithAI(xml, config.geminiApiKey);
        if (tender) {
          tenders.push(tender);
          context.log(`  [${i}/${total}] ${id} -> OK`);
        } else {
          context.log(`  [${i}/${total}] ${id} -> FALLO`);
        }
        if (i < total) await new Promise(r => setTimeout(r, pauseMs));
      }

      context.log(`[IA] Analizadas: ${tenders.length}/${total}`);

      if (tenders.length === 0) {
        context.log('Ninguna licitacion analizada correctamente');
        return;
      }

      tenders.sort((a, b) => (b.budget || 0) - (a.budget || 0));

      context.log('[PASO 5/5] Generando resumen y enviando email...');
      const html = await generateEmailSummary(tenders, dateStr, config.geminiApiKey);
      await sendEmail(html, dateStr, config);

      const newIds = tenders.map(t => t.id);
      saveHistory(newIds);
      saveResults(tenders, dateStr);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      context.log(`=== COMPLETADO en ${elapsed}s: ${tenders.length} licitaciones enviadas ===`);
    } catch (error) {
      context.log('ERROR CRITICO:', error.message);
      throw error;
    }
  }
});
