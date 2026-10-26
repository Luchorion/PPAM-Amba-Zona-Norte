// Forma de los datos, datos de ejemplo y migración de versiones viejas.
import { IDIOMAS_BASE } from "./constantes";
import { isoFecha, hoy0 } from "./fechas";

export function uid() { return "x" + Math.random().toString(36).slice(2, 10); }

// Publicador con todos los campos (los que faltan quedan con su valor por defecto).
export function base(o) {
  return {
    id: o.id, nombre: o.nombre || "", apellido: o.apellido || "", genero: o.genero || "M",
    celular: o.celular || "", mail: o.mail || "", congregacion: o.congregacion || "",
    privilegio: o.privilegio || "ninguno", precursorado: o.precursorado || "no",
    idiomas: Array.isArray(o.idiomas) ? o.idiomas.slice() : String(o.idiomas || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
    experiencia: o.experiencia || "comun",
    conyuge_id: o.conyuge_id || null
  };
}

function ejemplo() {
  var p = [
    base({ id: "c1", nombre: "Carlos", apellido: "Benítez", genero: "M", conyuge_id: "m1", celular: "11 5555-0101", mail: "carlos@ejemplo.com", congregacion: "Boulogne", privilegio: "anciano", idiomas: "Español", experiencia: "mentor" }),
    base({ id: "m1", nombre: "Marta", apellido: "Benítez", genero: "F", conyuge_id: "c1", celular: "11 5555-0102", mail: "marta@ejemplo.com", congregacion: "Boulogne", precursorado: "regular", idiomas: "Español, Portugués", experiencia: "mentor" }),
    base({ id: "j1", nombre: "Jorge", apellido: "Ledesma", genero: "M", conyuge_id: "l1", celular: "11 5555-0103", congregacion: "San Isidro", privilegio: "siervo", idiomas: "Español", experiencia: "comun" }),
    base({ id: "l1", nombre: "Lucía", apellido: "Ledesma", genero: "F", conyuge_id: "j1", celular: "11 5555-0104", congregacion: "San Isidro", idiomas: "Español, Inglés", experiencia: "comun" }),
    base({ id: "p1", nombre: "Pablo", apellido: "Quiroga", genero: "M", celular: "11 5555-0105", congregacion: "Boulogne", privilegio: "siervo", precursorado: "especial", idiomas: "Español", experiencia: "comun" }),
    base({ id: "d1", nombre: "Diego", apellido: "Sosa", genero: "M", celular: "11 5555-0106", mail: "diego@ejemplo.com", congregacion: "Boulogne", idiomas: "Español", experiencia: "principiante" }),
    base({ id: "a1", nombre: "Ana", apellido: "Ferreyra", genero: "F", celular: "11 5555-0107", congregacion: "Villa Adelina", precursorado: "regular", idiomas: "Español, Inglés", experiencia: "mentor" }),
    base({ id: "s1", nombre: "Sofía", apellido: "Romero", genero: "F", celular: "11 5555-0108", congregacion: "Boulogne", idiomas: "Español", experiencia: "principiante" })
  ];
  var a = [];
  [[1, 0, "c1"], [1, 0, "m1"], [1, 1, "p1"], [1, 1, "d1"], [1, 2, "a1"], [1, 2, "p1"], [1, 3, "l1"], [1, 4, "s1"], [1, 4, "a1"], [1, 4, "d1"],
   [2, 0, "j1"], [2, 0, "l1"], [2, 1, "a1"], [2, 1, "s1"], [3, 0, "c1"], [3, 0, "m1"], [3, 2, "p1"], [3, 2, "d1"], [4, 1, "j1"], [4, 1, "l1"]]
    .forEach(function (x) { a.push({ id: uid(), semana: x[0], turno: x[1], publicador_id: x[2] }); });
  return { pubs: p, asigs: a, ejemplo: true };
}

export function estadoVacio() {
  return { pubs: [], asigs: [], exc: [], susp: {}, inicio: isoFecha(hoy0()), congs: [], langs: IDIOMAS_BASE.slice(), ejemplo: false };
}

// s = lo que devolvió el almacén (o null). Devuelve un estado completo y al día.
export function preparar(s) {
  if (!s || !s.pubs || !s.asigs || (!s.pubs.length && !s.inicio)) s = ejemplo();
  else if (s.ejemplo && s.pubs.length && s.pubs[0].apellido === undefined) s = ejemplo();
  else s.pubs = s.pubs.map(base);
  return migrar(s);
}

function migrar(s) {
  s.exc = s.exc || [];
  // Turnos suspendidos por mal clima: "AAAA-MM-DD|turno" -> true. Se convierten las suspensiones de día completo anteriores.
  s.susp = s.susp || {};
  if (!s.inicio) s.inicio = isoFecha(hoy0());
  Object.keys(s.cancel || {}).forEach(function (iso) { for (var t = 0; t < 5; t++) s.susp[iso + "|" + t] = true; });
  delete s.cancel;
  s.langs = s.langs || IDIOMAS_BASE.slice();
  s.congs = s.congs || [];
  s.pubs.forEach(function (p) {
    p.idiomas.forEach(function (l) { if (s.langs.indexOf(l) === -1) s.langs.push(l); });
    if (p.congregacion && s.congs.indexOf(p.congregacion) === -1) s.congs.push(p.congregacion);
  });
  s.langs.sort(function (a, b) { return a.localeCompare(b, "es"); });
  s.congs.sort(function (a, b) { return a.localeCompare(b, "es"); });
  var cuenta = {};
  s.asigs.forEach(function (a) {
    var k = a.semana + "-" + a.turno;
    cuenta[k] = (cuenta[k] || 0) + 1;
    if (typeof a.fijo !== "boolean") a.fijo = cuenta[k] <= 2;
  });
  return s;
}
