"use client";

import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });
import React, { useEffect, useMemo, useState } from "react";

/**
 * NIVEL 2 — Múltiples proyectos, barra lateral por pasos y persistencia local.
 * - Puedes crear proyectos, guardarlos en tu navegador (localStorage) y reabrirlos.
 * - Pasos en la izquierda: Datos del proyecto → Costos → Datos de cotización → Cotización cliente
 *   (y placeholders para Logística, Impuestos, Pagos proveedor, Comisión Omar, Dashboard).
 * - Mantiene toda la lógica que ya teníamos para costos, prorrateos, IVA y cotización.
 * - En “Datos de cotización” puedes aplicar DESCUENTO % que afectará la cotización.
 */

// ===== Tipos =====
type Tipo = "Plegable" | "Desmontable" | "Oficina/Recepcion";
type Medida = 20 | 16 | 12 | 10 | 8 | 5;
type Price = Partial<Record<Tipo, number>> & { nota?: string };
interface Linea {
  id: string;
  medida: Medida;
  modelo: string; // S1..S11
  tipo: Tipo;
  cantidad: number;
  costoProveedor?: number;
  techoAnticondensante?: boolean;
}

type CotRow = {
  key: string; // "{medida}-{modelo}-{tipo}"
  medida: Medida;
  modelo: string;
  tipo: Tipo;
  qty: number;
  costoUnidad: number;
  utilidadUnidad: number;
  precioUnidad: number;
  precioUnidadBase: number; // precio calculado por margen/desc (sin override)
  costoLinea: number;
  utilidadLinea: number;
  precioLinea: number;
  marginPct: number;
  puertasUnidad: number;
  puertasLinea: number;
  m2Minibodega: number;
  m2Unidad: number;
  m2Linea: number;

  // Precio editable (override)
  overridePrecioU?: number;
  overridePrecioUValid: boolean;

  // Costo editable (override)
  overrideCostoU?: number;
  overrideCostoUValid: boolean;
};

type StepKey =
  | "proyecto"
  | "productos"
  | "costos"
  | "cotizacion"
  | "proyectoGanado"
  | "centroControl"
  | "logistica"
  | "impuestos"
  | "pagos"
  | "comisionOmar"
  | "dashboard";

interface ProyectoMeta {
  nombre: string;
  contacto: string;
  ubicacion: string;
  razonSocial?: string;
  createdAt: string; // ISO
  // Opcionales: el usuario puede no capturarlos al inicio
  contactoEmail?: string;
  contactoTelefono?: string;
}

interface ProyectoState {
  // ===== Parámetros y datos ya existentes =====
  ganado: boolean;
  tipoCambio: number;
  modulosPorContenedor: number;
  costoMaritimoUSD: number;
  costoFullMXN: number;
  costoSencilloMXN: number;
  optimizarMezcla: boolean;
  verDebugEmpaquetado: boolean;
  agenteAduanalUSD: number;
  maniobrasPuertoUSD: number;
  sencilloDirty: boolean;
  porcOtraEmpresa: number;
  porcFila: number;
  porcValorFactura: number;
  porcSeguro: number;
  porcIGI: number;
  porcDTA: number; // Derecho de Trámite Aduanero (DTA) % sobre valor en aduana
  asesorPct: number;
  comisionOmarPct: number; // % sobre precio de venta total (para calcular comisión Omar)
  confirmFletes: boolean;
  contenedoresConfirmados: number;
  usarContenedores20: boolean;
  contenedores20: number;
  costoMaritimo20USD: number;
  costoTerrestre20MXN: number;
  pagosCount: number;
  pagos: PagoItem[];
  pagosNotas: string;
  cotCondiciones: string;
  cotDescripcionTecnica: string;
  cotCaracteristicasS1S8: string;
  cotCaracteristicasS9: string;
  estatusProyecto: ProyectoStatus;
  movimientos: MovimientoFin[];

  // IVA TCs
  tcImport: number;
  tcCobro: number;
 
  // Datos de cotización
  marginPct: number;     // margen % objetivo (sobre precio)
  descuentoPct: number;  // descuento comercial % aplicado a la venta

  // Overrides de precios en cotización (precio unitario FINAL en USD por línea)
  // key = "{medida}-{modelo}-{tipo}" (ej. "20-S1-Plegable")
  precioOverrides: Record<string, number>;
  costoOverrides: Record<string, number>;

  // Líneas
  lineas: Linea[];

  // Control editable de costos (USD) en proyectos ganados
  costosControl: {
    productos: number;
    fleteMaritimo: number;
    fleteTerrestre: number;
    seguro: number;
    igi: number;
    dta: number;
    agenteAduanal: number;
    maniobras: number;
    honorarios: number;
    instalacion: number;
    comisionOmar: number;
    ivaImportacion: number;
  };
}

interface Proyecto {
  id: string;
  meta: ProyectoMeta;
  state: ProyectoState;
}

interface PagoItem {
  pct: number;
  date: string; // YYYY-MM-DD
  concept: string;
}

type ProyectoStatus =
  | "anticipoProveedor"
  | "liquidacionProveedor"
  | "transito"
  | "importacion"
  | "instalacion"
  | "entregado";

function estatusLabel(s: ProyectoStatus) {
  switch (s) {
    case "anticipoProveedor":
      return "Anticipo proveedor";
    case "liquidacionProveedor":
      return "Liquidación proveedor";
    case "transito":
      return "En tránsito";
    case "importacion":
      return "En importación";
    case "instalacion":
      return "En instalación";
    case "entregado":
      return "Entregado";
    default:
      return s;
  }
}

type MovimientoTipo = "cargo" | "abono";
type MovimientoMoneda = "USD" | "MXN";
type MovimientoCategoria =
  | "productos"
  | "fleteMaritimo"
  | "fleteTerrestre"
  | "seguro"
  | "igi"
  | "dta"
  | "agenteAduanal"
  | "maniobras"
  | "honorarios"
  | "comisionOmar"
  | "pagoCliente"
  | "iva"
  | "ivaImportacion"
  | "retiroUtilidad"
  | "importacion"
  | "instalacion"
  | "proveedor"
  | "logistica"
  | "impuestos"
  | "otros";
type MovimientoEstado = "porPagar" | "pagado";

interface MovimientoFin {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: MovimientoTipo;
  estado: MovimientoEstado;
  incluyeIva: boolean;
  ivaManual?: number;
  categoria: MovimientoCategoria;
  descripcion: string;
  monto: number;
  moneda: MovimientoMoneda;
  tcPago: number;
  referencia: string;
}

// ===== Lista de precios (USD) =====
const priceList: Record<Medida, Record<string, Price>> = {
  20: {
    S1: { Plegable: 1849, Desmontable: 1450, nota: "1 puerta frontal" },
    S2: { Plegable: 2049, Desmontable: 1750, nota: "2 puertas frontales" },
    S3: { Plegable: 1899, Desmontable: 1490, nota: "1 puerta lateral" },
    S4: { Plegable: 2099, Desmontable: 1790, nota: "2 puertas laterales" },
    S5: { Plegable: 2249, Desmontable: 1890, nota: "3 puertas laterales" },
    S6: { Plegable: 2349, Desmontable: 2090, nota: "4 puertas laterales" },
    S7: { Plegable: 2699, Desmontable: 2390, nota: "4 puertas (2 por lateral)" },
    S8: { Plegable: 2899, Desmontable: 2590, nota: "8 puertas (4 por lateral)" },
    S9: { "Oficina/Recepcion": 3200, nota: "Oficina/Recepcion con bano" },
    S10: { "Oficina/Recepcion": 3100, nota: "Oficina/Coworking" },
    S11: { "Oficina/Recepcion": 3150, nota: "Módulo 4 Baños" },
  },
  16: {
    S1: { Plegable: 1749, Desmontable: 1290, nota: "1 puerta frontal" },
    S2: { Plegable: 1899, Desmontable: 1600, nota: "2 puertas frontales" },
    S3: { Plegable: 1799, Desmontable: 1450, nota: "1 puerta lateral" },
    S4: { Plegable: 1999, Desmontable: 1650, nota: "2 puertas laterales" },
    S5: { Plegable: 2149, Desmontable: 1750, nota: "3 puertas laterales" },
  },
  12: {
    S1: { Plegable: 1549, Desmontable: 1150, nota: "1 puerta frontal" },
    S2: { Plegable: 1799, Desmontable: 1400, nota: "2 puertas frontales" },
  },
  10: {
    S1: { Plegable: 1349, Desmontable: 890, nota: "1 puerta frontal" },
    S2: { Plegable: 1599, Desmontable: 1140, nota: "2 puertas frontales" },
  },
  8: {
    S1: { Plegable: 1299, Desmontable: 750, nota: "1 puerta frontal" },
  },
  5: {
    S1: { Plegable: 1249, Desmontable: 690, nota: "1 puerta frontal" },
  },
}; // ← este punto y coma es importante

type ModuleSpec = { puertas: number; m2PorMinibodega: number };

const moduleSpecs: Partial<Record<Medida, Partial<Record<Tipo, Record<string, ModuleSpec>>>>> = {
  20: {
    Plegable: {
      S1: { puertas: 1, m2PorMinibodega: 14 },
      S2: { puertas: 2, m2PorMinibodega: 7 },
      S3: { puertas: 1, m2PorMinibodega: 14 },
      S4: { puertas: 2, m2PorMinibodega: 7 },
      S5: { puertas: 3, m2PorMinibodega: 4.7 },
      S6: { puertas: 4, m2PorMinibodega: 3.5 },
      S7: { puertas: 4, m2PorMinibodega: 3.5 },
      S8: { puertas: 8, m2PorMinibodega: 1.75 },
    },
    Desmontable: {
      S1: { puertas: 1, m2PorMinibodega: 14 },
      S2: { puertas: 2, m2PorMinibodega: 7 },
      S3: { puertas: 1, m2PorMinibodega: 14 },
      S4: { puertas: 2, m2PorMinibodega: 7 },
      S5: { puertas: 3, m2PorMinibodega: 4.7 },
      S6: { puertas: 4, m2PorMinibodega: 3.5 },
      S7: { puertas: 4, m2PorMinibodega: 3.5 },
      S8: { puertas: 8, m2PorMinibodega: 1.75 },
    },
  },
  16: {
    Plegable: {
      S1: { puertas: 1, m2PorMinibodega: 12 },
      S2: { puertas: 2, m2PorMinibodega: 6 },
      S3: { puertas: 1, m2PorMinibodega: 12 },
      S4: { puertas: 2, m2PorMinibodega: 6 },
      S5: { puertas: 3, m2PorMinibodega: 4 },
    },
    Desmontable: {
      S1: { puertas: 1, m2PorMinibodega: 12 },
      S2: { puertas: 2, m2PorMinibodega: 6 },
      S3: { puertas: 1, m2PorMinibodega: 12 },
      S4: { puertas: 2, m2PorMinibodega: 6 },
      S5: { puertas: 3, m2PorMinibodega: 4 },
    },
  },
  12: {
    Plegable: {
      S1: { puertas: 1, m2PorMinibodega: 9 },
      S2: { puertas: 2, m2PorMinibodega: 4.5 },
    },
    Desmontable: {
      S1: { puertas: 1, m2PorMinibodega: 9 },
      S2: { puertas: 2, m2PorMinibodega: 4.5 },
    },
  },
  10: {
    Plegable: {
      S1: { puertas: 1, m2PorMinibodega: 7 },
      S2: { puertas: 2, m2PorMinibodega: 3.5 },
    },
    Desmontable: {
      S1: { puertas: 1, m2PorMinibodega: 7 },
      S2: { puertas: 2, m2PorMinibodega: 3.5 },
    },
  },
  8: {
    Plegable: {
      S1: { puertas: 1, m2PorMinibodega: 5.5 },
    },
    Desmontable: {
      S1: { puertas: 1, m2PorMinibodega: 5.5 },
    },
  },
  5: {
    Plegable: {
      S1: { puertas: 1, m2PorMinibodega: 4 },
    },
    Desmontable: {
      S1: { puertas: 1, m2PorMinibodega: 4 },
    },
  },
};
const TECHO_ANTICONDENSANTE_USD = 60;

function getModuleSpec(medida: Medida, tipo: Tipo, modelo: string): ModuleSpec | null {
  const byMedida = moduleSpecs[medida];
  const byTipo = byMedida?.[tipo];
  const spec = byTipo?.[modelo];
  return spec || null;
}

function getTipoDisplay(modelo: string, tipo: Tipo): string {
  if (modelo === "S10") return "Oficina/Coworking";
  if (modelo === "S11") return "Módulo 4 Baños";
  return tipo;
}

// ===== Capacidades por contenedor (unidades por contenedor) =====
const containerCapacity: Partial<Record<Medida, Partial<Record<Tipo, Partial<Record<string, number>>>>>> = {
  20: {
    Plegable: { S1: 14, S2: 14, S3: 14, S4: 14, S5: 13, S6: 13, S7: 12, S8: 10 },
    Desmontable: { S1: 13, S2: 12, S3: 13, S4: 12, S5: 11, S6: 11, S7: 13, S8: 12 },
    "Oficina/Recepcion": { S9: 10, S10: 10, S11: 8 },
  },
  16: {
    Plegable: { S1: 14, S2: 14, S3: 14, S4: 14, S5: 13 },
    Desmontable: { S1: 13, S2: 12, S3: 13, S4: 12, S5: 11 },
  },
  12: { Plegable: { S1: 18, S2: 16 }, Desmontable: { S1: 18, S2: 16 } },
  10: { Plegable: { S1: 18, S2: 18 }, Desmontable: { S1: 22, S2: 20 } },
  8: { Plegable: { S1: 24 }, Desmontable: { S1: 30 } },
  5: { Plegable: { S1: 22 }, Desmontable: { S1: 30 } },
};

/** Calcula contenedores usando capacidades por modelo/tipo.
 *  Si falta capacidad para algún modelo, usa el fallback `modulosPorContenedor`.
 */
function containersFromCapacity(lineas: Linea[], fallbackPerContainer: number): number {
  let slots = 0;
  for (const l of lineas) {
    if (!l.cantidad || l.cantidad <= 0) continue;
    const cap = (containerCapacity as any)?.[l.medida]?.[l.tipo]?.[l.modelo] || 0;
    if (cap > 0) {
      slots += l.cantidad / cap;
    } else {
      const fb = fallbackPerContainer || 14;
      slots += l.cantidad / fb;
    }
  }
  return slots > 0 ? Math.ceil(slots) : 0;
}

// === Persistencia (claves) ===
// Usamos una clave estable (v1) para que NO vuelva a “perderse” el historial cuando renombramos rutas/versiones.
// También espejeamos a la clave v2 por compatibilidad.
const STORAGE_KEY = "containmx.projects";
const STORAGE_KEY_V2 = "containmx.projects.v2";
const STORAGE_BACKUP_KEY = "containmx.projects.backup";
const STORAGE_BACKUP_TS_KEY = "containmx.projects.backup.ts";
const STORAGE_META_KEY = "containmx.projects.meta";
const STORAGE_CURRENT_ID_KEY = "containmx.projects.currentId";

const SNAPSHOT_KEY = "containmx.snapshots.v2";
const AUTOBACKUP_KEY_V2 = "containmx.autobackups.v2";
const SNAPSHOTS_KEY_V2 = "containmx.snapshots.v2";
type Snapshot = { ts: number; projects: Proyecto[] };

const DEFAULT_COT_CONDICIONES =
  "Moneda y precios: En USD + IVA, vigencia de 10 días.\n" +
  "Términos de pago: 60 % anticipo | 30 % 1 mes previo a instalación | 10 % inicio instalación.\n" +
  "Entrega: FOB obra. Tiempo estimado de fabricación y colocación 16 a 20 semanas.\n" +
  "Garantía: 12 meses contra defectos de fabricación bajo uso normal.\n" +
  "Propiedad del material: S-Containr mantiene propiedad hasta liquidación total.\n" +
  "Incrementos de costo: Sujeto a variaciones internacionales de materia prima.\n" +
  "Confidencialidad: Toda la información y documentación es propiedad intelectual de S-Containr / Fila Systems SA de CV.\n" +
  "Garantía de instalación: Incluye descarga, ensamble y colocación (en superficie nivelada).\n" +
  "No incluye: Preparación de área, bardeado, instalaciones hidrosanitarias, instalaciones eléctricas, cimentación ni servicios adicionales.";

const DEFAULT_COT_DESC_TEC =
  "Módulos desmontables fabricados con acero SPA-C galvanizado, 100 % impermeables y apilables hasta 3 niveles con previa especificación.\n" +
  "El marco principal de acero galvanizado tiene un grosor no menor a 2.8 mm (Calibre 12).\n" +
  "Los tubos para montacargas no son menores a 3.0 mm (Calibre 11).\n" +
  "Las vigas no son menores a 1.5 mm (Calibre 16). Los marcos de pared no son menores a 1.8 mm (Calibre 14).\n" +
  "Los refuerzos secundarios no son menores a 1.2 mm (Calibre 18).\n" +
  "Las láminas galvanizadas de pared no son menores a 1.0 mm (Calibre 20). El techo es de lámina corrugada estilo ISO con drenaje de agua, grosor de 1.2 mm (Calibre 18).\n" +
  "Vida útil de 20-25 años por especificaciones para uso exterior.";

const DEFAULT_COT_CAR_S1S8 =
  "Acceso: Puerta __________  Cortina __________\n" +
  "Piso: Madera marina __________  Lámina antiderrapante __________, ventilación integrada y sellado hermético.\n" +
  "Color Módulo __________  Color Puerta ó Cortina __________";

const DEFAULT_COT_CAR_S9 = "Color Módulo __________";

// Exporta un dump de TODO localStorage (útil si el usuario usó otro origen: 127.0.0.1 vs localhost)
function dumpAllLocalStorageParsed(): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      const parsed = safeJsonParse(raw);
      out[k] = parsed !== null ? parsed : raw;
    }
  } catch {}
  return out;
}

function downloadLocalStorageDump() {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      origin: typeof window !== "undefined" ? window.location.origin : "",
      path: typeof window !== "undefined" ? window.location.pathname : "",
      __allKeysDump: dumpAllLocalStorageParsed(),
    };
    downloadJson(`containmx-localstorage-dump-${Date.now()}.json`, payload);
  } catch {}
}

// Intenta recuperar proyectos buscando en TODAS las keys de localStorage.
// Selecciona el candidato con más proyectos.
function recoverProjectsFromAnyKey(): { projects: Proyecto[]; label: string; count: number } | null {
  try {
    const candidates: Array<{ count: number; projects: any[]; label: string }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;

      const parsed = safeJsonParse(raw);
      if (!parsed) continue;

      const extracted = extractProjectsFromUnknown(parsed);
      if (Array.isArray(extracted) && extracted.length) {
        candidates.push({ count: extracted.length, projects: extracted, label: `localStorage:${k}` });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.count - a.count);

    const best = candidates[0];
    const normalized = normalizeProjects(best.projects);
    return { projects: normalized, label: best.label, count: normalized.length };
  } catch {
    return null;
  }
}

function safeJsonParse(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function appendAutoBackupV2() {
  try {
    const projectsRaw = localStorage.getItem(STORAGE_KEY) ?? "[]";
    const projectsV2Raw = localStorage.getItem(STORAGE_KEY_V2) ?? "[]";
    const snapshotsRaw = localStorage.getItem(SNAPSHOTS_KEY_V2) ?? "[]";

    const backups = safeJsonParse(localStorage.getItem(AUTOBACKUP_KEY_V2));
    const arr: any[] = Array.isArray(backups) ? backups : [];

    arr.unshift({
      ts: Date.now(),
      projectsRaw,
      projectsV2Raw,
      snapshotsRaw,
    });

    localStorage.setItem(AUTOBACKUP_KEY_V2, JSON.stringify(arr.slice(0, 30)));
  } catch {
    // ignore backup errors
  }
}

function downloadAutoBackupV2() {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      backups: safeJsonParse(localStorage.getItem(AUTOBACKUP_KEY_V2)) ?? [],
      latest: {
        projects: safeJsonParse(localStorage.getItem(STORAGE_KEY)) ?? [],
        projectsV2: safeJsonParse(localStorage.getItem(STORAGE_KEY_V2)) ?? [],
        snapshotsV2: safeJsonParse(localStorage.getItem(SNAPSHOTS_KEY_V2)) ?? [],
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `containmx-backup-v2-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // ignore download errors
  }
}

function looksLikeProject(x: any): boolean {
  if (!x || typeof x !== "object") return false;
  if (typeof (x as any).id === "string") return true;
  if ((x as any).meta && typeof (x as any).meta === "object") return true;
  if ((x as any).state && typeof (x as any).state === "object") return true;
  if (Array.isArray((x as any).lineas) || Array.isArray((x as any).productos)) return true;
  return false;
}

function extractProjectsFromUnknown(parsed: any): any[] {
  if (!parsed) return [];

  // 1) Array: puede ser projects[] o snapshots[]
  if (Array.isArray(parsed)) {
    // snapshots[] => [{ts, projects:[...]}]
    const snaps = parsed
      .filter((x: any) => x && typeof x === "object" && Array.isArray((x as any).projects))
      .map((x: any) => ({ ts: Number((x as any).ts ?? 0), projects: (x as any).projects as any[] }));
    if (snaps.length) {
      snaps.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return snaps[0].projects || [];
    }
    return parsed;
  }

  // 2) {projects:[...]}
  if (Array.isArray((parsed as any).projects)) return (parsed as any).projects;
  if (Array.isArray((parsed as any)?.data?.projects)) return (parsed as any).data.projects;

  // 3) Formato legacy común: {"<id>": { ...proyecto }, "<id2>": {...}}
  if (parsed && typeof parsed === "object") {
    const vals = Object.values(parsed as Record<string, any>);
    if (vals.length && vals.some(looksLikeProject)) return vals as any[];
  }

  // 4) Proyecto único
  if (looksLikeProject(parsed)) return [parsed];

  return [];
}

function buildDefaultPagos(count: number): PagoItem[] {
  const presets: Record<number, number[]> = {
    3: [60, 30, 10],
    4: [40, 30, 20, 10],
    5: [30, 25, 20, 15, 10],
  };
  const arr = presets[count] || Array.from({ length: count }, () => round2(100 / count));
  return arr.map((pct) => ({ pct, date: "", concept: "" }));
}

function defaultProyectoState(): ProyectoState {
  return {
    ganado: false,
    tipoCambio: 0,
    modulosPorContenedor: 14,
    costoMaritimoUSD: 2500,
    costoFullMXN: 65000,
    costoSencilloMXN: Math.round(65000 / 2),
    optimizarMezcla: true,
    verDebugEmpaquetado: false,
    agenteAduanalUSD: 750,
    maniobrasPuertoUSD: 1200,
    sencilloDirty: false,
    porcOtraEmpresa: 40,
    porcFila: 60,
    porcValorFactura: 60,
    porcSeguro: 0.5,
    porcIGI: 15,
    porcDTA: 0.8,
    asesorPct: 7,
    comisionOmarPct: 0,
    confirmFletes: false,
    contenedoresConfirmados: 0,
    usarContenedores20: false,
    contenedores20: 0,
    costoMaritimo20USD: 0,
    costoTerrestre20MXN: 0,
    pagosCount: 3,
    pagos: buildDefaultPagos(3),
    pagosNotas: "",
    cotCondiciones: DEFAULT_COT_CONDICIONES,
    cotDescripcionTecnica: DEFAULT_COT_DESC_TEC,
    cotCaracteristicasS1S8: DEFAULT_COT_CAR_S1S8,
    cotCaracteristicasS9: DEFAULT_COT_CAR_S9,
    estatusProyecto: "anticipoProveedor",
    movimientos: [],
    tcImport: 0,
    tcCobro: 0,
    marginPct: 0,
    descuentoPct: 0,
    precioOverrides: {},
    costoOverrides: {},
    lineas: [],
    costosControl: {
      productos: 0,
      fleteMaritimo: 0,
      fleteTerrestre: 0,
      seguro: 0,
      igi: 0,
      dta: 0,
      agenteAduanal: 0,
      maniobras: 0,
      honorarios: 0,
      instalacion: 0,
      comisionOmar: 0,
      ivaImportacion: 0,
    },
  };
}

function normalizeProjects(input: any[]): Proyecto[] {
  const now = new Date().toISOString();
  const baseState = defaultProyectoState();

  return (input || []).map((p: any) => {
    const id = String((p as any)?.id ?? cryptoRandom());

    const metaIn = (p as any)?.meta ?? {};
    const stateIn = (p as any)?.state ?? p ?? {};

    // líneas pueden venir en p.lineas, state.lineas, p.productos, state.productos
    const lineasRaw = Array.isArray((stateIn as any)?.lineas)
      ? (stateIn as any).lineas
      : Array.isArray((p as any)?.lineas)
        ? (p as any).lineas
        : Array.isArray((stateIn as any)?.productos)
          ? (stateIn as any).productos
          : Array.isArray((p as any)?.productos)
            ? (p as any).productos
            : [];
    const lineas = (lineasRaw || []).map((l: any) => ({
      ...l,
      techoAnticondensante: Boolean(l?.techoAnticondensante),
    }));

    const meta: ProyectoMeta = {
      nombre: String((metaIn as any)?.nombre ?? (p as any)?.nombre ?? "Proyecto"),
      contacto: String((metaIn as any)?.contacto ?? (p as any)?.contacto ?? ""),
      ubicacion: String((metaIn as any)?.ubicacion ?? (p as any)?.ubicacion ?? ""),
      razonSocial: String((metaIn as any)?.razonSocial ?? (p as any)?.razonSocial ?? ""),
      createdAt: String((metaIn as any)?.createdAt ?? (p as any)?.createdAt ?? now),
      contactoEmail: (metaIn as any)?.contactoEmail ?? (p as any)?.contactoEmail,
      contactoTelefono: (metaIn as any)?.contactoTelefono ?? (p as any)?.contactoTelefono,
    };

    const state: ProyectoState = {
      ...baseState,
      ...(stateIn as any),
      lineas,
    };
    if (!(state as any).costosControl) {
      state.costosControl = { ...baseState.costosControl };
    }

    return { id, meta, state } as Proyecto;
  });
}


const IVA_RATE = 0.16; // 16% IVA en MXN

function fmtUSD(n: number, withCode: boolean = true) {
  const s = n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withCode ? `${s} USD` : s;
}
// For editable numeric inputs: always dot-decimal, fixed 2 (e.g., 4115.68)
function fmtUSDInput(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toFixed(2);
}
function fmtMXN(n: number, withCode: boolean = true) {
  const s = n.toLocaleString("en-US", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withCode ? `${s} MXN` : s;
}
function fmtPct(n: number) {
  return `${Math.round(n * 100)} %`;
}
function pct(p: number) {
  return (p ?? 0) / 100;
}

function escapeHtml(val: string) {
  return (val || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\'/g, "&#39;");
}

// Robust numeric parser for USD: accepts "1,234.56", "1234,56", "1234.56", etc.
function parseNumericInput(raw: string): number {
  const s = (raw ?? "").toString().trim();
  if (!s) return NaN;

  // If user typed both comma and dot, assume comma is thousands separator: 1,234.56
  if (s.includes(",") && s.includes(".")) {
    const normalized = s.replace(/,/g, "");
    const n = Number(normalized);
    return n;
  }

  // If user typed only comma, assume comma is decimal separator: 1234,56
  if (s.includes(",") && !s.includes(".")) {
    const normalized = s.replace(/,/g, ".");
    const n = Number(normalized);
    return n;
  }

  // Default: dot decimals
  return Number(s);
}

function round2(n: number) {
  // Redondeo contable a 2 decimales (evita efectos binarios)
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function cryptoRandom() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2);
}

function buildMapsUrl(addr: string) {
  const q = encodeURIComponent(addr || "");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}
function isValidPhone(s: string) {
  // acepta dígitos, espacios, paréntesis, guiones y +
  return /^[0-9+()\-\s]{7,}$/.test((s || "").trim());
}

function calcMovTotals(list: MovimientoFin[]) {
  const base = list.reduce(
    (acc, m) => {
      const total = (m.monto || 0); // NO sumar IVA al total, solo desglosar
      if (m.moneda === "USD") acc.usd += total;
      else acc.mxn += total;
      return acc;
    },
    { usd: 0, mxn: 0 }
  );
  return { usd: round2(base.usd), mxn: round2(base.mxn) };
}

function calcMovTotalsFx(list: MovimientoFin[]) {
  return list.reduce(
    (acc, m) => {
      const total = (m.monto || 0);
      const tc = m.tcPago || 0;
      let usd = 0;
      let mxn = 0;
      if (m.moneda === "USD") {
        usd = total;
        mxn = tc > 0 ? round2(total * tc) : 0;
      } else {
        mxn = total;
        usd = tc > 0 ? round2(total / tc) : 0;
      }
      if (m.tipo === "cargo") {
        acc.usd -= usd;
        acc.mxn -= mxn;
      } else {
        acc.usd += usd;
        acc.mxn += mxn;
      }
      return acc;
    },
    { usd: 0, mxn: 0 }
  );
}

function movToUSD(m: MovimientoFin) {
  if (m.moneda === "USD") return m.monto || 0;
  return m.tcPago && m.tcPago > 0 ? round2((m.monto || 0) / m.tcPago) : 0;
}

function calcTotalsUSD(list: MovimientoFin[]) {
  return round2(list.reduce((acc, m) => acc + movToUSD(m), 0));
}

function calcIvaUSD(list: MovimientoFin[]) {
  return round2(
    list.reduce((acc, m) => {
      if (Number.isFinite(m.ivaManual)) {
        const manual = m.ivaManual as number;
        const ivaUsd = m.moneda === "USD" ? manual : (m.tcPago && m.tcPago > 0 ? round2(manual / m.tcPago) : 0);
        return acc + ivaUsd;
      }
      if (m.categoria === "ivaImportacion") {
        const ivaUsd = m.moneda === "USD" ? (m.monto || 0) : (m.tcPago && m.tcPago > 0 ? round2((m.monto || 0) / m.tcPago) : 0);
        return acc + ivaUsd;
      }
      if (!m.incluyeIva) return acc;
      // If monto already includes IVA, extract it from the total
      const base = m.monto || 0;
      const iva = round2((base * IVA_RATE) / (1 + IVA_RATE));
      const ivaUsd = m.moneda === "USD" ? iva : (m.tcPago && m.tcPago > 0 ? round2(iva / m.tcPago) : 0);
      return acc + ivaUsd;
    }, 0)
  );
}

// ---- Helpers de storage/snapshots ----
function persistProjects(data: Proyecto[], opts?: { allowShrink?: boolean }) {
  try {
    const raw = JSON.stringify(data);

    // Guard to avoid overwriting with fewer projects (e.g., stale tab), unless explicitly allowed
    try {
      if (!opts?.allowShrink) {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const currentParsed = safeJsonParse(currentRaw);
        if (Array.isArray(currentParsed) && currentParsed.length > data.length) {
          return;
        }
      }
    } catch {}

    // Principal (estable)
    localStorage.setItem(STORAGE_KEY, raw);
    // Espejo (compatibilidad)
    localStorage.setItem(STORAGE_KEY_V2, raw);

    // Backup: NO sobre-escribimos un backup con datos si alguien guarda un array vacío.
    // Así evitamos perder historial si alguna pantalla escribe "[]" por error.
    const existingBackupRaw = localStorage.getItem(STORAGE_BACKUP_KEY);
    const existingBackupParsed = safeJsonParse(existingBackupRaw);
    const backupHasData = Array.isArray(existingBackupParsed) && existingBackupParsed.length > 0;
    const nextHasData = Array.isArray(data) && data.length > 0;

    if (nextHasData || !backupHasData) {
      localStorage.setItem(STORAGE_BACKUP_KEY, raw);
      localStorage.setItem(STORAGE_BACKUP_TS_KEY, String(Date.now()));
    }
    try {
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify({ ts: Date.now(), count: data.length }));
    } catch {}
    appendAutoBackupV2();
  } catch {}
}
function loadProjects(): Proyecto[] {
  try {
    const readFirstNonEmptyArray = (): any[] => {
      const keys = [STORAGE_KEY, STORAGE_KEY_V2, STORAGE_BACKUP_KEY];
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = safeJsonParse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
        // Si hay array vacío, seguimos buscando por si el backup tiene datos
      }
      // Si ninguna tenía datos, regresa el array (aunque esté vacío) de la principal si existe
      const rawMain = localStorage.getItem(STORAGE_KEY);
      const parsedMain = safeJsonParse(rawMain);
      if (Array.isArray(parsedMain)) return parsedMain;
      return [];
    };

    let arr = readFirstNonEmptyArray();

    // Si hay meta de timestamp, usa el más reciente entre main/backup.
    try {
      const metaRaw = localStorage.getItem(STORAGE_META_KEY);
      const meta = safeJsonParse(metaRaw) || {};
      const mainRaw = localStorage.getItem(STORAGE_KEY);
      const mainParsed = safeJsonParse(mainRaw);
      const backupRaw = localStorage.getItem(STORAGE_BACKUP_KEY);
      const backupParsed = safeJsonParse(backupRaw);
      const backupTs = Number(localStorage.getItem(STORAGE_BACKUP_TS_KEY) || 0);
      const mainTs = Number(meta?.ts || 0);
      if (Array.isArray(mainParsed) && Array.isArray(backupParsed)) {
        if (backupTs > mainTs && backupParsed.length) {
          arr = backupParsed;
          persistProjects(backupParsed as any);
        } else if (mainParsed.length) {
          arr = mainParsed;
        }
      }
    } catch {}

    // Solo usa auto-backup si NO hay proyectos guardados.
    if (!arr || arr.length === 0) {
      try {
        const backups = safeJsonParse(localStorage.getItem(AUTOBACKUP_KEY_V2));
        if (Array.isArray(backups) && backups.length) {
          const latest = backups[0] as any;
          const candidates: any[] = [];
          const pushRaw = (raw: any) => {
            const parsed = safeJsonParse(raw);
            const extracted = extractProjectsFromUnknown(parsed);
            if (Array.isArray(extracted) && extracted.length) candidates.push(extracted);
          };
          pushRaw(latest?.projectsRaw);
          pushRaw(latest?.projectsV2Raw);
          pushRaw(latest?.snapshotsRaw);
          if (candidates.length) {
            const best = candidates[0];
            arr = best;
            persistProjects(best as any);
          }
        }
      } catch {}
    }

    // Si el principal está vacío pero el backup tiene datos, restaura automáticamente.
    // (Esto evita que “desaparezcan” proyectos por cambios de key o escrituras accidentales.)
    try {
      const mainRaw = localStorage.getItem(STORAGE_KEY);
      const mainParsed = safeJsonParse(mainRaw);
      const backupRaw = localStorage.getItem(STORAGE_BACKUP_KEY);
      const backupParsed = safeJsonParse(backupRaw);
      if (Array.isArray(mainParsed) && mainParsed.length === 0 && Array.isArray(backupParsed) && backupParsed.length > 0) {
        persistProjects(backupParsed as any);
      }
    } catch {}

    // Migración: antes algunos proyectos guardados traían 0.45; el nuevo default es 0.5
    return arr.map((p: any) => {
      const st = p?.state ?? {};
      const ps = st.porcSeguro;
      const nextSeguro = (ps === undefined || ps === null || ps === 0.45) ? 0.5 : ps;
      const nextDTA = (st.porcDTA === undefined || st.porcDTA === null) ? 0.8 : st.porcDTA;

      const nextAgente = (st.agenteAduanalUSD === undefined || st.agenteAduanalUSD === null) ? 750 : st.agenteAduanalUSD;
      const nextManiobras = (st.maniobrasPuertoUSD === undefined || st.maniobrasPuertoUSD === null) ? 1200 : st.maniobrasPuertoUSD;
      const nextOptimizar = (st.optimizarMezcla === undefined || st.optimizarMezcla === null) ? true : st.optimizarMezcla;
      const nextDebug = (st.verDebugEmpaquetado === undefined || st.verDebugEmpaquetado === null) ? false : st.verDebugEmpaquetado;
      const nextPrecioOverrides = (st.precioOverrides && typeof st.precioOverrides === "object")? st.precioOverrides: {};
      const nextCostoOverrides = (st.costoOverrides && typeof st.costoOverrides === "object") ? st.costoOverrides : {};
      const nextContenedoresConfirmados = (st.contenedoresConfirmados ?? 0) as number;
      const nextUsarCont20 = (st.usarContenedores20 ?? false) as boolean;
      const nextCont20 = (st.contenedores20 ?? 0) as number;
      const nextMar20 = (st.costoMaritimo20USD ?? 0) as number;
      const nextTer20 = (st.costoTerrestre20MXN ?? 0) as number;
      const nextPagosCount = (st.pagosCount ?? 3) as number;
      const nextPagos = Array.isArray(st.pagos) && st.pagos.length
        ? st.pagos
        : buildDefaultPagos(nextPagosCount);
      const nextPagosNotas = (st.pagosNotas ?? "") as string;
      const nextCotCondiciones = (st.cotCondiciones ?? "") as string;
      const nextCotDescripcionTecnica = (st.cotDescripcionTecnica ?? "") as string;
      const nextCotCaracteristicasS1S8 = (st.cotCaracteristicasS1S8 ?? "") as string;
      const nextCotCaracteristicasS9 = (st.cotCaracteristicasS9 ?? "") as string;
      const nextEstatus = (st.estatusProyecto ?? "anticipoProveedor") as ProyectoStatus;
      const nextMovs = Array.isArray(st.movimientos) ? st.movimientos : [];

      const withDefaults = (val: string, fallback: string) =>
        (val || "").trim().length ? val : fallback;

      return {
        ...p,
        state: {
          ...st,
          porcSeguro: nextSeguro,
          porcDTA: nextDTA,
          agenteAduanalUSD: nextAgente,
          maniobrasPuertoUSD: nextManiobras,
          optimizarMezcla: nextOptimizar,
          verDebugEmpaquetado: nextDebug,
          precioOverrides: nextPrecioOverrides,
          costoOverrides: nextCostoOverrides,
          contenedoresConfirmados: nextContenedoresConfirmados,
          usarContenedores20: nextUsarCont20,
          contenedores20: nextCont20,
          costoMaritimo20USD: nextMar20,
          costoTerrestre20MXN: nextTer20,
          pagosCount: nextPagosCount,
          pagos: nextPagos,
          pagosNotas: nextPagosNotas,
          cotCondiciones: withDefaults(nextCotCondiciones, DEFAULT_COT_CONDICIONES),
          cotDescripcionTecnica: withDefaults(nextCotDescripcionTecnica, DEFAULT_COT_DESC_TEC),
          cotCaracteristicasS1S8: withDefaults(nextCotCaracteristicasS1S8, DEFAULT_COT_CAR_S1S8),
          cotCaracteristicasS9: withDefaults(nextCotCaracteristicasS9, DEFAULT_COT_CAR_S9),
          estatusProyecto: nextEstatus,
          movimientos: nextMovs,
        },
      };
    });
  } catch { return []; }
}
function listSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function pushSnapshot(data: Proyecto[]) {
  try {
    const arr = listSnapshots();
    arr.unshift({ ts: Date.now(), projects: data });
    // limita a 10 snapshots
    const limited = arr.slice(0, 10);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(limited));
    appendAutoBackupV2();
  } catch {}
}
function downloadJson(filename: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v: unknown): string {
  const raw = v == null ? "" : String(v);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

// m² rentables por unidad según medida (valores fijos)
// Nota: el modelo S9 (Oficina/Recepcion) NO suma m² rentables.
function rentableM2(medida: Medida, tipo: Tipo): number {
  if (tipo === "Oficina/Recepcion") return 0;

  switch (medida) {
    case 20:
      return 14;
    case 16:
      return 12;
    case 12:
      return 9;
    case 10:
      return 7;
    case 8:
      return 5.5;
    case 5:
      return 4;
    default:
      return 0;
  }
}

// ===== Estilos simples =====
const layout: React.CSSProperties = { display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh" };
const sidebar: React.CSSProperties = { borderRight: "1px solid #eee", padding: 16, background: "#fafafa" };
const mainArea: React.CSSProperties = { padding: 16, maxWidth: 1300, margin: "0 auto", width: "100%" };
const card: React.CSSProperties = { border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 20, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignItems: "start" };
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0 };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
const selectCss: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px", width: "100%" };
const inputCss: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "10px 12px",
  outline: "none",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
  boxShadow: "0 0 0 0 rgba(99,102,241,0)",
};
const btn: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#f8f8f8",
  cursor: "pointer",
  transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
};
const btnGhost: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  cursor: "pointer",
  transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
};
const btnSmall: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "6px 10px",
  background: "#f3f4f6",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
};

// ===== UI helpers (Field, Th, Td) =====
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children, style, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      style={{ padding: 8, borderBottom: "1px solid #e5e7eb", textAlign: "left", ...(style || {}) }}
    >
      {children}
    </th>
  );
}

function Td({ children, style, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...rest}
      style={{ padding: 8, borderBottom: "1px solid #f3f4f6", ...(style || {}) }}
    >
      {children}
    </td>
  );
}

// ===== Design tokens & UI variants (UX refresh) =====
const tokens = {
  primary: "#6366f1",
  primaryText: "#ffffff",
  text: "#111827",
  textMuted: "#6b7280",
  surface: "#ffffff",
  surfaceAlt: "#fafafa",
  border: "#e5e7eb",
  radius: 12,
  shadowSm: "0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 6px 18px rgba(99,102,241,0.12)",
  shadowGlass: "0 8px 24px rgba(0,0,0,0.06)",
};

const btnPrimary: React.CSSProperties = {
  border: `1px solid ${tokens.primary}`,
  borderRadius: tokens.radius,
  padding: "10px 14px",
  background: tokens.primary,
  color: tokens.primaryText,
  cursor: "pointer",
  fontWeight: 700,
  boxShadow: tokens.shadowMd,
};

const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  border: "1px solid #c7d2fe",
  color: "#3730a3",
  fontSize: 12,
  fontWeight: 700,
};

const headerSticky: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 30,
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "saturate(180%) blur(6px)",
  borderBottom: `1px solid ${tokens.border}`,
  padding: "10px 16px",
};

const kpiPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 10,
  background: tokens.surfaceAlt,
  border: `1px solid ${tokens.border}`,
  fontWeight: 700,
  fontSize: 13,
};

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  const box: React.CSSProperties = {
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    padding: 12,
    background: tokens.surface,
    boxShadow: tokens.shadowSm,
    display: "grid",
    gap: 6,
    minWidth: 0,
  };
  const t: React.CSSProperties = { fontSize: 12, color: tokens.textMuted, fontWeight: 700 };
  const v: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 800,
    color: tokens.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const s: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textMuted,
  fontWeight: 600,
  whiteSpace: "pre-line",   // ✅ respeta \n
  lineHeight: 1.25,
  overflowWrap: "anywhere",
  maxWidth: "100%",
};

  return (
    <div style={box}>
      <div style={t}>{title}</div>
      <div style={v}>{value}</div>
      {typeof sub !== "undefined" ? <div style={s}>{sub}</div> : null}
    </div>
  );
}


// ===== Stepper Component =====
function Stepper({
  step,
  setStep,
}: {
  step: StepKey;
  setStep: (k: StepKey) => void;
}) {
  const steps: Array<{ key: StepKey; title: string; desc: string }> = [
    { key: "proyecto", title: "1) Nombre", desc: "Datos del proyecto" },
    { key: "productos", title: "2) Productos", desc: "Agregar módulos" },
    { key: "costos", title: "3) Costos", desc: "Fletes e impuestos" },
    { key: "cotizacion", title: "4) Cotización", desc: "Cotización cliente" },
    { key: "pagos", title: "5) Pagos", desc: "Calendario de pagos" },
    { key: "proyectoGanado", title: "6) Ganado", desc: "Proyecto ganado" },
  ];

  const wrap: React.CSSProperties = { display: "grid", gap: 8, marginTop: 14 };
  const base: React.CSSProperties = {
    textAlign: "left",
    width: "100%",
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    padding: "10px 12px",
    background: tokens.surface,
    cursor: "pointer",
    transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
    boxShadow: tokens.shadowSm,
  };
  const active: React.CSSProperties = {
    borderColor: "#c7d2fe",
    background: "#eef2ff",
    boxShadow: tokens.shadowMd,
  };

  return (
    <div style={wrap}>
      <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 800, letterSpacing: 0.2 }}>Flujo</div>
      {steps.map((s) => {
        const isActive = s.key === step;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            style={{ ...base, ...(isActive ? active : {}) }}
          >
            <div style={{ fontWeight: 900, color: tokens.text }}>{s.title}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: tokens.textMuted, marginTop: 2 }}>{s.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

// ===== PresetChips & StickyTotalsBar Components =====
function PresetChips({
  onMargin, onDiscount
}: { onMargin: (p: number) => void; onDiscount: (p: number) => void }) {
  const group: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
  const chipBtn: React.CSSProperties = {
    ...chip,
    cursor: "pointer",
    userSelect: "none",
    borderColor: "#c7d2fe",
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>Presets de margen</div>
      <div style={group}>
        {[30, 35, 40, 45, 50].map(m => (
          <button key={m} style={chipBtn} onClick={() => onMargin(m)}>
            {m}%
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700, marginTop: 6 }}>Presets de descuento</div>
      <div style={group}>
        {[0, 5, 10, 12, 15].map(d => (
          <button key={d} style={chipBtn} onClick={() => onDiscount(d)}>
            {d}%
          </button>
        ))}
      </div>
    </div>
  );
}

function StickyTotalsBar({
  costoUSD, utilidadUSD, precioUSD, tipoCambio,
}: {
  costoUSD: number; utilidadUSD: number; precioUSD: number; tipoCambio: number;
}) {
  const bar: React.CSSProperties = {
    position: "sticky",
    bottom: 0,
    zIndex: 40,
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "saturate(180%) blur(6px)",
    borderTop: `1px solid ${tokens.border}`,
    padding: 12,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 12,
  };
  const grid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 } as React.CSSProperties;
  const pillLabel: React.CSSProperties = { fontSize: 12, color: tokens.textMuted };
  const pillVal: React.CSSProperties = { fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" };
  const pillBox: React.CSSProperties = { border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "8px 10px", background: tokens.surface };
  return (
    <div style={bar}>
      <div style={grid}>
        <div style={pillBox}><div style={pillLabel}>Costo total</div><div style={pillVal}>{fmtUSD(costoUSD)}</div></div>
        <div style={pillBox}><div style={pillLabel}>Utilidad</div><div style={pillVal}>{fmtUSD(utilidadUSD)}</div></div>
        <div style={pillBox}><div style={pillLabel}>Precio de venta</div><div style={pillVal}>{fmtUSD(precioUSD)}</div></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnGhost} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑ Arriba</button>
      </div>
    </div>
  );
}

function QuickAddProductos({
  lineas,
  setLineas,
  modelosFor,
  getUnitCost,
}: {
  lineas: Linea[];
  setLineas: (ls: Linea[]) => void;
  modelosFor: (m: Medida) => string[];
  getUnitCost: (l: Linea) => number;
}) {
  const [medida, setMedida] = useState<Medida>(20);
  const [modelo, setModelo] = useState<string>(() => (modelosFor(20)[0] || "S1"));
  const [tipo, setTipo] = useState<Tipo>("Plegable");
  const [cantidad, setCantidad] = useState<number>(0);

  // Mantén modelo válido cuando cambia medida
  useEffect(() => {
    const ms = modelosFor(medida);
    const nextModelo = ms.includes(modelo) ? modelo : (ms[0] || "S1");
    if (nextModelo !== modelo) setModelo(nextModelo);
  }, [medida]);

  // Mantén tipo válido cuando cambia (medida/modelo)
  useEffect(() => {
    const entry = (priceList as any)?.[medida]?.[modelo] || {};
    const tiposDisponibles = Object.keys(entry).filter((k) => k !== "nota") as Tipo[];
    if (!tiposDisponibles.length) return;
    if (!tiposDisponibles.includes(tipo)) setTipo(tiposDisponibles[0]);
  }, [medida, modelo]);

  const tiposDisponibles = useMemo(() => {
    const entry = (priceList as any)?.[medida]?.[modelo] || {};
    return Object.keys(entry).filter((k) => k !== "nota") as Tipo[];
  }, [medida, modelo]);

  const nota = useMemo(() => {
    const entry = (priceList as any)?.[medida]?.[modelo] || {};
    return (entry?.nota as string) || "";
  }, [medida, modelo]);

  const unitUSD = useMemo(() => {
    const l: Linea = { id: "tmp", medida, modelo, tipo, cantidad: 1 };
    return getUnitCost(l) || 0;
  }, [medida, modelo, tipo]);

  const addLinea = () => {
    const qty = Number.isFinite(cantidad) ? Math.max(0, Math.floor(cantidad)) : 0;
    if (qty <= 0) {
      alert("Captura una cantidad mayor a 0");
      return;
    }
    const key = `${medida}-${modelo}-${tipo}`;

    // Si ya existe la misma combinación, suma cantidad
    const idx = lineas.findIndex((l) => `${l.medida}-${l.modelo}-${l.tipo}` === key);
    if (idx >= 0) {
      const next = [...lineas];
      next[idx] = { ...next[idx], cantidad: (next[idx].cantidad || 0) + qty };
      setLineas(next);
      return;
    }

    const nueva: Linea = {
      id: cryptoRandom(),
      medida,
      modelo,
      tipo,
      cantidad: qty,
      techoAnticondensante: false,
    };
    setLineas([...(lineas || []), nueva]);
  };

  const group: React.CSSProperties = { display: "grid", gap: 10 };
  const row: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "140px 140px 1fr 140px auto",
    gap: 10,
    alignItems: "end",
  };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={h2}>Agregar productos (rápido)</h2>
        <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
          Tip: si agregas el mismo modelo/tipo, se suma la cantidad
        </div>
      </div>

      <div style={group}>
        <div style={row}>
          <Field label="Medida">
            <select
              value={medida}
              onChange={(e) => setMedida(Number(e.target.value) as Medida)}
              style={selectCss}
            >
              {[20, 16, 12, 10, 8, 5].map((m) => (
                <option key={m} value={m}>
                  {m}'
                </option>
              ))}
            </select>
          </Field>

          <Field label="Modelo">
            <select
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              style={selectCss}
            >
              {modelosFor(medida).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
              style={selectCss}
            >
              {tiposDisponibles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cantidad">
            <input
              type="number"
              min={0}
              step={1}
              value={cantidad === 0 ? "" : String(cantidad)}
              onChange={(e) => {
                const raw = (e.target.value ?? "").toString();
                if (raw === "") {
                  setCantidad(0);
                  return;
                }
                const n = Math.floor(Number(raw));
                setCantidad(Number.isFinite(n) ? Math.max(0, n) : 0);
              }}
              style={{ ...inputCss, width: "100%" }}
            />
          </Field>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>Precio lista (USD)</div>
            <button style={btnPrimary} onClick={addLinea}>
              + Agregar
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={chip}>USD/u: {fmtUSD(unitUSD, false)}</span>
            {nota ? <span style={{ ...chip, background: "#fff7ed", borderColor: "#fed7aa", color: "#9a3412" }}>Nota: {nota}</span> : null}
          </div>
          <button
            style={btnSmall}
            onClick={() => {
              if (!lineas.length) return;
              const last = lineas[lineas.length - 1];
              const copia: Linea = { ...last, id: cryptoRandom(), cantidad: 1 };
              setLineas([...(lineas || []), copia]);
            }}
            disabled={!lineas.length}
            title="Agrega una línea copiando la última"
          >
            Duplicar última (qty 1)
          </button>
        </div>
      </div>
    </section>
  );
}

function LineasCompactTable({
  lineas,
  setLineas,
  getUnitCost,
}: {
  lineas: Linea[];
  setLineas: (ls: Linea[]) => void;
  getUnitCost: (l: Linea) => number;
}) {
  const totalUnidades = (lineas || []).reduce((a, l) => a + (l.cantidad || 0), 0);
  const [precioEspecial, setPrecioEspecial] = useState(false);
  const [draftCost, setDraftCost] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);

  const updateQty = (id: string, qty: number) => {
    const nextQty = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
    const next = (lineas || [])
      .map((l) => (l.id === id ? { ...l, cantidad: nextQty } : l))
      .filter((l) => (l.cantidad || 0) > 0);
    setLineas(next);
  };

  const inc = (id: string, delta: number) => {
    const l = (lineas || []).find((x) => x.id === id);
    if (!l) return;
    updateQty(id, (l.cantidad || 0) + delta);
  };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={h2}>Productos agregados</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={chip}>Líneas: {(lineas || []).length}</span>
          <span style={chip}>Unidades: {totalUnidades}</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={precioEspecial}
              onChange={(e) => setPrecioEspecial(e.target.checked)}
            />
            Precio especial
          </label>
          <button
            style={btnSmall}
            onClick={() => {
              if (!confirm("¿Vaciar todos los productos?")) return;
              setLineas([]);
            }}
            disabled={!lineas?.length}
            title="Borra todas las líneas"
          >
            Vaciar
          </button>
        </div>
      </div>

      {!lineas?.length ? (
        <div style={{ color: tokens.textMuted, fontWeight: 600 }}>
          Aún no hay productos. Agrégalos con “Agregar productos (rápido)”.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <Th style={{ width: 28 }}></Th>
                <Th>Medida</Th>
                <Th>Modelo</Th>
                <Th>Tipo</Th>
                <Th style={{ textAlign: "center" }}>Techo Anticondensante</Th>
                <Th style={{ textAlign: "right" }}>USD/u</Th>
                <Th style={{ textAlign: "center" }}>Cantidad</Th>
                <Th style={{ textAlign: "right" }}>Subtotal USD</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(lineas || []).map((l) => {
                const key = l.id;
                const baseUnit =
                  ((priceList as any)?.[l.medida]?.[l.modelo]?.[l.tipo] ?? 0) +
                  (l.techoAnticondensante ? TECHO_ANTICONDENSANTE_USD : 0);
                const overrideUnit = l.costoProveedor;
                const unit = typeof overrideUnit === "number" && Number.isFinite(overrideUnit) ? overrideUnit : baseUnit;
                const sub = round2(unit * (l.cantidad || 0));
                const draft =
                  (draftCost[key] ?? "") !== ""
                    ? (draftCost[key] as string)
                    : (typeof overrideUnit === "number" ? fmtUSDInput(overrideUnit) : "");
                return (
                  <tr
                    key={l.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!dragId || dragId === l.id) return;
                      const next = [...(lineas || [])];
                      const from = next.findIndex((x) => x.id === dragId);
                      const to = next.findIndex((x) => x.id === l.id);
                      if (from === -1 || to === -1) return;
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      setLineas(next);
                      setDragId(null);
                    }}
                    style={{
                      background: dragId && dragId === l.id ? "rgba(99,102,241,0.08)" : "transparent",
                    }}
                  >
                    <Td style={{ textAlign: "center" }}>
                      <span
                        role="button"
                        aria-label="Reordenar"
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => setDragId(null)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          cursor: "grab",
                          color: tokens.textMuted,
                          background: "rgba(15, 23, 42, 0.04)",
                          userSelect: "none",
                        }}
                        title="Arrastra para reordenar"
                      >
                        ⋮⋮
                      </span>
                    </Td>
                    <Td>{l.medida}'</Td>
                    <Td>{l.modelo}</Td>
                    <Td>{getTipoDisplay(l.modelo, l.tipo)}</Td>
                    <Td style={{ textAlign: "center" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(l.techoAnticondensante)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setLineas((lineas || []).map((x) =>
                              x.id === l.id ? { ...x, techoAnticondensante: checked } : x
                            ));
                          }}
                        />
                        Techo Anticondensante (+{fmtUSD(TECHO_ANTICONDENSANTE_USD, false)})
                      </label>
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 700 }}>
                      {precioEspecial ? (
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftCost((d) => ({ ...d, [key]: val }));
                            const raw = val.toString();
                            if (raw.trim() === "") {
                              setLineas((lineas || []).map((x) =>
                                x.id === l.id ? { ...x, costoProveedor: undefined } : x
                              ));
                              return;
                            }
                            const parsed = parseNumericInput(raw);
                            if (Number.isFinite(parsed)) {
                              setLineas((lineas || []).map((x) =>
                                x.id === l.id ? { ...x, costoProveedor: parsed } : x
                              ));
                            }
                          }}
                          onBlur={(e) => {
                            const raw = (e.currentTarget.value ?? "").toString();
                            const parsed = parseNumericInput(raw);
                            setLineas((lineas || []).map((x) =>
                              x.id === l.id ? { ...x, costoProveedor: Number.isFinite(parsed) ? parsed : undefined } : x
                            ));
                            setDraftCost((d) => {
                              const next = { ...d };
                              delete next[key];
                              return next;
                            });
                          }}
                          placeholder={fmtUSDInput(baseUnit)}
                          style={{ ...inputCss, width: 110, textAlign: "right" }}
                        />
                      ) : (
                        fmtUSD(unit, false)
                      )}
                    </Td>

                    <Td style={{ textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button style={btnSmall} onClick={() => inc(l.id, -1)}>-</button>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={String(l.cantidad ?? 0)}
                          onChange={(e) => updateQty(l.id, Number(e.target.value))}
                          style={{ ...inputCss, width: 90, textAlign: "center", padding: "8px 10px" }}
                        />
                        <button style={btnSmall} onClick={() => inc(l.id, +1)}>+</button>
                      </div>
                    </Td>

                    <Td style={{ textAlign: "right", fontWeight: 800 }}>{fmtUSD(sub, false)}</Td>

                    <Td style={{ textAlign: "right" }}>
                      <button style={btnSmall} onClick={() => setLineas((lineas || []).filter((x) => x.id !== l.id))}>
                        Eliminar
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ParametrosCard({
  s,
  setS,
  contenedores,
  fletesSencillos,
  contenedoresAuto,
  fletesFull,
}: {
  s: ProyectoState;
  setS: (patch: Partial<ProyectoState>) => void;
  contenedores: number;
  fletesSencillos: number;
  contenedoresAuto: number;
  fletesFull: number;
}) {
  return (
    <section style={card}>
      <h2 style={h2}>Parámetros</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Field label="Tipo de cambio">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={s.tipoCambio === 0 ? "" : String(s.tipoCambio)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ tipoCambio: next });
            }}
            style={inputCss}
            placeholder="Ej. 18"
          />
        </Field>

        <Field label="Confirmar fletes">
          <label style={{ display: "flex", alignItems: "center", gap: 10, height: 40 }}>
            <input
              type="checkbox"
              checked={!!s.confirmFletes}
              onChange={(e) => setS({ confirmFletes: e.target.checked })}
            />
            <span style={{ fontSize: 13, color: tokens.textMuted, fontWeight: 700 }}>
              Auto: {contenedoresAuto} · Full: {fletesFull} · Sencillos: {fletesSencillos}
            </span>
          </label>
        </Field>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Field label="Contenedores 40' (confirmados)">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={s.confirmFletes ? String(s.contenedoresConfirmados ?? 0) : String(contenedoresAuto)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const next = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
              setS({ contenedoresConfirmados: next });
            }}
            style={{ ...inputCss, background: s.confirmFletes ? "#fff" : "#f9fafb" }}
            disabled={!s.confirmFletes}
          />
          <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700, marginTop: 6 }}>
            {s.confirmFletes ? "Usando valor confirmado" : "Usando cálculo automático"}
          </div>
        </Field>

        <Field label="Incluir contenedores 20'">
          <label style={{ display: "flex", alignItems: "center", gap: 10, height: 40 }}>
            <input
              type="checkbox"
              checked={!!s.usarContenedores20}
              onChange={(e) => setS({ usarContenedores20: e.target.checked })}
            />
            <span style={{ fontSize: 13, color: tokens.textMuted, fontWeight: 700 }}>
              Habilitar 20' (se suman al total)
            </span>
          </label>
        </Field>

        <Field label="Contenedores 20'">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={String(s.contenedores20 ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const next = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
              setS({ contenedores20: next });
            }}
            style={{ ...inputCss, background: s.usarContenedores20 ? "#fff" : "#f9fafb" }}
            disabled={!s.usarContenedores20}
          />
        </Field>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Field label="Costo marítimo (USD / contenedor)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.costoMaritimoUSD === 0 ? "" : String(s.costoMaritimoUSD)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ costoMaritimoUSD: next });
            }}
            style={inputCss}
            placeholder="Ej. 2500"
          />
        </Field>

        <Field label="Costo marítimo 20' (USD / contenedor)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.costoMaritimo20USD === 0 ? "" : String(s.costoMaritimo20USD)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ costoMaritimo20USD: next });
            }}
            style={{ ...inputCss, background: s.usarContenedores20 ? "#fff" : "#f9fafb" }}
            placeholder="Ej. 1800"
            disabled={!s.usarContenedores20}
          />
        </Field>

        <Field label="Flete terrestre FULL (MXN)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.costoFullMXN === 0 ? "" : String(s.costoFullMXN)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ costoFullMXN: next });
            }}
            style={inputCss}
            placeholder="Ej. 65000"
          />
        </Field>

        <Field label="Flete terrestre Sencillo (MXN)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.costoSencilloMXN === 0 ? "" : String(s.costoSencilloMXN)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ costoSencilloMXN: next, sencilloDirty: true });
            }}
            style={inputCss}
            placeholder="Auto (50% del FULL)"
          />
        </Field>

        <Field label="Flete terrestre 20' (MXN)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.costoTerrestre20MXN === 0 ? "" : String(s.costoTerrestre20MXN)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ costoTerrestre20MXN: next });
            }}
            style={{ ...inputCss, background: s.usarContenedores20 ? "#fff" : "#f9fafb" }}
            placeholder="Ej. 35000"
            disabled={!s.usarContenedores20}
          />
        </Field>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Field label="% Valor factura (base IGI/Seguro)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.1}
            value={String(s.porcValorFactura ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
              setS({ porcValorFactura: next });
            }}
            style={inputCss}
          />
        </Field>

        <Field label="% Seguro">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={0.01}
            value={String(s.porcSeguro ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(10, parsed));
              setS({ porcSeguro: next });
            }}
            style={inputCss}
          />
        </Field>

        <Field label="% IGI">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.1}
            value={String(s.porcIGI ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
              setS({ porcIGI: next });
            }}
            style={inputCss}
          />
        </Field>

        <Field label="% DTA">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={0.01}
            value={String(s.porcDTA ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(10, parsed));
              setS({ porcDTA: next });
            }}
            style={inputCss}
          />
        </Field>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Field label="Agente aduanal (USD)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.agenteAduanalUSD === 0 ? "" : String(s.agenteAduanalUSD)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ agenteAduanalUSD: next });
            }}
            style={inputCss}
          />
        </Field>

        <Field label="Maniobras puerto (USD)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={s.maniobrasPuertoUSD === 0 ? "" : String(s.maniobrasPuertoUSD)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = raw === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
              setS({ maniobrasPuertoUSD: next });
            }}
            style={inputCss}
          />
        </Field>

        <Field label="Honorarios asesor % (sobre pago Otra empresa)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.1}
            value={String(s.asesorPct ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
              setS({ asesorPct: next });
            }}
            style={inputCss}
          />
        </Field>
        
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Field label="% Pago Otra empresa">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.1}
            value={String(s.porcOtraEmpresa ?? 0)}
            onChange={(e) => {
              const raw = (e.target.value ?? "").toString();
              const parsed = parseNumericInput(raw);
              const next = !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
              setS({ porcOtraEmpresa: next, porcFila: 100 - next });
            }}
            style={inputCss}
          />
        </Field>

        <Field label="% Pago Fila Systems">
          <div style={{ ...inputCss, background: "#f9fafb", borderColor: "#eee", display: "flex", alignItems: "center", height: 40 }}>
            <span style={{ paddingLeft: 8, fontWeight: 700 }}>{(s.porcFila ?? 0).toFixed(2)}%</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>(auto)</span>
          </div>
        </Field>
      </div>
    </section>
  );
}
function CotizacionClienteCard({
  s,
  setS,
}: {
  s: ProyectoState;
  setS: (patch: Partial<ProyectoState>) => void;
}) {
  // Drafts para inputs: permiten borrar/teclear sin que el input “rebote” a 0.
  const [draft, setDraft] = React.useState<{ margin: string; desc: string; omar: string }>({
    margin: "",
    desc: "",
    omar: "",
  });

  // Sincroniza drafts cuando cambia de proyecto (o cuando cambian valores externamente)
  React.useEffect(() => {
    setDraft({
      margin: (s?.marginPct ?? 0) === 0 ? "" : String(s.marginPct ?? 0),
      desc: (s?.descuentoPct ?? 0) === 0 ? "" : String(s.descuentoPct ?? 0),
      omar: (s?.comisionOmarPct ?? 0) === 0 ? "" : String(s.comisionOmarPct ?? 0),
    });
  }, [s?.marginPct, s?.descuentoPct, s?.comisionOmarPct]);

  const commitPct = (key: "margin" | "desc" | "omar", raw: string) => {
    const cleaned = (raw ?? "").toString().trim();

    // Vacío => default 0
    if (!cleaned) {
      if (key === "margin") setS({ marginPct: 0 });
      if (key === "desc") setS({ descuentoPct: 0 });
      if (key === "omar") setS({ comisionOmarPct: 0 });
      return;
    }

    const parsed = parseNumericInput(cleaned);
    const n = Number.isFinite(parsed) ? parsed : 0;

    if (key === "margin") {
      const next = Math.max(0, Math.min(95, n));
      setS({ marginPct: next });
    }
    if (key === "desc") {
      const next = Math.max(0, Math.min(100, n));
      setS({ descuentoPct: next });
    }
    if (key === "omar") {
      const next = Math.max(0, Math.min(100, n));
      setS({ comisionOmarPct: next });
    }
  };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={h2}>Cotización cliente</h2>
        <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 800 }}>
          Margen · Descuento · Comisión Omar
        </div>
      </div>

      <div style={{ height: 10 }} />

      <div style={grid3}>
        <Field label="Margen objetivo % (sobre precio)">
          <input
            type="text"
            inputMode="decimal"
            value={draft.margin}
            onChange={(e) => setDraft((d) => ({ ...d, margin: e.target.value }))}
            onBlur={() => commitPct("margin", draft.margin)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={inputCss}
            placeholder="Ej. 40"
          />
        </Field>

        <Field label="Descuento %">
          <input
            type="text"
            inputMode="decimal"
            value={draft.desc}
            onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
            onBlur={() => commitPct("desc", draft.desc)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={inputCss}
            placeholder="0 (default)"
          />
        </Field>

        <Field label="Comisión Omar % (sobre venta)">
          <input
            type="text"
            inputMode="decimal"
            value={draft.omar}
            onChange={(e) => setDraft((d) => ({ ...d, omar: e.target.value }))}
            onBlur={() => commitPct("omar", draft.omar)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={inputCss}
            placeholder="Ej. 3"
          />
        </Field>
      </div>

      <div style={{ height: 12 }} />
      <PresetChips
        onMargin={(p) => {
          setDraft((d) => ({ ...d, margin: String(p) }));
          setS({ marginPct: p });
        }}
        onDiscount={(p) => {
          setDraft((d) => ({ ...d, desc: p === 0 ? "" : String(p) }));
          setS({ descuentoPct: p });
        }}
      />
    </section>
  );
}

function CalendarioPagosCard({
  s,
  setS,
  totalVentaUSD,
  rows,
  meta,
}: {
  s: ProyectoState;
  setS: (patch: Partial<ProyectoState>) => void;
  totalVentaUSD: number;
  rows: CotRow[];
  meta: ProyectoMeta;
}) {
  const countOptions = [3, 4, 5];
  const pagos = Array.isArray(s.pagos) ? s.pagos : [];
  const pagosCount = countOptions.includes(s.pagosCount) ? s.pagosCount : 3;
  const [openPago, setOpenPago] = useState<Record<number, boolean>>({});

  const ensureLength = (count: number) => {
    const base = buildDefaultPagos(count);
    const next = Array.from({ length: count }, (_, i) => ({
      pct: pagos?.[i]?.pct ?? base[i].pct,
      date: pagos?.[i]?.date ?? base[i].date,
      concept: pagos?.[i]?.concept ?? base[i].concept,
    }));
    setS({ pagosCount: count, pagos: next });
  };

  useEffect(() => {
    if (pagos.length !== pagosCount) {
      ensureLength(pagosCount);
    }
  }, [pagosCount, pagos.length]);

  const sumPct = pagos.reduce((acc, p) => acc + (Number(p.pct) || 0), 0);
  const pcts = pagos.map((p) => Number(p.pct) || 0);
  const perPagoUnitsByLine = pcts.map(() => rows.map(() => 0));

  rows.forEach((r, lineIdx) => {
    const qty = Math.max(0, Math.floor(r.qty || 0));
    const rawUnits = pcts.map((p) => (qty * p) / 100);
    const floors = rawUnits.map((v) => Math.floor(v));
    let remainder = qty - floors.reduce((a, b) => a + b, 0);
    const units = floors.slice();
    for (let i = 0; i < units.length && remainder > 0; i += 1) {
      units[i] += 1;
      remainder -= 1;
    }
    units.forEach((u, pagoIdx) => {
      perPagoUnitsByLine[pagoIdx][lineIdx] = u;
    });
  });

  const targetPct = pcts.map((p) => (Number.isFinite(p) ? p : 0));
  const tolerance = 2;
  const linePrices = rows.map((r) => r.precioUnidad || 0);
  const totalVenta = totalVentaUSD || 0;

  const computePagoTotals = () =>
    pcts.map((_, pagoIdx) => {
      const unitsByLine = perPagoUnitsByLine[pagoIdx] || [];
      const totalUnits = unitsByLine.reduce((acc, u) => acc + u, 0);
      const amountUSD = round2(
        unitsByLine.reduce((acc, u, lineIdx) => acc + u * (linePrices[lineIdx] || 0), 0)
      );
      const effectivePct = totalVenta > 0 ? round2((amountUSD / totalVenta) * 100) : 0;
      return { totalUnits, amountUSD, unitsByLine, effectivePct };
    });

  const score = (eff: number[], weightFirst: number) =>
    eff.reduce((acc, v, i) => {
      const diff = v - (targetPct[i] || 0);
      const w = i === 0 ? weightFirst : 1;
      return acc + w * diff * diff;
    }, 0);

  let pagoTotals = computePagoTotals();
  let iterations = 0;
  const maxIterations = rows.reduce((acc, r) => acc + (r.qty || 0), 0) * (pcts.length || 1) * 2;

  while (iterations < maxIterations) {
    const eff = pagoTotals.map((t) => t.effectivePct);
    const overIdx = eff.findIndex((v, i) => v > (targetPct[i] || 0) + tolerance);
    const underIdx = eff.findIndex((v, i) => v < (targetPct[i] || 0) - tolerance);
    if (overIdx === -1 || underIdx === -1) break;

    let bestMove: { lineIdx: number; from: number; to: number; improvement: number } | null = null;
    const baseScore = score(eff, 2);

    for (let lineIdx = 0; lineIdx < rows.length; lineIdx += 1) {
      const unitsFrom = perPagoUnitsByLine[overIdx][lineIdx];
      if (!unitsFrom) continue;
      const price = linePrices[lineIdx] || 0;
      if (price <= 0) continue;

      const nextEff = eff.slice();
      nextEff[overIdx] = totalVenta > 0 ? round2(((pagoTotals[overIdx].amountUSD - price) / totalVenta) * 100) : 0;
      nextEff[underIdx] = totalVenta > 0 ? round2(((pagoTotals[underIdx].amountUSD + price) / totalVenta) * 100) : 0;

      const nextScore = score(nextEff, 2);
      const improvement = baseScore - nextScore;
      if (improvement > 0 && (!bestMove || improvement > bestMove.improvement)) {
        bestMove = { lineIdx, from: overIdx, to: underIdx, improvement };
      }
    }

    if (!bestMove) break;
    perPagoUnitsByLine[bestMove.from][bestMove.lineIdx] -= 1;
    perPagoUnitsByLine[bestMove.to][bestMove.lineIdx] += 1;
    pagoTotals = computePagoTotals();
    iterations += 1;
  }

  // pagoTotals ya calculado y ajustado arriba

  const exportPdf = () => {
    const fecha = new Date();
    const fechaFmt = fecha.toLocaleDateString("es-MX");
    const nombreProyecto = escapeHtml(meta?.nombre || "");
    const contacto = escapeHtml(meta?.contacto || "");
    const notas = escapeHtml(s?.pagosNotas || "");
    const logoUrl = "/logo-s-containr.png";

    const mainRowsHtml = pagos
      .map((p, idx) => {
        const totals = pagoTotals[idx];
        const subtotal = totals?.amountUSD || 0;
        const iva = round2(subtotal * IVA_RATE);
        const total = round2(subtotal + iva);
        return `
          <tr>
            <td class="pago">${escapeHtml(`Pago ${idx + 1}`)}</td>
            <td class="num">${totals?.totalUnits ?? 0}</td>
            <td class="fecha">${escapeHtml(p.date || "")}</td>
            <td class="actividad">${escapeHtml(p.concept || "")}</td>
            <td class="money">$ ${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="money">$ ${iva.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="money">$ ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="usd">USD</td>
          </tr>
        `;
      })
      .join("");

    const totalUnits = pagoTotals.reduce((acc, t) => acc + (t?.totalUnits || 0), 0);
    const totalSubtotal = round2(pagoTotals.reduce((acc, t) => acc + (t?.amountUSD || 0), 0));
    const totalIva = round2(totalSubtotal * IVA_RATE);
    const totalFinal = round2(totalSubtotal + totalIva);

    const detailTablesHtml = pagos
      .map((p, idx) => {
        const totals = pagoTotals[idx];
        const rowsHtml = rows
          .map((r, lineIdx) => {
            const units = totals?.unitsByLine?.[lineIdx] || 0;
            if (!units) return "";
            const sub = round2(units * (r.precioUnidad || 0));
            const iva = round2(sub * IVA_RATE);
            const tot = round2(sub + iva);
            const size = `${r.medida}'`;
            return `
              <tr>
                <td>${escapeHtml(size)}</td>
                <td>${escapeHtml(r.modelo)}</td>
                <td class="num">${units}</td>
                <td class="money">$ ${r.precioUnidad.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="money">$ ${sub.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="money">$ ${iva.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="money">$ ${tot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            `;
          })
          .join("");
        const subTotal = totals?.amountUSD || 0;
        const ivaTotal = round2(subTotal * IVA_RATE);
        const total = round2(subTotal + ivaTotal);
        const pctReal = totals?.effectivePct ?? 0;
        return `
          <div class="block">
            <div class="block-title">Pago ${idx + 1}</div>
            <table class="mini">
              <thead>
                <tr>
                  <th>Tamaño</th>
                  <th>Modelo</th>
                  <th>Unidades</th>
                  <th>Precio U</th>
                  <th>Sub - Total</th>
                  <th>IVA</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="7" class="muted">Sin unidades asignadas</td></tr>`}
                <tr class="total-row">
                  <td colspan="2">Totales</td>
                  <td class="num">${totals?.totalUnits ?? 0}</td>
                  <td></td>
                  <td class="money">$ ${subTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td class="money">$ ${ivaTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td class="money">$ ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            <div class="pct-real"> % real: ${pctReal.toFixed(2)}%</div>
          </div>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>Calendario de pagos</title>
          <style>
            * { box-sizing: border-box; }
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: Arial, sans-serif; color: #111; margin: 0; zoom: var(--cal-zoom, 0.82); }
            .header { display: grid; grid-template-columns: 1fr 1fr; align-items: center; }
            .logo { height: 72px; width: auto; object-fit: contain; }
            .title { text-align: center; font-size: 20px; font-weight: 700; color: #666; margin: 8px 0 12px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
            .meta .label { color: #777; font-weight: 700; }
            .meta .value { margin-left: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #222; padding: 5px 7px; }
            th { background: #f5f5f5; font-weight: 700; text-align: center; }
            td.pago { font-weight: 700; }
            td.money, th.money { text-align: right; white-space: nowrap; }
            td.num { text-align: center; }
            td.usd { text-align: center; }
            .notes { margin: 10px 0; }
            .notes .box { border: 1px solid #222; min-height: 50px; padding: 6px; }
            .block { margin-top: 8px; page-break-inside: avoid; }
            .block-title { font-weight: 800; margin: 6px 0; }
            .mini th, .mini td { border: 1px solid #111; padding: 3px 5px; font-size: 10px; }
            .total-row td { font-weight: 800; }
            .pct-real { text-align: right; font-weight: 700; margin-top: 4px; }
            .bank { margin-top: 10px; }
            .bank h3 { text-align: center; margin: 6px 0 10px; }
            .bank table th, .bank table td { border: 1px solid #111; padding: 6px; font-size: 12px; }
            .footer { margin-top: 16px; text-align: center; font-size: 11px; }
            .totals { margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <img class="logo" src="${logoUrl}" alt="S-CONTAINR" onerror="this.style.display='none'" />
            </div>
          </div>
          <div class="title">Calendario de pagos</div>
          <div class="meta">
            <div><span class="label">Contacto</span><span class="value">${contacto}</span></div>
            <div><span class="label">Fecha</span><span class="value">${fechaFmt}</span></div>
            <div><span class="label">Nombre del Proyecto</span><span class="value">${nombreProyecto}</span></div>
            <div><span class="label">Tipo de cambio</span><span class="value">Al día de pago</span></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Pago</th>
                <th>Unidades</th>
                <th>Fecha Estimadas</th>
                <th>Actividad</th>
                <th>Sub Total</th>
                <th>IVA</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${mainRowsHtml}
            </tbody>
          </table>

          ${detailTablesHtml}

          <table class="totals">
            <tr>
              <td style="font-weight:700">Totales</td>
              <td class="num">${totalUnits}</td>
              <td></td>
              <td class="money">$ ${totalSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="money">$ ${totalIva.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="money">$ ${totalFinal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="num">100.00%</td>
            </tr>
          </table>

          <div class="notes">
            <div class="label" style="font-weight:700; color:#777; margin-bottom:4px;">Notas:</div>
            <div class="box">${notas}</div>
          </div>

          <div class="bank">
            <h3>CUENTAS BANCARIAS PARA PAGO BANCO BASE</h3>
            <table>
              <tr>
                <th>BENEFICIARIO</th>
                <th colspan="2">FILA SYSTEMS SA DE CV</th>
              </tr>
              <tr>
                <th></th>
                <th>NUMERO DE CUENTA</th>
                <th>CLAVE</th>
              </tr>
              <tr>
                <td>DÓLARES</td>
                <td>45808070201</td>
                <td>14532045808070-20-10</td>
              </tr>
              <tr>
                <td>PESOS</td>
                <td>45808070101</td>
                <td>14532045808070-10-11</td>
              </tr>
            </table>
          </div>

          <div class="footer">
            Fila Systems S.A. de C.V. - Prol. Av. Vallarta 7555 Col. San Juan de Ocotán, Zapopan, Jal. C.P.45019 - Tel. 56 44772909
          </div>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    try {
      const totalDetailRows = pagoTotals.reduce((acc, t) => {
        const count = (t?.unitsByLine || []).filter((u) => u > 0).length;
        return acc + count;
      }, 0);
      const pagosCount = pagos.length || 0;
      const density = totalDetailRows + pagosCount * 2;
      const zoom = Math.max(0.7, Math.min(0.9, 0.9 - density * 0.006));
      w.document.documentElement.style.setProperty("--cal-zoom", String(zoom));
    } catch {}
    setTimeout(() => w.print(), 300);
  };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={h2}>Calendario de pagos</h2>
        <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
          Total venta: {fmtUSD(totalVentaUSD)}
        </div>
      </div>

      <div style={{ height: 8 }} />

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "center" }}>
        <Field label="Número de pagos">
          <select
            value={pagosCount}
            onChange={(e) => ensureLength(Number(e.target.value))}
            style={selectCss}
          >
            {countOptions.map((n) => (
              <option key={n} value={n}>
                {n} pagos
              </option>
            ))}
          </select>
        </Field>
        <div style={{ fontSize: 12, color: sumPct === 100 ? "#059669" : "#b45309", fontWeight: 800 }}>
          % total: {sumPct.toFixed(2)}% {sumPct === 100 ? "✓" : "(ajusta para 100%)"}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button style={btn} onClick={exportPdf}>Exportar PDF</button>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <Th>Pago</Th>
              <Th style={{ textAlign: "right" }}>%</Th>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th style={{ textAlign: "right" }}>Unidades (mix)</Th>
              <Th style={{ textAlign: "right" }}>Monto (USD)</Th>
              <Th style={{ textAlign: "right" }}>% real</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p, idx) => {
              const totals = pagoTotals[idx];
              const effectivePct = totalVentaUSD > 0 ? round2((totals?.amountUSD || 0) / totalVentaUSD * 100) : 0;
              const isOpen = !!openPago[idx];
              return (
                <React.Fragment key={idx}>
                  <tr>
                    <Td>Pago {idx + 1}</Td>
                    <Td style={{ textAlign: "right" }}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        value={String(p.pct ?? 0)}
                        onChange={(e) => {
                          const rawVal = parseNumericInput(e.target.value);
                          const nextPct = Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
                          const next = pagos.map((x, i) => (i === idx ? { ...x, pct: nextPct } : x));
                          setS({ pagos: next });
                        }}
                        style={{ ...inputCss, width: 90, textAlign: "right" }}
                      />
                    </Td>
                    <Td>
                      <input
                        type="date"
                        value={p.date ?? ""}
                        onChange={(e) => {
                          const next = pagos.map((x, i) => (i === idx ? { ...x, date: e.target.value } : x));
                          setS({ pagos: next });
                        }}
                        style={{ ...inputCss, width: 160 }}
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={p.concept ?? ""}
                        onChange={(e) => {
                          const next = pagos.map((x, i) => (i === idx ? { ...x, concept: e.target.value } : x));
                          setS({ pagos: next });
                        }}
                        style={{ ...inputCss, width: "100%" }}
                        placeholder="Anticipo, producción, entrega..."
                      />
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 800 }}>
                      {totals?.totalUnits ?? 0}
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 800 }}>
                      {totalVentaUSD > 0 ? fmtUSD(totals?.amountUSD || 0, false) : "—"}
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 800 }}>
                      {totalVentaUSD > 0 ? `${effectivePct.toFixed(2)}%` : "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <button style={btnSmall} onClick={() => setOpenPago((o) => ({ ...o, [idx]: !isOpen }))}>
                        {isOpen ? "Ocultar" : "Desglosar"}
                      </button>
                    </Td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <Td colSpan={7} style={{ background: "#fafafa" }}>
                        <div style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>
                          {(rows || []).map((r, lineIdx) => {
                            const units = totals?.unitsByLine?.[lineIdx] || 0;
                            if (!units) return null;
                            const lineAmount = round2(units * (r.precioUnidad || 0));
                            return (
                              <div key={`${idx}-${lineIdx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <span>
                                  {r.medida}' · {r.modelo} · {getTipoDisplay(r.modelo, r.tipo)} — {units} u × {fmtUSD(r.precioUnidad, false)}
                                </span>
                                <span style={{ fontWeight: 800 }}>{fmtUSD(lineAmount, false)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </Td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
        Monto por pago calculado por unidades enteras asignadas (mix real). El % real puede variar por redondeo de unidades.
      </div>

      <div style={{ height: 10 }} />
      <Field label="Notas (se imprime en el PDF)">
        <textarea
          value={s.pagosNotas ?? ""}
          onChange={(e) => setS({ pagosNotas: e.target.value })}
          style={{ ...inputCss, width: "100%", minHeight: 80 }}
          placeholder="Notas generales del calendario de pagos..."
        />
      </Field>
    </section>
  );
}

function ProyectoGanadoCard({
  s,
  setS,
  totalVentaUSD,
  costosDefaults,
}: {
  s: ProyectoState;
  setS: (patch: Partial<ProyectoState>) => void;
  totalVentaUSD: number;
  costosDefaults: ProyectoState["costosControl"];
}) {
  const movimientos = Array.isArray(s.movimientos) ? s.movimientos : [];
  const [montoDraft, setMontoDraft] = useState<Record<string, string>>({});
  const [soloIva, setSoloIva] = useState(false);
  const tcDefault = s.tcCobro || s.tipoCambio || 0;

  const setMovs = (next: MovimientoFin[]) => setS({ movimientos: next });

  const addMovimiento = () => {
    const nuevo: MovimientoFin = {
      id: cryptoRandom(),
      fecha: "",
      tipo: "cargo",
      estado: "porPagar",
      incluyeIva: false,
      categoria: "importacion",
      descripcion: "",
      monto: 0,
      moneda: "USD",
      tcPago: 0,
      referencia: "",
    };
    setMovs([nuevo, ...movimientos]);
  };

  const updateMov = (id: string, patch: Partial<MovimientoFin>) => {
    const next = movimientos.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setMovs(next);
  };

  const removeMov = (id: string) => {
    setMovs(movimientos.filter((m) => m.id !== id));
  };

  const calcTotal = (list: MovimientoFin[]) => {
    const base = list.reduce(
      (acc, m) => {
        const total = (m.monto || 0); // no sumar IVA, solo desglosar
        if (m.moneda === "USD") acc.usd += total;
        else acc.mxn += total;
        return acc;
      },
      { usd: 0, mxn: 0 }
    );
    return { usd: round2(base.usd), mxn: round2(base.mxn) };
  };

  const movToUSDFallback = (m: MovimientoFin) => {
    const baseAmount =
      (m.categoria === "iva" || m.categoria === "ivaImportacion") && Number.isFinite(m.ivaManual)
        ? (m.ivaManual as number)
        : (m.monto || 0);
    if (m.moneda === "USD") return baseAmount;
    const tc = m.tcPago || tcDefault || 0;
    return tc > 0 ? round2(baseAmount / tc) : 0;
  };
  const movToMXNFallback = (m: MovimientoFin, amountOverride?: number) => {
    const amount = Number.isFinite(amountOverride)
      ? (amountOverride as number)
      : (m.categoria === "iva" || m.categoria === "ivaImportacion") && Number.isFinite(m.ivaManual)
        ? (m.ivaManual as number)
        : (m.monto || 0);
    if (m.moneda === "MXN") return amount;
    const tc = m.tcPago || tcDefault || 0;
    return tc > 0 ? round2(amount * tc) : 0;
  };
  const calcTotalsUSDLocal = (list: MovimientoFin[]) =>
    round2(list.reduce((acc, m) => acc + movToUSDFallback(m), 0));
  const calcTotalsMXNLocal = (list: MovimientoFin[]) =>
    round2(list.reduce((acc, m) => acc + movToMXNFallback(m), 0));
  const ivaAmountOfMov = (m: MovimientoFin) => {
    if (Number.isFinite(m.ivaManual)) return m.ivaManual as number;
    if (!m.incluyeIva) return 0;
    const base = m.monto || 0;
    return round2((base * IVA_RATE) / (1 + IVA_RATE));
  };
  const movAmountWithIva = (m: MovimientoFin) => {
    if (m.categoria === "iva" || m.categoria === "ivaImportacion") {
      return Number.isFinite(m.ivaManual) ? (m.ivaManual as number) : (m.monto || 0);
    }
    const iva = m.incluyeIva ? ivaAmountOfMov(m) : 0;
    return round2((m.monto || 0) + iva);
  };
  const movToUSDWithIva = (m: MovimientoFin) => {
    const amount = movAmountWithIva(m);
    if (m.moneda === "USD") return amount;
    const tc = m.tcPago || tcDefault || 0;
    return tc > 0 ? round2(amount / tc) : 0;
  };

  const porPagar = calcTotal(movimientos.filter((m) => m.tipo === "cargo" && m.estado === "porPagar"));
  const totalCargos = calcTotal(movimientos.filter((m) => m.tipo === "cargo"));
  const totalAbonos = calcTotal(movimientos.filter((m) => m.tipo === "abono"));
  const utilidadFinal = { usd: round2(totalAbonos.usd - totalCargos.usd), mxn: round2(totalAbonos.mxn - totalCargos.mxn) };
  const saldoFx = calcMovTotalsFx(movimientos);

  const porPagarUSD = round2(
    movimientos.filter((m) => m.tipo === "cargo" && m.estado === "porPagar").reduce((acc, m) => acc + movToUSDWithIva(m), 0)
  );
  const porPagarMXN = round2(
    movimientos.filter((m) => m.tipo === "cargo" && m.estado === "porPagar").reduce((acc, m) => acc + movToMXNFallback(m, movAmountWithIva(m)), 0)
  );
  const cargosUtilUSD = calcTotalsUSDLocal(
    movimientos.filter(
      (m) => m.tipo === "cargo" && !(m.categoria === "productos" && m.estado === "pagado")
    )
  );
  const abonosUtilUSD = calcTotalsUSDLocal(movimientos.filter((m) => m.tipo === "abono"));
  const saldoUSD = round2(abonosUtilUSD - cargosUtilUSD);

  const ivaCargosUSD = round2(
    movimientos
      .filter((m) => m.tipo === "cargo" && m.categoria !== "ivaImportacion")
      .reduce((acc, m) => {
        const iva = ivaAmountOfMov(m);
        return acc + (m.moneda === "USD" ? iva : (m.tcPago || tcDefault || 0) > 0 ? round2(iva / (m.tcPago || tcDefault || 0)) : 0);
      }, 0)
  );
  const ivaAbonosUSD = round2(
    movimientos
      .filter((m) => m.tipo === "abono")
      .reduce((acc, m) => {
        const iva = ivaAmountOfMov(m);
        return acc + (m.moneda === "USD" ? iva : (m.tcPago || tcDefault || 0) > 0 ? round2(iva / (m.tcPago || tcDefault || 0)) : 0);
      }, 0)
  );
  const ivaSaldoUSD = round2(ivaAbonosUSD - ivaCargosUSD);

  const totalCotizacionConIvaUSD = round2((totalVentaUSD || 0) * (1 + IVA_RATE));
  const pagosClienteUSD = round2(
    movimientos
      .filter((m) => m.tipo === "abono" && m.categoria === "pagoCliente" && m.estado === "pagado")
      .reduce((acc, m) => acc + movToUSDWithIva(m), 0)
  );
  const pagosClientePendUSD = round2(
    movimientos
      .filter((m) => m.tipo === "abono" && m.categoria === "pagoCliente" && m.estado === "porPagar")
      .reduce((acc, m) => acc + movToUSDWithIva(m), 0)
  );
  const porCobrarClienteUSD = round2(Math.max(0, totalCotizacionConIvaUSD - pagosClienteUSD));
  const porCobrarClienteMXN = round2(tcDefault > 0 ? porCobrarClienteUSD * tcDefault : 0);

  const ivaAcreditableUSD = round2(
    movimientos
      .filter((m) => m.categoria === "ivaImportacion")
      .reduce((acc, m) => {
        const base = Number.isFinite(m.ivaManual) ? (m.ivaManual as number) : (m.monto || 0);
        return acc + (m.moneda === "USD" ? base : (m.tcPago || tcDefault || 0) > 0 ? round2(base / (m.tcPago || tcDefault || 0)) : 0);
      }, 0)
  );
  const ivaTrasladadoUSD = round2(
    movimientos
      .filter((m) => m.tipo === "abono" && m.incluyeIva)
      .reduce((acc, m) => {
        const iva = ivaAmountOfMov(m);
        return acc + (m.moneda === "USD" ? iva : (m.tcPago || tcDefault || 0) > 0 ? round2(iva / (m.tcPago || tcDefault || 0)) : 0);
      }, 0)
  );
  const ivaCuentaSaldoUSD = round2(ivaAcreditableUSD - ivaTrasladadoUSD);
  const ivaAcreditableMXN = round2(
    movimientos
      .filter((m) => m.categoria === "ivaImportacion")
      .reduce((acc, m) => {
        const base = Number.isFinite(m.ivaManual) ? (m.ivaManual as number) : (m.monto || 0);
        return acc + movToMXNFallback(m, base);
      }, 0)
  );
  const ivaTrasladadoMXN = round2(
    movimientos
      .filter((m) => m.tipo === "abono" && m.incluyeIva)
      .reduce((acc, m) => {
        const iva = ivaAmountOfMov(m);
        return acc + movToMXNFallback(m, iva);
      }, 0)
  );
  const ivaCuentaSaldoMXN = round2(ivaAcreditableMXN - ivaTrasladadoMXN);

  const proveedorPorPagar = calcTotal(movimientos.filter((m) => m.tipo === "cargo" && m.estado === "porPagar" && m.categoria === "proveedor"));
  const proveedorPagado = calcTotal(movimientos.filter((m) => m.tipo === "cargo" && m.estado === "pagado" && m.categoria === "proveedor"));
  const proveedorPagadoUSD = calcTotalsUSDLocal(movimientos.filter((m) => m.tipo === "cargo" && m.estado === "pagado" && m.categoria === "proveedor"));
  const costosList = [
    ["productos", "Productos"],
    ["fleteMaritimo", "Flete marítimo"],
    ["fleteTerrestre", "Flete terrestre"],
    ["seguro", "Seguro"],
    ["igi", "IGI"],
    ["dta", "DTA"],
    ["agenteAduanal", "Agente aduanal"],
    ["maniobras", "Maniobras"],
    ["honorarios", "Honorarios asesor"],
    ["instalacion", "Instalación"],
    ["comisionOmar", "Comisión Omar"],
    ["ivaImportacion", "IVA importación"],
  ] as Array<[keyof ProyectoState["costosControl"], string]>;
  const pagosPorCategoriaUSD = (categoria: MovimientoCategoria, estado?: MovimientoEstado) =>
    calcTotalsUSDLocal(
      movimientos.filter(
        (m) => m.tipo === "cargo" && m.categoria === categoria && (!estado || m.estado === estado)
      )
    );
  const proveedorMetaUSD = (s.costosControl?.productos ?? 0) as number;
  const proveedorPagadoProductosUSD = pagosPorCategoriaUSD("productos", "pagado");
  const proveedorRestanteProductosUSD = round2(proveedorMetaUSD - proveedorPagadoProductosUSD);
  const proveedorPorPagarUSD = round2(Math.max(0, proveedorMetaUSD - proveedorPagadoProductosUSD));
  const cargosPagadosUSD = round2(
    movimientos
      .filter((m) => m.tipo === "cargo" && m.estado === "pagado" && !(m.categoria === "productos"))
      .reduce((acc, m) => acc + movToUSDWithIva(m), 0)
  );
  const abonosPagadosUSD = round2(
    movimientos
      .filter((m) => m.tipo === "abono" && m.estado === "pagado")
      .reduce((acc, m) => acc + movToUSDWithIva(m), 0)
  );
  const saldoPagadoUSD = round2(abonosPagadosUSD - cargosPagadosUSD);
  const saldoPagadoMXN = round2(
    movimientos
      .filter((m) => m.tipo === "abono" && m.estado === "pagado")
      .reduce((acc, m) => acc + movToMXNFallback(m, movAmountWithIva(m)), 0) -
    movimientos
      .filter((m) => m.tipo === "cargo" && m.estado === "pagado" && !(m.categoria === "productos"))
      .reduce((acc, m) => acc + movToMXNFallback(m, movAmountWithIva(m)), 0)
  );
  const cargosTodosMXN = calcTotalsMXNLocal(
    movimientos.filter((m) => m.tipo === "cargo" && !(m.categoria === "productos" && m.estado === "pagado"))
  );
  const abonosTodosMXN = calcTotalsMXNLocal(movimientos.filter((m) => m.tipo === "abono"));
  const saldoPendienteMXN = round2(abonosTodosMXN - cargosTodosMXN);
  const saldoPendienteUSD = tcDefault > 0 ? round2(saldoPendienteMXN / tcDefault) : 0;
  const movimientosOrdenados = [...movimientos].sort((a, b) => {
    const da = a.fecha ? new Date(a.fecha).getTime() : Number.POSITIVE_INFINITY;
    const db = b.fecha ? new Date(b.fecha).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (a.estado !== b.estado) return a.estado === "pagado" ? -1 : 1;
    return 0;
  });
  const movimientosView = soloIva
    ? movimientosOrdenados.filter((m) => m.categoria === "iva" || m.categoria === "ivaImportacion")
    : movimientosOrdenados;
  const defaultsKey = JSON.stringify(costosDefaults || {});

  const flowMovs = movimientosOrdenados.filter((m) => m.fecha);
  const flowRows = (() => {
    const rows: Array<{
      date: string;
      inflow: number;
      outflow: number;
      balance: number;
    }> = [];
    let running = 0;
    flowMovs.forEach((m) => {
      if (m.tipo === "cargo" && m.categoria === "productos" && m.estado === "pagado") {
        return;
      }
      const mxn = movToMXNFallback(m, movAmountWithIva(m));
      const inflow = m.tipo === "abono" ? mxn : 0;
      const outflow = m.tipo === "cargo" ? mxn : 0;
      running = round2(running + inflow - outflow);
      rows.push({ date: m.fecha, inflow, outflow, balance: running });
    });
    return rows;
  })();
  const computeFlowTotals = () => {
    let inMXN = 0;
    let outMXN = 0;
    let inUSD = 0;
    let outUSD = 0;
    flowMovs.forEach((m) => {
      if (m.tipo === "cargo" && m.categoria === "productos" && m.estado === "pagado") return;
      const mxn = movToMXNFallback(m, movAmountWithIva(m));
      const usd = movToUSDFallback({ ...m, monto: movAmountWithIva(m) });
      if (m.tipo === "abono") {
        inMXN = round2(inMXN + mxn);
        inUSD = round2(inUSD + usd);
      } else {
        outMXN = round2(outMXN + mxn);
        outUSD = round2(outUSD + usd);
      }
    });
    return {
      inMXN,
      outMXN,
      saldoMXN: round2(inMXN - outMXN),
      inUSD,
      outUSD,
      saldoUSD: round2(inUSD - outUSD),
    };
  };
  const flowTotals = computeFlowTotals();
  const saldoPendienteFlujoMXN = flowTotals.saldoMXN;
  const pendientePorCobrarMXN = round2(
    tcDefault > 0 ? Math.max(0, porCobrarClienteUSD - porPagarUSD) * tcDefault : 0
  );

  useEffect(() => {
    const current = s.costosControl || ({} as ProyectoState["costosControl"]);
    const hasMissing = Object.keys(costosDefaults || {}).some((k) => (current as any)[k] === undefined);
    const allZero = Object.values(current || {}).every((v) => !v);
    if (hasMissing || allZero) {
      setS({ costosControl: { ...costosDefaults, ...current } });
    }
  }, [defaultsKey]);

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={h2}>Proyecto ganado</h2>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={soloIva}
              onChange={(e) => setSoloIva(e.target.checked)}
            />
            Ver solo IVA
          </label>
          <button style={btnSmall} onClick={addMovimiento}>+ Movimiento</button>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px", gap: 12, alignItems: "center" }}>
        <Field label="Estatus del proyecto">
          <select
            value={s.estatusProyecto}
            onChange={(e) => setS({ estatusProyecto: e.target.value as ProyectoStatus })}
            style={selectCss}
          >
            <option value="anticipoProveedor">Anticipo pagado a proveedor</option>
            <option value="liquidacionProveedor">Liquidación proveedor</option>
            <option value="transito">En tránsito</option>
            <option value="importacion">En importación</option>
            <option value="instalacion">En instalación</option>
            <option value="entregado">Entregado</option>
          </select>
        </Field>
        <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
          Registra cargos/abonos y estatus para alimentar el dashboard.
        </div>
        <Field label="TC default">
          <input
            type="number"
            inputMode="decimal"
            value={tcDefault ? String(tcDefault) : ""}
            onChange={(e) => {
              const parsed = parseNumericInput(e.target.value);
              setS({ tcCobro: Number.isFinite(parsed) ? parsed : 0 });
            }}
            placeholder="TC"
            style={{ ...inputCss, textAlign: "right" }}
          />
        </Field>
      </div>

      <div style={{ height: 12 }} />

      {!movimientos.length ? (
        <div style={{ color: tokens.textMuted, fontWeight: 600 }}>
          Aún no hay movimientos. Agrega el primero con “+ Movimiento”.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Estatus</Th>
                <Th>Categoría</Th>
                <Th>Descripción</Th>
                <Th>IVA</Th>
                <Th style={{ textAlign: "right" }}>Monto neto</Th>
                <Th style={{ textAlign: "right" }}>IVA</Th>
                <Th style={{ textAlign: "right" }}>Total</Th>
                <Th>Moneda</Th>
                <Th>TC</Th>
                <Th>Referencia</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {movimientosView.map((m) => (
                <tr key={m.id} style={m.estado === "pagado" ? { background: tokens.surfaceAlt } : undefined}>
                  <Td>
                    <input
                      type="date"
                      value={m.fecha}
                      onChange={(e) => updateMov(m.id, { fecha: e.target.value })}
                      style={{ ...inputCss, width: 140 }}
                    />
                  </Td>
                  <Td>
                    <select
                      value={m.tipo}
                      onChange={(e) => updateMov(m.id, { tipo: e.target.value as MovimientoTipo })}
                      style={{ ...selectCss, width: 110 }}
                    >
                      <option value="cargo">Cargo</option>
                      <option value="abono">Abono</option>
                    </select>
                  </Td>
                  <Td>
                    <select
                      value={m.estado}
                      onChange={(e) => updateMov(m.id, { estado: e.target.value as MovimientoEstado })}
                      style={{ ...selectCss, width: 120 }}
                    >
                      <option value="porPagar">Por pagar</option>
                      <option value="pagado">Pagado</option>
                    </select>
                  </Td>
                  <Td>
                    <select
                      value={m.categoria}
                      onChange={(e) => updateMov(m.id, { categoria: e.target.value as MovimientoCategoria })}
                      style={{ ...selectCss, width: 150 }}
                    >
                      <option value="productos">Productos</option>
                      <option value="fleteMaritimo">Flete marítimo</option>
                      <option value="fleteTerrestre">Flete terrestre</option>
                      <option value="seguro">Seguro</option>
                      <option value="igi">IGI</option>
                      <option value="dta">DTA</option>
                      <option value="agenteAduanal">Agente aduanal</option>
                      <option value="maniobras">Maniobras</option>
                      <option value="honorarios">Honorarios asesor</option>
                      <option value="comisionOmar">Comisión Omar</option>
                      <option value="pagoCliente">Pago cliente</option>
                      <option value="iva">IVA</option>
                      <option value="ivaImportacion">IVA importación</option>
                      <option value="importacion">Importación</option>
                      <option value="instalacion">Instalación</option>
                      <option value="proveedor">Proveedor</option>
                      <option value="retiroUtilidad">Retiro utilidad</option>
                      <option value="logistica">Logística</option>
                      <option value="impuestos">Impuestos</option>
                      <option value="otros">Otros</option>
                    </select>
                  </Td>
                  <Td>
                    <input
                      type="text"
                      value={m.descripcion}
                      onChange={(e) => updateMov(m.id, { descripcion: e.target.value })}
                      style={{ ...inputCss, width: "100%" }}
                      placeholder="Detalle del movimiento"
                    />
                  </Td>
                  <Td>
                    <input
                      type="checkbox"
                      checked={!!m.incluyeIva}
                      onChange={(e) => updateMov(m.id, { incluyeIva: e.target.checked })}
                    />
                  </Td>
                  <Td style={{ textAlign: "right" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        (montoDraft[m.id] ?? "") !== ""
                          ? (montoDraft[m.id] as string)
                          : (m.monto ? fmtUSDInput(m.monto) : "")
                      }
                      onChange={(e) => setMontoDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                      onBlur={() => {
                        const raw = montoDraft[m.id] ?? "";
                        const parsed = parseNumericInput(raw);
                        updateMov(m.id, { monto: Number.isFinite(parsed) ? parsed : 0 });
                        setMontoDraft((d) => {
                          const next = { ...d };
                          delete next[m.id];
                          return next;
                        });
                      }}
                      placeholder="Neto"
                      style={{ ...inputCss, width: 120, textAlign: "right" }}
                    />
                  </Td>
                  <Td style={{ textAlign: "right", fontWeight: 700 }}>
                    {m.categoria === "iva" || m.categoria === "ivaImportacion" ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={Number.isFinite(m.ivaManual) ? fmtUSDInput(m.ivaManual as number) : ""}
                        onChange={(e) => {
                          const parsed = parseNumericInput(e.target.value);
                          updateMov(m.id, { ivaManual: Number.isFinite(parsed) ? parsed : 0 });
                        }}
                        placeholder="IVA"
                        style={{ ...inputCss, width: 110, textAlign: "right" }}
                      />
                    ) : (
                      m.incluyeIva ? fmtUSD(round2(((m.monto || 0) * IVA_RATE) / (1 + IVA_RATE)), false) : "—"
                    )}
                  </Td>
                  <Td style={{ textAlign: "right", fontWeight: 800 }}>
                    {fmtUSD(m.monto || 0, false)}
                  </Td>
                  <Td>
                    <select
                      value={m.moneda}
                      onChange={(e) => updateMov(m.id, { moneda: e.target.value as MovimientoMoneda })}
                      style={{ ...selectCss, width: 90 }}
                    >
                      <option value="USD">USD</option>
                      <option value="MXN">MXN</option>
                    </select>
                  </Td>
                  <Td>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={m.tcPago ? String(m.tcPago) : ""}
                      onChange={(e) => {
                        const parsed = parseNumericInput(e.target.value);
                        updateMov(m.id, { tcPago: Number.isFinite(parsed) ? parsed : 0 });
                      }}
                      placeholder={tcDefault ? String(tcDefault) : "TC"}
                      style={{ ...inputCss, width: 90, textAlign: "right" }}
                    />
                  </Td>
                  <Td>
                    <input
                      type="text"
                      value={m.referencia}
                      onChange={(e) => updateMov(m.id, { referencia: e.target.value })}
                      style={{ ...inputCss, width: 140 }}
                      placeholder="Folio / Ref"
                    />
                  </Td>
                  <Td style={{ textAlign: "right" }}>
                    <button style={btnSmall} onClick={() => removeMov(m.id)}>Eliminar</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {flowRows.length ? (
        <div style={{ marginTop: 12, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Flujo de efectivo (MXN)</div>
          <div style={{ maxHeight: 220, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th style={{ textAlign: "right" }}>Entrada</Th>
                  <Th style={{ textAlign: "right" }}>Salida</Th>
                  <Th style={{ textAlign: "right" }}>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {flowRows.map((r, idx) => (
                  <tr key={`${r.date}-${idx}`}>
                    <Td>{r.date}</Td>
                    <Td style={{ textAlign: "right", fontWeight: 700 }}>{r.inflow ? fmtMXN(r.inflow, false) : "—"}</Td>
                    <Td style={{ textAlign: "right", fontWeight: 700 }}>{r.outflow ? fmtMXN(r.outflow, false) : "—"}</Td>
                    <Td style={{ textAlign: "right", fontWeight: 800 }}>{fmtMXN(r.balance, false)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div style={{ height: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <StatCard
          title="Por pagar"
          value={`${fmtUSD(porPagarUSD)} `}
          sub="Cargos pendientes"
        />
        <StatCard
          title="Por cobrar cliente"
          value={`${fmtUSD(porCobrarClienteUSD)} `}
          sub={`Pagado: ${fmtUSD(pagosClienteUSD)} · Por pagar: ${fmtUSD(pagosClientePendUSD)} · Total con IVA: ${fmtUSD(totalCotizacionConIvaUSD)}`}
        />
        <StatCard
          title="Utilidad final"
          value={`${fmtMXN(saldoPendienteFlujoMXN)} `}
          sub={`Pendiente (por cobrar - por pagar): ${fmtMXN(pendientePorCobrarMXN)}\nReal (recibido - pagado): ${fmtMXN(saldoPagadoMXN)}`}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
        <StatCard
          title="Proveedor por pagar"
          value={`${fmtUSD(proveedorPorPagarUSD)} `}
          sub="Cargos proveedor pendientes"
        />
        <StatCard
          title="Saldo IVA"
          value={`${fmtUSD(ivaSaldoUSD)} `}
          sub="IVA abonos - IVA cargos"
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
        Pagos a proveedor (Productos): Meta {fmtUSD(proveedorMetaUSD)} · Pagado {fmtUSD(proveedorPagadoProductosUSD)} · Restante {fmtUSD(proveedorRestanteProductosUSD)}
      </div>

      <div style={{ height: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Cuenta T · Proyecto (Flujo con IVA)</div>
          <div style={{ height: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Cargos</div>
              <div>{fmtMXN(flowTotals.outMXN)}</div>
              <div style={{ color: tokens.textMuted }}>{fmtUSD(flowTotals.outUSD)}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Abonos</div>
              <div>{fmtMXN(flowTotals.inMXN)}</div>
              <div style={{ color: tokens.textMuted }}>{fmtUSD(flowTotals.inUSD)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: tokens.textMuted }}>
            Saldo: {fmtMXN(flowTotals.saldoMXN)} · {fmtUSD(flowTotals.saldoUSD)}
          </div>
        </div>

        <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Cuenta T · IVA (USD/MXN)</div>
          <div style={{ height: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Cargos (IVA trasladado)</div>
              <div>{fmtUSD(ivaTrasladadoUSD)}</div>
              <div style={{ color: tokens.textMuted }}>{fmtMXN(ivaTrasladadoMXN)}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Abonos (IVA acreditable)</div>
              <div>{fmtUSD(ivaAcreditableUSD)}</div>
              <div style={{ color: tokens.textMuted }}>{fmtMXN(ivaAcreditableMXN)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: tokens.textMuted }}>
            Saldo IVA: {fmtUSD(ivaCuentaSaldoUSD)} · {fmtMXN(ivaCuentaSaldoMXN)}
          </div>
        </div>

        <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Cuenta T · Por pagar / por cobrar (USD)</div>
          <div style={{ height: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Por pagar</div>
              <div>{fmtUSD(porPagarUSD)}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Por cobrar</div>
              <div>{fmtUSD(porCobrarClienteUSD)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: tokens.textMuted }}>
            Total con IVA: {fmtUSD(totalCotizacionConIvaUSD)}
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />
      <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 800 }}>Desglose de costos (USD) editable</div>
          <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
            Para control contra pagos
          </div>
        </div>
        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {costosList.map(([key, label]) => {
            const planeado = (s.costosControl?.[key] ?? 0) as number;
            const pagado = pagosPorCategoriaUSD(key, "pagado");
            const porPagar = pagosPorCategoriaUSD(key, "porPagar");
            const restante = round2(planeado - pagado);
            return (
            <Field key={key} label={label}>
              <input
                type="text"
                inputMode="decimal"
                value={fmtUSDInput(planeado)}
                onChange={(e) => {
                  const parsed = parseNumericInput(e.target.value);
                  setS({ costosControl: { ...s.costosControl, [key]: Number.isFinite(parsed) ? parsed : 0 } });
                }}
                style={{ ...inputCss, textAlign: "right" }}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: tokens.textMuted, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Pagado: {fmtUSD(pagado)}</span>
                <span>Por pagar: {fmtUSD(porPagar)}</span>
                <span>Saldo: {fmtUSD(restante)}</span>
              </div>
            </Field>
          )})}
        </div>
      </div>
    </section>
  );
}

function ResultadosCostos({
  totalModulos,
  valorProductosUSD,
  fleteMaritimoUSD,
  fleteTerrestreUSD,
  seguroUSD,
  igiUSD,
  dtaUSD,
  porcDTA,
  agenteAduanalUSD,
  maniobrasPuertoUSD,
  costoBaseUSD,
  pagoAsesorTotalUSD,
  ivaAcreditableBaseMXN,
  ivaAcreditableTotalMXN,
  ivaFacturaAsesorMXN,
  tipoCambio,
  desgloseOpen,
}: {
  totalModulos: number;
  valorProductosUSD: number;
  fleteMaritimoUSD: number;
  fleteTerrestreUSD: number;
  seguroUSD: number;
  igiUSD: number;
  dtaUSD: number;
  porcDTA: number;
  agenteAduanalUSD: number;
  maniobrasPuertoUSD: number;
  costoBaseUSD: number;
  pagoAsesorTotalUSD: number;
  ivaAcreditableBaseMXN: number;
  ivaAcreditableTotalMXN: number;
  ivaFacturaAsesorMXN: number;
  tipoCambio: number;
  desgloseOpen?: boolean;
  // props legacy que pueden venir pero aquí no usamos
  lineas?: Linea[];
  porcValorFactura?: number;
  porcSeguro?: number;
  porcIGI?: number;
  ingresoEstrategiaMXN?: number;
}) {
  const costoUnit = totalModulos > 0 ? round2(costoBaseUSD / totalModulos) : 0;
  const costosImportacionUSD = round2(costoBaseUSD - valorProductosUSD);
  const ivaImportacionMXN = ivaAcreditableBaseMXN;
  return (
    <section style={card}>
      <h2 style={h2}>Resultados</h2>

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <StatCard title="Valor productos (USD)" value={fmtUSD(valorProductosUSD)} />
        <StatCard
          title="Costo total estimado (USD)"
          value={fmtUSD(costoBaseUSD)}
          sub={totalModulos > 0 ? `USD/u: ${fmtUSD(costoUnit, false)}` : undefined}
        />
        <StatCard
          title="Tipo de cambio"
          value={tipoCambio ? tipoCambio.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
          sub="Usado para IVA acreditable (MXN)"
        />
      </div>

      <div style={{ height: 14 }} />

      {/* Desglose (como antes: listado claro) */}
      <details open={!!desgloseOpen} style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12, background: tokens.surface }}>
        <summary style={{ cursor: "pointer", fontWeight: 800, color: tokens.text, listStyle: "none" as any }}>
          Desglose de costos (USD)
          <span style={{ marginLeft: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
            (productos + logística + impuestos + servicios)
          </span>
        </summary>

        <div style={{ height: 10 }} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th style={{ textAlign: "right" }}>Monto (USD)</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Productos</Td>
                <Td style={{ textAlign: "right", fontWeight: 800 }}>{fmtUSD(valorProductosUSD, false)}</Td>
              </tr>
              <tr>
                <Td>Flete marítimo</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(fleteMaritimoUSD, false)}</Td>
              </tr>
              <tr>
                <Td>Flete terrestre</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(fleteTerrestreUSD, false)}</Td>
              </tr>
              <tr>
                <Td>Seguro</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(seguroUSD, false)}</Td>
              </tr>
              <tr>
                <Td>IGI</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(igiUSD, false)}</Td>
              </tr>
              <tr>
                <Td>DTA ({(porcDTA ?? 0).toFixed(2)}%)</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(dtaUSD, false)}</Td>
              </tr>
              <tr>
                <Td>Agente aduanal</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(agenteAduanalUSD, false)}</Td>
              </tr>
              <tr>
                <Td>Maniobras puerto</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(maniobrasPuertoUSD, false)}</Td>
              </tr>
              <tr>
                <Td>Honorarios asesor</Td>
                <Td style={{ textAlign: "right" }}>{fmtUSD(pagoAsesorTotalUSD, false)}</Td>
              </tr>

              <tr>
                <Td style={{ paddingTop: 12, borderTop: `2px solid ${tokens.border}`, fontWeight: 900 }}>
                  Total costo estimado
                </Td>
                <Td
                  style={{
                    paddingTop: 12,
                    borderTop: `2px solid ${tokens.border}`,
                    textAlign: "right",
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {fmtUSD(costoBaseUSD, false)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
          Nota: el total ya incluye productos + fletes + seguro + IGI + DTA + agente/maniobras + honorarios asesor.
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div style={{ fontSize: 13, color: tokens.text, fontWeight: 800 }}>
            IVA a pagar en importación (MXN):{" "}
            <span style={{ fontWeight: 900 }}>{fmtMXN(ivaImportacionMXN, false)}</span>
          </div>
          <div style={{ fontSize: 13, color: tokens.text, fontWeight: 800, textAlign: "right" }}>
            Costos de importación (USD, sin productos):{" "}
            <span style={{ fontWeight: 900 }}>{fmtUSD(costosImportacionUSD, false)}</span>
          </div>
        </div>
      </details>

      <div style={{ height: 12 }} />

      <details open={!!desgloseOpen} style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12, background: tokens.surface }}>
        <summary style={{ cursor: "pointer", fontWeight: 800, color: tokens.text, listStyle: "none" as any }}>
          IVA acreditable (MXN)
          <span style={{ marginLeft: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
            (para referencia)
          </span>
        </summary>

        <div style={{ height: 10 }} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th style={{ textAlign: "right" }}>Monto (MXN)</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>IVA acreditable base</Td>
                <Td style={{ textAlign: "right", fontWeight: 800 }}>{fmtMXN(ivaAcreditableBaseMXN, false)}</Td>
              </tr>
              <tr>
                <Td>IVA factura asesor</Td>
                <Td style={{ textAlign: "right" }}>{fmtMXN(ivaFacturaAsesorMXN, false)}</Td>
              </tr>
              <tr>
                <Td style={{ paddingTop: 12, borderTop: `2px solid ${tokens.border}`, fontWeight: 900 }}>
                  IVA acreditable total
                </Td>
                <Td
                  style={{
                    paddingTop: 12,
                    borderTop: `2px solid ${tokens.border}`,
                    textAlign: "right",
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {fmtMXN(ivaAcreditableTotalMXN, false)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default function ContainMX() {
  type ChatMsg = {
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: string;
  };

  // ==================== Persistencia de proyectos ====================
  const API_STATE_URL = "/api/cotizador-v2/state";
  const CHAT_API_URL = "/cotizador-v2/api/chat";
  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("proyecto");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null);
  // Evita que el auto-save escriba "[]" en el primer render antes de hidratar desde localStorage
  const [hydrated, setHydrated] = useState(false);
  const [desgloseOpen, setDesgloseOpen] = useState(false);
  const [ccQuery, setCcQuery] = useState("");

  const importInputRef = React.useRef<HTMLInputElement>(null);
  // Guarda el precio unitario base (calculado) de la última renderización para poder detectar overrides “auto”.
  const lastBasePriceRef = React.useRef<Record<string, number>>({});
  // Draft de inputs de precio editable (permite borrar y teclear sin que “rebote” al valor calculado)
  const [precioOverrideDraft, setPrecioOverrideDraft] = useState<Record<string, string>>({});
  // Draft de inputs de costo editable (permite borrar y teclear sin que “rebote” al valor calculado)
  const [costoOverrideDraft, setCostoOverrideDraft] = useState<Record<string, string>>({});
  const [precioManual, setPrecioManual] = useState(false);
  const [showGanadosList, setShowGanadosList] = useState(false);
  const [chatDockOpen, setChatDockOpen] = useState(true);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatCopyMsg, setChatCopyMsg] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatUseWeb, setChatUseWeb] = useState(true);
  const [chatMessagesMap, setChatMessagesMap] = useState<Record<string, ChatMsg[]>>({});
  const [chatDockSide, setChatDockSide] = useState<"left" | "right">("right");
  const [chatDockWidth, setChatDockWidth] = useState(380);
  const [chatDockHeight, setChatDockHeight] = useState(340);
  const [chatContextMode, setChatContextMode] = useState<"resumen" | "completo">("resumen");
  const chatDockRef = React.useRef<HTMLDivElement>(null);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const remoteSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRemoteSaveRef = React.useRef<{ projects: Proyecto[]; currentId: string | null } | null>(null);

  async function fetchRemoteState(): Promise<{ projects: Proyecto[]; currentId: string | null } | null> {
    try {
      const res = await fetch(API_STATE_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.projects)) return null;
      const normalized = normalizeProjects(data.projects);
      return { projects: normalized, currentId: data.currentId ?? normalized[0]?.id ?? null };
    } catch {
      return null;
    }
  }

  function scheduleRemoteSave(next: Proyecto[], nextCurrentId: string | null, opts?: { force?: boolean }) {
    if (!hydrated && !opts?.force) return;
    pendingRemoteSaveRef.current = { projects: next, currentId: nextCurrentId };
    if (remoteSaveTimerRef.current) clearTimeout(remoteSaveTimerRef.current);
    remoteSaveTimerRef.current = setTimeout(async () => {
      const payload = pendingRemoteSaveRef.current;
      if (!payload) return;
      try {
        await fetch(API_STATE_URL, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {}
    }, 800);
  }

  // Guarda inmediatamente en localStorage cada cambio (además del auto-guardado por useEffect)
  function commitProjects(
    next: Proyecto[],
    opts?: { snapshot?: boolean; currentId?: string | null; allowShrink?: boolean; skipRemote?: boolean }
  ) {
    try {
      persistProjects(next, { allowShrink: opts?.allowShrink });
      if (opts?.snapshot) pushSnapshot(next);
      setProjects(next);
      const nextId = typeof opts?.currentId !== "undefined" ? opts.currentId : currentId;
      if (typeof opts?.currentId !== "undefined") {
        setCurrentId(nextId);
        try {
          if (nextId) localStorage.setItem(STORAGE_CURRENT_ID_KEY, nextId);
        } catch {}
      }
      setSavedAt(new Date());
      if (!opts?.skipRemote) scheduleRemoteSave(next, nextId ?? null);
    } catch {}
  }

  function manualSave() {
    persistProjects(projects);
    pushSnapshot(projects);
    setSavedAt(new Date());
    scheduleRemoteSave(projects, currentId ?? null);
  }

  function exportProjects() {
    downloadJson(`containmx-projects-${new Date().toISOString().slice(0,10)}.json`, { projects: normalizeProjects(projects as any) });
  }

  function triggerImport() {
    importInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      const data = JSON.parse(text);

      // 1) Formatos "normales": array de proyectos o {projects:[...]}
      let rawProjects: any[] = [];
      if (Array.isArray(data)) {
        rawProjects = data;
      } else if (data && typeof data === "object" && Array.isArray((data as any).projects)) {
        rawProjects = (data as any).projects;
      }

      // 2) Formato de rescate: export de keys legacy (incluye __allKeysDump y/o entries local::key)
      if (!rawProjects.length && data && typeof data === "object") {
        const candidates: Array<{ count: number; projects: any[]; label: string }> = [];

        const pushFrom = (val: any, label: string) => {
          const extracted = extractProjectsFromUnknown(val);
          if (extracted.length) candidates.push({ count: extracted.length, projects: extracted, label });
        };

        // a) dump completo
        const dump = (data as any).__allKeysDump;
        if (dump && typeof dump === "object") {
          for (const [k, v] of Object.entries(dump)) {
            pushFrom(v, `__allKeysDump:${k}`);
          }
        }

        // b) entries top-level (excluye metadatos)
        for (const [k, v] of Object.entries(data as any)) {
          if (k.startsWith("__")) continue;
          pushFrom(v, k);
        }

        candidates.sort((a, b) => b.count - a.count);
        rawProjects = candidates[0]?.projects ?? [];

        if (candidates[0]?.count) {
          setRecoveryMsg(`📦 Archivo legacy detectado. Mejor candidato: ${candidates[0].count} proyecto(s) desde ${candidates[0].label}.`);
        }
      }

      if (!Array.isArray(rawProjects) || !rawProjects.length) {
        setRecoveryMsg("⚠️ El archivo no contiene proyectos (ni en formato V2 ni en formato legacy)." );
        e.target.value = "";
        return;
      }

      // Normaliza por si viene de legacy
      const normalized = normalizeProjects(rawProjects);
      commitProjects(normalized, { snapshot: true, currentId: normalized[0]?.id ?? null, allowShrink: true });
      setRecoveryMsg(`✅ Importados ${normalized.length} proyecto(s) desde archivo.`);

      // limpia el input para permitir reimportar el mismo archivo
      e.target.value = "";
    } catch {
      setRecoveryMsg("⚠️ No se pudo importar el archivo (JSON inválido o formato desconocido)." );
      try { e.target.value = ""; } catch {}
    }
  }

  function restoreLastSnapshot() {
    const snaps = listSnapshots();
    if (!snaps.length) return;
    const last = snaps[0];
    commitProjects(last.projects, { snapshot: false, currentId: last.projects[0]?.id ?? null, allowShrink: true });
  }


  // cargar del API (DB) y fallback a localStorage si no hay data
  useEffect(() => {
    let alive = true;
    (async () => {
      const remote = await fetchRemoteState();
      if (!alive) return;
      if (remote?.projects?.length) {
        commitProjects(remote.projects, {
          snapshot: false,
          currentId: remote.currentId ?? remote.projects[0]?.id ?? null,
          allowShrink: true,
          skipRemote: true,
        });
        setRecoveryMsg(null);
        setHydrated(true);
        return;
      }

      const parsed = loadProjects();
      if (parsed.length) {
        setProjects(parsed);
        try {
          const savedId = localStorage.getItem(STORAGE_CURRENT_ID_KEY);
          const exists = savedId && parsed.some((p) => p.id === savedId);
          setCurrentId(exists ? (savedId as string) : parsed[0].id);
        } catch {
          setCurrentId(parsed[0].id);
        }
        setRecoveryMsg(null);
        setHydrated(true);
        // Si aún no hay data en DB, migra lo local
        scheduleRemoteSave(parsed, parsed[0]?.id ?? null, { force: true });
        return;
      }

      // Rescate: si el storage principal quedó vacío, intenta recuperar buscando en TODAS las keys.
      const recovered = recoverProjectsFromAnyKey();
      if (recovered?.projects?.length) {
        commitProjects(recovered.projects, {
          snapshot: true,
          currentId: recovered.projects[0]?.id ?? null,
          allowShrink: true,
          skipRemote: false,
        });
        setRecoveryMsg(`🛟 Rescate automático: ${recovered.count} proyecto(s) recuperado(s) desde ${recovered.label}.`);
        setHydrated(true);
        return;
      }

      setRecoveryMsg(null);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // guardar al localStorage on change
  useEffect(() => {
    if (!hydrated) return; // evita sobre-escribir con [] antes de cargar
    persistProjects(projects);
  }, [projects, hydrated]);

  // Guardado UX: mostrar cuándo se guardó por última vez
  useEffect(() => {
    if (projects.length) setSavedAt(new Date());
  }, [projects]);

  useEffect(() => {
    try {
      if (currentId) localStorage.setItem(STORAGE_CURRENT_ID_KEY, currentId);
    } catch {}
  }, [currentId]);

  // Snapshots: cada 10 min + al ocultar/cerrar
  useEffect(() => {
    if (!projects.length) return;
    const id = setInterval(() => {
      pushSnapshot(projects);
    }, 10 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        persistProjects(projects);
        pushSnapshot(projects);
      }
    };
    const onUnload = () => {
      persistProjects(projects);
      pushSnapshot(projects);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [projects]);

  const current = useMemo(() => projects.find(p => p.id === currentId) || null, [projects, currentId]);
  const currentSafeId = current?.id ?? null;

  function newProject() {
    const now = new Date().toISOString();
    const id = cryptoRandom();
    const nuevo: Proyecto = {
      id,
      meta: { nombre: "Nuevo proyecto", contacto: "", ubicacion: "", razonSocial: "", createdAt: now },
      state: {
        ganado: false,
        tipoCambio: 0,
        modulosPorContenedor: 14,
        costoMaritimoUSD: 2500,
        costoFullMXN: 65000,
        costoSencilloMXN: Math.round(65000 / 2),
        optimizarMezcla: true,
        verDebugEmpaquetado: false,
        agenteAduanalUSD: 750,
        maniobrasPuertoUSD: 1200,
        sencilloDirty: false,
        porcOtraEmpresa: 40,
        porcFila: 60,
        porcValorFactura: 60,
        porcSeguro: 0.5,
        porcIGI: 15,
        porcDTA: 0.8,
        asesorPct: 8,
        comisionOmarPct: 0,
        confirmFletes: false,
        contenedoresConfirmados: 0,
        usarContenedores20: false,
        contenedores20: 0,
        costoMaritimo20USD: 0,
        costoTerrestre20MXN: 0,
        pagosCount: 3,
        pagos: buildDefaultPagos(3),
        pagosNotas: "",
        cotCondiciones: DEFAULT_COT_CONDICIONES,
        cotDescripcionTecnica: DEFAULT_COT_DESC_TEC,
        cotCaracteristicasS1S8: DEFAULT_COT_CAR_S1S8,
        cotCaracteristicasS9: DEFAULT_COT_CAR_S9,
        estatusProyecto: "anticipoProveedor",
        movimientos: [],
        tcImport: 0,
        tcCobro: 0,
        marginPct: 0,
        descuentoPct: 0,
        precioOverrides: {},
        costoOverrides: {},
        lineas: [],
        costosControl: {
          productos: 0,
          fleteMaritimo: 0,
          fleteTerrestre: 0,
          seguro: 0,
          igi: 0,
          dta: 0,
          agenteAduanal: 0,
          maniobras: 0,
          honorarios: 0,
          instalacion: 0,
          comisionOmar: 0,
          ivaImportacion: 0,
        },
      },
    };
    const next = [nuevo, ...projects];
    commitProjects(next, { snapshot: true, currentId: id });
    setStep("proyecto");
  }

  function duplicateProject() {
    if (!current) return;
    const clone: Proyecto = {
      id: cryptoRandom(),
      meta: { ...current.meta, nombre: current.meta.nombre + " (copia)", createdAt: new Date().toISOString() },
      state: {
        ...JSON.parse(JSON.stringify(current.state)),
        descuentoPct: 0,
      },
    };
    const next = [clone, ...projects];
    commitProjects(next, { snapshot: true, currentId: clone.id });
  }

  function deleteProject() {
    if (!current) return;
    const left = projects.filter(p => p.id !== current.id);
    const nextId = left[0]?.id ?? null;
    commitProjects(left, { snapshot: true, currentId: nextId, allowShrink: true });
  }

  function updateMeta(patch: Partial<ProyectoMeta>) {
    if (!current) return;
    const next = projects.map(p => p.id === current.id ? { ...p, meta: { ...p.meta, ...patch } } : p);
    commitProjects(next);
  }

  function updateState(patch: Partial<ProyectoState>) {
    if (!current) return;

    // When margin/discount changes, drop overrides that were auto-copied from previous base.
    const touchesPricing = ("marginPct" in patch) || ("descuentoPct" in patch);

    const next = projects.map((p) => {
      if (p.id !== current.id) return p;

      const prevState = p.state;
      let nextState: ProyectoState = { ...prevState, ...patch } as ProyectoState;

      if (touchesPricing) {
        // If an override equals the previous base, it's considered "auto" and should be removed
        // so that new margin/discount is reflected.
        const prevBase = lastBasePriceRef.current || {};

        const prevPriceOv =
          prevState.precioOverrides && typeof prevState.precioOverrides === "object"
            ? (prevState.precioOverrides as Record<string, number>)
            : {};

        const prevCostOv =
          prevState.costoOverrides && typeof prevState.costoOverrides === "object"
            ? (prevState.costoOverrides as Record<string, number>)
            : {};

        if (Object.keys(prevPriceOv).length) {
          const cleaned: Record<string, number> = { ...prevPriceOv };
          for (const [k, v] of Object.entries(prevPriceOv)) {
            const oldBase = prevBase[String(k)];
            if (typeof oldBase === "number" && Number.isFinite(oldBase)) {
              if (round2(Number(v)) === round2(oldBase)) {
                delete cleaned[String(k)];
              }
            }
          }
          nextState = { ...nextState, precioOverrides: cleaned };
        }

        // If any cost override was equal to the previous calculated cost (rare, but for symmetry), drop it.
        if (Object.keys(prevCostOv).length) {
          const cleanedC: Record<string, number> = { ...prevCostOv };
          // We don't have a prev cost base map; keep cost overrides unless NaN/<=0.
          for (const [k, v] of Object.entries(prevCostOv)) {
            if (!(typeof v === "number" && Number.isFinite(v) && v >= 0)) {
              delete cleanedC[String(k)];
            }
          }
          nextState = { ...nextState, costoOverrides: cleanedC };
        }
      }

      return { ...p, state: nextState };
    });

    commitProjects(next);
  }

  // ===== Shortcuts a state del proyecto actual =====
  const s = current?.state;
  const setS = (patch: Partial<ProyectoState>) => updateState(patch);
  const setLineas = (ls: Linea[]) => setS({ lineas: ls });
  const proyectosGanados = (projects || []).filter((p) => !!p?.state?.ganado);
  const movimientosGanados = proyectosGanados.flatMap((p) => {
    const tcFallback = p.state?.tcCobro || p.state?.tipoCambio || 0;
    const projectName = p.meta?.nombre || "Proyecto";
    const contacto = p.meta?.contacto || "—";
    const ubicacion = p.meta?.ubicacion || "—";
    const estatus = p.state?.estatusProyecto;
    return (p.state?.movimientos || []).map((m) => ({
      ...m,
      tcPago: m.tcPago || tcFallback,
      _projectId: p.id,
      _projectName: projectName,
      _contacto: contacto,
      _ubicacion: ubicacion,
      _estatus: estatus,
    }));
  });
  const movAmountWithIva = (m: MovimientoFin): number => {
    if (m.categoria === "iva" || m.categoria === "ivaImportacion") {
      return Number.isFinite(m.ivaManual) ? (m.ivaManual as number) : (m.monto || 0);
    }
    const base = m.monto || 0;
    const iva = m.incluyeIva ? round2((base * IVA_RATE) / (1 + IVA_RATE)) : 0;
    return round2(base + iva);
  };
  const movToMXNFlow = (m: MovimientoFin) => {
    const amount = movAmountWithIva(m);
    if (m.moneda === "MXN") return amount;
    const tc = m.tcPago || 0;
    return tc > 0 ? round2(amount * tc) : 0;
  };
  const movToUSDFlow = (m: MovimientoFin) => {
    const amount = movAmountWithIva(m);
    if (m.moneda === "USD") return amount;
    const tc = m.tcPago || 0;
    return tc > 0 ? round2(amount / tc) : 0;
  };
  const ccMovs = movimientosGanados.filter((m) => m.fecha);
  const ccPorPagar = (() => {
    const movs = movimientosGanados.filter((m) => m.tipo === "cargo" && m.estado === "porPagar");
    return {
      usd: round2(movs.reduce((acc, m) => acc + movToUSDFlow(m), 0)),
      mxn: round2(movs.reduce((acc, m) => acc + movToMXNFlow(m), 0)),
    };
  })();
  const ccPorRecibir = (() => {
    const movs = movimientosGanados.filter((m) => m.tipo === "abono" && m.estado === "porPagar");
    return {
      usd: round2(movs.reduce((acc, m) => acc + movToUSDFlow(m), 0)),
      mxn: round2(movs.reduce((acc, m) => acc + movToMXNFlow(m), 0)),
    };
  })();
  const ccFlowTotals = (() => {
    let inMXN = 0;
    let outMXN = 0;
    let inUSD = 0;
    let outUSD = 0;
    ccMovs.forEach((m) => {
      if (m.tipo === "cargo" && m.categoria === "productos" && m.estado === "pagado") return;
      const mxn = movToMXNFlow(m);
      const usd = movToUSDFlow(m);
      if (m.tipo === "abono") {
        inMXN = round2(inMXN + mxn);
        inUSD = round2(inUSD + usd);
      } else {
        outMXN = round2(outMXN + mxn);
        outUSD = round2(outUSD + usd);
      }
    });
    return {
      inMXN,
      outMXN,
      saldoMXN: round2(inMXN - outMXN),
      inUSD,
      outUSD,
      saldoUSD: round2(inUSD - outUSD),
    };
  })();
  const ccUtilidad = { usd: ccFlowTotals.saldoUSD, mxn: ccFlowTotals.saldoMXN };
  const ccRealTotals = (() => {
    let inMXN = 0;
    let outMXN = 0;
    let inUSD = 0;
    let outUSD = 0;
    ccMovs
      .filter((m) => m.estado === "pagado")
      .forEach((m) => {
        if (m.tipo === "cargo" && m.categoria === "productos" && m.estado === "pagado") return;
        const mxn = movToMXNFlow(m);
        const usd = movToUSDFlow(m);
        if (m.tipo === "abono") {
          inMXN = round2(inMXN + mxn);
          inUSD = round2(inUSD + usd);
        } else {
          outMXN = round2(outMXN + mxn);
          outUSD = round2(outUSD + usd);
        }
      });
    return {
      inMXN,
      outMXN,
      saldoMXN: round2(inMXN - outMXN),
      inUSD,
      outUSD,
      saldoUSD: round2(inUSD - outUSD),
    };
  })();
  const ccRealMXN = ccRealTotals.saldoMXN;
  const ccAlertas = (() => {
    const today = new Date();
    const msDay = 1000 * 60 * 60 * 24;
    const upcoming = movimientosGanados
      .filter((m) => m.estado === "porPagar" && m.fecha)
      .map((m) => {
        const d = new Date(`${m.fecha}T00:00:00`);
        const diff = Math.ceil((d.getTime() - today.getTime()) / msDay);
        return { m, date: d, diffDays: diff };
      })
      .filter((x) => Number.isFinite(x.diffDays) && x.diffDays >= 0 && x.diffDays <= 30)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const sumByRange = (max: number) =>
      round2(
        upcoming
          .filter((u) => u.diffDays <= max)
          .reduce((acc, u) => acc + movToMXNFlow(u.m), 0)
      );
    return {
      upcoming,
      sum7: sumByRange(7),
      sum15: sumByRange(15),
      sum30: sumByRange(30),
    };
  })();
  const ccEstatusCounts = proyectosGanados.reduce((acc, p) => {
    const k = p.state?.estatusProyecto || "sinEstatus";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const toggleGanado = (checked: boolean) => {
    if (!current) return;
    setS({ ganado: checked });
    if (checked) {
      setStep("proyectoGanado");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setStep("centroControl"), 400);
    }
  };

  // ==================== Cálculos/Hooks deben correr SIEMPRE (evita error de hooks) ====================
  // Usa un state seguro para cálculos cuando aún no hay proyecto seleccionado.
  const sSafe: ProyectoState = (s as any) ?? defaultProyectoState();

  // Contenedores y fletes (deben declararse antes de usarse en hooks)
  const contenedoresAuto = useMemo(() => {
    const lineas = sSafe?.lineas ?? [];
    const fallback = sSafe?.modulosPorContenedor || 14;
    const optim = sSafe?.optimizarMezcla ?? true;

    // Si NO optimizamos mezcla, usamos una capacidad base fija (legacy)
    if (!optim) {
      const total = lineas.reduce((acc, l) => acc + (l.cantidad || 0), 0);
      return total > 0 ? Math.ceil(total / fallback) : 0;
    }

    // Optimizado: usa capacidades por modelo/tipo/medida
    return containersFromCapacity(lineas, fallback);
  }, [sSafe?.lineas, sSafe?.modulosPorContenedor, sSafe?.optimizarMezcla]);

  const contenedores40 = sSafe?.confirmFletes
    ? Math.max(0, Math.floor(sSafe?.contenedoresConfirmados || 0))
    : contenedoresAuto;
  const contenedores20 = sSafe?.usarContenedores20 ? Math.max(0, Math.floor(sSafe?.contenedores20 || 0)) : 0;
  const contenedores = contenedores40 + contenedores20;

  const fletesFull = Math.floor(contenedores40 / 2);
  const fletesSencillos = contenedores40 % 2 === 0 ? 0 : 1;

  // Mantén TC de cobro sincronizado al TC de costos
  useEffect(() => {
    if (!current) return;
    const st = current.state;
    if ((st.tcCobro || 0) !== (st.tipoCambio || 0)) {
      updateState({ tcCobro: st.tipoCambio });
    }
  }, [current?.state?.tipoCambio]);

  // Mantén % Valor factura sincronizado a % FilaSystems (mismo valor)
  useEffect(() => {
    if (!current) return;
    const st = current.state;
    const fila = st.porcFila ?? 0;
    if ((st.porcValorFactura ?? 0) !== fila) {
      updateState({ porcValorFactura: fila });
    }
  }, [current?.state?.porcFila]);

  // Mantén flete Sencillo sincronizado al 50% del FULL (hasta que el usuario lo edite)
  useEffect(() => {
    if (!current) return;
    const st = current.state;
    // Solo aplica cuando hay 1 flete sencillo (contenedores impares)
    if (fletesSencillos !== 1) return;
    // Si el usuario lo editó manualmente, ya no se auto-sincroniza
    if (st.sencilloDirty) return;

    const full = st.costoFullMXN || 0;
    const target = Math.round(full / 2);
    if ((st.costoSencilloMXN || 0) !== target) {
      updateState({ costoSencilloMXN: target });
    }
  }, [current?.state?.costoFullMXN, current?.state?.sencilloDirty, fletesSencillos]);

  // ==================== (Parte 3/10 y siguientes: cálculos + UI) ====================
  // ==================== Cálculos compartidos (mismos que tenías) ====================
  // ===== Navegación de pasos (wizard) =====
  const stepOrder: StepKey[] = ["proyecto", "productos", "costos", "cotizacion", "pagos", "proyectoGanado", "centroControl"];
  const stepIndex = stepOrder.indexOf(step);
  const canPrev = stepIndex > 0;
  const canNext = stepIndex >= 0 && stepIndex < stepOrder.length - 1;

  const goPrev = () => {
    if (!canPrev) return;
    setStep(stepOrder[stepIndex - 1]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = () => {
    if (!canNext) return;
    setStep(stepOrder[stepIndex + 1]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const modelosFor = (medida: Medida) => Object.keys(priceList[medida] || {});
  const getUnitCost = (l: Linea) => {
    const base = (priceList[l.medida]?.[l.modelo]?.[l.tipo] ?? 0) + (l.techoAnticondensante ? TECHO_ANTICONDENSANTE_USD : 0);
    return (typeof l.costoProveedor === "number" && Number.isFinite(l.costoProveedor))
      ? l.costoProveedor
      : base;
  };

  // Use plain computed values instead of useMemo after guards
  const totalModulos = (sSafe?.lineas ?? []).reduce((acc, l) => acc + (l.cantidad || 0), 0);
  const valorProductosUSD = (sSafe?.lineas ?? []).reduce(
    (acc, l) => acc + getUnitCost(l) * (l.cantidad || 0),
    0
  );

  
  const valorFacturaUSD = (valorProductosUSD * (s?.porcValorFactura ?? 0)) / 100;
  const fleteMaritimoUSD =
    (contenedores40 * (s?.costoMaritimoUSD ?? 0)) +
    (contenedores20 * (s?.costoMaritimo20USD ?? 0));
  const seguroUSD = round2((valorFacturaUSD + fleteMaritimoUSD) * pct(s?.porcSeguro ?? 0));
  const igiUSD = round2((valorFacturaUSD + fleteMaritimoUSD + seguroUSD) * pct(s?.porcIGI ?? 0));
  const dtaUSD = round2((valorFacturaUSD + fleteMaritimoUSD + seguroUSD) * pct(s?.porcDTA ?? 0));
  const fleteTerrestreUSD = (
    (fletesFull * (s?.costoFullMXN ?? 0)) +
    (fletesSencillos * (s?.costoSencilloMXN ?? 0)) +
    (contenedores20 * (s?.costoTerrestre20MXN ?? 0))
  ) / ((s?.tipoCambio || 1));
  const agenteAduanalUSDTotal = s?.agenteAduanalUSD ?? 0;
  const maniobrasPuertoUSDTotal = s?.maniobrasPuertoUSD ?? 0;  

  // Asesor (HONORARIOS): comisión sobre el pago a “Otra empresa”
  // Ej: si valorProductosUSD=100, porcOtraEmpresa=40% => pagoOtraEmpresaUSD=40
  // Honorarios 7% => 2.8 (esto es el gasto real a prorratear)
  const pagoOtraEmpresaUSD = valorProductosUSD * pct(s?.porcOtraEmpresa ?? 0);
  const asesorRate = pct(s?.asesorPct ?? 0);
  const tcImp = (s?.tcImport || s?.tipoCambio || 0);

  // ✅ SOLO honorarios (gasto real). NO sumar el pago al proveedor porque ya está incluido en valorProductosUSD.
  const pagoAsesorTotalUSD = round2(pagoOtraEmpresaUSD * asesorRate);

  // IVA acreditable (referencia en MXN)
  // Base IVA importación: (valor factura + flete marítimo + seguro) * TC * 16%
  // IVA asesor: honorarios asesor * TC * 16%
  const tcForIVA = tcImp || 0;
  const baseIVAImportUSD = valorFacturaUSD + fleteMaritimoUSD + seguroUSD;

  const ivaAcreditableBaseMXN = round2(baseIVAImportUSD * tcForIVA * IVA_RATE);
  const ivaFacturaAsesorMXN = round2(pagoAsesorTotalUSD * tcForIVA * IVA_RATE);
  const ivaAcreditableTotalMXN = round2(ivaAcreditableBaseMXN + ivaFacturaAsesorMXN);

  const extrasUSD =
    fleteMaritimoUSD +
    fleteTerrestreUSD +
    seguroUSD +
    igiUSD +
    dtaUSD +
    agenteAduanalUSDTotal +
    maniobrasPuertoUSDTotal +
    pagoAsesorTotalUSD;
  const costoBaseUSD = round2(valorProductosUSD + extrasUSD);

  const totalRentableM2 = (sSafe?.lineas ?? []).reduce(
    (acc, l) => acc + rentableM2(l.medida, l.tipo) * (l.cantidad || 0),
    0
  );
  const totalShare = totalRentableM2 > 0 ? totalRentableM2 : totalModulos;

  const rows: CotRow[] = (sSafe?.lineas ?? []).map((l) => {
    const key = `${l.medida}-${l.modelo}-${l.tipo}`;
    const qty = l.cantidad || 0;
    const baseUnit = getUnitCost(l) || 0;
    const share = totalShare > 0
      ? (totalRentableM2 > 0 ? rentableM2(l.medida, l.tipo) * qty : qty) / totalShare
      : 0;
    const extraUnit = qty > 0 ? (extrasUSD * share) / qty : 0;
    const costoUnidadBase = round2(baseUnit + extraUnit);

    const margin = pct(s?.marginPct ?? 0);
    const discount = pct(s?.descuentoPct ?? 0);
    const precioUnidadBase = round2(margin >= 0.95 ? costoUnidadBase : (costoUnidadBase / (1 - margin)));
    const precioUnidadCalc = round2(precioUnidadBase * (1 - discount));

    const overrideCosto = (s?.costoOverrides || {})[key];
    const overridePrecio = (s?.precioOverrides || {})[key];

    const costoUnidad = typeof overrideCosto === "number" && Number.isFinite(overrideCosto) && overrideCosto >= 0
      ? round2(overrideCosto)
      : costoUnidadBase;
    const precioUnidad = typeof overridePrecio === "number" && Number.isFinite(overridePrecio) && overridePrecio >= 0
      ? round2(overridePrecio)
      : precioUnidadCalc;

    const costoLinea = round2(costoUnidad * qty);
    const precioLinea = round2(precioUnidad * qty);
    const utilidadLinea = round2(precioLinea - costoLinea);
    const utilidadUnidad = qty > 0 ? round2(utilidadLinea / qty) : 0;
    const marginPct = precioUnidad > 0 ? round2((utilidadUnidad / precioUnidad) * 100) : 0;
    const spec = getModuleSpec(l.medida, l.tipo, l.modelo);
    const puertasUnidad = spec?.puertas || 0;
    const puertasLinea = round2(puertasUnidad * qty);
    const m2Minibodega = spec?.m2PorMinibodega || 0;
    const m2Unidad = rentableM2(l.medida, l.tipo);
    const m2Linea = round2(m2Unidad * qty);

    lastBasePriceRef.current[key] = precioUnidadCalc;

    const overridePrecioUValid = !(
      typeof overridePrecio !== "undefined" &&
      !(typeof overridePrecio === "number" && Number.isFinite(overridePrecio) && overridePrecio >= 0)
    );
    const overrideCostoUValid = !(
      typeof overrideCosto !== "undefined" &&
      !(typeof overrideCosto === "number" && Number.isFinite(overrideCosto) && overrideCosto >= 0)
    );

    return {
      key,
      medida: l.medida,
      modelo: l.modelo,
      tipo: l.tipo,
      qty,
      costoUnidad: costoUnidadBase,
      utilidadUnidad,
      precioUnidad,
      precioUnidadBase: precioUnidadCalc,
      costoLinea,
      utilidadLinea,
      precioLinea,
      marginPct,
      puertasUnidad,
      puertasLinea,
      m2Minibodega,
      m2Unidad,
      m2Linea,
      overridePrecioU: overridePrecio,
      overridePrecioUValid,
      overrideCostoU: overrideCosto,
      overrideCostoUValid,
    };
  });

  const totalCostoUSD = rows.reduce((acc, r) => acc + r.costoLinea, 0);
  const totalPrecioUSD = rows.reduce((acc, r) => acc + r.precioLinea, 0);
  const totalUtilidadUSD = round2(totalPrecioUSD - totalCostoUSD);
  const omarCommissionUSD = round2(totalPrecioUSD * pct(s?.comisionOmarPct ?? 0));
  const netUtilidadUSD = round2(totalPrecioUSD - totalCostoUSD - omarCommissionUSD);
  const avgMarginNetPct = totalPrecioUSD > 0 ? round2((netUtilidadUSD / totalPrecioUSD) * 100) : 0;
  const totalRentableM2Safe = totalRentableM2 || 0;
  const totalPrecioRentableUSD = rows.reduce((acc, r) => acc + (r.m2Linea > 0 ? r.precioLinea : 0), 0);
  const precioXM2USD = totalRentableM2Safe > 0 ? round2(totalPrecioRentableUSD / totalRentableM2Safe) : 0;
  const tcCobro = s?.tcCobro || s?.tipoCambio || 0;
  const precioXM2MXN = totalRentableM2Safe > 0 && tcCobro > 0 ? round2(precioXM2USD * tcCobro) : 0;
  const mixPorM2 = (() => {
    const map = new Map<number, number>();
    rows.forEach((r) => {
      if (!(r.m2Minibodega > 0) || !(r.puertasLinea > 0)) return;
      map.set(r.m2Minibodega, round2((map.get(r.m2Minibodega) || 0) + r.puertasLinea));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([m2, puertas]) => ({ m2, puertas }));
  })();
  const totalPuertasMix = round2(mixPorM2.reduce((acc, x) => acc + x.puertas, 0));
  const puertasGrandes = round2(mixPorM2.filter((x) => x.m2 >= 9 && x.m2 <= 14).reduce((acc, x) => acc + x.puertas, 0));
  const puertasMedianas = round2(mixPorM2.filter((x) => x.m2 === 7 || x.m2 === 6).reduce((acc, x) => acc + x.puertas, 0));
  const puertasChicas = round2(mixPorM2.filter((x) => x.m2 <= 5).reduce((acc, x) => acc + x.puertas, 0));
  const pctMix = (n: number) => (totalPuertasMix > 0 ? round2((n / totalPuertasMix) * 100) : 0);
  const pctGrandes = pctMix(puertasGrandes);
  const pctMedianas = pctMix(puertasMedianas);
  const pctChicas = pctMix(puertasChicas);
  const CHAT_PROMPTS_KEY = "containmx.chatPrompts.v1";
  const CHAT_DOCK_SETTINGS_KEY = "containmx.chatDock.v1";
  const CHAT_MESSAGES_KEY = "containmx.chatMessages.v1";
  const CHAT_WEB_KEY = "containmx.chatUseWeb.v1";
  const STEP_TITLES: Record<StepKey, string> = {
    proyecto: "Nombre",
    productos: "Productos",
    costos: "Costos",
    cotizacion: "Cotizacion",
    pagos: "Pagos",
    proyectoGanado: "Ganado",
    centroControl: "Centro de control",
    logistica: "Logistica",
    impuestos: "Impuestos",
    comisionOmar: "Comision Omar",
    dashboard: "Dashboard",
  };
  const currentStepLabel = STEP_TITLES[step] || step;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_DOCK_SETTINGS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved?.open === "boolean") setChatDockOpen(saved.open);
      if (saved?.side === "left" || saved?.side === "right") setChatDockSide(saved.side);
      if (Number.isFinite(saved?.width)) setChatDockWidth(Math.max(320, Math.min(720, Math.round(saved.width))));
      if (Number.isFinite(saved?.height)) setChatDockHeight(Math.max(240, Math.min(720, Math.round(saved.height))));
      if (saved?.mode === "resumen" || saved?.mode === "completo") setChatContextMode(saved.mode);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        CHAT_DOCK_SETTINGS_KEY,
        JSON.stringify({
          open: chatDockOpen,
          side: chatDockSide,
          width: chatDockWidth,
          height: chatDockHeight,
          mode: chatContextMode,
        })
      );
    } catch {}
  }, [chatDockOpen, chatDockSide, chatDockWidth, chatDockHeight, chatContextMode]);

  useEffect(() => {
    try {
      const rawMsgs = localStorage.getItem(CHAT_MESSAGES_KEY);
      if (rawMsgs) {
        const map = JSON.parse(rawMsgs);
        if (map && typeof map === "object") setChatMessagesMap(map);
      }
      const rawWeb = localStorage.getItem(CHAT_WEB_KEY);
      if (rawWeb === "0") setChatUseWeb(false);
      if (rawWeb === "1") setChatUseWeb(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(chatMessagesMap));
    } catch {}
  }, [chatMessagesMap]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_WEB_KEY, chatUseWeb ? "1" : "0");
    } catch {}
  }, [chatUseWeb]);

  useEffect(() => {
    if (!currentId) return;
    try {
      const raw = localStorage.getItem(CHAT_PROMPTS_KEY);
      const map = raw ? JSON.parse(raw) : {};
      setChatPrompt(typeof map?.[currentId] === "string" ? map[currentId] : "");
    } catch {
      setChatPrompt("");
    }
  }, [currentId]);

  useEffect(() => {
    if (!currentId) return;
    try {
      const raw = localStorage.getItem(CHAT_PROMPTS_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[currentId] = chatPrompt || "";
      localStorage.setItem(CHAT_PROMPTS_KEY, JSON.stringify(map));
    } catch {}
  }, [currentId, chatPrompt]);

  const chatMessages = useMemo<ChatMsg[]>(
    () => (currentId ? chatMessagesMap[currentId] || [] : []),
    [currentId, chatMessagesMap]
  );

  const chatProjectContext = useMemo(() => {
    const meta = current?.meta;
    const st = current?.state;
    const lineCount = (st?.lineas || []).length;
    const movCount = (st?.movimientos || []).length;
    const resumen = [
      `Proyecto: ${meta?.nombre || "Sin nombre"}`,
      `Contacto: ${meta?.contacto || "Sin contacto"}`,
      `Ubicación: ${meta?.ubicacion || "Sin ubicación"}`,
      `Paso actual: ${currentStepLabel}`,
      `Ganado: ${st?.ganado ? "Sí" : "No"}`,
      `Estatus proyecto: ${st?.estatusProyecto ? estatusLabel(st.estatusProyecto) : "Sin estatus"}`,
      `Unidades totales: ${totalModulos}`,
      `Líneas de producto: ${lineCount}`,
      `Costo estimado USD: ${round2(costoBaseUSD)}`,
      `Venta total USD: ${round2(totalPrecioUSD)}`,
      `Utilidad neta USD: ${round2(netUtilidadUSD)}`,
      `Por pagar (ganados) USD: ${round2(ccPorPagar.usd)}`,
      `Por recibir (ganados) USD: ${round2(ccPorRecibir.usd)}`,
      `Flujo real (ganados) MXN: ${round2(ccRealMXN)}`,
      `Movimientos registrados: ${movCount}`,
    ].join("\n");

    if (chatContextMode === "resumen") return resumen;
    return `${resumen}\n\nJSON completo proyecto activo:\n${JSON.stringify(current || {}, null, 2)}`;
  }, [
    current?.id,
    current,
    current?.meta?.nombre,
    current?.meta?.contacto,
    current?.meta?.ubicacion,
    current?.state?.ganado,
    current?.state?.estatusProyecto,
    current?.state?.lineas,
    current?.state?.movimientos,
    currentStepLabel,
    totalModulos,
    costoBaseUSD,
    totalPrecioUSD,
    netUtilidadUSD,
    ccPorPagar.usd,
    ccPorRecibir.usd,
    ccRealMXN,
    chatContextMode,
  ]);

  const copyChatContext = async () => {
    const finalText = `${chatPrompt ? `Solicitud:\n${chatPrompt}\n\n` : ""}Contexto:\n${chatProjectContext}`;
    try {
      await navigator.clipboard.writeText(finalText);
      setChatCopyMsg("Contexto copiado");
      setTimeout(() => setChatCopyMsg(null), 1800);
    } catch {
      setChatCopyMsg("No se pudo copiar");
      setTimeout(() => setChatCopyMsg(null), 1800);
    }
  };

  const appendChatMessage = (projectId: string, msg: ChatMsg) => {
    setChatMessagesMap((prev) => {
      const currentMsgs = prev[projectId] || [];
      return { ...prev, [projectId]: [...currentMsgs, msg] };
    });
  };

  const clearChatMessages = () => {
    if (!currentId) return;
    setChatMessagesMap((prev) => ({ ...prev, [currentId]: [] }));
    setChatError(null);
  };

  const sendChatPrompt = async () => {
    if (!currentId) return;
    const question = (chatPrompt || "").trim();
    if (!question) return;
    setChatError(null);
    setChatLoading(true);

    appendChatMessage(currentId, {
      id: cryptoRandom(),
      role: "user",
      text: question,
      createdAt: new Date().toISOString(),
    });
    setChatPrompt("");

    try {
      const res = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          context: chatProjectContext,
          history: chatMessages.slice(-10).map((m) => ({ role: m.role, text: m.text })),
          includeWeb: chatUseWeb,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo obtener respuesta del asistente.");
      }
      appendChatMessage(currentId, {
        id: cryptoRandom(),
        role: "assistant",
        text: String(data.answer || "").trim() || "Sin respuesta.",
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      setChatError(e?.message || "Error de conexión con el asistente.");
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatLoading]);

  const openFreightValidationWeb = () => {
    const q = [
      "costo flete maritimo contenedor 40 pies",
      current?.meta?.ubicacion || "",
      current?.meta?.nombre || "",
      String(new Date().getFullYear()),
    ]
      .filter(Boolean)
      .join(" ");
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  };

  const openLandFreightValidationWeb = () => {
    const q = [
      "cotizacion flete terrestre plataforma contenedor",
      current?.meta?.ubicacion || "",
      String(new Date().getFullYear()),
    ]
      .filter(Boolean)
      .join(" ");
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  };

  const setPrecioOverride = (key: string, raw: string) => {
    const cleaned = (raw ?? "").toString().trim();
    const prev = s?.precioOverrides || {};
    if (!cleaned) {
      const { [key]: _omit, ...rest } = prev;
      setS({ precioOverrides: rest });
      return;
    }
    const parsed = parseNumericInput(cleaned);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setS({ precioOverrides: { ...prev, [key]: round2(parsed) } });
  };

  const setCostoOverride = (key: string, raw: string) => {
    const cleaned = (raw ?? "").toString().trim();
    const prev = s?.costoOverrides || {};
    if (!cleaned) {
      const { [key]: _omit, ...rest } = prev;
      setS({ costoOverrides: rest });
      return;
    }
    const parsed = parseNumericInput(cleaned);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setS({ costoOverrides: { ...prev, [key]: round2(parsed) } });
  };

  const exportCotizacionPdf = () => {
    const fecha = new Date();
    const fechaFmt = fecha.toLocaleDateString("es-MX");
    const meta = current?.meta as ProyectoMeta;
    const nombreProyecto = escapeHtml(meta?.nombre || "");
    const contacto = escapeHtml(meta?.contacto || "");
    const razonSocial = escapeHtml(meta?.razonSocial || "");
    const telefono = escapeHtml(meta?.contactoTelefono || "");
    const correo = escapeHtml(meta?.contactoEmail || "");
    const logoUrl = "/logo-s-containr.png";

    const isOfficeModel = (modelo: string) => modelo === "S9" || modelo === "S10" || modelo === "S11";
    const rowsModulos = rows.filter((r) => !isOfficeModel(r.modelo));
    const rowsOficinas = rows.filter((r) => isOfficeModel(r.modelo));

    const buildRowHtml = (r: (typeof rows)[number]) => {
      const product = `UAP-${r.medida}'`;
      const note = (priceList as any)?.[r.medida]?.[r.modelo]?.nota;
      const tipoDesc = getTipoDisplay(r.modelo, r.tipo);
      const noteText = typeof note === "string" && note.trim() ? note.trim() : "";
      const desc = `${r.modelo} ${tipoDesc}${noteText && noteText.toLowerCase() !== tipoDesc.toLowerCase() ? ` · ${noteText}` : ""}`;
      const sub = round2(r.precioLinea);
      const iva = round2(sub * IVA_RATE);
      const total = round2(sub + iva);
      return `
        <tr>
          <td>${escapeHtml(product)}</td>
          <td>${escapeHtml(desc)}</td>
          <td class="money">$ ${r.precioUnidad.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="num">${r.qty}</td>
          <td class="money">$ ${sub.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="money">$ ${iva.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="money">$ ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="usd">USD</td>
        </tr>
      `;
    };

    const summarizeRows = (arr: typeof rows) => {
      const sub = round2(arr.reduce((acc, r) => acc + r.precioLinea, 0));
      const iva = round2(sub * IVA_RATE);
      return { sub, iva, total: round2(sub + iva) };
    };
    const modTotals = summarizeRows(rowsModulos);
    const officeTotals = summarizeRows(rowsOficinas);
    const globalTotals = summarizeRows(rows);

    const subtotalRowHtml = (label: string, totals: { sub: number; iva: number; total: number }) => `
      <tr class="totals">
        <td colspan="4" class="subtotal-label">${escapeHtml(label)}</td>
        <td class="money">$ ${totals.sub.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="money">$ ${totals.iva.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="money">$ ${totals.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="usd">USD</td>
      </tr>
    `;

    const rowsParts: string[] = [];
    if (rowsModulos.length) {
      rowsParts.push(rowsModulos.map(buildRowHtml).join(""));
      rowsParts.push(subtotalRowHtml("SUBTOTAL MODULOS", modTotals));
    }
    if (rowsOficinas.length) {
      rowsParts.push(`<tr class="spacer-row"><td colspan="8"></td></tr>`);
      rowsParts.push(rowsOficinas.map(buildRowHtml).join(""));
      rowsParts.push(subtotalRowHtml("SUBTOTAL OFICINAS", officeTotals));
    }
    rowsParts.push(`<tr class="spacer-row"><td colspan="8"></td></tr>`);
    rowsParts.push(subtotalRowHtml("SUBTOTAL GENERAL", globalTotals));
    const rowsHtml = rowsParts.join("");

    const m2Tot = totalRentableM2Safe;
    const modulosTot = rows.reduce((acc, r) => acc + (r.m2Linea > 0 ? r.qty : 0), 0);
    const subTotalRentable = round2(rows.reduce((acc, r) => acc + (r.m2Linea > 0 ? r.precioLinea : 0), 0));
    const costoM2Iva = m2Tot > 0 ? round2(subTotalRentable / m2Tot) : 0;
    const mixRowsPdfHtml = mixPorM2
      .map(
        (x) => `
          <div class="mix-row">
            <span>${x.m2.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(x.m2) ? 0 : 1, maximumFractionDigits: 1 })} m2</span>
            <strong>${x.puertas.toFixed(0)}</strong>
          </div>
        `,
      )
      .join("");
    const condCom = escapeHtml(s?.cotCondiciones || "");
    const descTec = escapeHtml(s?.cotDescripcionTecnica || "");
    const carS1S8 = escapeHtml(s?.cotCaracteristicasS1S8 || "");
    const carS9 = escapeHtml(s?.cotCaracteristicasS9 || "");

    const html = `
      <html>
        <head>
          <title>Cotización</title>
          <style>
            @page { size: A4 portrait; margin: 8mm; }
            body { font-family: Arial, sans-serif; color: #111; margin: 0; zoom: 0.74; }
            .page { min-height: 100vh; display: flex; flex-direction: column; padding: 6mm 2mm 8mm; }
            .top { display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
            .logo { height: 64px; width: auto; object-fit: contain; display: block; }
            .header-title { text-align: center; font-size: 18px; font-weight: 700; color: #666; margin: 6px 0 14px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
            .meta .label { color: #777; font-weight: 700; }
            .meta .value { margin-left: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th, td { border: 1px solid #111; padding: 4px 5px; }
            th { background: #f5f5f5; text-align: center; }
            td.money { text-align: right; white-space: nowrap; }
            td.num { text-align: center; }
            td.usd { text-align: center; }
            .totals td { font-weight: 800; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
            .box { border: 1px solid #111; padding: 6px; font-size: 10px; }
            .section-title { font-weight: 800; margin-bottom: 6px; }
            .bank { margin-top: 12px; }
            .bank table th, .bank table td { border: 1px solid #111; padding: 6px; font-size: 11px; }
            .footer { margin-top: 10px; text-align: center; font-size: 10px; }
            .section-gap { height: 8mm; }
            .bank { margin-top: 8px; }
            .signatures { margin-top: 10mm; }
            .sig-line { border-top: 1px solid #111; padding-top: 6px; min-height: 10mm; }
            .legend { margin-top: 6px; font-size: 10px; line-height: 1.4; }
            .legend a { color: #0000ee; text-decoration: underline; }
            .summary-grid { margin-top: 6px; display: grid; grid-template-columns: 60% 40%; gap: 8px; align-items: stretch; }
            .mix-box { border: 1px solid #111; padding: 6px; font-size: 9px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
            .mix-title { font-weight: 800; margin-bottom: 4px; grid-column: 1 / -1; }
            .mix-row { display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 1px 0; }
            .mix-total { font-weight: 800; border-top: 1px solid #111; margin-top: 2px; padding-top: 2px; }
            .mix-pcts { display: grid; gap: 4px; align-content: start; min-width: 120px; }
            .mix-pct { border: 1px solid #ddd; padding: 4px; border-radius: 6px; text-align: right; }
            .mix-pct b { display: block; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="page">
          <div class="top">
            <div>
              <img class="logo" src="${logoUrl}" alt="S-CONTAINR" onerror="this.style.display='none'" />
              <div style="font-size:10px; margin-top:6px; line-height:1.4;">
                S-Containr / Fila Systems S.A. de C.V.<br/>
                Av. Vallarta 7555, Zapopan, Jalisco, México.<br/>
                contacto@scontainr.com | (56) 44 77 2909 | www.scontainr.com
              </div>
            </div>
            <div></div>
          </div>
          <div class="header-title">COTIZACIÓN</div>

          <div class="meta">
            <div><span class="label">Contacto</span><span class="value">${contacto}</span></div>
            <div><span class="label">Fecha</span><span class="value">${fechaFmt}</span></div>
            <div><span class="label">Nombre del Proyecto</span><span class="value">${nombreProyecto}</span></div>
            <div><span class="label">Tipo de cambio</span><span class="value">Al día de pago</span></div>
            <div><span class="label">Razón Social</span><span class="value">${razonSocial}</span></div>
            <div><span class="label">Teléfono</span><span class="value">${telefono}</span></div>
            <div><span class="label">Correo</span><span class="value">${correo}</span></div>
          </div>

          <div class="section-gap"></div>

          <table>
            <thead>
              <tr>
                <th>PRODUCTO</th>
                <th>DESCRIPCIÓN</th>
                <th>Precio</th>
                <th>U</th>
                <th>SUBTOTAL</th>
                <th>IVA</th>
                <th>TOTAL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="summary-grid">
            <table>
              <tr><td><b>M2 Rentables Totales:</b></td><td class="num">${m2Tot.toFixed(0)}</td></tr>
              <tr><td><b>Módulos Rentables Totales:</b></td><td class="num">${modulosTot}</td></tr>
              <tr><td><b>Costo x m2 Rentable + IVA USD:</b></td><td class="money" style="text-align:center">$ ${costoM2Iva.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
            </table>
            <div class="mix-box">
              <div class="mix-title">MIX DE UNIDADES</div>
              <div>
                ${mixRowsPdfHtml}
                <div class="mix-row mix-total">
                  <span>TOTAL PUERTAS</span>
                  <strong>${totalPuertasMix.toFixed(0)}</strong>
                </div>
              </div>
              <div class="mix-pcts">
                <div class="mix-pct">
                  Grandes (14m2 a 9m2)
                  <b>${pctGrandes.toFixed(2)}%</b>
                </div>
                <div class="mix-pct">
                  Medianas (7m2 y 6m2)
                  <b>${pctMedianas.toFixed(2)}%</b>
                </div>
                <div class="mix-pct">
                  Chicas (5m2 o menos)
                  <b>${pctChicas.toFixed(2)}%</b>
                </div>
              </div>
            </div>
          </div>

          <div class="grid-2">
            <div class="box">
              <div class="section-title">CONDICIONES COMERCIALES</div>
              <div>${condCom.replace(/\n/g, "<br/>")}</div>
            </div>
            <div class="box">
              <div class="section-title">DESCRIPCIÓN TÉCNICA</div>
              <div>${descTec.replace(/\n/g, "<br/>")}</div>
            </div>
          </div>

          <div class="grid-2">
            <div class="box">
              <div class="section-title">CARACTERÍSTICAS MODULOS S1-S8</div>
              <div>${carS1S8.replace(/\n/g, "<br/>")}</div>
            </div>
            <div class="box">
              <div class="section-title">CARACTERÍSTICAS MODULO S9</div>
              <div>${carS9.replace(/\n/g, "<br/>")}</div>
            </div>
          </div>

          <div class="signatures" style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
            <div class="sig-line">
              ${contacto || "CLIENTE"}<br/>${razonSocial || "CLIENTE"}
            </div>
            <div class="sig-line">
              JORGE ARREGUI<br/>DIRECTOR COMERCIAL
            </div>
          </div>

          <div class="bank">
            <div class="section-title" style="text-align:center;">CUENTAS BANCARIAS PARA PAGO BANCO BASE</div>
            <table>
              <tr>
                <th>BENEFICIARIO</th>
                <th colspan="2">FILA SYSTEMS SA DE CV</th>
              </tr>
              <tr>
                <th></th>
                <th>NUMERO DE CUENTA</th>
                <th>CLAVE</th>
              </tr>
              <tr>
                <td>DÓLARES</td>
                <td>45808070201</td>
                <td>14532045808070-20-10</td>
              </tr>
              <tr>
                <td>PESOS</td>
                <td>45808070101</td>
                <td>14532045808070-10-11</td>
              </tr>
            </table>
            <div class="legend">
              Todos los pagos pactados en dólares estadounidenses (USD) serán cubiertos en USD directamente o en pesos mexicanos al tipo de cambio de venta vigente al día de cada pago, conforme a la información publicada por BBVA México en su portal oficial de información financiera:
              <a href="https://www.bbva.mx/personas/informacion-financiera-al-dia.html">https://www.bbva.mx/personas/informacion-financiera-al-dia.html</a>.
            </div>
          </div>

          <div class="footer">
            Fila Systems, S.A. de C.V. - Prol. Av. Vallarta 7555 Col. San Juan de Ocotán, Zapopan, Jal. C.P.45019 - Tel. 56 44772909
          </div>
          </div>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const exportCotizacionExcel = async () => {
    const meta = current?.meta as ProyectoMeta;
    const fecha = new Date();
    const fechaFmt = fecha.toLocaleDateString("es-MX");
    const nombreProyecto = meta?.nombre || "Proyecto";
    const contacto = meta?.contacto || "";
    const razonSocial = meta?.razonSocial || "";
    const ubicacion = meta?.ubicacion || "";
    const telefono = meta?.contactoTelefono || "";
    const correo = meta?.contactoEmail || "";

    const resumenRows: Array<[string, string | number]> = [
      ["Proyecto", nombreProyecto],
      ["Contacto", contacto],
      ["Razón social", razonSocial],
      ["Ubicación", ubicacion],
      ["Teléfono", telefono],
      ["Correo", correo],
      ["Fecha", fechaFmt],
      ["Tipo de cambio", s?.tipoCambio ?? 0],
      ["Margen objetivo %", s?.marginPct ?? 0],
      ["Descuento %", s?.descuentoPct ?? 0],
      ["Comisión Omar %", s?.comisionOmarPct ?? 0],
      ["Costo total (USD)", round2(totalCostoUSD)],
      ["Precio de venta (USD)", round2(totalPrecioUSD)],
      ["Utilidad (USD)", round2(totalUtilidadUSD)],
      ["Comisión Omar (USD)", round2(omarCommissionUSD)],
      ["Utilidad neta (USD)", round2(netUtilidadUSD)],
      ["Margen neto promedio %", round2(avgMarginNetPct)],
      ["m2 rentables", round2(totalRentableM2Safe)],
      ["Precio/m2 USD", round2(precioXM2USD)],
      ["Precio/m2 MXN", round2(precioXM2MXN)],
    ];

    const cotizacionRows = rows.map((r) => {
      const utilidadNetaPct = r.precioLinea > 0 ? round2((r.utilidadLinea / r.precioLinea) * 100) : 0;
      const omarLineaUSD = totalPrecioUSD > 0 ? round2((r.precioLinea / totalPrecioUSD) * omarCommissionUSD) : 0;
      const precioXM2LineaUSD = r.m2Linea > 0 ? round2(r.precioLinea / r.m2Linea) : 0;
      return {
        Medida: `${r.medida}'`,
        Modelo: r.modelo,
        Tipo: getTipoDisplay(r.modelo, r.tipo),
        Qty: r.qty,
        "Puertas/u": round2(r.puertasUnidad),
        "Puertas línea": round2(r.puertasLinea),
        m2: round2(r.m2Linea),
        "Costo USD/u": round2(r.costoUnidad),
        "Precio USD/u": round2(r.precioUnidad),
        "Costo línea": round2(r.costoLinea),
        "Precio línea": round2(r.precioLinea),
        Utilidad: round2(r.utilidadLinea),
        "Utilidad % (neta)": utilidadNetaPct,
        "Comisión Omar": omarLineaUSD,
        "Precio/m2 USD": precioXM2LineaUSD,
      };
    });

    const costosRows = [
      { Concepto: "Productos", Monto: round2(valorProductosUSD), Moneda: "USD" },
      { Concepto: "Flete marítimo", Monto: round2(fleteMaritimoUSD), Moneda: "USD" },
      { Concepto: "Flete terrestre", Monto: round2(fleteTerrestreUSD), Moneda: "USD" },
      { Concepto: "Seguro", Monto: round2(seguroUSD), Moneda: "USD" },
      { Concepto: "IGI", Monto: round2(igiUSD), Moneda: "USD" },
      { Concepto: "DTA", Monto: round2(dtaUSD), Moneda: "USD" },
      { Concepto: "Agente aduanal", Monto: round2(agenteAduanalUSDTotal), Moneda: "USD" },
      { Concepto: "Maniobras puerto", Monto: round2(maniobrasPuertoUSDTotal), Moneda: "USD" },
      { Concepto: "Honorarios asesor", Monto: round2(pagoAsesorTotalUSD), Moneda: "USD" },
      { Concepto: "Total costo estimado", Monto: round2(totalCostoUSD), Moneda: "USD" },
      { Concepto: "IVA a pagar importación", Monto: round2(ivaAcreditableBaseMXN), Moneda: "MXN" },
    ];

    const safeName = (nombreProyecto || "cotizacion").replace(/[^a-z0-9\-_]+/gi, "_");
    try {
      const XLSX = await import("xlsx");
      const resumenSheet = XLSX.utils.aoa_to_sheet(resumenRows);
      const cotizacionSheet = XLSX.utils.json_to_sheet(cotizacionRows);
      const costosSheet = XLSX.utils.json_to_sheet(costosRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, resumenSheet, "Resumen");
      XLSX.utils.book_append_sheet(wb, cotizacionSheet, "Cotizacion");
      XLSX.utils.book_append_sheet(wb, costosSheet, "Costos");
      XLSX.writeFile(wb, `${safeName}_cotizacion.xlsx`);
    } catch {
      const flatRows: string[][] = [];
      flatRows.push(
        ["Resumen", ""],
        ...resumenRows.map(([k, v]) => [k, String(v)]),
        [],
        ["Cotizacion por linea", ""],
        [
          "Medida",
          "Modelo",
          "Tipo",
          "Qty",
          "Puertas/u",
          "Puertas línea",
          "m2",
          "Costo USD/u",
          "Precio USD/u",
          "Costo línea",
          "Precio línea",
          "Utilidad",
          "Utilidad % (neta)",
          "Comisión Omar",
          "Precio/m2 USD",
        ],
        ...cotizacionRows.map((r) => [
          String(r.Medida),
          String(r.Modelo),
          String(r.Tipo),
          String(r.Qty),
          String(r["Puertas/u"]),
          String(r["Puertas línea"]),
          String(r.m2),
          String(r["Costo USD/u"]),
          String(r["Precio USD/u"]),
          String(r["Costo línea"]),
          String(r["Precio línea"]),
          String(r.Utilidad),
          String(r["Utilidad % (neta)"]),
          String(r["Comisión Omar"]),
          String(r["Precio/m2 USD"]),
        ]),
        [],
        ["Costos", ""],
        ["Concepto", "Monto", "Moneda"],
        ...costosRows.map((r) => [r.Concepto, String(r.Monto), r.Moneda])
      );
      const csv = "\uFEFF" + flatRows.map((row) => row.map(csvCell).join(",")).join("\n");
      downloadText(`${safeName}_cotizacion.csv`, csv, "text/csv;charset=utf-8");
    }
  };

  const syncPagosFromCondiciones = () => {
    const raw = (s?.cotCondiciones || "").toString();
    const match = raw.match(/Términos de pago:\s*([^\n]+)/i);
    if (!match) return;
    const parts = match[1].split("|").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const parsed = parts
      .map((p) => {
        const m = p.match(/([\d.,]+)\s*%?\s*(.*)/);
        if (!m) return null;
        const pctVal = parseNumericInput(m[1]);
        const concept = (m[2] || "").trim();
        return {
          pct: Number.isFinite(pctVal) ? pctVal : 0,
          concept,
          date: "",
        };
      })
      .filter(Boolean) as PagoItem[];
    if (!parsed.length) return;
    const count = Math.min(5, Math.max(3, parsed.length));
    const normalized = parsed.slice(0, count);
    setS({ pagosCount: count, pagos: normalized });
  };

  // Guards al final para mantener orden estable de hooks entre renders.
  if (!hydrated) {
    return (
      <div style={{ padding: 24, fontFamily: inter.style.fontFamily }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Cargando Cotizador...</h1>
        <p style={{ marginTop: 8, color: "#6b7280", fontWeight: 600 }}>Inicializando datos locales...</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div style={{ padding: 24, fontFamily: inter.style.fontFamily, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Cotizador V2</h1>
        <p style={{ margin: 0, color: "#6b7280", fontWeight: 600 }}>
          No hay proyectos cargados en este navegador. Crea uno nuevo o importa un JSON.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={newProject}>+ Crear proyecto</button>
          <button style={btn} onClick={triggerImport}>Importar JSON</button>
          <button style={btnGhost} onClick={downloadAutoBackupV2}>Descargar auto-backup</button>
          <button style={btnGhost} onClick={downloadLocalStorageDump}>Descargar dump localStorage</button>
        </div>
        {recoveryMsg ? (
          <div style={{ marginTop: 8, padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fafafa", color: "#111827", fontWeight: 700 }}>
            {recoveryMsg}
          </div>
        ) : null}
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: inter.style.fontFamily, color: tokens.text, background: tokens.surfaceAlt, minHeight: "100vh" }}>
      <div style={headerSticky}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>Cotizador V2</div>
            <select
              value={currentSafeId ?? ""}
              onChange={(e) => setCurrentId(e.target.value)}
              style={{ ...selectCss, maxWidth: 260 }}
            >
              {(projects || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.meta?.nombre || "Proyecto"}
                </option>
              ))}
            </select>
            <div style={{ position: "relative" }}>
              <button
                style={{ ...btnGhost, padding: "8px 12px", fontWeight: 800 }}
                onClick={() => setShowGanadosList((v) => !v)}
              >
                Proyectos ganados ({proyectosGanados.length})
              </button>
              {showGanadosList ? (
                <div
                  style={{
                    position: "absolute",
                    top: "110%",
                    left: 0,
                    zIndex: 50,
                    width: 320,
                    maxHeight: 240,
                    overflowY: "auto",
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 12,
                    background: tokens.surface,
                    boxShadow: tokens.shadowMd,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: tokens.textMuted, marginBottom: 8 }}>
                    Proyectos ganados
                  </div>
                  {!proyectosGanados.length ? (
                    <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>Sin ganados</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {proyectosGanados.map((p) => {
                        const unidades = (p.state?.lineas || []).reduce((acc, l) => acc + (l.cantidad || 0), 0);
                        return (
                          <button
                            key={p.id}
                            style={{
                              ...btnGhost,
                              padding: "8px 10px",
                              textAlign: "left",
                              display: "grid",
                              gap: 4,
                              borderRadius: 10,
                              background: p.id === currentSafeId ? "#eef2ff" : undefined,
                              borderColor: p.id === currentSafeId ? "#c7d2fe" : tokens.border,
                            }}
                            onClick={() => {
                              setCurrentId(p.id);
                              setStep("proyectoGanado");
                              setShowGanadosList(false);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{p.meta?.nombre || "Proyecto"}</div>
                            <div style={{ fontSize: 11, color: tokens.textMuted, fontWeight: 700 }}>
                              {estatusLabel(p.state?.estatusProyecto || "anticipoProveedor")} · {unidades} uds
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            {savedAt ? (
              <span style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                Guardado: {savedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            {recoveryMsg ? (
              <span style={{ fontSize: 12, color: "#065f46", fontWeight: 700, background: "#ecfdf3", border: "1px solid #a7f3d0", padding: "4px 8px", borderRadius: 999 }}>
                {recoveryMsg}
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button style={btnGhost} onClick={() => setChatDockOpen((v) => !v)}>
              {chatDockOpen ? "Ocultar asistente" : "Abrir asistente"}
            </button>
            <button style={btnGhost} onClick={() => setStep("centroControl")}>Centro de control</button>
            <button style={btnPrimary} onClick={newProject}>+ Proyecto</button>
            <button style={btn} onClick={duplicateProject}>Duplicar</button>
            <button style={btn} onClick={() => { if (confirm("¿Eliminar este proyecto?")) deleteProject(); }}>Eliminar</button>
            <button style={btn} onClick={manualSave}>Guardar</button>
            <button style={btn} onClick={exportProjects}>Exportar</button>
            <button style={btn} onClick={triggerImport}>Importar</button>
          </div>
        </div>
      </div>

      <div style={layout}>
        <aside style={sidebar}>
          <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 800, letterSpacing: 0.2 }}>Proyecto</div>
          <div style={{ marginTop: 6, fontWeight: 900 }}>{current?.meta?.nombre || "Proyecto"}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
            {current?.meta?.contacto || "Contacto"} · {current?.meta?.ubicacion || "Ubicación"}
          </div>

          <Stepper step={step} setStep={setStep} />

          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 800 }}>Resumen rápido</div>
            <div style={kpiPill}>Unidades: {totalModulos}</div>
            <div style={kpiPill}>Contenedores: {contenedores40} (40') · {contenedores20} (20')</div>
            <div style={kpiPill}>Costo estimado: {fmtUSD(costoBaseUSD)}</div>
          </div>
        </aside>

        <main style={mainArea}>
          {step === "proyecto" ? (
            <section style={card}>
              <h2 style={h2}>Datos del proyecto</h2>
              <div style={grid2}>
                <Field label="Nombre del proyecto">
                  <input
                    type="text"
                    value={current?.meta?.nombre ?? ""}
                    onChange={(e) => updateMeta({ nombre: e.target.value })}
                    style={inputCss}
                  />
                </Field>
                <Field label="Contacto">
                  <input
                    type="text"
                    value={current?.meta?.contacto ?? ""}
                    onChange={(e) => updateMeta({ contacto: e.target.value })}
                    style={inputCss}
                  />
                </Field>
              </div>
              <div style={{ height: 10 }} />
              <div style={grid2}>
                <Field label="Ubicación">
                  <input
                    type="text"
                    value={current?.meta?.ubicacion ?? ""}
                    onChange={(e) => updateMeta({ ubicacion: e.target.value })}
                    style={inputCss}
                  />
                </Field>
                <Field label="Razón social">
                  <input
                    type="text"
                    value={current?.meta?.razonSocial ?? ""}
                    onChange={(e) => updateMeta({ razonSocial: e.target.value })}
                    style={inputCss}
                  />
                </Field>
              </div>
              <div style={{ height: 10 }} />
              <div style={grid2}>
                <Field label="Email contacto">
                  <input
                    type="email"
                    value={current?.meta?.contactoEmail ?? ""}
                    onChange={(e) => updateMeta({ contactoEmail: e.target.value })}
                    style={inputCss}
                  />
                  {current?.meta?.contactoEmail && !isValidEmail(current.meta.contactoEmail) ? (
                    <div style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>Email inválido</div>
                  ) : null}
                </Field>
                <Field label="Teléfono contacto">
                  <input
                    type="tel"
                    value={current?.meta?.contactoTelefono ?? ""}
                    onChange={(e) => updateMeta({ contactoTelefono: e.target.value })}
                    style={inputCss}
                  />
                  {current?.meta?.contactoTelefono && !isValidPhone(current.meta.contactoTelefono) ? (
                    <div style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>Teléfono inválido</div>
                  ) : null}
                </Field>
              </div>
            </section>
          ) : null}

          {step === "productos" ? (
            <>
              <QuickAddProductos
                lineas={sSafe.lineas}
                setLineas={setLineas}
                modelosFor={modelosFor}
                getUnitCost={getUnitCost}
              />
              <LineasCompactTable
                lineas={sSafe.lineas}
                setLineas={setLineas}
                getUnitCost={getUnitCost}
              />
            </>
          ) : null}

          {step === "costos" ? (
            <>
              <ParametrosCard
                s={sSafe}
                setS={setS}
                contenedores={contenedores}
                fletesSencillos={fletesSencillos}
                contenedoresAuto={contenedoresAuto}
                fletesFull={fletesFull}
              />
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
                <button style={btnGhost} onClick={() => setDesgloseOpen((v) => !v)}>
                  {desgloseOpen ? "Ocultar desglose" : "Abrir desglose"}
                </button>
              </div>
              <ResultadosCostos
                totalModulos={totalModulos}
                valorProductosUSD={valorProductosUSD}
                fleteMaritimoUSD={fleteMaritimoUSD}
                fleteTerrestreUSD={fleteTerrestreUSD}
                seguroUSD={seguroUSD}
                igiUSD={igiUSD}
                dtaUSD={dtaUSD}
                porcDTA={s?.porcDTA ?? 0}
                agenteAduanalUSD={agenteAduanalUSDTotal}
                maniobrasPuertoUSD={maniobrasPuertoUSDTotal}
                costoBaseUSD={costoBaseUSD}
                pagoAsesorTotalUSD={pagoAsesorTotalUSD}
                ivaAcreditableBaseMXN={ivaAcreditableBaseMXN}
                ivaAcreditableTotalMXN={ivaAcreditableTotalMXN}
                ivaFacturaAsesorMXN={ivaFacturaAsesorMXN}
                tipoCambio={s?.tipoCambio ?? 0}
                desgloseOpen={desgloseOpen}
              />
            </>
          ) : null}

          {step === "cotizacion" ? (
            <>
              <CotizacionClienteCard s={sSafe} setS={setS} />
              <section style={card}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={h2}>Cotización por línea</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={precioManual}
                        onChange={(e) => setPrecioManual(e.target.checked)}
                      />
                      Precio manual
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={!!sSafe.ganado}
                        onChange={(e) => toggleGanado(e.target.checked)}
                      />
                      Proyecto ganado
                    </label>
                    <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                      Margen neto: {avgMarginNetPct.toFixed(2)}% · Descuento: {s?.descuentoPct ?? 0}%
                    </div>
                  </div>
                </div>

                {!rows.length ? (
                  <div style={{ color: tokens.textMuted, fontWeight: 700 }}>
                    Agrega productos para generar la cotización.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <Th>Medida</Th>
                          <Th>Modelo</Th>
                          <Th>Tipo</Th>
                          <Th style={{ textAlign: "right" }}>Qty</Th>
                          <Th style={{ textAlign: "right" }}>Puertas/u</Th>
                          <Th style={{ textAlign: "right" }}>Puertas línea</Th>
                          <Th style={{ textAlign: "right" }}>m2</Th>
                          <Th style={{ textAlign: "right" }}>Costo USD/u</Th>
                          <Th style={{ textAlign: "right" }}>Precio USD/u</Th>
                          <Th style={{ textAlign: "right" }}>Costo línea</Th>
                          <Th style={{ textAlign: "right" }}>Precio línea</Th>
                          <Th style={{ textAlign: "right" }}>Utilidad</Th>
                          <Th style={{ textAlign: "right" }}>Utilidad % (neta)</Th>
                          <Th style={{ textAlign: "right" }}>Comisión Omar</Th>
                          <Th style={{ textAlign: "right" }}>Precio/m2 USD</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const precioDraft =
                            (precioOverrideDraft[r.key] ?? "") !== ""
                              ? (precioOverrideDraft[r.key] as string)
                              : (typeof r.overridePrecioU === "number" ? fmtUSDInput(r.overridePrecioU) : "");
                          const costoDraft = costoOverrideDraft[r.key] ?? (typeof r.overrideCostoU === "number" ? fmtUSDInput(r.overrideCostoU) : "");
                          const omarLineaUSD = totalPrecioUSD > 0 ? round2((r.precioLinea / totalPrecioUSD) * omarCommissionUSD) : 0;
                          const utilidadNetaLinea = round2(r.precioLinea - r.costoLinea - omarLineaUSD);
                          const utilidadNetaPct = r.precioLinea > 0 ? round2((utilidadNetaLinea / r.precioLinea) * 100) : 0;
                          const precioXM2LineaUSD = r.m2Linea > 0 ? round2(r.precioLinea / r.m2Linea) : 0;
                          return (
                            <tr key={r.key}>
                              <Td>{r.medida}'</Td>
                              <Td>{r.modelo}</Td>
                              <Td>{getTipoDisplay(r.modelo, r.tipo)}</Td>
                              <Td style={{ textAlign: "right" }}>{r.qty}</Td>
                              <Td style={{ textAlign: "right" }}>{r.puertasUnidad > 0 ? r.puertasUnidad.toFixed(0) : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{r.puertasLinea > 0 ? r.puertasLinea.toFixed(0) : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{r.m2Linea ? r.m2Linea.toFixed(2) : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>
                                <input
                                  type="text"
                                  value={costoDraft}
                                  onChange={(e) => setCostoOverrideDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                                  onBlur={() => {
                                    setCostoOverride(r.key, costoOverrideDraft[r.key] ?? "");
                                    setCostoOverrideDraft((d) => ({ ...d, [r.key]: "" }));
                                  }}
                                  placeholder={fmtUSDInput(r.costoUnidad)}
                                  style={{ ...inputCss, width: 120, textAlign: "right", borderColor: r.overrideCostoUValid ? "#ddd" : "#f59e0b" }}
                                />
                              </Td>
                              <Td style={{ textAlign: "right" }}>
                                <input
                                  type="text"
                                  value={precioManual ? precioDraft : fmtUSDInput(r.precioUnidad)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPrecioOverrideDraft((d) => ({ ...d, [r.key]: val }));
                                    if (precioManual) {
                                      setPrecioOverride(r.key, val);
                                    }
                                  }}
                                  onFocus={() => {
                                    if (!precioManual) return;
                                    const current = precioOverrideDraft[r.key];
                                    const hasOverride = typeof r.overridePrecioU === "number";
                                    if (!current && !hasOverride) {
                                      setPrecioOverrideDraft((d) => ({ ...d, [r.key]: fmtUSDInput(r.precioUnidad) }));
                                    }
                                  }}
                                  onBlur={() => {
                                    if (!precioManual) return;
                                    setPrecioOverride(r.key, precioOverrideDraft[r.key] ?? "");
                                    setPrecioOverrideDraft((d) => {
                                      const next = { ...d };
                                      delete next[r.key];
                                      return next;
                                    });
                                  }}
                                  placeholder={fmtUSDInput(r.precioUnidadBase)}
                                  readOnly={!precioManual}
                                  style={{
                                    ...inputCss,
                                    width: 120,
                                    textAlign: "right",
                                    borderColor: r.overridePrecioUValid ? "#ddd" : "#f59e0b",
                                    background: !precioManual ? "#f9fafb" : undefined,
                                  }}
                                />
                              </Td>
                              <Td style={{ textAlign: "right", fontWeight: 700 }}>{fmtUSD(r.costoLinea, false)}</Td>
                              <Td style={{ textAlign: "right", fontWeight: 800 }}>{fmtUSD(r.precioLinea, false)}</Td>
                              <Td style={{ textAlign: "right" }}>{fmtUSD(r.utilidadLinea, false)}</Td>
                              <Td style={{ textAlign: "right" }}>{r.precioLinea > 0 ? `${utilidadNetaPct.toFixed(2)}%` : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{fmtUSD(omarLineaUSD, false)}</Td>
                              <Td style={{ textAlign: "right" }}>{r.m2Linea > 0 ? fmtUSD(precioXM2LineaUSD, false) : "—"}</Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section style={card}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <StatCard title="Costo total (USD)" value={fmtUSD(totalCostoUSD)} />
                  <StatCard title="Utilidad (USD)" value={fmtUSD(totalUtilidadUSD)} sub={`Utilidad neta (Omar): ${fmtUSD(netUtilidadUSD, false)}`} />
                  <StatCard title="Precio de venta (USD)" value={fmtUSD(totalPrecioUSD)} />
                  <StatCard title="Comisión Omar (USD)" value={fmtUSD(omarCommissionUSD)} sub={`${(s?.comisionOmarPct ?? 0).toFixed(2)}% sobre venta`} />
                  <StatCard title="Margen neto promedio" value={`${avgMarginNetPct.toFixed(2)}%`} sub="Después de comisión Omar" />
                  <StatCard title="m2 rentables" value={totalRentableM2Safe ? totalRentableM2Safe.toFixed(2) : "—"} sub={precioXM2USD > 0 ? `Precio/m2: ${fmtUSD(precioXM2USD, false)} · ${tcCobro > 0 ? fmtMXN(precioXM2MXN, false) : "MXN —"}` : "Precio/m2: —"} />
                </div>
              </section>

              <section style={card}>
                <h2 style={h2}>Mix de unidades</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <Th style={{ textAlign: "left" }}>m2 por minibodega</Th>
                          <Th style={{ textAlign: "right" }}>Puertas</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {mixPorM2.map((x) => (
                          <tr key={x.m2}>
                            <Td>{x.m2} m2</Td>
                            <Td style={{ textAlign: "right", fontWeight: 700 }}>{x.puertas.toFixed(0)}</Td>
                          </tr>
                        ))}
                        <tr>
                          <Td style={{ fontWeight: 800 }}>TOTAL PUERTAS</Td>
                          <Td style={{ textAlign: "right", fontWeight: 900 }}>{totalPuertasMix.toFixed(0)}</Td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>Grandes (14m2 a 9m2)</div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>{pctGrandes.toFixed(2)}%</div>
                      <div style={{ fontSize: 12, color: tokens.textMuted }}>{puertasGrandes.toFixed(0)} puertas</div>
                    </div>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>Medianas (7m2 y 6m2)</div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>{pctMedianas.toFixed(2)}%</div>
                      <div style={{ fontSize: 12, color: tokens.textMuted }}>{puertasMedianas.toFixed(0)} puertas</div>
                    </div>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>Chicas (5m2 o menos)</div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>{pctChicas.toFixed(2)}%</div>
                      <div style={{ fontSize: 12, color: tokens.textMuted }}>{puertasChicas.toFixed(0)} puertas</div>
                    </div>
                  </div>
                </div>
              </section>
              <section style={card}>
                <h2 style={h2}>Textos de la cotización (editables)</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  <Field label="Condiciones comerciales">
                    <textarea
                      value={s?.cotCondiciones ?? ""}
                      onChange={(e) => setS({ cotCondiciones: e.target.value })}
                      style={{ ...inputCss, width: "100%", minHeight: 120, fontFamily: "inherit" }}
                    />
                  </Field>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button style={btnSmall} onClick={syncPagosFromCondiciones}>
                      Usar términos de pago en calendario
                    </button>
                  </div>
                  <Field label="Descripción técnica">
                    <textarea
                      value={s?.cotDescripcionTecnica ?? ""}
                      onChange={(e) => setS({ cotDescripcionTecnica: e.target.value })}
                      style={{ ...inputCss, width: "100%", minHeight: 120, fontFamily: "inherit" }}
                    />
                  </Field>
                  <Field label="Características módulos S1-S8">
                    <textarea
                      value={s?.cotCaracteristicasS1S8 ?? ""}
                      onChange={(e) => setS({ cotCaracteristicasS1S8: e.target.value })}
                      style={{ ...inputCss, width: "100%", minHeight: 90, fontFamily: "inherit" }}
                    />
                  </Field>
                  <Field label="Características módulo S9">
                    <textarea
                      value={s?.cotCaracteristicasS9 ?? ""}
                      onChange={(e) => setS({ cotCaracteristicasS9: e.target.value })}
                      style={{ ...inputCss, width: "100%", minHeight: 70, fontFamily: "inherit" }}
                    />
                  </Field>
                </div>
              </section>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button style={btnSmall} onClick={exportCotizacionExcel}>Exportar Excel (.xlsx)</button>
                <button style={btn} onClick={exportCotizacionPdf}>Exportar cotización PDF</button>
              </div>
            </>
          ) : null}

          {step === "pagos" ? (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={!!sSafe.ganado}
                    onChange={(e) => toggleGanado(e.target.checked)}
                  />
                  Proyecto ganado
                </label>
              </div>
              <CalendarioPagosCard s={sSafe} setS={setS} totalVentaUSD={totalPrecioUSD} rows={rows} meta={current?.meta as ProyectoMeta} />
            </>
          ) : null}

          {step === "proyectoGanado" ? (
              <ProyectoGanadoCard
                s={sSafe}
                setS={setS}
                totalVentaUSD={totalPrecioUSD}
                costosDefaults={{
                  productos: valorProductosUSD,
                  fleteMaritimo: fleteMaritimoUSD,
                  fleteTerrestre: fleteTerrestreUSD,
                  seguro: seguroUSD,
                  igi: igiUSD,
                  dta: dtaUSD,
                  agenteAduanal: agenteAduanalUSDTotal,
                  maniobras: maniobrasPuertoUSDTotal,
                  honorarios: pagoAsesorTotalUSD,
                  instalacion: 0,
                  comisionOmar: omarCommissionUSD,
                  ivaImportacion: tcImp > 0 ? round2(ivaAcreditableBaseMXN / tcImp) : 0,
                }}
              />
          ) : null}

          {step === "centroControl" ? (
            <section style={card}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <h2 style={h2}>Centro de control</h2>
                <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                  Proyectos ganados: {proyectosGanados.length}
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                <StatCard title="Por pagar (ganados)" value={fmtMXN(ccPorPagar.mxn)} sub={`USD ${fmtUSD(ccPorPagar.usd)}`} />
                <StatCard title="Por cobrar (ganados)" value={fmtMXN(ccPorRecibir.mxn)} sub={`USD ${fmtUSD(ccPorRecibir.usd)}`} />
                <StatCard title="Utilidad final (ganados)" value={fmtMXN(ccUtilidad.mxn)} sub={`USD ${fmtUSD(ccUtilidad.usd)}`} />
                <StatCard title="Flujo real (ganados)" value={fmtMXN(ccRealMXN)} sub="Recibido - pagado" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Alertas de pagos próximos</div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 700 }}>
                    7 días: {fmtMXN(ccAlertas.sum7)} · 15 días: {fmtMXN(ccAlertas.sum15)} · 30 días: {fmtMXN(ccAlertas.sum30)}
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ maxHeight: 160, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <Th>Fecha</Th>
                          <Th>Proyecto</Th>
                          <Th style={{ textAlign: "right" }}>Monto</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {ccAlertas.upcoming.slice(0, 8).map((u, idx) => (
                          <tr key={`${u.m.id}-${idx}`}>
                            <Td>{u.m.fecha}</Td>
                            <Td>{(u.m as any)._projectName || "Proyecto"}</Td>
                            <Td style={{ textAlign: "right", fontWeight: 700 }}>{fmtMXN(movToMXNFlow(u.m), false)}</Td>
                          </tr>
                        ))}
                        {!ccAlertas.upcoming.length ? (
                          <tr>
                            <Td colSpan={3} style={{ color: tokens.textMuted }}>Sin pagos próximos (30 días)</Td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Estatus de proyectos</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {Object.keys(ccEstatusCounts).length ? Object.entries(ccEstatusCounts).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, border: `1px solid ${tokens.border}`, background: tokens.surfaceAlt }}>
                        {k === "sinEstatus" ? "Sin estatus" : estatusLabel(k as ProyectoStatus)}: <strong>{v}</strong>
                      </span>
                    )) : (
                      <span style={{ color: tokens.textMuted, fontSize: 12 }}>Sin estatus registrados</span>
                    )}
                  </div>
                </div>

                <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Flujo real (MXN)</div>
                  <div style={{ fontSize: 12, color: tokens.textMuted }}>
                    Ingresos: {fmtMXN(ccRealTotals.inMXN)} · Egresos: {fmtMXN(ccRealTotals.outMXN)}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{fmtMXN(ccRealMXN)}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>Proyectos ganados</div>
                <input
                  type="text"
                  value={ccQuery}
                  onChange={(e) => setCcQuery(e.target.value)}
                  placeholder="Buscar proyecto o contacto..."
                  style={{ ...inputCss, width: 260 }}
                />
              </div>

              {!proyectosGanados.length ? (
                <div style={{ color: tokens.textMuted, fontWeight: 600 }}>
                  Aún no hay proyectos ganados. Márcalos en “Proyecto ganado”.
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: "auto", border: `1px solid ${tokens.border}`, borderRadius: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <Th>Proyecto</Th>
                        <Th>Contacto</Th>
                        <Th>Ubicación</Th>
                        <Th>Estatus</Th>
                        <Th>Próximo pago</Th>
                        <Th style={{ textAlign: "right" }}>Monto</Th>
                        <Th style={{ textAlign: "right" }}>Unidades</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {proyectosGanados
                        .filter((p) => {
                          if (!ccQuery.trim()) return true;
                          const q = ccQuery.toLowerCase();
                          return (
                            (p.meta?.nombre || "").toLowerCase().includes(q) ||
                            (p.meta?.contacto || "").toLowerCase().includes(q) ||
                            (p.meta?.ubicacion || "").toLowerCase().includes(q)
                          );
                        })
                        .map((p) => {
                          const unidades = (p.state?.lineas || []).reduce((acc, l) => acc + (l.cantidad || 0), 0);
                          const nextMov = (p.state?.movimientos || [])
                            .filter((m) => m.estado === "porPagar" && m.fecha)
                            .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0];
                          const nextMonto = nextMov ? movToMXNFlow({ ...nextMov, tcPago: nextMov.tcPago || p.state?.tcCobro || p.state?.tipoCambio || 0 }) : 0;
                          return (
                            <tr key={p.id}>
                              <Td style={{ fontWeight: 800 }}>{p.meta?.nombre || "Proyecto"}</Td>
                              <Td>{p.meta?.contacto || "—"}</Td>
                              <Td>{p.meta?.ubicacion || "—"}</Td>
                              <Td>{p.state?.estatusProyecto ? estatusLabel(p.state.estatusProyecto) : "—"}</Td>
                              <Td>{nextMov?.fecha || "—"}</Td>
                              <Td style={{ textAlign: "right", fontWeight: 700 }}>{nextMov ? fmtMXN(nextMonto, false) : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{unidades || 0}</Td>
                              <Td style={{ textAlign: "right" }}>
                                <button
                                  style={btnSmall}
                                  onClick={() => {
                                    setCurrentId(p.id);
                                    setStep("proyectoGanado");
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                >
                                  Abrir
                                </button>
                              </Td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 16 }}>
            <button style={btnGhost} onClick={goPrev} disabled={!canPrev}>
              ← Anterior
            </button>
            <button style={btnPrimary} onClick={goNext} disabled={!canNext}>
              Siguiente →
            </button>
          </div>
        </main>
      </div>

      {step === "cotizacion" ? (
        <StickyTotalsBar
          costoUSD={totalCostoUSD}
          utilidadUSD={totalUtilidadUSD}
          precioUSD={totalPrecioUSD}
          tipoCambio={s?.tipoCambio ?? 0}
        />
      ) : null}

      <div
        ref={chatDockRef}
        onMouseUp={() => {
          const el = chatDockRef.current;
          if (!el || !chatDockOpen) return;
          const viewportW = typeof window !== "undefined" ? window.innerWidth : 1440;
          const viewportH = typeof window !== "undefined" ? window.innerHeight : 900;
          const maxW = Math.max(320, viewportW - 24);
          const maxH = Math.max(240, viewportH - 24);
          setChatDockWidth(Math.max(320, Math.min(maxW, Math.round(el.offsetWidth))));
          setChatDockHeight(Math.max(240, Math.min(maxH, Math.round(el.offsetHeight))));
        }}
        style={{
          position: "fixed",
          left: chatDockSide === "left" ? 14 : undefined,
          right: chatDockSide === "right" ? 14 : undefined,
          bottom: 14,
          zIndex: 60,
          width: chatDockOpen ? Math.max(320, Math.min(chatDockWidth, ((typeof window !== "undefined" ? window.innerWidth : 1440) - 24))) : "auto",
          height: chatDockOpen ? Math.max(240, Math.min(chatDockHeight, ((typeof window !== "undefined" ? window.innerHeight : 900) - 24))) : "auto",
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          background: tokens.surface,
          boxShadow: tokens.shadowMd,
          overflow: "auto",
          resize: chatDockOpen ? "both" : "none",
        }}
      >
        {chatDockOpen ? (
          <div style={{ padding: 12, display: "grid", gap: 8, minHeight: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Asistente de proyecto</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={btnSmall}
                  onClick={() => setChatDockSide((x) => (x === "right" ? "left" : "right"))}
                  title="Mover panel"
                >
                  {chatDockSide === "right" ? "Izquierda" : "Derecha"}
                </button>
                <button style={btnSmall} onClick={() => setChatDockOpen(false)}>Ocultar</button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted, fontWeight: 700 }}>
              Espacio fijo para consultar ChatGPT con contexto de todo el cotizador y proyecto ganado.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                style={chatContextMode === "resumen" ? btnSmall : btnGhost}
                onClick={() => setChatContextMode("resumen")}
              >
                Contexto resumen
              </button>
              <button
                style={chatContextMode === "completo" ? btnSmall : btnGhost}
                onClick={() => setChatContextMode("completo")}
              >
                Contexto completo
              </button>
            </div>
            <textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              placeholder="Escribe tu pregunta (ej. analiza riesgos de flujo y pagos)."
              style={{
                width: "100%",
                minHeight: 86,
                resize: "vertical",
                border: `1px solid ${tokens.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                fontFamily: inter.style.fontFamily,
                fontSize: 12,
              }}
            />
            <div
              ref={chatScrollRef}
              style={{
                minHeight: 120,
                maxHeight: 260,
                overflowY: "auto",
                border: `1px solid ${tokens.border}`,
                borderRadius: 10,
                padding: 8,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              {chatMessages.length === 0 ? (
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Sin mensajes todavía.</div>
              ) : (
                chatMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      justifySelf: m.role === "user" ? "end" : "start",
                      maxWidth: "92%",
                      border: `1px solid ${tokens.border}`,
                      background: m.role === "user" ? "#EEF2FF" : "#F9FAFB",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.35,
                    }}
                  >
                    {m.text}
                  </div>
                ))
              )}
              {chatLoading ? <div style={{ fontSize: 11, color: tokens.textMuted }}>Consultando...</div> : null}
            </div>
            {chatError ? <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700 }}>{chatError}</div> : null}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: tokens.textMuted }}>
              <input
                type="checkbox"
                checked={chatUseWeb}
                onChange={(e) => setChatUseWeb(e.target.checked)}
              />
              Permitir validación web (fletes / referencias externas)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button style={btnGhost} onClick={copyChatContext}>Copiar contexto</button>
              <button style={btnPrimary} onClick={sendChatPrompt} disabled={chatLoading}>
                {chatLoading ? "Consultando..." : "Preguntar"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <button style={btnGhost} onClick={clearChatMessages}>Limpiar chat</button>
              <button style={btnGhost} onClick={openFreightValidationWeb}>Validar flete marítimo (web)</button>
              <button style={btnGhost} onClick={openLandFreightValidationWeb}>Validar flete terrestre (web)</button>
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>
              {chatCopyMsg || `Proyecto activo: ${current?.meta?.nombre || "Sin nombre"}`}
            </div>
          </div>
        ) : (
          <button
            style={{ ...btnPrimary, borderRadius: 0, width: "100%" }}
            onClick={() => setChatDockOpen(true)}
          >
            Abrir asistente
          </button>
        )}
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />
    </div>
  );
}
