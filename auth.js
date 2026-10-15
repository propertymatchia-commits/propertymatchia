/* =========================================================
   PropertyMatch · sesión, llamadas a la API y modo demo.
   Lo usan index.html (login), admin.html y validar.html.

   La sesión vive en sessionStorage: se borra al cerrar la pestaña.
   Las acciones del administrador NO dependen de esta sesión para ser
   seguras: el servidor (api/admin.js) exige un token firmado.
   ========================================================= */
const PM = (() => {
  const KEY = "pm_sesion";
  const DEMO_KEY = "pm_demo_db_v3";

  const get = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY));
      if (s && (!s.exp || s.exp > Date.now())) return s;
    } catch (_) { /* sin sesión */ }
    return null;
  };
  const set = s => sessionStorage.setItem(KEY, JSON.stringify(s));
  const clear = () => { sessionStorage.removeItem(KEY); sessionStorage.removeItem(DEMO_KEY); };
  const home = rol => (rol === "administrador" ? "admin.html" : "validar.html");

  /* Pide una sesión del rol indicado; si no hay, manda al login y vuelve después. */
  function require(rol) {
    const s = get();
    if (!s) {
      const destino = location.pathname.split("/").pop() + location.search;
      location.replace("index.html?next=" + encodeURIComponent(destino));
      return null;
    }
    if (s.rol !== rol) { location.replace(home(s.rol)); return null; }
    return s;
  }

  /* Solo se acepta volver a páginas propias (evita redirecciones a otros sitios). */
  const destinoSeguro = next => (/^(validar|admin)\.html(\?.*)?$/.test(next || "") ? next : null);

  /* ---------- Datos de ejemplo del modo demo ---------- */
  function demoDb() {
    try {
      const guardada = JSON.parse(sessionStorage.getItem(DEMO_KEY));
      if (guardada) return guardada;
    } catch (_) { /* usa la semilla */ }
    const p = (id, titulo, tipo, op, precio, zona, dorm, disp, asesor) => ({
      id, titulo, tipo_propiedad: tipo, tipo_operacion: op, precio, moneda: "USD",
      ubicacion: zona, dormitorios: dorm, disponible: disp, asesor_id: asesor
    });
    const db = {
      sig: 100,
      asesores: [
        { id: 1, nombre: "Sofía Fernández", usuario: "sofia.fernandez", email: "sofia.fernandez@elartefacto.com", telefono: "099 111 222", zona: "Malvín y Buceo", activo: true, tiene_clave: true },
        { id: 2, nombre: "Ana Pereira", usuario: "ana.pereira", email: "ana.pereira@elartefacto.com", telefono: "099 333 444", zona: "Pocitos y Punta Carretas", activo: true, tiene_clave: true },
        { id: 3, nombre: "Martín Rodríguez", usuario: "martin.rodriguez", email: "martin.rodriguez@elartefacto.com", telefono: "099 555 666", zona: "Centro y Cordón", activo: true, tiene_clave: false }
      ],
      clientes: [1, 1, 2, 3, 3, 3],
      rendimiento: {
        1: { clientes: 14, pendientes: 2, aprobados: 6, rechazados: 6, sug: 38, sugApr: 15, agr: 4 },
        2: { clientes: 5, pendientes: 0, aprobados: 4, rechazados: 1, sug: 13, sugApr: 11, agr: 1 },
        3: { clientes: 8, pendientes: 1, aprobados: 4, rechazados: 3, sug: 20, sugApr: 9, agr: 6 }
      },
      propiedades: [
        p(2, "Casa 3 dormitorios en Malvín", "casa", "alquiler", 2200, "Malvín", 3, true, 1),
        p(19, "Casa 3 dormitorios en Malvín", "casa", "venta", 280000, "Malvín", 3, true, 1),
        p(23, "Apartamento 2 dormitorios en Buceo", "apartamento", "venta", 165000, "Buceo", 2, true, 1),
        p(4, "Apartamento 2 dormitorios en Pocitos", "apartamento", "alquiler", 1500, "Pocitos", 2, true, 2),
        p(15, "Apartamento 3 dormitorios en Pocitos", "apartamento", "venta", 295000, "Pocitos", 3, true, 2),
        p(17, "Apartamento 2 dormitorios en Punta Carretas", "apartamento", "alquiler", 1400, "Punta Carretas", 2, true, 2),
        p(5, "Apartamento 1 dormitorio en Cordón", "apartamento", "alquiler", 1050, "Cordón", 1, true, 3),
        p(24, "Apartamento 1 dormitorio en el Centro", "apartamento", "alquiler", 700, "Centro", 1, false, 3),
        p(8, "Casa con jardín a dos cuadras de la rambla", "casa", "venta", 465000, "Carrasco", 3, true, 1),
        p(10, "Casa de 4 dormitorios con piscina", "casa", "venta", 495000, "Carrasco", 4, true, 1),
        p(25, "Casa 4 dormitorios en Punta Gorda", "casa", "venta", 650000, "Punta Gorda", 4, true, 1)
      ]
    };
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(db));
    return db;
  }
  const guardarDemo = db => sessionStorage.setItem(DEMO_KEY, JSON.stringify(db));

  /* Responde igual que api/admin.js, pero sobre los datos de ejemplo. */
  function demoApi(action, d) {
    const db = demoDb();
    const err = error => ({ ok: false, error });
    if (action === "login") {
      const u = String(d.usuario || "").trim().toLowerCase();
      if (d.rol === "administrador") {
        return u === "propertymatchia" && d.password === "demo"
          ? { ok: true, nombre: "Administrador", token: "demo", exp: Date.now() + 2 * 3600e3 }
          : err("Usuario o contraseña incorrectos.");
      }
      const a = db.asesores.find(x => x.activo && x.usuario === u);
      return a && a.tiene_clave && d.password === "demo"
        ? { ok: true, asesor: { id: a.id, nombre: a.nombre, zona: a.zona, usuario: a.usuario }, exp: Date.now() + 8 * 3600e3 }
        : err("Usuario o contraseña incorrectos.");
    }
    if (action === "listar") {
      return { ok: true,
        asesores: db.asesores.map(a => ({ ...a,
          propiedades_asignadas: db.propiedades.filter(p => p.asesor_id === a.id).length,
          clientes_asignados: db.clientes.filter(c => c === a.id).length })),
        propiedades: db.propiedades };
    }
    if (action === "crear_propiedad") {
      let asesor = d.asesor_id;
      let motivo = "elegido por el administrador";
      if (asesor == null) {
        const zona = String(d.ubicacion || "").toLowerCase();
        const cerca = db.asesores.find(a => a.activo && String(a.zona || "").toLowerCase().split(" y ").some(z => zona.includes(z) || z.includes(zona)));
        const carga = a => db.propiedades.filter(p => p.asesor_id === a.id).length;
        const elegido = cerca || db.asesores.slice().sort((a, b) => carga(a) - carga(b))[0];
        asesor = elegido.id;
        motivo = cerca ? "zona más cercana: " + cerca.zona : "se asignó al asesor con menos propiedades";
      }
      const p = { ...d, id: ++db.sig, asesor_id: asesor };
      db.propiedades.push(p); guardarDemo(db);
      return { ok: true, propiedad: p, asignacion: motivo };
    }
    if (action === "eliminar_propiedad") {
      db.propiedades = db.propiedades.filter(p => p.id !== Number(d.id)); guardarDemo(db);
      return { ok: true };
    }
    if (action === "reasignar") {
      if (d.asesor_id == null) return err("Elegí un asesor para la propiedad.");
      const p = db.propiedades.find(x => x.id === Number(d.id));
      if (p) p.asesor_id = Number(d.asesor_id);
      guardarDemo(db); return { ok: true };
    }
    if (action === "traspasar") {
      if (d.a == null) return err("Elegí el asesor de destino.");
      if (Number(d.de) === Number(d.a)) return err("Elegí un asesor distinto.");
      let n = 0;
      for (const p of db.propiedades) if (p.asesor_id === Number(d.de)) { p.asesor_id = Number(d.a); n++; }
      guardarDemo(db); return { ok: true, movidas: n };
    }
    if (action === "disponibilidad") {
      const p = db.propiedades.find(x => x.id === Number(d.id));
      if (p) p.disponible = d.disponible === true;
      guardarDemo(db); return { ok: true };
    }
    if (action === "rendimiento") {
      const pct = (n, t) => (t > 0 ? Math.round((n / t) * 100) : null);
      return { ok: true, asesores: db.asesores.map(a => {
        const r = db.rendimiento[a.id] || { clientes: 0, pendientes: 0, aprobados: 0, rechazados: 0, sug: 0, sugApr: 0, agr: 0 };
        return { id: a.id, nombre: a.nombre, activo: a.activo, clientes: r.clientes, pendientes: r.pendientes,
          aprobados: r.aprobados, rechazados: r.rechazados, tasa_aprobacion: pct(r.aprobados, r.aprobados + r.rechazados),
          sugeridas_ia: r.sug, sugeridas_aprobadas: r.sugApr, aciertos_ia: pct(r.sugApr, r.sug), agregadas_por_asesor: r.agr };
      }) };
    }
    if (action === "crear_asesor") {
      const usuario = String(d.usuario || "").trim().toLowerCase();
      if (!String(d.nombre || "").trim()) return err("Falta el nombre.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || ""))) return err("El email no es válido.");
      if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return err("El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.");
      if (!String(d.zona || "").trim()) return err("Falta la zona: se usa para asignarle propiedades por cercanía.");
      if (String(d.password || "").length < 8) return err("La contraseña debe tener entre 8 y 100 caracteres.");
      if (db.asesores.some(a => a.usuario === usuario)) return err("Ya existe un asesor con ese usuario.");
      const id = Math.max(...db.asesores.map(a => a.id)) + 1;
      db.asesores.push({ id, nombre: d.nombre.trim(), usuario, email: d.email, telefono: d.telefono || "", zona: d.zona.trim(), activo: true, tiene_clave: true });
      guardarDemo(db);
      return { ok: true, asesor: { id, nombre: d.nombre.trim(), usuario, zona: d.zona.trim() } };
    }
    if (action === "baja_asesor") {
      const a = db.asesores.find(x => x.id === Number(d.id));
      if (!a) return err("No existe ese asesor.");
      const restantes = db.asesores.filter(x => x.activo && x.id !== a.id);
      if (!restantes.length) return err("No se puede dar de baja al único asesor activo.");
      const carga = x => db.propiedades.filter(p => p.asesor_id === x.id).length;
      let movidas = 0;
      for (const p of db.propiedades.filter(x => x.asesor_id === a.id)) {
        const zona = String(p.ubicacion).toLowerCase();
        const cerca = restantes.find(r => String(r.zona || "").toLowerCase().split(" y ").some(z => zona.includes(z) || z.includes(zona)));
        p.asesor_id = (cerca || restantes.slice().sort((x, y) => carga(x) - carga(y))[0]).id;
        movidas++;
      }
      a.activo = false; guardarDemo(db);
      return { ok: true, propiedades_movidas: movidas, clientes_movidos: 0 };
    }
    if (action === "reactivar_asesor") {
      const a = db.asesores.find(x => x.id === Number(d.id));
      if (!a) return err("No existe ese asesor.");
      a.activo = true; guardarDemo(db); return { ok: true };
    }
    if (action === "definir_password") {
      if (String(d.password || "").length < 8) return err("La contraseña debe tener entre 8 y 100 caracteres.");
      const a = db.asesores.find(x => x.id === Number(d.id));
      if (!a) return err("No existe ese asesor.");
      a.tiene_clave = true; guardarDemo(db); return { ok: true };
    }
    if (action === "cambiar_mi_password") {
      if (d.actual !== "demo") return err("La contraseña actual no es correcta.");
      if (String(d.nueva || "").length < 8) return err("La contraseña nueva debe tener entre 8 y 100 caracteres.");
      return { ok: true };
    }
    return err("Acción desconocida.");
  }

  /* ---------- Llamada a la API (o a los datos de ejemplo) ---------- */
  async function api(action, datos = {}, opciones = {}) {
    const s = get();
    const demo = opciones.demo ?? !!(s && s.demo);
    if (demo) { await new Promise(r => setTimeout(r, 120)); return demoApi(action, datos); }
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s && s.token ? { Authorization: "Bearer " + s.token } : {}) },
        body: JSON.stringify({ action, ...datos })
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && s && s.rol === "administrador") { clear(); location.replace("index.html"); }
      return json.ok !== undefined ? json : { ok: false, error: "Respuesta inesperada del servidor." };
    } catch (_) {
      return { ok: false, error: "No se pudo conectar con el servidor." };
    }
  }

  return { get, set, clear, home, require, destinoSeguro, api };
})();
