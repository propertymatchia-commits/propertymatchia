// API del login y del panel de administración.
// Corre en el servidor de Vercel: es el único lugar que usa la clave secreta de Supabase.
//
// Variables de entorno (ya existen en Vercel, no hace falta agregar nada):
//   NEXT_PUBLIC_SUPABASE_URL   URL del proyecto de Supabase
//   SUPABASE_SECRET_KEY        clave secreta (service_role). También firma los tokens de sesión.
//
// Las credenciales (usuario y contraseña) de asesores y administrador viven en la tabla `asesores`,
// con la contraseña guardada como hash (scrypt), nunca en texto plano.
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { asesorMasCercano } from './_zonas.js';

const TTL_ADMIN = 2 * 60 * 60 * 1000; // 2 horas
const TTL_ASESOR = 8 * 60 * 60 * 1000; // 8 horas
const OPERACIONES = ['venta', 'alquiler'];
const MONEDAS = ['USD', 'UYU'];
const TIPOS = ['casa', 'apartamento', 'terreno'];

const supabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

/* ---------- Contraseñas ---------- */
export function hashear(password) {
  const sal = randomBytes(16).toString('hex');
  return `scrypt1$${sal}$${scryptSync(password, sal, 32).toString('hex')}`;
}
const HASH_FALSO = hashear('relleno-para-igualar-tiempos');
export function verificar(password, guardado) {
  const [version, sal, hash] = String(guardado || HASH_FALSO).split('$');
  if (version !== 'scrypt1' || !sal || !hash) return false;
  const calculado = scryptSync(String(password), sal, 32);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calculado.length && timingSafeEqual(calculado, esperado) && guardado !== undefined && guardado !== null;
}

/* ---------- Token de sesión del administrador ---------- */
const firmar = datos => createHmac('sha256', process.env.SUPABASE_SECRET_KEY).update(`admin.${datos}`).digest('hex');
const crearToken = (exp, adminId) => `${exp}.${adminId}.${firmar(`${exp}.${adminId}`)}`;
function leerToken(req) {
  const h = req.headers.authorization || '';
  const [exp, adminId, firma] = (h.startsWith('Bearer ') ? h.slice(7) : '').split('.');
  if (!exp || !adminId || !firma || !(Number(exp) > Date.now())) return null;
  const esperada = Buffer.from(firmar(`${exp}.${adminId}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return { adminId: Number(adminId) };
}

/* ---------- Validación de entradas ---------- */
const texto = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const numero = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const entero = v => (v === null || v === '' || v === undefined ? null : Number(v));
const esId = v => Number.isInteger(v) && v > 0;
const claveValida = p => typeof p === 'string' && p.length >= 8 && p.length <= 100;

function validarPropiedad(d) {
  const p = {
    titulo: texto(d.titulo, 140),
    tipo_propiedad: texto(d.tipo_propiedad, 40).toLowerCase(),
    tipo_operacion: texto(d.tipo_operacion, 20).toLowerCase(),
    precio: numero(d.precio, NaN),
    moneda: texto(d.moneda, 3).toUpperCase() || 'USD',
    ubicacion: texto(d.ubicacion, 80),
    dormitorios: Math.round(numero(d.dormitorios)),
    banos: numero(d.banos),
    superficie: numero(d.superficie) > 0 ? numero(d.superficie) : null, // la base exige > 0 o vacío
    garage: d.garage === true,
    mascotas: d.mascotas === true,
    disponible: d.disponible !== false,
    descripcion: texto(d.descripcion, 600) || null,
    url: texto(d.url, 300) || null
  };
  if (!p.titulo) return { error: 'Falta el título.' };
  if (!TIPOS.includes(p.tipo_propiedad)) return { error: 'Tipo de propiedad inválido.' };
  if (!OPERACIONES.includes(p.tipo_operacion)) return { error: 'La operación debe ser venta o alquiler.' };
  if (!(p.precio > 0)) return { error: 'El precio tiene que ser mayor a cero.' };
  if (!MONEDAS.includes(p.moneda)) return { error: 'Moneda inválida.' };
  if (!p.ubicacion) return { error: 'Falta la ubicación.' };
  if (p.url && !/^https?:\/\//i.test(p.url)) return { error: 'El enlace debe empezar con http:// o https://.' };
  return { valor: p };
}

const ok = (res, datos = {}) => res.status(200).json({ ok: true, ...datos });
const fallo = (res, codigo, error) => res.status(codigo).json({ ok: false, error });

/* Asesores que pueden recibir propiedades (el administrador no cuenta) */
async function asesoresActivos(db) {
  const { data, error } = await db.from('asesores').select('id,nombre,zona,activo').eq('rol', 'asesor').eq('activo', true);
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fallo(res, 405, 'Método no permitido');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return fallo(res, 500, 'El servidor no tiene configurada la conexión a Supabase.');
  }

  const { action, ...d } = req.body || {};
  const db = supabase();

  try {
    /* ---- Pública: iniciar sesión (asesor o administrador) ---- */
    if (action === 'login') {
      const usuario = texto(d.usuario, 80).toLowerCase();
      const rol = d.rol === 'administrador' ? 'administrador' : 'asesor';
      const password = typeof d.password === 'string' ? d.password : '';
      if (!usuario || !password) return fallo(res, 400, 'Ingresá usuario y contraseña.');

      const { data, error } = await db.from('asesores')
        .select('id,nombre,zona,usuario,password_hash,rol,activo').ilike('usuario', usuario.replace(/[%_\\]/g, '\\$&')).limit(1);
      if (error) throw error;
      const u = (data || [])[0];
      const correcto = verificar(password, u?.password_hash) && !!u && u.activo && u.rol === rol;
      if (!correcto) {
        await new Promise(r => setTimeout(r, 700)); // frena los intentos repetidos
        return fallo(res, 401, 'Usuario o contraseña incorrectos.');
      }
      if (rol === 'administrador') {
        const exp = Date.now() + TTL_ADMIN;
        return ok(res, { nombre: u.nombre, token: crearToken(exp, u.id), exp });
      }
      return ok(res, { asesor: { id: u.id, nombre: u.nombre, zona: u.zona, usuario: u.usuario }, exp: Date.now() + TTL_ASESOR });
    }

    /* ---- Todo lo demás exige ser administrador ---- */
    const sesion = leerToken(req);
    if (!sesion) return fallo(res, 401, 'Sesión vencida. Volvé a ingresar.');

    if (action === 'listar') {
      const [a, p, c] = await Promise.all([
        db.from('asesores').select('id,nombre,usuario,email,telefono,zona,activo,password_hash').eq('rol', 'asesor').order('id'),
        db.from('propiedades')
          .select('id,titulo,tipo_propiedad,tipo_operacion,precio,moneda,ubicacion,dormitorios,disponible,asesor_id').order('id'),
        db.from('clientes').select('asesor_id')
      ]);
      for (const r of [a, p, c]) if (r.error) throw r.error;
      const props = p.data || [];
      const asesores = (a.data || []).map(({ password_hash, ...x }) => ({
        ...x,
        tiene_clave: !!password_hash,
        propiedades_asignadas: props.filter(y => y.asesor_id === x.id).length,
        clientes_asignados: (c.data || []).filter(y => y.asesor_id === x.id).length
      }));
      return ok(res, { asesores, propiedades: props });
    }

    if (action === 'crear_propiedad') {
      const v = validarPropiedad(d);
      if (v.error) return fallo(res, 400, v.error);
      const activos = await asesoresActivos(db);
      let asesor = entero(d.asesor_id);
      let motivo = 'elegido por el administrador';
      if (asesor === null) {
        // Toda propiedad tiene que tener asesor: si no se eligió uno, va al de la zona más cercana
        const { data: cargas } = await db.from('propiedades').select('asesor_id');
        const carga = new Map();
        for (const x of cargas || []) carga.set(x.asesor_id, (carga.get(x.asesor_id) ?? 0) + 1);
        const sug = asesorMasCercano(v.valor.ubicacion, activos, carga);
        if (!sug) return fallo(res, 409, 'No hay asesores activos para asignar la propiedad.');
        asesor = sug.id;
        motivo = sug.motivo;
      } else if (!activos.some(a => a.id === asesor)) {
        return fallo(res, 400, 'Asesor inválido o inactivo.');
      }
      const { data, error } = await db.from('propiedades').insert({ ...v.valor, asesor_id: asesor }).select().single();
      if (error) throw error;
      return ok(res, { propiedad: data, asignacion: motivo });
    }

    if (action === 'eliminar_propiedad') {
      const id = Number(d.id);
      if (!esId(id)) return fallo(res, 400, 'Propiedad inválida.');
      const { error } = await db.from('propiedades').delete().eq('id', id);
      if (error) throw error;
      return ok(res);
    }

    if (action === 'reasignar') {
      const id = Number(d.id), asesor = entero(d.asesor_id);
      if (!esId(id) || !esId(asesor)) return fallo(res, 400, 'Elegí un asesor para la propiedad.');
      if (!(await asesoresActivos(db)).some(a => a.id === asesor)) return fallo(res, 400, 'Asesor inválido o inactivo.');
      const { error } = await db.from('propiedades').update({ asesor_id: asesor }).eq('id', id);
      if (error) throw error;
      return ok(res);
    }

    if (action === 'traspasar') {
      const de = Number(d.de), a = entero(d.a);
      if (!esId(de) || !esId(a)) return fallo(res, 400, 'Elegí el asesor de destino.');
      if (de === a) return fallo(res, 400, 'Elegí un asesor distinto.');
      if (!(await asesoresActivos(db)).some(x => x.id === a)) return fallo(res, 400, 'Asesor inválido o inactivo.');
      const { data, error } = await db.from('propiedades').update({ asesor_id: a }).eq('asesor_id', de).select('id');
      if (error) throw error;
      return ok(res, { movidas: (data || []).length });
    }

    if (action === 'disponibilidad') {
      const id = Number(d.id);
      if (!esId(id)) return fallo(res, 400, 'Propiedad inválida.');
      const { error } = await db.from('propiedades').update({ disponible: d.disponible === true }).eq('id', id);
      if (error) throw error;
      return ok(res);
    }

    if (action === 'dashboard') {
      // Datos en bruto: los filtros y los gráficos se calculan en el navegador, así todo coincide.
      const [a, p, c, pr] = await Promise.all([
        db.from('asesores').select('id,nombre,zona,activo').eq('rol', 'asesor').order('id'),
        db.from('propiedades')
          .select('id,tipo_propiedad,tipo_operacion,precio,moneda,ubicacion,dormitorios,disponible,asesor_id').order('id'),
        db.from('clientes').select('id,asesor_id,estado,tipo_operacion,tipo_propiedad,ubicacion_buscada,presupuesto_max,created_at'),
        db.from('propuestas').select('cliente_id,propiedad_id,origen,aprobada,created_at')
      ]);
      for (const r of [a, p, c, pr]) if (r.error) throw r.error;
      return ok(res, { asesores: a.data || [], propiedades: p.data || [], clientes: c.data || [], propuestas: pr.data || [] });
    }

    if (action === 'rendimiento') {
      // Métricas por asesor, calculadas con lo que ya guarda el flujo: clientes.estado y propuestas.
      const [a, c, pr] = await Promise.all([
        db.from('asesores').select('id,nombre,activo').eq('rol', 'asesor').order('id'),
        db.from('clientes').select('id,asesor_id,estado'),
        db.from('propuestas').select('cliente_id,origen,aprobada')
      ]);
      for (const r of [a, c, pr]) if (r.error) throw r.error;
      const duenoDe = new Map((c.data || []).map(x => [x.id, x.asesor_id]));
      const filas = (a.data || []).map(as => {
        const cli = (c.data || []).filter(x => x.asesor_id === as.id);
        const prop = (pr.data || []).filter(x => duenoDe.get(x.cliente_id) === as.id);
        const aprobados = cli.filter(x => x.estado === 'Aprobado').length;
        const rechazados = cli.filter(x => x.estado === 'Rechazado').length;
        const deIA = prop.filter(x => x.origen === 'ia');
        const pct = (n, t) => (t > 0 ? Math.round((n / t) * 100) : null);
        return {
          id: as.id, nombre: as.nombre, activo: as.activo,
          clientes: cli.length,
          pendientes: cli.filter(x => x.estado === 'Pendiente').length,
          aprobados, rechazados,
          tasa_aprobacion: pct(aprobados, aprobados + rechazados),
          sugeridas_ia: deIA.length,
          sugeridas_aprobadas: deIA.filter(x => x.aprobada).length,
          aciertos_ia: pct(deIA.filter(x => x.aprobada).length, deIA.length),
          agregadas_por_asesor: prop.filter(x => x.origen === 'asesor').length
        };
      });
      return ok(res, { asesores: filas });
    }

    if (action === 'crear_asesor') {
      const nombre = texto(d.nombre, 100), email = texto(d.email, 160).toLowerCase();
      const usuario = texto(d.usuario, 40).toLowerCase(), zona = texto(d.zona, 100);
      if (!nombre) return fallo(res, 400, 'Falta el nombre.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fallo(res, 400, 'El email no es válido.');
      if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return fallo(res, 400, 'El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.');
      if (!zona) return fallo(res, 400, 'Falta la zona: se usa para asignarle propiedades por cercanía.');
      if (!claveValida(d.password)) return fallo(res, 400, 'La contraseña debe tener entre 8 y 100 caracteres.');
      const { data: mx, error: e0 } = await db.from('asesores').select('id').order('id', { ascending: false }).limit(1);
      if (e0) throw e0;
      const { data, error } = await db.from('asesores').insert({
        id: ((mx || [])[0]?.id ?? 0) + 1, nombre, email, telefono: texto(d.telefono, 40) || null, zona,
        usuario, password_hash: hashear(d.password), rol: 'asesor', activo: true
      }).select('id,nombre,usuario,zona').single();
      if (error) {
        if (error.code === '23505') return fallo(res, 409, 'Ya existe un asesor con ese usuario.');
        throw error;
      }
      return ok(res, { asesor: data });
    }

    if (action === 'baja_asesor') {
      const id = Number(d.id);
      if (!esId(id)) return fallo(res, 400, 'Asesor inválido.');
      const { data: todos, error: e0 } = await db.from('asesores').select('id,nombre,zona,activo').eq('rol', 'asesor');
      if (e0) throw e0;
      if (!(todos || []).some(a => a.id === id)) return fallo(res, 404, 'No existe ese asesor.');
      const restantes = (todos || []).filter(a => a.activo && a.id !== id);
      if (!restantes.length) return fallo(res, 409, 'No se puede dar de baja al único asesor activo.');
      const { error: e1 } = await db.from('asesores').update({ activo: false }).eq('id', id);
      if (e1) throw e1;

      // Nada queda sin dueño: sus propiedades y sus clientes pendientes pasan al asesor más cercano.
      const { data: cargas } = await db.from('propiedades').select('asesor_id');
      const carga = new Map();
      for (const x of cargas || []) carga.set(x.asesor_id, (carga.get(x.asesor_id) ?? 0) + 1);
      const { data: props } = await db.from('propiedades').select('id,ubicacion').eq('asesor_id', id);
      for (const p of props || []) {
        const sug = asesorMasCercano(p.ubicacion, restantes, carga);
        carga.set(sug.id, (carga.get(sug.id) ?? 0) + 1);
        const { error } = await db.from('propiedades').update({ asesor_id: sug.id }).eq('id', p.id);
        if (error) throw error;
      }
      const { data: clis } = await db.from('clientes').select('id,ubicacion_buscada').eq('asesor_id', id).eq('estado', 'Pendiente');
      for (const c of clis || []) {
        const sug = asesorMasCercano(c.ubicacion_buscada, restantes, new Map());
        const { error } = await db.from('clientes').update({ asesor_id: sug.id }).eq('id', c.id);
        if (error) throw error;
      }
      return ok(res, { propiedades_movidas: (props || []).length, clientes_movidos: (clis || []).length });
    }

    if (action === 'reactivar_asesor') {
      const id = Number(d.id);
      if (!esId(id)) return fallo(res, 400, 'Asesor inválido.');
      const { data, error } = await db.from('asesores').update({ activo: true }).eq('id', id).eq('rol', 'asesor').select('id');
      if (error) throw error;
      if (!(data || []).length) return fallo(res, 404, 'No existe ese asesor.');
      return ok(res);
    }

    if (action === 'definir_password') {
      const id = Number(d.id);
      if (!esId(id)) return fallo(res, 400, 'Asesor inválido.');
      if (!claveValida(d.password)) return fallo(res, 400, 'La contraseña debe tener entre 8 y 100 caracteres.');
      const { data, error } = await db.from('asesores').update({ password_hash: hashear(d.password) })
        .eq('id', id).eq('rol', 'asesor').select('id');
      if (error) throw error;
      if (!(data || []).length) return fallo(res, 404, 'No existe ese asesor.');
      return ok(res);
    }

    if (action === 'cambiar_mi_password') {
      if (!claveValida(d.nueva)) return fallo(res, 400, 'La contraseña nueva debe tener entre 8 y 100 caracteres.');
      const { data, error } = await db.from('asesores').select('password_hash').eq('id', sesion.adminId).eq('rol', 'administrador').single();
      if (error) throw error;
      if (!verificar(String(d.actual ?? ''), data?.password_hash)) {
        await new Promise(r => setTimeout(r, 700));
        return fallo(res, 401, 'La contraseña actual no es correcta.');
      }
      const { error: e2 } = await db.from('asesores').update({ password_hash: hashear(d.nueva) }).eq('id', sesion.adminId);
      if (e2) throw e2;
      return ok(res);
    }

    return fallo(res, 400, 'Acción desconocida.');
  } catch (e) {
    console.error('admin api:', action, e?.message || e);
    return fallo(res, 500, 'No se pudo completar la operación.');
  }
}
