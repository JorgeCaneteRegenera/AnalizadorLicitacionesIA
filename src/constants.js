// ============================================================
// CONSTANTES DE FILTRADO - Modifica aqui para cambiar criterios
// ============================================================

export const ALLOWED_CPV_CODES = new Set([
  '45315600', '45315400', '45310000', '45331000', '42512000',
  '42511110', '45331220', '45311000', '45311100', '09310000',
  '31500000', '50232100', '71356200', '71310000', '50532000',
  '50532200', '50532400', '09332000', '09330000', '09331000',
  '09331200', '45316100', '34928500', '34928530', '45316000',
  '71313000', '71314300', '72220000', '72224000', '73000000',
  '79411000', '79419000', '50232110', '51100000', '45300000',
  '50700000', '50711000', '50720000', '50730000', '50721000',
]);

export const INTERESTING_AUTHORITIES = [
  "DIRECCION GENERAL DE CARRETERAS",
  "ADIF",
  "AUTORIDAD PORTUARIA DE BARCELONA",
  "AUTORIDAD PORTUARIA DE MALAGA",
  "AUTORIDAD PORTUARIA DE CARTAGENA",
  "AUTORIDAD PORTUARIA DE VIGO",
  "Consejeria Fomento Murcia",
  "Empresa Municipal de Transportes de Madrid",
  "MCT",
  "ICA",
  "SEIASA",
  "CHS",
  "EMUASA",
  "UMH",
  "Aadif",
  "Intendente de Cartagena",
  "EMT PALMA",
  "AYUNTAMIENTO DE CARTAGENA",
];

export const SPECIAL_KEYWORDS = [
  'energia',
  'instalaciones electricas',
  'climatizacion',
  'hidrogeno',
  'eficiencia energetica',
  'fotovoltaica',
];

// Presupuestos minimos
export const MIN_BUDGET_LOCAL = 30000;      // Murcia/Alicante
export const MIN_BUDGET_NATIONAL = 1000000; // Resto de Espana
