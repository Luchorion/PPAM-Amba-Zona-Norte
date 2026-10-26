// Reglas de un turno: 2 a 4 personas; con 2, del mismo género o cónyuges.
import { MAX } from "./constantes";

export function sonConyuges(a, b) { return a.conyuge_id === b.id || b.conyuge_id === a.id; }

// nivel: "ok" cubierto, "warn" falta gente, "error" regla rota, "" sin nadie.
export function estado(personas) {
  var n = personas.length;
  if (n === 0) return { nivel: "", texto: "Sin cubrir" };
  if (n === 1) return { nivel: "warn", texto: "Falta 1 persona" };
  if (n > MAX) return { nivel: "error", texto: "Más de 4" };
  if (n === 2) {
    var a = personas[0], b = personas[1];
    if (a.genero === b.genero || sonConyuges(a, b)) return { nivel: "ok", texto: "Cubierto" };
    return { nivel: "error", texto: "Pareja no válida" };
  }
  return { nivel: "ok", texto: "Cubierto" };
}

// Para resumir varios turnos: el peor nivel gana ("error" > "warn" > "ok").
export function empeorar(peor, nivel) {
  if (nivel === "error") return "error";
  if (nivel !== "ok" && peor !== "error") return "warn";
  return peor;
}
