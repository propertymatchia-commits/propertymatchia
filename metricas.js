// Cálculos del dashboard: el único lugar donde se calculan sus números.
// Lo usa el servidor (api/admin.js, acción "dashboard"): el navegador recibe los números ya calculados.
// Excepción: en el modo demo no hay servidor, así que auth.js usa esta misma función con datos de ejemplo.

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const pct = (n, t) => (t > 0 ? Math.round((n / t) * 100) : null);
const DIA = 86400e3;
const SEMANA = 7 * DIA;
const OFFSET_UY = -3 * 60 * 60 * 1000; // las semanas se cortan en hora de Uruguay (UTC-3)

/* Lunes a las 00:00 (hora de Uruguay) de la semana de una fecha, en milisegundos */
function inicioSemana(fecha) {
  const local = new Date(new Date(fecha).getTime() + OFFSET_UY);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.getTime() - OFFSET_UY;
}

/* Filtros que manda la página: se aceptan solo valores esperables */
export function leerFiltros(d = {}) {
  const dias = [0, 7, 30, 90].includes(Number(d.dias)) ? Number(d.dias) : 0;
  const t = v => String(v ?? '').trim().slice(0, 80);
  return { dias, asesor: t(d.asesor), op: t(d.op), tipo: t(d.tipo), zona: norm(t(d.zona)) };
}

/* D = datos en bruto de la base · F = filtros · devuelve todo lo que muestra el dashboard */
export function calcularDashboard(D, F, ahora = Date.now()) {
  const asesoresTodos = D.asesores || [];
  const propiedades = D.propiedades || [];
  const clientes = D.clientes || [];
  const propuestas = D.propuestas || [];

  /* ---- Opciones de los filtros (salen de todos los datos, no de los filtrados) ---- */
  const tipos = [...new Set([...propiedades.map(p => p.tipo_propiedad), ...clientes.map(c => c.tipo_propiedad)].filter(Boolean))].sort();
  const zonasMap = new Map();
  for (const z of [...propiedades.map(p => p.ubicacion), ...clientes.map(c => c.ubicacion_buscada)]) {
    if (z && !zonasMap.has(norm(z))) zonasMap.set(norm(z), z);
  }
  const opciones = {
    asesores: asesoresTodos.filter(a => a.activo).map(a => [String(a.id), a.nombre]),
    tipos: tipos.map(t => [t, t.charAt(0).toUpperCase() + t.slice(1)]),
    zonas: [...zonasMap].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  };

  /* ---- Aplicar filtros ---- */
  const desde = F.dias ? ahora - F.dias * DIA : 0;
  const props = propiedades.filter(p =>
    (!F.asesor || String(p.asesor_id) === F.asesor) &&
    (!F.op || p.tipo_operacion === F.op) &&
    (!F.tipo || p.tipo_propiedad === F.tipo) &&
    (!F.zona || norm(p.ubicacion) === F.zona));
  const clis = clientes.filter(c =>
    (!F.asesor || String(c.asesor_id) === F.asesor) &&
    (!F.op || c.tipo_operacion === F.op) &&
    (!F.tipo || c.tipo_propiedad === F.tipo) &&
    (!F.zona || norm(c.ubicacion_buscada) === F.zona) &&
    (!desde || new Date(c.created_at).getTime() >= desde));
  const idsClientes = new Set(clis.map(c => c.id));
  const prop = propuestas.filter(x => idsClientes.has(x.cliente_id));
  const asesores = asesoresTodos.filter(a => a.activo && (!F.asesor || String(a.id) === F.asesor));
  const contar = (lista, estado) => lista.filter(c => c.estado === estado).length;

  /* ---- Fichas ---- */
  const aprobadas = contar(clis, 'Aprobado');
  const resueltas = aprobadas + contar(clis, 'Rechazado');
  const sugeridasIA = prop.filter(x => x.origen === 'ia');
  const mantenidas = sugeridasIA.filter(x => x.aprobada).length;
  const kpis = {
    propiedades: props.length,
    disponibles: props.filter(p => p.disponible).length,
    clientes: clis.length,
    pendientes: contar(clis, 'Pendiente'),
    aprobadas, resueltas, tasa: pct(aprobadas, resueltas),
    sugeridas: sugeridasIA.length, mantenidas, aciertos: pct(mantenidas, sugeridasIA.length)
  };

  /* ---- 1) Propiedades por asesor ---- */
  const porAsesor = asesores.map(a => ({ etiqueta: a.nombre, valor: props.filter(p => p.asesor_id === a.id).length }))
    .filter(f => f.valor > 0 || !F.asesor).sort((a, b) => b.valor - a.valor);

  /* ---- 2) Propiedades por zona ---- */
  const zonas = new Map();
  for (const p of props) zonas.set(p.ubicacion, (zonas.get(p.ubicacion) || 0) + 1);
  const porZona = [...zonas].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor);

  /* ---- 3) Estado de las propuestas por asesor ---- */
  const total = f => Object.values(f.valores).reduce((s, n) => s + n, 0);
  const estados = asesores.map(a => {
    const cs = clis.filter(x => x.asesor_id === a.id);
    return { etiqueta: a.nombre, valores: { Aprobado: contar(cs, 'Aprobado'), Rechazado: contar(cs, 'Rechazado'), Pendiente: contar(cs, 'Pendiente') } };
  }).filter(f => total(f) > 0).sort((a, b) => total(b) - total(a));

  /* ---- 4) Tasa de aprobación y aciertos de la IA por asesor ---- */
  const ratios = asesores.map(a => {
    const cs = clis.filter(x => x.asesor_id === a.id);
    const ids = new Set(cs.map(x => x.id));
    const ap = contar(cs, 'Aprobado'), re = contar(cs, 'Rechazado');
    const sug = prop.filter(x => ids.has(x.cliente_id) && x.origen === 'ia');
    const ok = sug.filter(x => x.aprobada).length;
    return {
      etiqueta: a.nombre,
      tasa: pct(ap, ap + re), tasa_det: ap + re ? `${ap} de ${ap + re}` : '',
      aciertos: pct(ok, sug.length), aciertos_det: sug.length ? `${ok} de ${sug.length}` : ''
    };
  }).filter(f => f.tasa !== null || f.aciertos !== null).sort((a, b) => (b.tasa ?? -1) - (a.tasa ?? -1));

  /* ---- 5) Origen de las propiedades propuestas ---- */
  const origen = asesores.map(a => {
    const ids = new Set(clis.filter(x => x.asesor_id === a.id).map(x => x.id));
    const ps = prop.filter(x => ids.has(x.cliente_id));
    return { etiqueta: a.nombre, valores: { ia: ps.filter(x => x.origen === 'ia').length, asesor: ps.filter(x => x.origen === 'asesor').length } };
  }).filter(f => total(f) > 0).sort((a, b) => total(b) - total(a));

  /* ---- 6) Qué buscan los clientes ---- */
  const zc = new Map();
  for (const x of clis) zc.set(x.ubicacion_buscada, (zc.get(x.ubicacion_buscada) || 0) + 1);
  const operacion = {
    venta: clis.filter(x => x.tipo_operacion === 'venta').length,
    alquiler: clis.filter(x => x.tipo_operacion === 'alquiler').length,
    topZonas: [...zc].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([etiqueta, valor]) => ({ etiqueta, valor }))
  };

  /* ---- 7) Clientes recibidos por semana (semanas sin clientes cuentan como 0) ---- */
  const semanas = [];
  const fechas = clis.map(x => x.created_at).filter(Boolean);
  if (fechas.length) {
    const cuenta = new Map();
    for (const f of fechas) { const k = inicioSemana(f); cuenta.set(k, (cuenta.get(k) || 0) + 1); }
    const ini = Math.min(...cuenta.keys());
    const fin = Math.max(inicioSemana(ahora), ini);
    for (let t = ini; t <= fin; t += SEMANA) semanas.push({ t, n: cuenta.get(t) || 0 });
  }

  return { opciones, kpis, porAsesor, porZona, estados, ratios, origen, operacion, semanas };
}
