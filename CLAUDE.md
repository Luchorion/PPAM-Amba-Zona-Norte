# Exhibidor Boulogne

App web para teléfono que usa **un solo coordinador** para organizar los turnos del exhibidor de publicaciones (carrito de los testigos de Jehová) en la **estación Boulogne**, todos los sábados.

La versión actual es **un único archivo**, `index.html` (HTML + CSS + JS vanilla, sin build). Se hizo como artifact de Claude, por eso no usa frameworks ni `alert()`/`confirm()`/`prompt()`: todas las confirmaciones están dentro de la página.

---

## Cómo trabaja el usuario (leer primero)

- Escribe en español rioplatense (usa "vos"). La interfaz va en el mismo registro.
- Quiere respuestas **breves**. Prefiere preguntar él antes que recibir explicaciones largas.
- No hay que felicitarlo. Si está equivocado, hay que decírselo.
- Usa la app **desde el celular**: todo es mobile-first.
- **No agregues funciones que no pidió.** Antes de sumar algo, proponelo y esperá el sí. Varias veces rechazó cosas que se agregaron por iniciativa propia (ver "Descartado" más abajo).
- Quiere probar en local e ir iterando antes de desplegar.

---

## Reglas del dominio

- **Días:** solo sábados.
- **Turnos:** 5 por sábado, de 2 horas: 7–9, 9–11, 11–13, 13–15 y 15–17.
- **Cupos:** máximo 4 personas por turno. Mínimo 2.
- **Turno de 2 personas:** es válido solo si son del **mismo género** o son **cónyuges**. Con 3 o 4 personas no hay restricción.
- **Patrón mensual:** la organización se divide en 1er, 2do, 3er, 4to y 5to sábado del mes. Para una fecha, `semana = Math.ceil(dia / 7)`. El 5to sábado existe solo algunos meses.
- **Fijos:** cada (semana, turno) tiene personas fijas, normalmente 2. Se repiten todos los meses.
- **Reemplazos:** son por **fecha concreta**, nunca en el patrón. Cubren a un fijo que no viene o completan cupos.
- **Suspensión:** es **por turno** y el único motivo es **mal clima**.

---

## Pantallas (barra de navegación inferior)

### 1. Sábados (pantalla de inicio)
- Tira horizontal con los próximos sábados (el anterior y 12 más). Cada fecha muestra el mes, el día, qué sábado del mes es y un punto de estado: verde si está todo cubierto, amarillo si falta gente, rojo si hay un error de regla, y círculo vacío si está todo suspendido.
- Deslizar a los costados cambia de sábado; "Hoy" vuelve al próximo sábado. Bajar desde arriba actualiza los datos.
- Resumen del día, por ejemplo: "2 de 4 turnos cubiertos · 1 suspendido · Sin ausencias".
- Una tarjeta por turno: la hora va en una columna a la izquierda, con el estado y un medidor de 4 cupos.
  - Los turnos cubiertos se ven compactos (solo los nombres); al tocarlos se abren. Un turno donde se está trabajando queda abierto.
  - Cada fijo tiene un botón **"No viene"** (gris), que lo tacha solo esa fecha y se puede deshacer. Ya no lleva etiqueta "Fijo".
  - Los reemplazos del día tienen la etiqueta "Reemplazo" y una × para quitarlos.
  - **"+ Agregar reemplazo · N libres"** abre el buscador.
  - **"Suspender por mal clima"** está en el menú ⋯ de cada turno. El turno suspendido se ve punteado y tiene dos botones:
    - **"Avisar cancelación"** muestra un recuadro con el mensaje y los botones Cerrar y **Copiar**. Copia al portapapeles: **no abre WhatsApp**.
    - **"Reactivar turno"** lo vuelve a habilitar sin perder las personas cargadas.

### 2. Fijos
- Selector de 1er a 5to sábado.
- Solo muestra fijos: sin fecha, sin reemplazos y sin etiqueta Fijo/Reemplazo.
- "+ Agregar fijo" abre el buscador y × quita a la persona.

### 3. Hermanos
- Lista con buscador.
- Al tocar a alguien se abre su **ficha**, con:
  - género, privilegio, precursorado y experiencia (como chips);
  - celular, mail, congregación, cantidad de reemplazos en los últimos 3 meses e idiomas;
  - cónyuge (se elige con el buscador);
  - los turnos fijos donde está.
- Desde la ficha se edita o se borra (con confirmación dentro de la página). Formulario:
  - **Nombre** (único campo obligatorio), apellido y género.
  - Celular y mail.
  - **Congregación:** se elige de una lista, con opción de agregar una nueva.
  - Privilegio: Ninguno, Siervo ministerial o Anciano.
  - Precursorado: No, Regular, Especial o Superintendente de circuito.
  - Experiencia: Principiante, Común o Mentor.
  - **Idiomas:** son tags que se activan y desactivan, con opción de agregar uno nuevo.

### 4. Resumen
- **Cobertura**: % de turnos cubiertos del mes actual y del anterior. Verde desde 90%, amarillo desde 70%, rojo por debajo.
- **Para resolver · próximas 4 semanas:** una fila por sábado con chips de los horarios que fallan. Al tocarla va a esa fecha.
- **Más ausencias** en los últimos 3 meses. Al tocar un nombre se abre la ficha.
- **Turnos que más quedaron sin cubrir.** Solo cuenta sábados ya pasados. Al tocar uno va a Fijos.
- Todo cuenta desde `state.inicio`, la fecha en que se empezó a usar la app.

### Buscador (hoja inferior, el mismo en todos lados)
- Busca por cualquier dato: nombre, apellido, congregación, celular, mail, idiomas, privilegio o precursorado. No distingue tildes y exige que coincidan todas las palabras.
- Avisa si la persona "Ya tiene otro turno ese día/sábado".
- Al elegir **reemplazo**, la lista se ordena por quién **menos reemplazos hizo en los últimos 3 meses** y muestra ese número.
- Al elegir **cónyuge**, solo aparecen personas del género opuesto.

---

## Modelo de datos

Hoy todo se guarda en `localStorage`, clave `"exhibidor-boulogne-v1"`, como un solo objeto `state`:

```js
state = {
  pubs:   [Publicador],
  asigs:  [Asignacion],          // patrón fijo
  exc:    [Excepcion],           // cambios por fecha
  susp:   { "AAAA-MM-DD|turno": true },   // turnos suspendidos por mal clima
  inicio: "AAAA-MM-DD",          // desde cuándo hay datos (para el Resumen)
  congs:  ["Boulogne", ...],     // lista de congregaciones
  langs:  ["Español", ...],      // lista de idiomas
  ejemplo: boolean               // true = datos de ejemplo (muestra banner)
}

Publicador = {
  id, nombre, apellido,
  genero: "M" | "F",
  celular, mail, congregacion,
  privilegio: "ninguno" | "siervo" | "anciano",
  precursorado: "no" | "regular" | "especial" | "sc",   // sc = superintendente de circuito
  idiomas: string[],
  experiencia: "principiante" | "comun" | "mentor",
  conyuge_id: string | null       // simétrico: se actualizan los dos lados
}

Asignacion = { id, semana: 1..5, turno: 0..4, publicador_id, fijo }
// "fijo" es un campo heredado: hoy todo lo que está en asigs es fijo.

Excepcion = { id, fecha: "AAAA-MM-DD", semana, turno, publicador_id, tipo: "ausente" | "extra" }
// ausente = un fijo no viene esa fecha; extra = reemplazo solo esa fecha
```

**Quiénes van una fecha** (`plantel` + `presentes`): los fijos de (semana, turno), menos los marcados `ausente` en esa fecha, más los `extra` de esa fecha.

`migrar()` actualiza datos viejos al cargar:
- convierte idiomas de texto a array;
- pasa el viejo `cancel` (suspensión de día completo) a `susp` por turno;
- completa `inicio`, `congs` y `langs`.

Si hay datos nuevos, mantené la compatibilidad ahí.

---

## Descartado por el usuario (no volver a agregar)

- Login o cualquier protección de edición. **Sin login**: quien tenga el link edita.
- Mostrar "hermano/hermana" o la experiencia (mentor, etc.) en las tarjetas de turno.
- Etiquetas Fijo/Reemplazo, fechas o reemplazos dentro de la pestaña **Fijos**.
- Botones "Copiar sábado", "Copiar mes" o "Enviar cronograma por WhatsApp".
- Abrir WhatsApp directamente con enlaces `wa.me`. El aviso se **copia**.
- Aviso de "faltan fijos", vista de todo el mes, backup/exportar y disponibilidad por hermano.
- Suspensión de día completo con motivos varios. Ahora es por turno y solo "mal clima".

## Ideas propuestas y no pedidas (no implementar sin preguntar)

- Que "No viene" abra directo el buscador de reemplazo.
- Sugerir primero reemplazos que cumplan la regla de 2 personas.
- Nota por fecha.
- Borrar o renombrar congregaciones e idiomas de las listas.

---

## Próximo paso previsto: Supabase + Vercel

El usuario despliega con **Vercel + Supabase**. El plan:

- Migrar a Next.js con Supabase como base, para que **otros vean el cronograma** y los datos no se pierdan con el navegador.
- **Sin login**: RLS abierto para `anon`, como pidió.
- Probar en local antes de desplegar.

Tablas sugeridas, a partir del modelo de arriba:
- `publicadores`
- `asignaciones` (patrón)
- `excepciones` (fecha, semana, turno, publicador_id, tipo)
- `suspensiones` (fecha, turno)
- `congregaciones` e `idiomas` (o arrays)
- un valor de configuración para `inicio`

**Hecho (oct 2026):** app Next.js en esta carpeta. `lib/exhibidor.js` es el script de `index.html` casi sin cambios; `lib/almacen.js` guarda en Supabase (diff por filas, solo escribe lo que cambió) o en localStorage si faltan las variables `NEXT_PUBLIC_SUPABASE_*`. Esquema en `supabase/migrations/` (se aplica solo al pushear al repo de GitHub conectado a Supabase), tablas con prefijo `exhibidor_` para poder compartir un proyecto de Supabase existente (el usuario no tiene cupo para proyectos nuevos). Si cambia la lógica, cambiala en `lib/exhibidor.js`; `index.html` queda como referencia.

Hubo un primer esqueleto Next.js + Supabase (`exhibidores.zip`), pero está **desactualizado**: solo tenía publicadores y asignaciones básicas. La referencia de comportamiento y diseño es `index.html`.

---

## Diseño

- Una columna, con un máximo de ~600px.
- Barra superior sticky con eyebrow y título.
- Barra de navegación fija abajo, que respeta `env(safe-area-inset-*)`.
- Colores como tokens CSS en `:root`, con tema claro y oscuro (`prefers-color-scheme` y `[data-theme]`). Paleta azul marino / celeste / mostaza en tonos apagados (el usuario pidió "menos neón"). Tokens extra: `--link` para enlaces y `--resalte` (mostaza) para los botones de la barra superior. Colores semánticos ok/warn/err, separados del acento.
- Tipografías: **Onest** (texto) e **IBM Plex Mono** (horas, fechas y números), desde Google Fonts.
- Objetivos táctiles de 44px o más. Sin scroll horizontal a 390px de ancho.

## Estructura del código (`index.html`)

Un IIFE con estado global y `render()`, que reconstruye `#app` con `innerHTML`. Los eventos se delegan en `#app` mediante atributos `data-act` (click, input y submit). Secciones del script:

- datos y migración
- búsqueda
- reglas
- fechas
- operaciones
- piezas de UI
- vistas: `vistaSabados`, `vistaFijos`, `vistaResumen`, `vistaLista`, `vistaFicha`, `vistaForm`
- hoja de búsqueda (`picker`)
- textos de aviso (`textoCancelacion`)
- eventos
