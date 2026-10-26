// Fechas: todo en hora local, sin horario (medianoche).
import { MESES, MES_C } from "./constantes";

export function hoy0() { var h = new Date(); return new Date(h.getFullYear(), h.getMonth(), h.getDate()); }
export function sumarDias(f, d) { return new Date(f.getFullYear(), f.getMonth(), f.getDate() + d); }
// 1er, 2do… sábado del mes: semana = Math.ceil(día / 7).
export function semanaDe(f) { return Math.ceil(f.getDate() / 7); }

export function proximoSabado() {
  var h = hoy0();
  return sumarDias(h, (6 - h.getDay() + 7) % 7);
}
// El n-ésimo sábado del mes m (puede venir fuera de rango, p. ej. -1), o null si ese mes no tiene.
export function nthSat(y, m, n) {
  var b = new Date(y, m, 1);
  y = b.getFullYear(); m = b.getMonth();
  var offset = (6 - b.getDay() + 7) % 7;
  var f = new Date(y, m, 1 + offset + (n - 1) * 7);
  return f.getMonth() === m ? f : null;
}
export function sabadosDelMes(y, m) {
  var r = [];
  for (var n = 1; n <= 5; n++) { var f = nthSat(y, m, n); if (f) r.push(f); }
  return r;
}

export function isoFecha(f) {
  function d2(x) { return (x < 10 ? "0" : "") + x; }
  return f.getFullYear() + "-" + d2(f.getMonth() + 1) + "-" + d2(f.getDate());
}
export function desdeIso(iso) { var z = iso.split("-"); return new Date(+z[0], +z[1] - 1, +z[2]); }
export function fechaLarga(f) { return "Sábado " + f.getDate() + " de " + MESES[f.getMonth()]; }
export function fechaCorta(f) { return f.getDate() + " " + MES_C[f.getMonth()]; }
