// ============================================================
// SERVICIO ZIP - Descarga y procesamiento del ZIP de PLACSP
// ============================================================

import JSZip from 'jszip';

/**
 * Descarga el ZIP mensual de licitaciones desde PLACSP
 */
export async function downloadMonthlyZip() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const url = `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_${year}${month}.zip`;

  console.log(`[ZIP] Descargando datos de ${month}/${year}...`);
  console.log(`[ZIP] URL: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error descargando ZIP: HTTP ${response.status}. Comprueba tu conexion a internet.`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`[ZIP] Descargado: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  return { buffer, dateStr: `${month}/${year}` };
}

/**
 * Procesa un buffer ZIP y extrae las entradas XML de licitaciones
 */
export async function processZipBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Filtrar archivos ATOM validos
  const atomFiles = Object.values(zip.files).filter(f => {
    const name = f.name.toLowerCase();
    return !f.dir && name.endsWith('.atom') && (name.includes('licitaciones') || name.includes('completo'));
  });

  if (atomFiles.length === 0) {
    throw new Error('No se encontraron archivos .atom en el ZIP');
  }

  console.log(`[ZIP] Encontrados ${atomFiles.length} archivos ATOM`);

  // Leer todos los archivos ATOM
  const allContents = [];
  for (const file of atomFiles) {
    console.log(`[ZIP] Leyendo: ${file.name}`);
    const content = await file.async('string');
    allContents.push(content);
  }

  // Extraer todas las entradas <entry>
  let allEntries = [];
  for (const content of allContents) {
    const matches = content.match(/<entry[\s\S]*?<\/entry>/g);
    if (matches) allEntries = allEntries.concat(matches);
  }

  console.log(`[ZIP] Total entradas encontradas: ${allEntries.length}`);

  return allEntries;
}
