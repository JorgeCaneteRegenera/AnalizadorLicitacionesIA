import { app } from '@azure/functions';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig, isConfigured } from '../config-manager.js';
import { clearHistory, loadHistory, removeFromHistory } from '../history-manager.js';
import { getUsageStats } from '../usage-tracker.js';
import { searchResults, saveFeedback, loadFeedback, removeTenderFromResults, saveSuggestion } from '../results-manager.js';
import { runAnalysis } from '../run-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_PATH = join(__dirname, '..', 'config-ui.html');

let currentRun = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  step: null,
  progress: null,
  tenders: [],
  logs: [],
  error: null,
};

function addRunLog(msg) {
  currentRun.logs.push({ ts: new Date().toISOString(), msg });
  if (currentRun.logs.length > 200) currentRun.logs = currentRun.logs.slice(-200);
}

function resetRunState() {
  currentRun = {
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    step: null,
    progress: null,
    tenders: [],
    logs: [],
    error: null,
  };
}

function parseJson(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
}

function safeConfig(config) {
  const safe = { ...config };
  if (safe.emailConfig?.smtp?.password) {
    const p = safe.emailConfig.smtp.password;
    safe.emailConfig.smtp.password = p.length > 4 ? '****' + p.slice(-4) : '****';
  }
  if (safe.geminiApiKey) {
    const k = safe.geminiApiKey;
    safe.geminiApiKey = k.length > 6 ? '****' + k.slice(-6) : '****';
  }
  safe._isConfigured = isConfigured(config);
  const history = loadHistory();
  safe._historyCount = history.size;
  return safe;
}

function getClientPrincipal(req) {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function ensureTenant(req) {
  const tenantId = process.env.REGENERA_TENANT_ID;
  if (!tenantId) return null;
  const principal = getClientPrincipal(req);
  if (!principal?.claims) return { status: 401, message: 'No autenticado' };
  const tid = principal.claims.find(c => c.typ === 'http://schemas.microsoft.com/identity/claims/tenantid')?.val;
  if (!tid || tid !== tenantId) return { status: 403, message: 'Tenant no autorizado' };
  return null;
}

app.http('ConfigUI', {
  methods: ['GET', 'POST'],
  route: '{*path}',
  authLevel: 'anonymous',
  handler: async (req) => {
    const authError = ensureTenant(req);
    if (authError) {
      return { status: authError.status, jsonBody: { success: false, message: authError.message } };
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && path === '/') {
      const html = readFileSync(UI_PATH, 'utf-8');
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
      };
    }

    if (path === '/api/config' && req.method === 'GET') {
      const config = loadConfig();
      return { status: 200, jsonBody: safeConfig(config) };
    }

    if (path === '/api/config' && req.method === 'POST') {
      const current = loadConfig();
      const incoming = parseJson(req.body);
      if (incoming.emailConfig?.smtp?.password?.startsWith('****')) {
        incoming.emailConfig.smtp.password = current.emailConfig.smtp.password;
      }
      if (incoming.geminiApiKey?.startsWith('****')) {
        incoming.geminiApiKey = current.geminiApiKey;
      }
      const merged = { ...current, ...incoming };
      saveConfig(merged);
      return { status: 200, jsonBody: { success: true, message: 'Configuracion guardada correctamente' } };
    }

    if (path === '/api/clear-history' && req.method === 'POST') {
      clearHistory();
      return { status: 200, jsonBody: { success: true, message: 'Historial limpiado' } };
    }

    if (path === '/api/test-email' && req.method === 'POST') {
      try {
        const config = loadConfig();
        const nodemailer = (await import('nodemailer')).default;
        const transporter = nodemailer.createTransport({
          host: config.emailConfig.smtp.host,
          port: config.emailConfig.smtp.port,
          secure: config.emailConfig.smtp.secure,
          auth: {
            user: config.emailConfig.smtp.user,
            pass: config.emailConfig.smtp.password,
          },
        });
        await transporter.verify();
        await transporter.sendMail({
          from: config.emailConfig.from || config.emailConfig.smtp.user,
          to: config.emailConfig.recipients[0],
          subject: 'Test - Analizador Licitaciones REGENERA',
          html: '<h2>Email de prueba</h2><p>Si recibes este email, la configuracion SMTP es correcta.</p><p>El analizador de licitaciones esta listo para funcionar.</p>',
        });
        return { status: 200, jsonBody: { success: true, message: `Email de prueba enviado a ${config.emailConfig.recipients[0]}` } };
      } catch (error) {
        return { status: 500, jsonBody: { success: false, message: `Error SMTP: ${error.message}` } };
      }
    }

    if (path === '/api/usage' && req.method === 'GET') {
      const stats = getUsageStats();
      return { status: 200, jsonBody: stats };
    }

    if (path === '/api/tenders' && req.method === 'GET') {
      const dateFrom = url.searchParams.get('dateFrom') || undefined;
      const dateTo = url.searchParams.get('dateTo') || undefined;
      const tenderId = url.searchParams.get('tenderId') || undefined;
      const results = searchResults({ dateFrom, dateTo, tenderId });
      const feedback = loadFeedback();
      const feedbackMap = {};
      for (const f of feedback.items) feedbackMap[f.tenderId] = f;
      const enriched = results.map(t => ({ ...t, feedback: feedbackMap[t.id] || null }));
      return { status: 200, jsonBody: { success: true, tenders: enriched, total: enriched.length } };
    }

    if (path === '/api/feedback' && req.method === 'POST') {
      const body = parseJson(req.body);
      if (!body.tenderId || !body.reason) {
        return { status: 400, jsonBody: { success: false, message: 'Falta tenderId o reason' } };
      }
      saveFeedback(body.tenderId, body.reason);
      return { status: 200, jsonBody: { success: true, message: 'Feedback guardado' } };
    }

    if (path === '/api/remove-tender' && req.method === 'POST') {
      const body = parseJson(req.body);
      if (!body.tenderId) {
        return { status: 400, jsonBody: { success: false, message: 'Falta tenderId' } };
      }
      const removedResults = removeTenderFromResults(body.tenderId);
      const removedHistory = removeFromHistory(body.tenderId);
      return { status: 200, jsonBody: { success: true, removedResults, removedHistory, message: 'Licitacion eliminada del historico' } };
    }

    if (path === '/api/suggest-tender' && req.method === 'POST') {
      const body = parseJson(req.body);
      if (!body.id || !body.title) {
        return { status: 400, jsonBody: { success: false, message: 'Falta ID o titulo' } };
      }
      saveSuggestion(body);
      return { status: 200, jsonBody: { success: true, message: 'Sugerencia guardada' } };
    }

    if (path === '/api/run' && req.method === 'POST') {
      if (currentRun.status === 'running') {
        return { status: 200, jsonBody: { success: true, alreadyRunning: true, message: 'Ya hay una ejecucion en curso' } };
      }
      resetRunState();
      currentRun.status = 'running';
      currentRun.startedAt = new Date().toISOString();
      addRunLog('Ejecucion iniciada manualmente.');

      runAnalysis({
        testMode: false,
        onLog: (msg) => addRunLog(msg),
        onStep: (step) => currentRun.step = step,
        onProgress: (progress) => currentRun.progress = progress,
        onTender: (t) => currentRun.tenders.push({
          id: t.id,
          title: t.title,
          budget: t.budget,
          province: t.province,
          contractingAuthority: t.contractingAuthority,
        }),
      }).then(() => {
        currentRun.status = 'completed';
        currentRun.finishedAt = new Date().toISOString();
        addRunLog('Ejecucion finalizada correctamente.');
      }).catch((error) => {
        currentRun.status = 'error';
        currentRun.error = error.message;
        currentRun.finishedAt = new Date().toISOString();
        addRunLog(`[ERROR] ${error.message}`);
      });

      return { status: 200, jsonBody: { success: true, message: 'Ejecucion iniciada' } };
    }

    if (path === '/api/run-status' && req.method === 'GET') {
      return { status: 200, jsonBody: currentRun };
    }

    return { status: 404, jsonBody: { success: false, message: 'Not found' } };
  }
});
