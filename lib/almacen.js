import { createClient } from "@supabase/supabase-js";

// Dónde se guardan los datos. Con las variables de Supabase usa la base;
// sin ellas, el navegador (localStorage), igual que index.html.
export function crearAlmacen() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? almacenSupabase(createClient(url, key)) : almacenLocal();
}

/* ---------- navegador ---------- */
const KEY = "exhibidor-boulogne-v1";

function almacenLocal() {
  return {
    cargar() {
      try {
        const raw = localStorage.getItem(KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return Promise.resolve(null);
      }
    },
    guardar(state) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      return Promise.resolve();
    },
    ocupado() { return false; }
  };
}

/* ---------- Supabase ---------- */
// Cada tabla tiene "id" como clave. El estado se convierte en filas y,
// al guardar, solo se escriben las filas que cambiaron desde la última vez.
const T = {
  pubs: "exhibidor_publicadores",
  asigs: "exhibidor_asignaciones",
  exc: "exhibidor_excepciones",
  susp: "exhibidor_suspensiones",
  listas: "exhibidor_listas",
  config: "exhibidor_config"
};

function filas(state) {
  const out = { pubs: {}, asigs: {}, exc: {}, susp: {}, listas: {}, config: {} };
  state.pubs.forEach((p) => {
    out.pubs[p.id] = {
      id: p.id, nombre: p.nombre, apellido: p.apellido, genero: p.genero,
      celular: p.celular, mail: p.mail, congregacion: p.congregacion,
      privilegio: p.privilegio, precursorado: p.precursorado, idiomas: p.idiomas,
      experiencia: p.experiencia, conyuge_id: p.conyuge_id || null
    };
  });
  state.asigs.forEach((a) => {
    out.asigs[a.id] = { id: a.id, semana: a.semana, turno: a.turno, publicador_id: a.publicador_id, fijo: a.fijo !== false };
  });
  state.exc.forEach((e) => {
    out.exc[e.id] = { id: e.id, fecha: e.fecha, semana: e.semana, turno: e.turno, publicador_id: e.publicador_id, tipo: e.tipo };
  });
  Object.keys(state.susp || {}).forEach((k) => {
    if (!state.susp[k]) return;
    const z = k.split("|");
    out.susp[k] = { id: k, fecha: z[0], turno: +z[1] };
  });
  (state.congs || []).forEach((v) => { out.listas["cong|" + v] = { id: "cong|" + v, tipo: "cong", valor: v }; });
  (state.langs || []).forEach((v) => { out.listas["idioma|" + v] = { id: "idioma|" + v, tipo: "idioma", valor: v }; });
  out.config.inicio = { id: "inicio", valor: state.inicio };
  out.config.ejemplo = { id: "ejemplo", valor: state.ejemplo ? "1" : "0" };
  return out;
}

function aEstado(r) {
  const susp = {};
  r.susp.forEach((s) => { susp[s.fecha + "|" + s.turno] = true; });
  const conf = {};
  r.config.forEach((c) => { conf[c.id] = c.valor; });
  return {
    pubs: r.pubs.map((p) => ({ ...p, idiomas: p.idiomas || [] })),
    asigs: r.asigs,
    exc: r.exc,
    susp,
    congs: r.listas.filter((l) => l.tipo === "cong").map((l) => l.valor),
    langs: r.listas.filter((l) => l.tipo === "idioma").map((l) => l.valor),
    inicio: conf.inicio || null,
    ejemplo: conf.ejemplo === "1"
  };
}

function almacenSupabase(db) {
  let previo = null; // lo que hay en la base, como filas
  let cola = Promise.resolve();
  let pendientes = 0;

  async function leer(nombre) {
    const { data, error } = await db.from(T[nombre]).select("*");
    if (error) throw error;
    return data;
  }

  async function cargar() {
    const nombres = Object.keys(T);
    const datos = await Promise.all(nombres.map(leer));
    const r = {};
    nombres.forEach((n, i) => { r[n] = datos[i]; });
    const s = aEstado(r);
    previo = filas(s);
    previo.config = {};
    r.config.forEach((c) => { previo.config[c.id] = { id: c.id, valor: c.valor }; });
    return s.pubs.length || s.inicio ? s : null;
  }

  async function upsert(nombre, rows) {
    if (!rows.length) return;
    const { error } = await db.from(T[nombre]).upsert(rows);
    if (error) throw error;
  }
  async function borrar(nombre, ids) {
    if (!ids.length) return;
    const { error } = await db.from(T[nombre]).delete().in("id", ids);
    if (error) throw error;
  }

  async function sincronizar(state) {
    const nuevo = filas(state);
    const cambios = {}, quitados = {};
    Object.keys(T).forEach((n) => {
      cambios[n] = Object.keys(nuevo[n]).filter((k) => JSON.stringify(nuevo[n][k]) !== JSON.stringify(previo[n][k])).map((k) => nuevo[n][k]);
      quitados[n] = Object.keys(previo[n]).filter((k) => !nuevo[n][k]);
    });
    // Orden pensado para las claves foráneas: primero se sacan turnos, después se agregan hermanos, etc.
    await borrar("exc", quitados.exc);
    await borrar("asigs", quitados.asigs);
    await upsert("pubs", cambios.pubs);
    await Promise.all([upsert("asigs", cambios.asigs), upsert("exc", cambios.exc), upsert("susp", cambios.susp), upsert("listas", cambios.listas), upsert("config", cambios.config)]);
    await Promise.all([borrar("pubs", quitados.pubs), borrar("susp", quitados.susp), borrar("listas", quitados.listas)]);
    previo = nuevo;
  }

  return {
    cargar,
    // Los guardados van en fila, uno detrás del otro. Si uno falla, el próximo reintenta lo que faltó.
    guardar(state) {
      pendientes++;
      const p = cola.then(() => sincronizar(state));
      cola = p.catch(() => {}).finally(() => { pendientes--; });
      return p;
    },
    ocupado() { return pendientes > 0; }
  };
}
