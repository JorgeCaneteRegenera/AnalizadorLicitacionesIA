// ============================================================
// GESTOR DE RESULTADOS - Guarda licitaciones analizadas
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const RESULTS_PATH = join(DATA_DIR, 'results.json');
const FEEDBACK_PATH = join(DATA_DIR, 'feedback.json');
const FEEDBACK_TRAINING_PATH = join(DATA_DIR, 'feedback-training.jsonl');
const SUGGESTIONS_PATH = join(DATA_DIR, 'suggestions.jsonl');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Guarda los resultados de una ejecucion
 */
export function saveResults(tenders, dateStr) {
  ensureDataDir();
  const existing = loadAllResults();

  const execution = {
    date: dateStr,
    timestamp: new Date().toISOString(),
    count: tenders.length,
    tenders: tenders.map(t => ({
      id: t.id,
      title: t.title,
      summary: t.summary,
      contractingAuthority: t.contractingAuthority,
      province: t.province,
      budget: t.budget,
      currency: t.currency || 'EUR',
      publicationDate: t.publicationDate,
      deadline: t.deadline,
      executionPeriod: t.executionPeriod,
      link: t.link,
      cpvCodes: t.cpvCodes,
      status: t.status,
      procedure: t.procedure,
    })),
  };

  existing.executions.unshift(execution);

  // Mantener solo las ultimas 90 ejecuciones
  if (existing.executions.length > 90) {
    existing.executions = existing.executions.slice(0, 90);
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(existing, null, 2), 'utf-8');
}

/**
 * Carga todos los resultados guardados
 */
export function loadAllResults() {
  if (!existsSync(RESULTS_PATH)) {
    return { executions: [] };
  }
  try {
    return JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
  } catch {
    return { executions: [] };
  }
}

/**
 * Busca licitaciones por filtros (fecha e id)
 */
export function searchResults({ dateFrom, dateTo, tenderId }) {
  const all = loadAllResults();
  const results = [];

  for (const exec of all.executions) {
    for (const t of exec.tenders) {
      // Filtro por ID
      if (tenderId && !t.id.toLowerCase().includes(tenderId.toLowerCase())) continue;

      // Filtro por fecha
      const tDate = t.publicationDate || exec.date;
      if (dateFrom && tDate < dateFrom) continue;
      if (dateTo && tDate > dateTo) continue;

      results.push({ ...t, executionDate: exec.timestamp });
    }
  }

  // Deduplicar por ID (quedarse con la mas reciente)
  const seen = new Map();
  for (const r of results) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }

  return Array.from(seen.values()).sort((a, b) => (b.budget || 0) - (a.budget || 0));
}

/**
 * Guarda feedback de falso positivo
 */
export function saveFeedback(tenderId, reason) {
  ensureDataDir();
  const feedback = loadFeedback();

  feedback.items.push({
    tenderId,
    reason,
    timestamp: new Date().toISOString(),
  });

  writeFileSync(FEEDBACK_PATH, JSON.stringify(feedback, null, 2), 'utf-8');

  // Guardar un registro de entrenamiento con datos de la licitacion si existen
  const tender = findTenderById(tenderId);
  const trainingRecord = {
    tenderId,
    reason,
    timestamp: new Date().toISOString(),
    tender: tender || null,
  };
  const line = JSON.stringify(trainingRecord) + '\n';
  try {
    writeFileSync(FEEDBACK_TRAINING_PATH, line, { encoding: 'utf-8', flag: 'a' });
  } catch {}
}

/**
 * Carga todo el feedback
 */
export function loadFeedback() {
  if (!existsSync(FEEDBACK_PATH)) {
    return { items: [] };
  }
  try {
    return JSON.parse(readFileSync(FEEDBACK_PATH, 'utf-8'));
  } catch {
    return { items: [] };
  }
}

/**
 * Obtiene los IDs marcados como falso positivo
 */
export function getFeedbackIds() {
  const feedback = loadFeedback();
  return new Set(feedback.items.map(f => f.tenderId));
}

/**
 * Elimina una licitacion por ID de resultados guardados
 */
export function removeTenderFromResults(tenderId) {
  const all = loadAllResults();
  let removed = false;
  for (const exec of all.executions) {
    const before = exec.tenders.length;
    exec.tenders = exec.tenders.filter(t => t.id !== tenderId);
    if (exec.tenders.length !== before) {
      removed = true;
      exec.count = exec.tenders.length;
    }
  }
  if (removed) {
    all.executions = all.executions.filter(e => e.tenders.length > 0);
    writeFileSync(RESULTS_PATH, JSON.stringify(all, null, 2), 'utf-8');
  }
  return removed;
}

/**
 * Guarda una sugerencia de licitacion no encontrada
 */
export function saveSuggestion(suggestion) {
  ensureDataDir();
  const record = {
    ...suggestion,
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(record) + '\n';
  writeFileSync(SUGGESTIONS_PATH, line, { encoding: 'utf-8', flag: 'a' });
}

/**
 * Devuelve un Set con todos los IDs de resultados guardados
 */
export function getAllResultIds() {
  const all = loadAllResults();
  const ids = new Set();
  for (const exec of all.executions) {
    for (const t of exec.tenders) ids.add(t.id);
  }
  return ids;
}

function findTenderById(tenderId) {
  const all = loadAllResults();
  for (const exec of all.executions) {
    const tender = exec.tenders.find(t => t.id === tenderId);
    if (tender) {
      return { ...tender, executionTimestamp: exec.timestamp };
    }
  }
  return null;
}
