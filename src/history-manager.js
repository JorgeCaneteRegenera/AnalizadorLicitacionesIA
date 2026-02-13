// ============================================================
// GESTOR DE HISTORIAL - Evita enviar licitaciones repetidas
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, '..', 'data', 'history.json');

/**
 * Carga el historial de IDs ya procesados
 */
export function loadHistory() {
  if (!existsSync(HISTORY_PATH)) {
    return new Set();
  }
  try {
    const raw = readFileSync(HISTORY_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return new Set(data.processedIds || []);
  } catch {
    return new Set();
  }
}

/**
 * Guarda los nuevos IDs procesados al historial
 */
export function saveHistory(processedIds) {
  const existing = loadHistory();
  for (const id of processedIds) {
    existing.add(id);
  }

  // Mantener solo los ultimos 90 dias de IDs (limitar crecimiento)
  const allIds = Array.from(existing);
  const maxIds = 50000;
  const idsToKeep = allIds.length > maxIds ? allIds.slice(-maxIds) : allIds;

  const data = {
    lastUpdated: new Date().toISOString(),
    totalIds: idsToKeep.length,
    processedIds: idsToKeep,
  };

  writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[HISTORIAL] Guardados ${idsToKeep.length} IDs en total`);
}

/**
 * Limpia todo el historial
 */
export function clearHistory() {
  const data = {
    lastUpdated: new Date().toISOString(),
    totalIds: 0,
    processedIds: [],
  };
  writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log('[HISTORIAL] Historial limpiado');
}

/**
 * Elimina un ID concreto del historial
 */
export function removeFromHistory(tenderId) {
  const existing = loadHistory();
  if (!existing.has(tenderId)) return false;
  existing.delete(tenderId);
  const ids = Array.from(existing);
  const data = {
    lastUpdated: new Date().toISOString(),
    totalIds: ids.length,
    processedIds: ids,
  };
  writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[HISTORIAL] Eliminado ID ${tenderId}`);
  return true;
}
