// Textos: escapado de HTML, nombres y búsqueda.
import { PRIV, PREC, EXP } from "./constantes";

export function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
// Minúsculas y sin tildes, para comparar.
export function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function completo(p) { return (p.nombre + " " + p.apellido).trim(); }
export function alfa(p) { return p.apellido ? p.apellido + ", " + p.nombre : p.nombre; }
export function iniciales(p) { return ((p.nombre[0] || "") + (p.apellido[0] || "")).toUpperCase(); }
export function textoPrec(p) { return p.precursorado === "sc" ? PREC.sc : "Precursor " + PREC[p.precursorado].toLowerCase(); }
// Congregación, privilegio y precursorado en una línea.
export function detalle(p) {
  var partes = [];
  if (p.congregacion) partes.push(p.congregacion);
  if (p.privilegio !== "ninguno") partes.push(PRIV[p.privilegio]);
  if (p.precursorado !== "no") partes.push(textoPrec(p));
  return partes.join(" · ");
}
export function textoCuenta(n) { return n === 0 ? "Sin reemplazos en 3 meses" : n + (n === 1 ? " reemplazo" : " reemplazos") + " en 3 meses"; }

// Búsqueda: tienen que aparecer todas las palabras en algún dato de la persona.
function pajar(p) {
  return norm([
    p.nombre, p.apellido, p.celular, p.mail, p.congregacion,
    PRIV[p.privilegio], p.precursorado === "no" ? "" : "precursor " + PREC[p.precursorado],
    EXP[p.experiencia], p.idiomas.join(" "), p.genero === "M" ? "hermano" : "hermana"
  ].join(" "));
}
export function coincide(p, q) {
  var palabras = norm(q).split(/\s+/).filter(Boolean);
  var h = pajar(p);
  return palabras.every(function (w) { return h.indexOf(w) !== -1; });
}
// Agrega un valor a una lista ordenada si no está (sin distinguir tildes) y devuelve el que quedó.
export function sinRepetir(lista, nuevo) {
  var buscado = norm(nuevo);
  for (var i = 0; i < lista.length; i++) if (norm(lista[i]) === buscado) return lista[i];
  lista.push(nuevo);
  lista.sort(function (a, b) { return a.localeCompare(b, "es"); });
  return nuevo;
}
