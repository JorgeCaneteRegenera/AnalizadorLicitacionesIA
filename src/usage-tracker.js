// ============================================================
// TRACKER DE USO DE API - Contador diario de peticiones Gemini
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_PATH = join(__dirname, '..', 'data', 'api-usage.json');

const DAILY_LIMIT = 1000;

function loadUsage() {
  if (!existsSync(USAGE_PATH)) {
    return { days: {} };
  }
  try {
    return JSON.parse(readFileSync(USAGE_PATH, 'utf-8'));
  } catch {
    return { days: {} };
  }
}

function saveUsage(data) {
  writeFileSync(USAGE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Registra una peticion a la API de Gemini
 */
export function trackApiCall() {
  const data = loadUsage();
  const today = getTodayKey();

  if (!data.days[today]) {
    data.days[today] = { calls: 0, firstCall: new Date().toISOString() };
  }
  data.days[today].calls++;
  data.days[today].lastCall = new Date().toISOString();

  // Limpiar dias antiguos (mantener solo ultimos 30 dias)
  const keys = Object.keys(data.days).sort();
  if (keys.length > 30) {
    const toDelete = keys.slice(0, keys.length - 30);
    toDelete.forEach(k => delete data.days[k]);
  }

  saveUsage(data);
  return data.days[today].calls;
}

/**
 * Obtiene las estadisticas de uso
 */
export function getUsageStats() {
  const data = loadUsage();
  const today = getTodayKey();
  const todayData = data.days[today] || { calls: 0 };

  // Calcular media de los ultimos 7 dias
  const last7days = Object.keys(data.days).sort().slice(-7);
  const totalLast7 = last7days.reduce((sum, key) => sum + (data.days[key]?.calls || 0), 0);
  const avgLast7 = last7days.length > 0 ? Math.round(totalLast7 / last7days.length) : 0;

  // Historico por dia (ultimos 14 dias)
  const history = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    history.push({
      date: key,
      calls: data.days[key]?.calls || 0,
    });
  }

  return {
    today: todayData.calls,
    limit: DAILY_LIMIT,
    percentage: Math.round((todayData.calls / DAILY_LIMIT) * 100),
    remaining: Math.max(0, DAILY_LIMIT - todayData.calls),
    avgLast7,
    history,
  };
}

/**
 * Comprueba si quedan peticiones disponibles hoy
 */
export function canMakeApiCall() {
  const data = loadUsage();
  const today = getTodayKey();
  const todayCalls = data.days[today]?.calls || 0;
  return todayCalls < DAILY_LIMIT;
}
