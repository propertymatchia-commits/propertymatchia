# Rol administrador (director comercial): especificación de requerimientos

Continúa la numeración del documento de requerimientos del sistema (RF-01 a RF-23).

## 1. Por qué existe este rol
El asesor trabaja una propuesta por vez. Nadie ve el conjunto: qué propiedades tiene cada asesor, quién responde mejor, ni quién da de alta a los asesores y mantiene el catálogo. El administrador cubre eso.

La motivación viene de una observación de la cátedra: dos asesores pueden tener comportamientos muy distintos. Uno manda muchas propuestas; otro manda pocas, pero cierra mejor porque se informa antes de enviar. Para el director comercial esa diferencia es información útil, y el **volumen** solo no la muestra: hace falta el **ratio**.

## 2. Actores
| Actor | Acceso | Qué hace |
|---|---|---|
| **Asesor** | Usuario y contraseña | Revisa y valida las propuestas de sus clientes (RF-16 a RF-19). Sin cambios. |
| **Administrador** | Usuario y contraseña | Gestiona asesores y catálogo, y ve el rendimiento (esta especificación). |
| **Cliente** | Ninguno (actor externo) | Envía el mail de consulta y recibe la propuesta. No inicia sesión. |
| **Sistema (n8n)** | Clave de servicio | Ejecuta el flujo automático. No es una persona. |

## 3. Requerimientos funcionales

### 3.1 Acceso
**RF-24 — Autenticación.** El sistema deberá permitir ingresar con usuario y contraseña, eligiendo el tipo de acceso (asesor o administrador). Un usuario solo puede entrar por el tipo de acceso que le corresponde.

**RF-25 — Contraseñas.** Las contraseñas se almacenarán de forma no reversible. El administrador podrá definir la contraseña de un asesor y cambiar la propia. Un asesor sin contraseña definida no podrá ingresar.

### 3.2 Catálogo de propiedades
**RF-26 — Alta y baja de propiedades.** El administrador podrá cargar propiedades nuevas y eliminarlas, con confirmación previa.

**RF-27 — Disponibilidad.** El administrador podrá marcar una propiedad como disponible o no disponible. Las no disponibles no se proponen a clientes.

### 3.3 Asignación de propiedades
**RF-28 — Asignación obligatoria.** Toda propiedad deberá tener un asesor asignado. El sistema no permitirá guardar una propiedad sin asesor.

**RF-29 — Asignación por cercanía.** Si al cargar una propiedad no se elige asesor, el sistema la asignará al asesor cuya zona esté más cerca de la ubicación de la propiedad. Si la zona no se reconoce, la asignará al asesor con menos propiedades.

**RF-30 — Reasignación.** El administrador podrá cambiar el asesor de una propiedad, o traspasar toda la cartera de un asesor a otro. No se podrá dejar una propiedad sin asesor.

### 3.4 Gestión de asesores
**RF-31 — Alta de asesores.** El administrador podrá dar de alta un asesor con nombre, email, teléfono, zona, usuario y contraseña inicial. El usuario deberá ser único.

**RF-32 — Baja de asesores.** El administrador podrá dar de baja un asesor. Es una baja lógica: se conserva su historial. Sus propiedades y sus clientes con propuesta pendiente pasarán automáticamente a los demás asesores, según cercanía. No se podrá dar de baja al único asesor activo.

**RF-33 — Reactivación.** El administrador podrá reactivar un asesor dado de baja.

**RF-34 — Cartera por asesor.** El administrador podrá ver, para cada asesor, cuántas propiedades y cuántos clientes tiene asignados.

### 3.5 Rendimiento
**RF-35 — Indicadores por asesor.** El administrador podrá ver, en una página de dashboard aparte del panel de gestión, los siguientes indicadores por asesor:

| Indicador | Definición |
|---|---|
| Clientes | Cantidad de clientes asignados. |
| Pendientes / Aprobadas / Rechazadas | Propuestas según su estado. |
| **Tasa de aprobación** | Aprobadas ÷ (aprobadas + rechazadas). Mide quién cierra mejor, no quién manda más. |
| **Aciertos de la IA** | De las propiedades que sugirió la IA, cuántas el asesor dejó en la propuesta. |
| Agregadas por el asesor | Propiedades que el asesor sumó por su cuenta. |

**RF-36 — Gráficos y filtros.** El dashboard presentará los indicadores y la composición del catálogo y de la demanda en gráficos, con una fila única de filtros que acotan todo lo que se muestra: período (por fecha de ingreso del cliente), asesor, operación, tipo de propiedad y zona. Cada gráfico tendrá una tabla equivalente.

## 4. Restricciones y decisiones de diseño
- **Tres tablas.** Se mantiene el modelo exigido (`clientes`, `propiedades`, `asesores`). El rol, el usuario y la contraseña se agregan como columnas de `asesores`; la asignación de propiedades, como columna `asesor_id` de `propiedades`. La tabla intermedia `propuestas` ya estaba definida para registrar qué propiedades se propusieron y cuáles se aprobaron.
- **Datos que ya produce el flujo.** El rendimiento se calcula con `clientes.estado` y `propuestas`, que el flujo de n8n ya está diseñado para escribir. El rol no agrega pasos nuevos al flujo.
- **Seguridad en el servidor.** Todas las operaciones del administrador pasan por una función de servidor con sesión firmada y vencimiento. El navegador nunca recibe la clave secreta de la base de datos.

## 5. Fuera de alcance (Parte B)
**Autorizador final.** Que el administrador autorice o bloquee pasos del asesor antes de que el correo salga al cliente. Se deja afuera a propósito: obligaría a interrumpir cada paso del asesor y a sumar más lógica de espera y aprobación en n8n, y no es necesario para cumplir el alcance de la Parte A. Queda planteado como evolución natural: un segundo nivel de validación para propuestas sensibles (por ejemplo, de monto alto).

## 6. Criterios de aceptación (resumen)
| Requisito | Cómo se verifica |
|---|---|
| RF-24, RF-25 | Un usuario con contraseña incorrecta, o por el tipo de acceso equivocado, no entra. Un asesor sin contraseña no entra. |
| RF-28, RF-29 | Cargar una propiedad sin asesor la deja asignada al más cercano. La base rechaza insertar una sin asesor. |
| RF-30 | Reasignar y traspasar actualizan los contadores del panel; no se acepta un destino vacío. |
| RF-31 a RF-33 | Un asesor nuevo puede entrar; al darlo de baja ya no entra y sus propiedades quedan con otro asesor; al reactivarlo vuelve a entrar. |
| RF-35, RF-36 | Con propuestas resueltas, las tasas coinciden con el conteo manual, y al aplicar un filtro cambian todos los gráficos y las fichas de forma coherente. |
