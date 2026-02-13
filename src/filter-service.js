// ============================================================
// SERVICIO DE FILTRADO - Filtra licitaciones relevantes
// ============================================================

import {
  ALLOWED_CPV_CODES,
  INTERESTING_AUTHORITIES,
  SPECIAL_KEYWORDS,
} from './constants.js';

function createSmartRegex(terms) {
  const pattern = terms.map(term => {
    return term
      .replace(/[aá]/gi, '[aá]')
      .replace(/[eé]/gi, '[eé]')
      .replace(/[ií]/gi, '[ií]')
      .replace(/[oó]/gi, '[oó]')
      .replace(/[uú]/gi, '[uú]');
  }).join('|');
  return new RegExp(`(?:^|[^a-z0-9áéíóúü])(${pattern})(?:$|[^a-z0-9áéíóúü])`, 'i');
}

function quickExtractBudget(xml) {
  const match = xml.match(/<cbc:TaxExclusiveAmount[^>]*>\s*([\d.]+)\s*<\/cbc:TaxExclusiveAmount>/) ||
                xml.match(/<cbc:EstimatedOverallContractAmount[^>]*>\s*([\d.]+)\s*<\/cbc:EstimatedOverallContractAmount>/);
  return match ? parseFloat(match[1]) : 0;
}

function quickIsLocalProvince(xml, localProvinces) {
  const provinces = localProvinces || ['Murcia', 'Alicante'];
  const locationBlock = xml.match(/<cac:RealizedLocation[\s\S]*?<\/cac:RealizedLocation>/i);
  const contentToSearch = locationBlock ? locationBlock[0] : xml;
  const pattern = provinces.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(pattern + '|Alacant|3000\\d|0300\\d', 'i').test(contentToSearch);
}

export function extractUniqueId(xml) {
  const titleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  const expedienteMatch = title.match(/Expediente:\s*([^\s<,]+)/i);
  if (expedienteMatch) return expedienteMatch[1].trim();

  const idTagMatch = xml.match(/<id>(.*?)<\/id>/);
  if (idTagMatch) {
    const rawId = idTagMatch[1].trim();
    const parts = rawId.split('/');
    return parts[parts.length - 1] || rawId;
  }
  return `rand-${Math.random()}`;
}

function isWithinWindow(entryXml, days = 10) {
  const dateMatch = entryXml.match(/<cbc:IssueDate>\s*(\d{4}-\d{2}-\d{2})\s*<\/cbc:IssueDate>/i) ||
                    entryXml.match(/<(?:updated|published)>\s*(\d{4}-\d{2}-\d{2})/i);
  if (!dateMatch) return false;
  const entryDate = new Date(dateMatch[1]);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

/**
 * Filtra las entradas XML y devuelve solo las relevantes
 */
export function filterRelevantEntries(allEntries, processedIds, config) {
  const windowDays = config?.filters?.windowDays || 10;
  const minBudgetLocal = config?.filters?.minBudgetLocal || 30000;
  const minBudgetNational = config?.filters?.minBudgetNational || 1000000;

  const localProvinces = config?.filters?.localProvinces || ['Murcia', 'Alicante'];
  const keywords = config?.filters?.specialKeywords?.length > 0 ? config.filters.specialKeywords : Array.from(SPECIAL_KEYWORDS);
  const authorities = config?.filters?.interestingAuthorities?.length > 0 ? config.filters.interestingAuthorities : Array.from(INTERESTING_AUTHORITIES);

  const cpvList = Array.from(ALLOWED_CPV_CODES);
  const cpvRegex = new RegExp(`<cbc:ItemClassificationCode[^>]*>\\s*(${cpvList.join('|')})\\s*<`, 'i');
  const authRegex = createSmartRegex(authorities);
  const kwRegex = createSmartRegex(keywords);

  const uniqueEntriesMap = new Map();
  let excludedByHistory = 0;
  let excludedByStatus = 0;
  let excludedByWindow = 0;
  let excludedByRelevance = 0;

  for (const entry of allEntries) {
    // Solo publicadas
    if (!/Estado:\s*Publicada|>\s*PUB\s*</i.test(entry)) {
      excludedByStatus++;
      continue;
    }

    // Ventana temporal
    if (!isWithinWindow(entry, windowDays)) {
      excludedByWindow++;
      continue;
    }

    const uniqueId = extractUniqueId(entry);

    // Ya procesada?
    if (processedIds.has(uniqueId)) {
      excludedByHistory++;
      continue;
    }

    const budget = quickExtractBudget(entry);
    const isLocal = quickIsLocalProvince(entry, localProvinces);

    let isRelevant = false;

    // Criterio A: CPV + presupuesto
    if (cpvRegex.test(entry)) {
      if (isLocal && budget >= minBudgetLocal) isRelevant = true;
      else if (!isLocal && budget >= minBudgetNational) isRelevant = true;
    }

    // Criterio B: Organismo + palabra clave
    if (!isRelevant) {
      const authTagMatch = entry.match(/<cac-place-ext:ContractingAuthorityName[^>]*>([\s\S]*?)<\/cac-place-ext:ContractingAuthorityName>/i);
      const authName = authTagMatch ? authTagMatch[1] : '';
      if (authRegex.test(authName)) {
        const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
        const clean = (text) => text.replace(/\s+/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
        const text = clean(titleMatch ? titleMatch[1] : '') + ' ' + clean(summaryMatch ? summaryMatch[1] : '');
        if (kwRegex.test(text)) isRelevant = true;
      }
    }

    if (isRelevant) {
      uniqueEntriesMap.set(uniqueId, entry);
    } else {
      excludedByRelevance++;
    }
  }

  console.log(`[FILTRO] Resultados:`);
  console.log(`  - Excluidas por estado (no publicada): ${excludedByStatus}`);
  console.log(`  - Excluidas por ventana temporal (>${windowDays} dias): ${excludedByWindow}`);
  console.log(`  - Excluidas por historial (ya enviadas): ${excludedByHistory}`);
  console.log(`  - Excluidas por relevancia (no cumple criterios): ${excludedByRelevance}`);
  console.log(`  - RELEVANTES NUEVAS: ${uniqueEntriesMap.size}`);

  return uniqueEntriesMap;
}
