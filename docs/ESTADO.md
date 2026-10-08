# Estado del proyecto PropertyMatch IA

Actualizado: 2026-10-01. Lo que figura como "hecho" sale del repo y de la conversación con Claude chat; Supabase, Vercel y n8n todavía no se verificaron directamente.

## Hecho
- Repo en GitHub (`propertymatchia-commits/propertymatchia`) conectado a Vercel.
- Prueba de conexión Vercel → Supabase: `index.html` + `api/guardar.js` (inserta en tabla `prueba`).
- `package.json` con `@supabase/supabase-js`.
- `validar.html`: página de validación del asesor (modo demo con `?demo=1`, carga desde Supabase, aprobar/rechazar por POST a n8n).
- Flujo de n8n parcial (de la compañera): Gmail trigger → extracción con IA → lectura de propiedades.
- Cuentas creadas: GitHub, n8n, Supabase, Vercel.

## Por cambiar
- [ ] `validar.html`: completar `SUPABASE_URL` y `SUPABASE_ANON_KEY` (hoy son placeholders y la página queda en modo demo).
- [ ] n8n, trigger de Gmail: apagar *Simplify*. `$json.snippet` trae solo ~200 caracteres. Usar `email_text = {{ $json.text }}` y `sender_email = {{ $json.from.value[0].address }}`.
- [ ] n8n, extractor: los campos no coinciden con la tabla. Cambiar `operacion` → `tipo_operacion`, `zona` → `ubicacion_buscada`, `precio_maximo` → `presupuesto_max`. Descripción de operación: "venta o alquiler. Si el cliente dice comprar, es venta".
- [ ] n8n, "Toma datos Supabase": activar *Return All*.
- [ ] Verificar que los valores de `tipo_operacion` coincidan exactamente entre `clientes` y `propiedades`.
- [ ] `api/guardar.js` y la tabla `prueba` son del test inicial; borrarlos o reemplazarlos cuando ya no sirvan.
- [ ] `index.html` sigue siendo el "hola mundo". Decidir si queda de portada o se reemplaza.

## Falta
- [ ] Policies RLS para que `validar.html` lea con la anon key:
  ```sql
  alter table propiedades enable row level security;
  alter table clientes enable row level security;
  create policy "lectura propiedades" on propiedades for select to anon using (true);
  create policy "lectura clientes" on clientes for select to anon using (true);
  ```
- [ ] Nodos de n8n por agregar, en orden:
  1. Supabase – Guardar cliente (Create en `clientes`), entre "Extrae info a JSON" y "Toma datos Supabase" (RF-07).
  2. Aggregate (All Item Data, campo `propiedades`).
  3. Basic LLM Chain "IA elige matches" (Gemini), responde `{"ids":[...]}`.
  4. Code "Arma link" (usa `$execution.resumeUrl`).
  5. IF por si `ids` viene vacío (avisar al asesor).
  6. Gmail: mail al asesor con el link.
  7. Wait (Resume: On Webhook Call, POST, Respond: Immediately).
  8. IF `accion == aprobar`.
  9. Code "Arma mail cliente" (HTML con datos exactos de Supabase).
  10. Gmail Reply con Message ID del mail original.
- [ ] Reemplazar `TU-PROYECTO.vercel.app` en el Code de n8n por la URL real de Vercel.
- [ ] Probar el flujo completo con un mail real. Primer error probable: CORS en el Wait; si la ejecución sigue en n8n, funciona igual.
- [ ] Dossier: anotar en Riesgos y Seguridad que clientes queda legible con la anon key (aceptable para un MVP académico).
- [ ] Capturas para la entrega usando `validar.html?demo=1`.
- [ ] Exportar los workflows de n8n a `n8n/*.json` para versionarlos.

## Actualización (2026-10-02)
- Hecho: `validar.html` ya apunta al proyecto real de Supabase (`xnzfyklewwmibncryrei`) con la anon key; sin modo demo automático (solo con `?demo=1`).
- Hecho: workflow `PropertymatchIA` (id `X4eNosiuZRg7wHL0`) editado directo en n8n: 17 nodos, inactivo, credenciales de Gmail y Supabase conectadas.
- Verificado contra la base real: `propiedades`, `clientes` y `asesores` existen con las columnas del diagrama. `clientes` NO tiene `moneda`.
- Pendiente: policies RLS (SQL arriba) y confirmar si las tablas tienen datos (con la anon key hoy devuelven lista vacía: o están vacías o RLS bloquea).
- Pendiente: reemplazar el mail provisorio del asesor (`propertymatchia@gmail.com`) en los nodos "Mail al asesor" y "Aviso sin matches".
- Seguridad: revocar el token de MCP de n8n que se compartió en el chat.

## Actualización (2026-10-08)
- Hecho: `validar.html` permite quitar las sugeridas por la IA y agregar otras disponibles; envía `propiedades_aprobadas` y `propiedades_agregadas`.
- Hecho: portada nueva en `index.html` (reemplaza el "hola mundo").
- Hecho: 3 casas de Carrasco cargadas en Supabase (ids 8, 9 y 10); hay 8 propiedades, 7 disponibles.
- Hecho: se verificó que la clave pública lee propiedades y clientes, y no puede insertar ni borrar; RLS activo en las 4 tablas.
- Hecho: `docs/DOSSIER.md` (riesgos, seguridad, uso de IA, pruebas) y capturas en `docs/capturas/`.
- Bloqueado: n8n. La instancia original ya no existe (plan agotado) y el equipo pasó a otra cuenta. Falta importar `n8n/PropertymatchIA.v2.json`, reconectar credenciales y probar de punta a punta.
- Pendiente en n8n (cuando se retome): que el asesor reciba siempre el link aunque la IA no encuentre matches (sacar el IF «¿Hay matches?»), mail real del asesor, y probar el flujo completo.
- Pendiente de seguridad: revocar y regenerar los tokens de Supabase y n8n que se compartieron por chat.
