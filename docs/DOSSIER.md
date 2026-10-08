# PropertyMatch IA: material para el dossier

Borrador con lo verificado hasta ahora. Cada afirmación sale de algo que se comprobó en el proyecto real.

## 1. Qué es
Bot de IA para una inmobiliaria. Un cliente escribe un mail con lo que busca (por ejemplo: «quiero comprar una casa en Carrasco de 3 dormitorios, presupuesto 500000 USD»); la IA extrae los criterios, preselecciona propiedades de la base de datos, un asesor revisa y ajusta la propuesta en una página web, y el cliente recibe la respuesta por mail.

## 2. Arquitectura
| Componente | Rol |
|---|---|
| Gmail | Recepción de la consulta y envío de la respuesta. |
| n8n | Orquestación del flujo (17 nodos): extracción con IA, guardado del cliente, búsqueda, espera de validación y respuesta. |
| Gemini (LLM) | Extrae los datos del mail y elige las propiedades que coinciden. |
| Supabase (PostgreSQL) | Tablas `propiedades`, `clientes` y `asesores`. |
| Vercel | Publica la portada y la página de validación del asesor (`validar.html`). |
| GitHub | Repositorio y control de versiones. |

Diagrama: ver la imagen de arquitectura del enunciado. El flujo implementado sigue los 10 pasos del diagrama.

## 3. Riesgos y seguridad
**Qué se hizo bien**
- Row Level Security activo en las 4 tablas (`propiedades`, `clientes`, `asesores`, `prueba`).
- La clave pública (anon) solo tiene políticas de lectura sobre `propiedades` y `clientes`. Se comprobó que con esa clave: **no** se puede insertar (HTTP 401), **no** se puede borrar y **no** se ve `asesores` ni `prueba`.
- La clave secreta (service_role) solo se usa del lado del servidor (n8n y variables de entorno de Vercel). Nunca está en el código del front ni en el repositorio.
- `.env*` y la configuración local con tokens están en `.gitignore`.
- Cada integrante usa tokens personales; no se comparten claves.
- Un humano valida siempre antes de que el cliente reciba nada: la IA propone, el asesor decide.
- El workflow no envía nada al cliente sin aprobación explícita (nodo de espera + condición `aprobar`).
- El mail al cliente se arma con los datos exactos de la base, no con texto generado por la IA, para que no invente precios ni links.

**Riesgos conocidos y aceptados (MVP académico)**
- La tabla `clientes` es legible con la clave pública, porque la página de validación necesita mostrar el nombre y los criterios del cliente. En producción se reemplazaría por una función de servidor o una vista con solo las columnas necesarias, y un enlace firmado con vencimiento.
- El enlace de validación no tiene autenticación: quien lo tenga puede aprobar. Mitigación futura: token de un solo uso y vencimiento.
- La clave pública está visible en el código de la página. Es lo esperado para esa clave y es inofensiva con las políticas actuales, pero depende de que RLS siga bien configurado.
- La IA puede equivocarse al interpretar un mail ambiguo. Se mitiga con la validación humana.
- Los datos de propiedades de la base son de ejemplo.

**Incidentes de la sesión (honestidad sobre el proceso)**
- Durante el trabajo se compartieron por chat un token de acceso a n8n y uno de Supabase. Quedó asentado que deben revocarse y regenerarse al terminar. Regla del equipo: los tokens se guardan solo en variables de entorno.
- La instancia de n8n del plan gratuito se agotó y hubo que migrar a otra cuenta.

## 4. Uso de la IA en el desarrollo
- La IA (Claude) se usó para: diseñar el flujo de n8n, escribir y corregir el código de `validar.html` y la portada, revisar la consistencia entre n8n y las tablas, cargar datos de ejemplo y verificar permisos en Supabase.
- Todo cambio quedó en el repositorio con su commit; el equipo revisa y aprueba lo que se publica.
- El equipo configuró las cuentas y las credenciales; la IA no tuvo acceso a contraseñas.

## 5. Pruebas realizadas
| Prueba | Resultado |
|---|---|
| Lectura pública de propiedades y clientes | Correcta. |
| Escritura con la clave pública | Rechazada (401), como corresponde. |
| Página de validación con datos de ejemplo | Correcta. |
| Página de validación contra la base real | Carga las propiedades disponibles. |
| Quitar una sugerida y agregar otra | El contador, las etiquetas y el envío reflejan el cambio. |
| Mail de extremo a extremo (Gmail → n8n → asesor → cliente) | **Pendiente**: requiere n8n activo. |

## 6. Capturas
En `docs/capturas/`:
- `01-portada.png`: portada del sistema.
- `02-validacion-demo.png`: página del asesor con datos de ejemplo.
- `03-validacion-datos-reales.png`: página del asesor leyendo la base real.
