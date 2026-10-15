// Cercanía entre barrios de Montevideo, para asignar cada propiedad al asesor de la zona más próxima.
// El prefijo "_" hace que Vercel no lo exponga como endpoint: es solo un módulo interno.
//
// Las coordenadas son aproximadas (centro de cada barrio). Alcanzan para decidir qué zona de asesor
// queda más cerca; no son para mostrar en un mapa.

const BARRIOS = {
  'ciudad vieja': [-34.9070, -56.2040],
  'centro': [-34.9055, -56.1900],
  'aguada': [-34.8900, -56.1850],
  'cordon': [-34.9040, -56.1760],
  'palermo': [-34.9110, -56.1750],
  'tres cruces': [-34.8940, -56.1680],
  'parque rodo': [-34.9157, -56.1672],
  'punta carretas': [-34.9236, -56.1595],
  'pocitos': [-34.9120, -56.1480],
  'parque batlle': [-34.8950, -56.1550],
  'la blanqueada': [-34.8870, -56.1500],
  'union': [-34.8800, -56.1400],
  'buceo': [-34.8950, -56.1300],
  'malvin': [-34.9020, -56.1150],
  'malvin norte': [-34.8800, -56.1100],
  'punta gorda': [-34.9150, -56.1000],
  'carrasco': [-34.8850, -56.0500],
  'carrasco norte': [-34.8700, -56.0500],
  'prado': [-34.8570, -56.2000],
  'reducto': [-34.8700, -56.1800],
  'cerro': [-34.8930, -56.2450]
};

const normalizar = s => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Coordenadas del barrio, o null si no lo conocemos. Acepta «Carrasco Sur», «Pocitos Nuevo», etc. */
export function coordenadas(zona) {
  const z = normalizar(zona);
  if (!z) return null;
  if (BARRIOS[z]) return BARRIOS[z];
  // El nombre más largo contenido en el texto gana («malvin norte» antes que «malvin»)
  const clave = Object.keys(BARRIOS)
    .filter(k => z.includes(k) || k.includes(z))
    .sort((a, b) => b.length - a.length)[0];
  return clave ? BARRIOS[clave] : null;
}

/** Distancia aproximada en km (equirrectangular, suficiente para una ciudad). */
function km([la1, lo1], [la2, lo2]) {
  const x = (lo2 - lo1) * Math.cos(((la1 + la2) / 2) * Math.PI / 180);
  const y = la2 - la1;
  return Math.hypot(x, y) * 111.32;
}

/** Barrios que cubre un asesor, a partir de su campo zona («Malvín y Buceo» → [malvín, buceo]). */
const zonasDe = asesor => String(asesor.zona ?? '').split(/\s+y\s+|,|\/|;/).map(s => s.trim()).filter(Boolean);

/**
 * Elige el asesor cuya zona queda más cerca de `ubicacion`.
 * @param {string} ubicacion barrio de la propiedad
 * @param {{id:number, zona:string, activo?:boolean}[]} asesores asesores candidatos
 * @param {Map<number,number>} [carga] cuántas propiedades tiene ya cada asesor (desempata y es el plan B)
 * @returns {{id:number, motivo:string, km?:number} | null}
 */
export function asesorMasCercano(ubicacion, asesores, carga = new Map()) {
  const candidatos = asesores.filter(a => a.activo !== false);
  if (!candidatos.length) return null;
  const cargaDe = a => carga.get(a.id) ?? 0;
  const menosCargado = () => candidatos.slice().sort((a, b) => cargaDe(a) - cargaDe(b) || a.id - b.id)[0];

  const origen = coordenadas(ubicacion);
  if (!origen) return { id: menosCargado().id, motivo: 'zona desconocida: se asignó al asesor con menos propiedades' };

  let mejor = null;
  for (const a of candidatos) {
    for (const zona of zonasDe(a)) {
      const c = coordenadas(zona);
      if (!c) continue;
      const d = km(origen, c);
      if (!mejor || d < mejor.km - 0.05 || (Math.abs(d - mejor.km) <= 0.05 && cargaDe(a) < cargaDe(mejor.asesor))) {
        mejor = { asesor: a, km: d, zona };
      }
    }
  }
  if (!mejor) return { id: menosCargado().id, motivo: 'ningún asesor tiene zona conocida: se asignó al que tiene menos propiedades' };
  return { id: mejor.asesor.id, km: Math.round(mejor.km * 10) / 10, motivo: `zona más cercana: ${mejor.zona}` };
}
