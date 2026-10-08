# PropertyMatch IA

Proyecto académico (obligatorio de incorporación digital): bot de IA para una inmobiliaria.
Llega un mail de un cliente con requisitos (ej: "quiero comprar una casa en Carrasco de 3 dormitorios, presupuesto 500000 USD"),
la IA extrae los criterios, busca propiedades que coincidan en Supabase, un asesor valida la propuesta en una página web
y n8n le manda el mail final al cliente.

## Stack
- **GitHub**: repo `propertymatchia-commits/propertymatchia` (este).
- **Vercel**: hosting de los HTML y de las funciones serverless en `api/`.
- **Supabase**: base de datos. Tablas: `propiedades`, `clientes` (y `prueba`, solo del test inicial).
- **n8n**: orquestación (Gmail trigger, Gemini para extraer/elegir, Wait + webhook para la validación).

## Archivos del repo
- `index.html`: portada del proyecto, con un botón al demo de la validación.
- `api/guardar.js`: función serverless de prueba (ya no la usa ninguna página). Inserta en la tabla `prueba`. Usa `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY` (variables de entorno en Vercel).
- `validar.html`: página de validación del asesor (ver abajo).
- `docs/ESTADO.md`: qué está hecho, qué hay que cambiar, qué falta.
- `docs/DOSSIER.md` y `docs/capturas/`: material listo para el dossier (riesgos y seguridad, uso de IA, pruebas, capturas).

## Flujo completo
1. Gmail trigger recibe el mail del cliente.
2. IA (Gemini) extrae: tipo de operación, tipo de propiedad, ubicación, dormitorios, presupuesto, otros requisitos.
3. Se guarda el cliente en `clientes` (RF-07 del documento).
4. Se leen todas las `propiedades` de Supabase y se juntan (Aggregate).
5. IA elige matches (`{"ids": [...]}`), con algo de flexibilidad (hasta 10% sobre presupuesto, un dormitorio más), nunca cambiando el tipo de operación, solo `disponible = true`.
6. n8n arma un link a `validar.html?cliente=ID&props=1,2,3&resume=URL_DEL_WAIT` y se lo manda por mail al asesor.
7. El nodo Wait espera. El asesor abre la página, desmarca lo que no va, agrega otras propiedades disponibles y aprueba o rechaza.
8. La página hace POST a la `resume` URL de n8n con `accion`, `cliente_id`, `propiedades_aprobadas` (ej "4,7"), `propiedades_agregadas` (las que sumó el asesor) y `comentario`.
9. Si `accion == aprobar`, n8n arma el HTML del mail con los datos exactos de Supabase y responde al cliente en el mismo hilo (Gmail Reply).

## Reglas del proyecto
- `validar.html` usa **solo la anon key** de Supabase. Nunca la `service_role` / secret key en archivos del front.
- `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `validar.html` ya están completos con la clave pública (anon). Es seguro que estén en el front; la service_role / secret key jamás.
- `validar.html?demo=1` muestra datos de ejemplo (casa en Carrasco), sirve para capturas de la entrega.
- Los nombres de columnas deben coincidir entre n8n y la tabla: `tipo_operacion`, `ubicacion_buscada`, `presupuesto_max`, `dormitorios`, `tipo_propiedad`, `otros_requisitos`. Valores de operación: `venta` / `alquiler` (si el cliente dice "comprar" es `venta`).
- No commitear claves ni `.env*`.
- No hacer commit ni push sin que el usuario lo pida.

## Idioma
Todo en español rioplatense (UI, comentarios, docs).

## Datos reales del proyecto
- **Producción (Vercel):** https://propertymatchia.vercel.app (proyecto `propertymatchia`, equipo `property-match-ia`).
- **Supabase:** proyecto `PropertyMatchIA`, ref `xnzfyklewwmibncryrei`, URL `https://xnzfyklewwmibncryrei.supabase.co`, región us-east-1.
  - `propiedades`: id, titulo, tipo_propiedad, tipo_operacion, precio, moneda, ubicacion, dormitorios, banos, superficie, garage, mascotas, disponible, descripcion, url.
  - `clientes`: id (UUID), nombre, email, telefono, tipo_operacion, tipo_propiedad, ubicacion_buscada, presupuesto_max, moneda, dormitorios, banos, otros_requisitos, asesor_id (FK a asesores), thread_id (text, threadId de Gmail), estado (`Pendiente`/`Aprobado`/`Rechazado`, con CHECK), created_at. Las propiedades de cada cliente van en `propuestas`.
  - `asesores`: id, nombre, email, telefono, zona, activo.
  - `propuestas` (tabla intermedia): id, cliente_id (FK a clientes), propiedad_id (FK a propiedades), origen (`ia`/`asesor`), aprobada (boolean), created_at. Única por (cliente_id, propiedad_id). RLS activo y sin policies: solo accede n8n con la service_role.
  - RLS activo; policies de lectura para `anon` en `propiedades` y `clientes`.
- **n8n:** la instancia `propertymatchia.app.n8n.cloud` ya no existe (plan agotado; el equipo usa otra cuenta). Workflow `PropertymatchIA`, 17 nodos. Para retomar: importar `n8n/PropertymatchIA.v2.json`, reconectar credenciales y actualizar la URL en `tools/n8n.cjs` y `.mcp.json.example`. `n8n/PropertymatchIA.v2.json` es una copia del diseño (sin credenciales); `n8n/nodos-propuestas.json` son los 8 nodos que escriben en `propuestas` y en `clientes.estado` (para pegar en el lienzo de n8n).
- El Gmail trigger filtra `-from:me in:inbox` para que el flujo no se procese a sí mismo.
- El mail del asesor es provisorio (`propertymatchia@gmail.com`) en los nodos "Mail al asesor" y "Aviso sin matches".

## Cómo editar todo con Claude (setup de cada persona)
Cada integrante usa **sus propios tokens**. Nunca se suben al repo ni se pegan en un chat.

1. **GitHub:** que la dueña del repo te agregue en Settings → Collaborators. Después: `gh auth login` y `gh repo clone propertymatchia-commits/propertymatchia`.
2. **Vercel:** que te inviten al equipo `property-match-ia`. Después: `npm i -g vercel`, `vercel login`, `vercel link`.
3. **Supabase:** que te inviten al proyecto (Project Settings → Team). Creá un token en https://supabase.com/dashboard/account/tokens y guardalo:
   `setx SUPABASE_ACCESS_TOKEN "sbp_..."`
4. **n8n:** que te inviten como usuaria (Settings → Users). En Settings → Instance-level MCP activá MCP, hacé Connect y copiá tu token:
   `setx N8N_MCP_TOKEN "..."`
5. Copiá `.mcp.json.example` como `.mcp.json` (está en el `.gitignore`) y reabrí la app para que cargue las variables nuevas.
6. Abrí esta carpeta en Claude Code. Lee este archivo y `docs/ESTADO.md`.

Sin reiniciar la app también se puede trabajar con los scripts de `tools/` (necesitan Node):
- `node tools/n8n.cjs get_instance_context` · `node tools/n8n.cjs get_workflow_details '{"workflowId":"X4eNosiuZRg7wHL0","detailLevel":"full"}'` · `node tools/n8n.cjs update_workflow @ops.json`
- `node tools/supabase-sql.cjs "select count(*) from propiedades"`

Notas de Windows: si PowerShell bloquea scripts, `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. El `package.json` usa módulos ES, por eso los scripts son `.cjs`.
