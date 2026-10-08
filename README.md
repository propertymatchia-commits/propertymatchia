# PropertyMatch IA

Proyecto académico de automatización inmobiliaria. Un cliente escribe un mail con lo que busca, la IA extrae los criterios y preselecciona propiedades, un asesor las valida en una página web y el cliente recibe la propuesta por mail.

**Demo:** https://propertymatchia.vercel.app

## Cómo funciona
1. El cliente envía un mail de consulta (Gmail).
2. n8n extrae los datos con IA (Gemini) y guarda al cliente en Supabase.
3. La IA preselecciona propiedades disponibles que coincidan.
4. El asesor recibe un link a `validar.html`, donde puede quitar las sugeridas, agregar otras y dejar un comentario.
5. Al aprobar, n8n arma el mail con las propiedades elegidas y responde al cliente en el mismo hilo.

## Tecnologías
n8n · Supabase (PostgreSQL) · Vercel · GitHub · Gmail · Gemini

## Contenido del repo
| Ruta | Qué es |
|---|---|
| `index.html` | Portada. |
| `validar.html` | Página de validación del asesor (`?demo=1` muestra datos de ejemplo). |
| `api/guardar.js` | Función de prueba de la conexión Vercel → Supabase. |
| `n8n/PropertymatchIA.v2.json` | Diseño del workflow de n8n, sin credenciales. |
| `tools/` | Scripts para operar n8n y Supabase con tokens personales. |
| `docs/` | Estado del proyecto, material del dossier y capturas. |
| `CLAUDE.md` | Contexto y setup para trabajar con Claude. |

## Para colaborar
Ver la sección «Cómo editar todo con Claude» de `CLAUDE.md`. Cada integrante usa sus propios tokens; nunca se suben al repositorio.
