// La app: estado, pantallas y eventos. Arma el HTML con texto y redibuja todo #app en cada cambio;
// los botones llevan data-act y los eventos se manejan con un solo listener por tipo.
import { HORAS, TURNOS, SABADOS, ORD, MAX, MESES, MES_C, PRIV, PREC, EXP, ICONOS, CONTACTO } from "./constantes";
import { hoy0, sumarDias, semanaDe, proximoSabado, sabadosDelMes, isoFecha, desdeIso, fechaLarga, fechaCorta } from "./fechas";
import { esc, norm, completo, alfa, iniciales, textoPrec, detalle, textoCuenta, coincide, sinRepetir } from "./texto";
import { estado, empeorar } from "./reglas";
import { uid, base, preparar, estadoVacio } from "./datos";

export function iniciar(app, almacen) {
  /* ---------- estado ---------- */
  var state = null;             // los datos (ver CLAUDE.md, "Modelo de datos")
  var tab = "sabados";          // "sabados" | "fijos" | "hermanos" | "resumen"
  var fecha = null;             // sábado elegido en Sábados
  var semFijos = 1;             // 1..5 en Fijos
  var pantalla = { tipo: "lista" }; // en Hermanos: lista | ficha | form
  var filtro = "";
  var filtroCong = "";          // "" = todas, "-" = sin congregación
  var filtroGen = "";           // "" | "M" | "F"
  var abiertos = {};            // turnos cubiertos que se muestran completos ("AAAA-MM-DD|turno" o "F<semana>|turno")
  var menuTurno = null;         // turno con el menú ⋯ abierto
  var picker = null;            // hoja de búsqueda abierta: { titulo, fuente(), elegir(id), sinOpcion? }
  var pickerCong = "";          // filtro de congregación en la hoja de búsqueda
  var confirmar = false;        // confirmación de borrar en la ficha
  var aviso = null;             // "AAAA-MM-DD|turno" con el recuadro de aviso abierto
  var toast = null;             // { texto, err }
  var toastTimer = null;
  var animar = null;            // animación para el próximo render: { dia: 1 | -1 } o { abrir: "clave" }
  var orden = { col: "nombre", asc: true }; // columna por la que se ordena la tabla de Hermanos en computadora
  var ANCHO = window.matchMedia ? window.matchMedia("(min-width: 1000px)") : { matches: false };

  // Búsqueda de hermanos por id, rehecha cuando cambia la lista.
  var indice = { lista: null, largo: -1, porId: {} };
  function pub(id) {
    if (indice.lista !== state.pubs || indice.largo !== state.pubs.length) {
      indice = { lista: state.pubs, largo: state.pubs.length, porId: {} };
      state.pubs.forEach(function (p) { indice.porId[p.id] = p; });
    }
    return indice.porId[id];
  }
  function ordenar() {
    state.pubs.sort(function (a, b) {
      return a.apellido.localeCompare(b.apellido, "es") || a.nombre.localeCompare(b.nombre, "es");
    });
  }

  /* ---------- avisos: toast, guardado, lector de pantalla, vibración ---------- */
  function avisar(texto, err) {
    toast = { texto: texto, err: !!err };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast = null;
      var t = document.getElementById("toast");
      if (t) t.remove();
    }, 3200);
  }
  // Estos van fuera de #app para que render() no los borre.
  function elemento(clase, attrs) {
    var el = document.createElement("div");
    el.className = clase;
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    document.body.appendChild(el);
    return el;
  }
  var marca = elemento("guardado", { role: "status" }), marcaTimer = null, guardando = 0;
  var vivo = elemento("solo-lector", { "aria-live": "polite" });
  var indicador = elemento("tirar", { "aria-hidden": "true" });
  var tarjeta = elemento("tarjeta", { "aria-hidden": "true" }); // datos al pasar el mouse sobre un nombre

  function mostrarMarca(texto, clase) {
    clearTimeout(marcaTimer);
    marca.textContent = texto; marca.className = "guardado visible " + clase;
    if (clase === "ok") marcaTimer = setTimeout(function () { marca.className = "guardado"; }, 1400);
  }
  function anunciar(texto) { vivo.textContent = ""; setTimeout(function () { vivo.textContent = texto; }, 50); }
  // Solo Android; en iPhone no hace nada.
  function vibrar() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }

  function guardar() {
    guardando++;
    mostrarMarca("Guardando…", "");
    almacen.guardar(state).then(function () {
      if (--guardando === 0) mostrarMarca("Guardado ✓", "ok");
    }, function () {
      guardando--;
      marca.className = "guardado";
      avisar("No se pudo guardar. Revisá la conexión y volvé a intentar.", true);
      render();
    });
  }
  function cambio() { guardar(); render(); }

  /* ---------- consultas sobre los datos ---------- */
  // Quiénes están anotados en una fecha y turno: los fijos (marcando los ausentes) y los reemplazos.
  function plantel(iso, semana, turno) {
    var excs = state.exc.filter(function (e) { return e.fecha === iso && e.semana === semana && e.turno === turno; });
    var aus = {};
    excs.forEach(function (e) { if (e.tipo === "ausente") aus[e.publicador_id] = e.id; });
    var filas = [];
    state.asigs.forEach(function (a) {
      if (a.semana !== semana || a.turno !== turno) return;
      var p = pub(a.publicador_id);
      if (p) filas.push({ p: p, tipo: "base", a: a, ausente: !!aus[p.id], excId: aus[p.id] });
    });
    excs.forEach(function (e) {
      if (e.tipo !== "extra") return;
      var p = pub(e.publicador_id);
      if (p) filas.push({ p: p, tipo: "extra", ausente: false, excId: e.id });
    });
    return filas;
  }
  function presentes(filas) { return filas.filter(function (f) { return !f.ausente; }); }
  function suspendido(iso, t) { return !!state.susp[iso + "|" + t]; }
  function personasFijas(semana, t) {
    return state.asigs.filter(function (a) { return a.semana === semana && a.turno === t; })
      .map(function (a) { return pub(a.publicador_id); }).filter(Boolean);
  }
  function fijosDe(p) {
    return state.asigs.filter(function (a) { return a.publicador_id === p.id; })
      .sort(function (a, b) { return a.semana - b.semana || a.turno - b.turno; });
  }
  // Reemplazos que hizo cada hermano en los últimos 3 meses (incluye los ya agendados).
  function contarReemplazos(pid) {
    var desde = isoFecha(sumarDias(hoy0(), -91));
    return state.exc.filter(function (e) { return e.tipo === "extra" && e.publicador_id === pid && e.fecha >= desde; }).length;
  }
  // Cada turno activo de un sábado con su estado real ese día.
  function turnosDe(f) {
    var iso = isoFecha(f), sem = semanaDe(f), out = [];
    TURNOS.forEach(function (h, t) {
      if (suspendido(iso, t)) return;
      out.push({ f: f, t: t, sem: sem, est: estado(presentes(plantel(iso, sem, t)).map(function (x) { return x.p; })) });
    });
    return out;
  }
  function resumenFecha(f) {
    var iso = isoFecha(f), sem = semanaDe(f), cub = 0, peor = "ok", aus = 0, sus = 0;
    TURNOS.forEach(function (h, t) {
      if (suspendido(iso, t)) { sus++; return; }
      var filas = plantel(iso, sem, t), pres = presentes(filas);
      aus += filas.length - pres.length;
      var e = estado(pres.map(function (x) { return x.p; }));
      if (e.nivel === "ok") cub++;
      peor = empeorar(peor, e.nivel);
    });
    if (sus === TURNOS.length) peor = "susp";
    return { cubiertos: cub, nivel: peor, ausentes: aus, suspendidos: sus };
  }
  // Peor estado de los turnos fijos de un sábado del mes.
  function nivelSemana(semana) {
    var peor = "ok";
    TURNOS.forEach(function (h, t) { peor = empeorar(peor, estado(personasFijas(semana, t)).nivel); });
    return peor;
  }
  function cobertura(y, m) {
    var tot = 0, ok = 0;
    sabadosDelMes(y, m).forEach(function (f) {
      if (isoFecha(f) < state.inicio) return; // antes de usar la app no hay datos
      turnosDe(f).forEach(function (x) { tot++; if (x.est.nivel === "ok") ok++; });
    });
    return { tot: tot, ok: ok, pct: tot ? Math.round(ok * 100 / tot) : null };
  }

  /* ---------- operaciones ---------- */
  function agregarAsig(semana, turno, pid) {
    var delTurno = state.asigs.filter(function (a) { return a.semana === semana && a.turno === turno; });
    if (delTurno.length >= MAX) { avisar("Ese turno ya tiene 4 personas.", true); return; }
    if (delTurno.some(function (a) { return a.publicador_id === pid; })) { avisar("Esa persona ya está en el turno.", true); return; }
    var fijos = delTurno.filter(function (a) { return a.fijo; }).length;
    state.asigs.push({ id: uid(), semana: semana, turno: turno, publicador_id: pid, fijo: fijos < 2 });
  }
  function quitarAsig(id) {
    var q = state.asigs.filter(function (a) { return a.id === id; })[0];
    state.asigs = state.asigs.filter(function (a) { return a.id !== id; });
    if (q) {
      state.exc = state.exc.filter(function (e) {
        return !(e.tipo === "ausente" && e.semana === q.semana && e.turno === q.turno && e.publicador_id === q.publicador_id);
      });
    }
  }
  // Pasa un fijo a otro (semana, turno). Sus "No viene" del turno viejo dejan de valer.
  function moverAsig(id, semana, turno) {
    var a = state.asigs.filter(function (x) { return x.id === id; })[0];
    if (!a || (a.semana === semana && a.turno === turno)) return false;
    var destino = state.asigs.filter(function (x) { return x.semana === semana && x.turno === turno; });
    if (destino.length >= MAX) { avisar("Ese turno ya tiene 4 personas.", true); return false; }
    if (destino.some(function (x) { return x.publicador_id === a.publicador_id; })) { avisar("Esa persona ya está en ese turno.", true); return false; }
    state.exc = state.exc.filter(function (e) {
      return !(e.tipo === "ausente" && e.semana === a.semana && e.turno === a.turno && e.publicador_id === a.publicador_id);
    });
    a.semana = semana; a.turno = turno;
    return true;
  }
  function marcarAusente(iso, semana, turno, pid) {
    var ya = state.exc.some(function (e) {
      return e.tipo === "ausente" && e.fecha === iso && e.semana === semana && e.turno === turno && e.publicador_id === pid;
    });
    if (!ya) state.exc.push({ id: uid(), fecha: iso, semana: semana, turno: turno, publicador_id: pid, tipo: "ausente" });
  }
  function agregarExtra(iso, semana, turno, pid) {
    if (presentes(plantel(iso, semana, turno)).length >= MAX) { avisar("Ese turno ya tiene 4 personas.", true); return; }
    state.exc.push({ id: uid(), fecha: iso, semana: semana, turno: turno, publicador_id: pid, tipo: "extra" });
  }
  function quitarExc(id) { state.exc = state.exc.filter(function (e) { return e.id !== id; }); }
  function borrarPub(id) {
    state.pubs = state.pubs.filter(function (p) { return p.id !== id; }).map(function (p) {
      if (p.conyuge_id === id) p.conyuge_id = null;
      return p;
    });
    state.asigs = state.asigs.filter(function (a) { return a.publicador_id !== id; });
    state.exc = state.exc.filter(function (e) { return e.publicador_id !== id; });
  }
  // El cónyuge es simétrico: se actualizan los dos lados y se limpian parejas anteriores.
  function setConyuge(id, nuevo) {
    var yo = pub(id);
    if (!yo) return;
    function limpiar(pid) { var p = pub(pid); if (p) p.conyuge_id = null; }
    if (yo.conyuge_id) limpiar(yo.conyuge_id);
    if (nuevo) {
      var otro = pub(nuevo);
      if (otro && otro.conyuge_id && otro.conyuge_id !== id) limpiar(otro.conyuge_id);
      if (otro) otro.conyuge_id = id;
      yo.conyuge_id = nuevo;
    } else {
      yo.conyuge_id = null;
    }
  }

  /* ---------- piezas de UI ---------- */
  function top(eyebrow, titulo, extra, volver) {
    var h = '<header class="top"><div class="top-txt">';
    if (volver) h += '<button class="volver" data-act="volver">‹ ' + esc(volver) + "</button>";
    else h += '<div class="eyebrow">' + esc(eyebrow) + "</div>";
    h += "<h1>" + esc(titulo) + "</h1></div>" + (extra || "") + "</header>";
    return h;
  }
  function cupos(n, nivel) {
    var h = '<span class="cupos ' + nivel + '" aria-label="' + n + ' de ' + MAX + ' cupos">';
    for (var i = 0; i < MAX; i++) h += '<i class="' + (i < n ? "on" : "") + '"></i>';
    return h + "</span>";
  }
  function columnaHora(t) {
    return '<div class="hora"><b>' + HORAS[t][0] + '</b><i></i><span>' + HORAS[t][1] + "</span></div>";
  }
  function rango(t) { return HORAS[t][0] + "–" + HORAS[t][1]; }
  function opcion(v, txt, actual) { return '<option value="' + esc(v) + '"' + (v === actual ? " selected" : "") + ">" + esc(txt) + "</option>"; }
  function opcionesCong(actual, todas) {
    return opcion("", todas, actual) + state.congs.map(function (c) { return opcion(c, c, actual); }).join("") + opcion("-", "Sin congregación", actual);
  }
  function filtraCong(p, cong) { return !cong || (cong === "-" ? !p.congregacion : p.congregacion === cong); }
  // Turno cubierto en una línea con los nombres; al tocarlo se abre.
  function lineaCompacta(k, nombres) {
    return '<button class="resumen-turno" data-act="turno-abrir" data-k="' + k + '"><span>' + esc(nombres.join(", ")) + '</span><span class="chev">›</span></button></div></article>';
  }
  function botonCopiarCel(p) {
    return '<button class="copiar-chico" data-act="copiar-cel" data-id="' + p.id + '" aria-label="Copiar el celular de ' + esc(completo(p)) + '">Copiar</button>';
  }
  function banner() {
    if (!state.ejemplo) return "";
    return '<div class="banner"><span>Estás viendo datos de ejemplo. Probá todo lo que quieras y después empezá con tus datos.</span>' +
      '<span class="acciones"><button data-act="vaciar">Empezar de cero</button><button data-act="quedarme">Quedarme con estos</button></span></div>';
  }

  /* ---------- Sábados ---------- */
  function vistaSabados() {
    if (!fecha) fecha = proximoSabado();
    var iso = isoFecha(fecha), sem = semanaDe(fecha), r = resumenFecha(fecha);
    var esHoy = iso === isoFecha(proximoSabado());
    var h = top(SABADOS[sem - 1] + " del mes", fechaLarga(fecha), esHoy ? "" : '<button class="top-btn sec" data-act="hoy">Hoy</button>');
    h += banner() + tiraFechas(iso);

    var activos = TURNOS.length - r.suspendidos, extras = [];
    if (r.suspendidos) extras.push(r.suspendidos + (r.suspendidos === 1 ? " suspendido" : " suspendidos"));
    extras.push(r.ausentes ? r.ausentes + (r.ausentes === 1 ? " ausencia" : " ausencias") : "Sin ausencias");
    h += '<div class="resumen-dia"><strong>' + (activos ? r.cubiertos + " de " + activos + " turnos cubiertos" : "Todo suspendido por mal clima") + "</strong>" +
      "<span>" + extras.join(" · ") + "</span></div>";
    if (faltantes(fecha).length) {
      h += aviso === iso + "|pedido"
        ? '<div class="aviso-box"><textarea id="aviso-txt" readonly aria-label="Mensaje para WhatsApp">' + esc(textoPedido(fecha)) + "</textarea>" +
          '<div class="dos"><button class="btn sec" data-act="aviso-cerrar">Cerrar</button><button class="btn" data-act="copiar">Copiar</button></div></div>'
        : '<button class="wa" data-act="pedido">' + ICONOS.enviar + "Pedir reemplazos</button>";
    }

    h += '<div class="turnos">';
    TURNOS.forEach(function (hora, t) { h += suspendido(iso, t) ? turnoSuspendido(iso, t) : turnoDelDia(iso, sem, t); });
    return h + "</div>";
  }
  // El sábado anterior y los 12 siguientes, con su estado.
  function tiraFechas(iso) {
    var inicio = proximoSabado(), mesPrev = null;
    var h = '<div class="fechas" role="group" aria-label="Elegir sábado">';
    for (var i = -1; i < 12; i++) {
      var f = sumarDias(inicio, i * 7), rf = resumenFecha(f);
      if (mesPrev !== null && f.getMonth() !== mesPrev) h += '<span class="mes-sep" aria-hidden="true"></span>';
      mesPrev = f.getMonth();
      h += '<button class="dia" data-act="fecha" data-v="' + isoFecha(f) + '" aria-pressed="' + (isoFecha(f) === iso) + '" aria-label="' + esc(fechaLarga(f)) + '">' +
        '<span class="dia-mes">' + MES_C[f.getMonth()] + '</span><span class="dia-num">' + f.getDate() + '</span>' +
        '<span class="dia-n">' + ORD[semanaDe(f) - 1] + '</span><span class="dia-dot ' + rf.nivel + '"></span></button>';
    }
    return h + "</div>";
  }
  function turnoSuspendido(iso, t) {
    return '<article class="turno n-susp" aria-label="Turno de ' + TURNOS[t] + ' suspendido">' + columnaHora(t) +
      '<div class="cuerpo"><div class="cab"><span class="estado">Suspendido por mal clima</span></div>' +
      '<p class="vacio">Los que estaban anotados no tienen que ir.</p>' +
      (aviso === iso + "|" + t
        ? '<div class="aviso-box"><textarea id="aviso-txt" readonly aria-label="Mensaje para WhatsApp">' + esc(textoCancelacion(fecha, t)) + "</textarea>" +
          '<div class="dos"><button class="btn sec" data-act="aviso-cerrar">Cerrar</button><button class="btn" data-act="copiar">Copiar</button></div></div>'
        : '<button class="wa" data-act="aviso" data-turno="' + t + '">' + ICONOS.enviar + "Avisar cancelación</button>") +
      '<button class="sumar" data-act="reactivar" data-turno="' + t + '">Reactivar turno</button></div></article>';
  }
  function turnoDelDia(iso, sem, t) {
    var filas = plantel(iso, sem, t), pres = presentes(filas);
    var est = estado(pres.map(function (x) { return x.p; }));
    var k = iso + "|" + t, compacto = est.nivel === "ok" && !abiertos[k];
    var h = '<article class="turno' + (est.nivel === "error" ? " n-error" : "") + (compacto ? " compacto" : "") + '" data-k="' + k + '" aria-label="Turno de ' + TURNOS[t] + '">' + columnaHora(t);
    h += '<div class="cuerpo"><div class="cab"><span class="estado ' + est.nivel + '">' + esc(est.texto) + '</span><span class="cab-der">' + cupos(pres.length, est.nivel) +
      '<button class="mas" data-act="menu-turno" data-k="' + k + '" aria-label="Más opciones" aria-expanded="' + (menuTurno === k) + '">⋯</button></span></div>';
    if (menuTurno === k) h += '<div class="menu-turno"><button data-act="suspender" data-turno="' + t + '">Suspender por mal clima</button></div>';
    if (compacto) return h + lineaCompacta(k, pres.map(function (x) { return completo(x.p); }));

    if (filas.length) {
      h += '<ul class="gente">';
      filas.forEach(function (x) {
        var nom = esc(completo(x.p)), link = '<button class="nom" data-act="ficha-desde" data-id="' + x.p.id + '">';
        if (x.tipo === "extra") {
          h += "<li>" + link + nom + '</button><span class="rol reemplazo">Reemplazo</span>' +
            '<button class="x" data-act="quitar-exc" data-id="' + x.excId + '" aria-label="Quitar a ' + nom + '">×</button></li>';
        } else if (x.ausente) {
          h += "<li>" + link + '<span class="tachado">' + nom + '</span><small class="et">No viene</small></button>' +
            '<button class="accion acento" data-act="quitar-exc" data-id="' + x.excId + '">Deshacer</button></li>';
        } else {
          h += "<li>" + link + nom + "</button>" +
            '<button class="accion" data-act="ausente" data-pid="' + x.p.id + '" data-turno="' + t + '">No viene</button></li>';
        }
      });
      h += "</ul>";
    } else {
      h += '<p class="vacio">Nadie asignado.</p>';
    }
    if (pres.length < MAX) {
      var libres = MAX - pres.length;
      h += '<button class="sumar" data-act="abrir-extra" data-turno="' + t + '">+ Agregar reemplazo <span class="libres">· ' + libres + (libres === 1 ? " libre" : " libres") + "</span></button>";
    }
    if (est.nivel === "ok") h += '<button class="link-susp" data-act="turno-plegar" data-k="' + k + '">Mostrar menos</button>';
    return h + "</div></article>";
  }
  // El recuadro del aviso crece hasta mostrar todo el mensaje.
  function ajustarAviso() {
    var ta = document.getElementById("aviso-txt");
    if (ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; }
  }
  // Aviso de un turno suspendido por mal clima, para copiar y pegar en WhatsApp.
  function textoCancelacion(f, t) {
    var dia = f.getDate() + " de " + MESES[f.getMonth()];
    var nombres = presentes(plantel(isoFecha(f), semanaDe(f), t)).map(function (x) { return completo(x.p); });
    var txt = "¡Hola, queridos hermanos! ☔\n\nPor el mal clima, el turno de *" + HORAS[t][0] + " a " + HORAS[t][1] +
      " h* del exhibidor en la estación Boulogne de este *sábado " + dia + "* queda suspendido.\n";
    if (nombres.length) txt += "\n" + (nombres.length === 1 ? "No hace falta que vayas, " + nombres[0] : "Los que estaban anotados no tienen que ir: " + nombres.join(", ")) + ".\n";
    return txt + "\n¡Cuídense mucho y gracias por su disposición! Un abrazo grande.";
  }
  // Turnos activos sin cubrir de una fecha, con los cupos libres de cada uno.
  function faltantes(f) {
    var iso = isoFecha(f), sem = semanaDe(f), r = [];
    TURNOS.forEach(function (h, t) {
      if (suspendido(iso, t)) return;
      var pres = presentes(plantel(iso, sem, t));
      if (estado(pres.map(function (x) { return x.p; })).nivel !== "ok") r.push({ t: t, libres: MAX - pres.length });
    });
    return r;
  }
  // Pedido de reemplazos de una fecha, para copiar y pegar en WhatsApp.
  function textoPedido(f) {
    var dif = Math.round((f - hoy0()) / 864e5);
    var cuando = (dif === 0 ? "HOY " : dif === 1 ? "MAÑANA " : "") + "SÁBADO " + f.getDate() + "/" + (f.getMonth() + 1);
    var lineas = faltantes(f).map(function (x) {
      return "- " + HORAS[x.t][0] + " a " + HORAS[x.t][1] + " (" + x.libres + (x.libres === 1 ? " reemplazo)" : " reemplazos)");
    });
    return "Hola!!! 👋\nSe está necesitando cubrir los siguientes reemplazos:\n\n" +
      "PUNTO: 🔶 Estación Boulogne 🔶\n\nFecha: " + cuando + "\n\nHorarios:\n" + lineas.join("\n") + "\n\n" +
      "Si desean hacerse disponible pueden hacerlo:\n" +
      "1️⃣ Primero, comunicarse al siguiente link de WhatsApp 🔶 " + CONTACTO + "\n" +
      "2️⃣ Una vez aprobado, ingresando en la app, opción \"Calendario\" y puede \"Solicitar como reemplazo\".\n" +
      "Muchas gracias por su buena disposición!! 🔶";
  }

  /* ---------- Fijos ---------- */
  function vistaFijos() {
    var h = top("Se repiten cada mes", "Turnos fijos");
    if (ANCHO.matches) return h + tablaFijos();
    h += '<div class="semanas" role="group" aria-label="Sábado del mes">';
    for (var n = 1; n <= 5; n++) {
      h += '<button class="sem" data-act="sem" data-v="' + n + '" aria-pressed="' + (semFijos === n) + '" aria-label="' + SABADOS[n - 1] + '"><b>' + ORD[n - 1] + "</b><small>sábado</small>" +
        '<span class="dia-dot ' + nivelSemana(n) + '"></span></button>';
    }
    h += "</div>";
    h += '<p class="nota">Quiénes van siempre el ' + SABADOS[semFijos - 1] + " de cada mes.</p>";
    h += '<div class="turnos">';
    TURNOS.forEach(function (hora, t) { h += turnoFijo(t); });
    return h + "</div>";
  }
  function turnoFijo(t) {
    var del = state.asigs.filter(function (a) { return a.semana === semFijos && a.turno === t; });
    var personas = del.map(function (a) { return pub(a.publicador_id); }).filter(Boolean);
    var est = estado(personas);
    var txt = del.length ? del.length + (del.length === 1 ? " fijo" : " fijos") : "Sin fijos";
    var k = "F" + semFijos + "|" + t, compacto = est.nivel === "ok" && !abiertos[k];
    var h = '<article class="turno' + (est.nivel === "error" ? " n-error" : "") + (compacto ? " compacto" : "") + '" data-k="' + k + '" aria-label="Turno de ' + TURNOS[t] + '">' + columnaHora(t);
    h += '<div class="cuerpo"><div class="cab"><span class="estado ' + (est.nivel === "error" ? "error" : "") + '">' + (est.nivel === "error" ? esc(est.texto) : txt) + "</span>" + cupos(del.length, est.nivel) + "</div>";
    if (compacto) return h + lineaCompacta(k, personas.map(completo));
    if (del.length) {
      h += '<ul class="gente">';
      del.forEach(function (a) {
        var p = pub(a.publicador_id);
        if (!p) return;
        var nom = esc(completo(p));
        h += '<li><button class="nom" data-act="ficha-desde" data-id="' + p.id + '">' + nom + "</button>" +
          '<button class="x" data-act="quitar" data-id="' + a.id + '" aria-label="Quitar a ' + nom + '">×</button></li>';
      });
      h += "</ul>";
    }
    if (del.length < MAX) h += '<button class="sumar" data-act="abrir-turno" data-turno="' + t + '">+ Agregar fijo</button>';
    if (est.nivel === "ok") h += '<button class="link-susp" data-act="turno-plegar" data-k="' + k + '">Mostrar menos</button>';
    return h + "</div></article>";
  }
  // En computadora: los 5 sábados del mes a la vez, una fila por turno.
  function tablaFijos() {
    var h = '<table class="tabla-fijos"><thead><tr><th scope="col"><span class="solo-lector">Horario</span></th>';
    for (var n = 1; n <= 5; n++) h += '<th scope="col">' + SABADOS[n - 1] + '<span class="dia-dot ' + nivelSemana(n) + '"></span></th>';
    h += "</tr></thead><tbody>";
    TURNOS.forEach(function (hora, t) {
      h += '<tr><th scope="row" class="tf-hora">' + HORAS[t][0] + "<span>" + HORAS[t][1] + "</span></th>";
      for (var s = 1; s <= 5; s++) h += celdaFija(s, t);
      h += "</tr>";
    });
    return h + "</tbody></table>";
  }
  function celdaFija(sem, t) {
    var del = state.asigs.filter(function (a) { return a.semana === sem && a.turno === t; });
    var est = estado(del.map(function (a) { return pub(a.publicador_id); }).filter(Boolean));
    var h = '<td class="tf-celda' + (est.nivel === "error" ? " error" : "") + (del.length ? "" : " vacia") + '" data-sem="' + sem + '" data-turno="' + t + '">';
    if (est.nivel === "error") h += '<span class="estado error">' + esc(est.texto) + "</span>";
    del.forEach(function (a) {
      var p = pub(a.publicador_id);
      if (!p) return;
      var nom = esc(completo(p));
      h += '<div class="tf-p" draggable="true" data-asig="' + a.id + '" title="Arrastralo a otro turno para moverlo"><button class="nom" data-act="ficha-desde" data-id="' + p.id + '">' + nom + "</button>" +
        '<button class="x" data-act="quitar" data-id="' + a.id + '" aria-label="Quitar a ' + nom + '">×</button></div>';
    });
    if (del.length < MAX) {
      h += '<button class="tf-sumar" data-act="abrir-turno" data-sem="' + sem + '" data-turno="' + t + '" aria-label="Agregar fijo al ' + SABADOS[sem - 1] + ", " + TURNOS[t] + '">+ Agregar</button>';
    }
    return h + "</td>";
  }

  /* ---------- Resumen ---------- */
  function vistaResumen() {
    var hoy = hoy0(), desde3 = isoFecha(sumarDias(hoy, -91));
    var ini = desdeIso(state.inicio), inicioTxt = ini.getDate() + " de " + MESES[ini.getMonth()];
    var h = top("Exhibidor Boulogne", "Resumen");
    // En computadora, las dos mitades van una al lado de la otra.
    h += '<div class="resumen-cols"><div>' + bloqueCobertura(hoy) + bloquePendientes() + "</div><div>" +
      bloqueAusencias(desde3) + bloqueFallas(hoy, desde3, inicioTxt) + "</div></div>";
    h += '<p class="nota pie">Los números se cuentan desde el ' + inicioTxt + ", cuando empezaste a usar la app.</p>";
    return h;
  }
  // % de turnos cubiertos del mes actual y del anterior (solo los que tienen datos).
  function bloqueCobertura(hoy) {
    function mes(m) { return MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1); }
    function tile(nombre, c) {
      var niv = c.pct >= 90 ? "ok" : c.pct >= 70 ? "warn" : "error";
      return '<div class="tile"><span class="tile-tit">' + nombre + "</span>" +
        '<span class="tile-num">' + c.pct + '<small>%</small></span>' +
        '<span class="medidor"><i class="' + niv + '" style="width:' + c.pct + '%"></i></span>' +
        '<span class="tile-det">' + c.ok + " de " + c.tot + " turnos cubiertos</span></div>";
    }
    var mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), tiles = [];
    var m0 = cobertura(hoy.getFullYear(), hoy.getMonth()), m1 = cobertura(hoy.getFullYear(), hoy.getMonth() - 1);
    if (m0.pct !== null) tiles.push(tile(mes(hoy.getMonth()), m0));
    if (m1.pct !== null) tiles.push(tile(mes(mesAnt.getMonth()), m1));
    return '<p class="bloque-tit primero">Cobertura</p>' + (tiles.length
      ? '<div class="tiles' + (tiles.length === 1 ? " uno" : "") + '">' + tiles.join("") + "</div>"
      : '<div class="bloque"><div class="linea-turno"><span class="vacio">Todavía no hay sábados para medir.</span></div></div>');
  }
  // Próximas 4 semanas: un renglón por sábado con los horarios que fallan.
  function bloquePendientes() {
    var ps = proximoSabado(), grupos = [];
    for (var w = 0; w < 4; w++) {
      var fw = sumarDias(ps, w * 7);
      var malos = turnosDe(fw).filter(function (x) { return x.est.nivel !== "ok"; });
      if (malos.length) grupos.push({ f: fw, malos: malos });
    }
    var h = '<p class="bloque-tit">Para resolver · próximas 4 semanas</p><div class="bloque">';
    if (!grupos.length) h += '<div class="linea-turno"><span class="estado ok">Todo cubierto. No hay nada pendiente.</span></div>';
    grupos.forEach(function (g) {
      var iv = isoFecha(g.f);
      h += '<div class="fila-pend"><button class="pend-fecha" data-act="ir-turno" data-v="' + iv + '" data-turno="' + g.malos[0].t + '"><b>' + fechaCorta(g.f) + "</b><small>" + ORD[semanaDe(g.f) - 1] + " sáb</small></button>" +
        '<span class="pend-chips">' + g.malos.map(function (x) {
          return '<button class="pchip ' + (x.est.nivel || "vacio") + '" data-act="ir-turno" data-v="' + iv + '" data-turno="' + x.t + '" aria-label="' + esc(x.est.texto) + ", " + HORAS[x.t][0] + " a " + HORAS[x.t][1] + '">' + rango(x.t) + "</button>";
        }).join("") + "</span></div>";
    });
    h += "</div>";
    if (grupos.length) h += '<p class="leyenda"><span class="pchip vacio">sin cubrir</span><span class="pchip warn">falta gente</span><span class="pchip error">pareja no válida</span></p>';
    return h;
  }
  function bloqueAusencias(desde3) {
    var aus = {};
    state.exc.forEach(function (e) { if (e.tipo === "ausente" && e.fecha >= desde3) aus[e.publicador_id] = (aus[e.publicador_id] || 0) + 1; });
    var rank = Object.keys(aus).map(function (id) { return { p: pub(id), n: aus[id] }; }).filter(function (x) { return x.p; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    var h = '<p class="bloque-tit">Más ausencias · últimos 3 meses</p><div class="bloque">';
    if (!rank.length) h += '<div class="linea-turno"><span class="vacio">Nadie faltó a su turno fijo.</span></div>';
    var maxA = rank.length ? rank[0].n : 1;
    rank.forEach(function (x) {
      h += '<button class="fila-rank" data-act="ficha-desde" data-id="' + x.p.id + '"><span class="rank-nom">' + esc(completo(x.p)) + "</span>" +
        '<span class="rank-bar"><i style="width:' + Math.round(x.n * 100 / maxA) + '%"></i></span><span class="rank-n">' + x.n + "</span></button>";
    });
    return h + "</div>";
  }
  // Turnos que más fallaron en sábados ya pasados (desde que se usa la app, hasta 3 meses).
  function bloqueFallas(hoy, desde3, inicioTxt) {
    var fallas = {}, f = proximoSabado();
    if (isoFecha(f) === isoFecha(hoy)) f = sumarDias(f, 7); // el sábado de hoy todavía no terminó
    for (f = sumarDias(f, -7); isoFecha(f) >= state.inicio && isoFecha(f) >= desde3; f = sumarDias(f, -7)) {
      turnosDe(f).forEach(function (x) {
        if (x.est.nivel === "ok") return;
        var k = x.sem + "|" + x.t;
        fallas[k] = (fallas[k] || 0) + 1;
      });
    }
    var rf = Object.keys(fallas).map(function (k) { var z = k.split("|"); return { sem: +z[0], t: +z[1], n: fallas[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var h = '<p class="bloque-tit">Turnos que más quedaron sin cubrir</p><div class="bloque">';
    if (!rf.length) h += '<div class="linea-turno"><span class="vacio">Todavía no hay sábados pasados para comparar. Se cuenta desde el ' + inicioTxt + ".</span></div>";
    rf.forEach(function (x) {
      h += '<button class="fila-rank" data-act="ir-fijo" data-v="' + x.sem + '"><span class="rank-nom">' + SABADOS[x.sem - 1] +
        ' <small class="mono">' + rango(x.t) + 'h</small></span><span class="rank-n">' + x.n + (x.n === 1 ? " vez" : " veces") + "</span></button>";
    });
    return h + "</div>";
  }

  /* ---------- Hermanos: lista ---------- */
  // Turnos fijos en corto: "1er sáb 9–11" o "3 turnos fijos".
  function turnosCorto(p) {
    var suyos = fijosDe(p);
    if (!suyos.length) return "Sin turno fijo";
    if (suyos.length > 2) return suyos.length + " turnos fijos";
    return suyos.map(function (a) { return ORD[a.semana - 1] + " sáb " + rango(a.turno); }).join(", ");
  }
  function lineaLista(p) {
    var partes = [];
    if (p.congregacion && !filtroCong) partes.push(p.congregacion);
    partes.push(turnosCorto(p));
    return partes.join(" · ");
  }
  function listaHTML() {
    var vis = state.pubs.filter(function (p) {
      if (filtroGen && p.genero !== filtroGen) return false;
      if (!filtraCong(p, filtroCong)) return false;
      return !filtro || coincide(p, filtro);
    });
    var filtrando = filtro || filtroCong || filtroGen;
    var h = '<p class="conteo">' + (filtrando ? vis.length + " de " + state.pubs.length : state.pubs.length) + " hermanos</p>";
    if (!state.pubs.length) return h + '<p class="vacio">Todavía no cargaste a nadie. Tocá “+ Nuevo” para empezar.</p>';
    if (!vis.length) return h + '<p class="vacio">' + (filtro ? "Nadie coincide con “" + esc(filtro) + "”." : "No hay nadie con esos filtros.") + "</p>";
    if (ANCHO.matches) return h + tablaHermanos(vis);
    var letra = null;
    vis.forEach(function (p) {
      var d = lineaLista(p), l = norm(p.apellido || p.nombre).charAt(0).toUpperCase() || "#";
      if (l !== letra) { h += (letra === null ? "" : "</div>") + '<p class="letra">' + esc(l) + '</p><div class="filas">'; letra = l; }
      h += '<button class="fila-h" data-act="ficha" data-id="' + p.id + '"><span class="ini">' + esc(iniciales(p)) + "</span>" +
        '<span class="fila-txt"><b>' + esc(alfa(p)) + "</b>" + (d ? "<span>" + esc(d) + "</span>" : "") + '</span><span class="chev">›</span></button>';
    });
    return h + "</div>";
  }
  // En computadora, la lista es una tabla que se ordena tocando el encabezado.
  var COLUMNAS = [["nombre", "Nombre"], ["cong", "Congregación"], ["turnos", "Turnos fijos"], ["celular", "Celular"]];
  function claveOrden(p, col) {
    if (col === "cong") return p.congregacion ? norm(p.congregacion) : null;
    if (col === "celular") return p.celular || null;
    if (col === "turnos") { var f = fijosDe(p)[0]; return f ? f.semana * 10 + f.turno : null; }
    return norm(alfa(p));
  }
  function tablaHermanos(vis) {
    var filas = vis.slice().sort(function (a, b) {
      var x = claveOrden(a, orden.col), y = claveOrden(b, orden.col);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1; // los vacíos siempre al final
      var c = typeof x === "number" ? x - y : x.localeCompare(y, "es");
      return orden.asc ? c : -c;
    });
    var h = '<table class="tabla-h"><thead><tr>';
    COLUMNAS.forEach(function (c) {
      var on = orden.col === c[0];
      h += '<th scope="col" class="c-' + c[0] + '"' + (on ? ' aria-sort="' + (orden.asc ? "ascending" : "descending") + '"' : "") + ">" +
        '<button data-act="ordenar" data-v="' + c[0] + '">' + c[1] + (on ? (orden.asc ? " ↑" : " ↓") : "") + "</button></th>";
    });
    h += "</tr></thead><tbody>";
    filas.forEach(function (p) {
      var sel = pantalla.tipo === "ficha" && pantalla.id === p.id;
      h += '<tr data-act="fila-ficha" data-id="' + p.id + '"' + (sel ? ' class="sel"' : "") + ">" +
        '<td><button class="nom" data-act="ficha" data-id="' + p.id + '"' + (sel ? ' aria-current="true"' : "") + '><span class="ini">' + esc(iniciales(p)) + "</span>" + esc(alfa(p)) + "</button></td>" +
        "<td>" + esc(p.congregacion) + "</td><td>" + esc(turnosCorto(p)) + '</td><td class="c-celular"><span class="con-copiar">' + esc(p.celular) + (p.celular ? botonCopiarCel(p) : "") + "</span></td></tr>";
    });
    return h + "</tbody></table>";
  }
  function vistaLista() {
    var h = top("Exhibidor Boulogne", "Hermanos", '<button class="top-btn" data-act="nuevo">+ Nuevo</button>');
    h += '<div class="buscar">' + ICONOS.lupa + '<input type="search" id="filtro" placeholder="Buscar por nombre, congregación, idioma…" aria-label="Buscar hermano" value="' + esc(filtro) + '"></div>';
    h += '<div class="par filtros"><select id="filtro-cong" aria-label="Filtrar por congregación">' + opcionesCong(filtroCong, "Todas las congregaciones") + "</select>" +
      '<select id="filtro-gen" aria-label="Filtrar por género">' + opcion("", "Hermanos y hermanas", filtroGen) + opcion("M", "Hermanos", filtroGen) + opcion("F", "Hermanas", filtroGen) + "</select></div>";
    return h + '<div id="lista">' + listaHTML() + "</div>";
  }

  /* ---------- Hermanos: ficha ---------- */
  function vistaFicha(id) {
    var p = pub(id);
    if (!p) { pantalla = { tipo: "lista" }; return vistaLista(); }
    var c = p.conyuge_id ? pub(p.conyuge_id) : null;
    var h = top("", completo(p), '<button class="top-btn" data-act="editar" data-id="' + p.id + '">Editar</button>', pantalla.desde || "Hermanos");
    h += '<div class="ficha-cab"><span class="ini">' + esc(iniciales(p)) + '</span><div class="chips">';
    h += '<span class="chip">' + (p.genero === "M" ? "Hermano" : "Hermana") + "</span>";
    if (p.privilegio !== "ninguno") h += '<span class="chip acento">' + PRIV[p.privilegio] + "</span>";
    if (p.precursorado !== "no") h += '<span class="chip acento">' + textoPrec(p) + "</span>";
    h += '<span class="chip">' + EXP[p.experiencia] + "</span></div></div>";

    // Solo los datos cargados; lo que falta queda como botón para completarlo.
    var faltan = [];
    function dato(et, val, foco) {
      if (!val) { faltan.push([et, foco]); return ""; }
      return '<div class="dato"><dt>' + et + "</dt><dd>" + val + "</dd></div>";
    }
    h += '<dl class="bloque">';
    h += dato("Celular", p.celular ? '<span class="con-copiar">' + esc(p.celular) + botonCopiarCel(p) + "</span>" : "", "f-celular");
    h += dato("Mail", esc(p.mail), "f-mail");
    h += dato("Congregación", esc(p.congregacion), "f-cong");
    h += dato("Idiomas", p.idiomas.length ? '<span class="chips">' + p.idiomas.map(function (l) { return '<span class="chip">' + esc(l) + "</span>"; }).join("") + "</span>" : "", "f-nuevo-idioma");
    h += dato("Reemplazos", esc(textoCuenta(contarReemplazos(p.id))));
    h += "</dl>";
    if (faltan.length) h += '<div class="faltan">' + faltan.map(function (x) {
      return '<button class="sumar-chip" data-act="editar" data-id="' + p.id + '" data-foco="' + x[1] + '">+ ' + x[0] + "</button>";
    }).join("") + "</div>";

    h += '<div class="bloque">' + (c
      ? '<div class="linea-turno"><button class="nom" data-act="ficha-desde" data-id="' + c.id + '"><small class="et">Cónyuge</small>' + esc(completo(c)) + '</button>' +
        '<button class="accion acento" data-act="abrir-conyuge" data-id="' + p.id + '">Cambiar</button></div>'
      : '<button class="btn-fila" data-act="abrir-conyuge" data-id="' + p.id + '"><span>Elegir cónyuge</span><span>›</span></button>') + "</div>";

    var suyos = fijosDe(p);
    h += '<p class="bloque-tit">Turnos fijos</p><div class="bloque">';
    if (!suyos.length) h += '<div class="linea-turno"><span class="vacio">No está en ningún turno.</span></div>';
    suyos.forEach(function (a) {
      h += '<div class="linea-turno fila-fijo"><button class="nom" data-act="ir-fijo" data-v="' + a.semana + '" data-turno="' + a.turno + '"><span>' + SABADOS[a.semana - 1] + "<small>" + rango(a.turno) + 'h</small></span></button>' +
        '<button class="x" data-act="quitar" data-id="' + a.id + '" aria-label="Sacar del turno ' + SABADOS[a.semana - 1] + " " + rango(a.turno) + 'h">×</button></div>';
    });
    h += "</div>";

    if (confirmar) {
      h += '<div class="aviso-borrar">¿Borrar a ' + esc(completo(p)) + '? También se quita de todos los turnos.' +
        '<div class="dos"><button class="btn sec" data-act="borrar-no">Cancelar</button><button class="btn peligro-fuerte" data-act="borrar-si" data-id="' + p.id + '">Sí, borrar</button></div></div>';
    } else {
      h += '<button class="btn peligro ancho borrar" data-act="borrar-pedir">Borrar</button>';
    }
    return h;
  }

  /* ---------- Hermanos: formulario ---------- */
  function vistaForm() {
    var p = pantalla.id ? pub(pantalla.id) : null;
    var v = pantalla.draft ? Object.assign({}, p || base({}), pantalla.draft) : (p || base({}));
    function opciones(map, actual) {
      return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === actual ? " selected" : "") + ">" + map[k] + "</option>"; }).join("");
    }
    var h = top("", p ? "Editar hermano" : "Nuevo hermano", "", p ? completo(p) : "Hermanos");
    h += '<form class="form" id="form-pub" autocomplete="off">';

    h += '<div class="grupo"><span class="grupo-tit">Persona</span>';
    h += '<div class="par"><label class="campo" for="f-nombre">Nombre<input type="text" id="f-nombre" value="' + esc(v.nombre) + '"></label>';
    h += '<label class="campo" for="f-apellido">Apellido<input type="text" id="f-apellido" value="' + esc(v.apellido) + '"></label></div>';
    h += '<div class="seg"><input type="radio" name="genero" id="g-m" value="M"' + (v.genero === "M" ? " checked" : "") + '><label for="g-m">Hermano</label>';
    h += '<input type="radio" name="genero" id="g-f" value="F"' + (v.genero === "F" ? " checked" : "") + '><label for="g-f">Hermana</label></div></div>';

    h += '<div class="grupo"><span class="grupo-tit">Contacto</span>';
    h += '<label class="campo" for="f-celular">Celular<input type="tel" id="f-celular" inputmode="tel" value="' + esc(v.celular) + '"></label>';
    h += '<label class="campo" for="f-mail">Mail<input type="email" id="f-mail" inputmode="email" value="' + esc(v.mail) + '"></label></div>';

    h += '<div class="grupo"><span class="grupo-tit">Congregación y servicio</span>';
    h += '<label class="campo" for="f-cong">Congregación<select id="f-cong"><option value="">Sin congregación</option>';
    state.congs.forEach(function (c) { h += '<option value="' + esc(c) + '"' + (v.congregacion === c ? " selected" : "") + ">" + esc(c) + "</option>"; });
    h += "</select></label>";
    h += '<div class="agregar-a-lista"><input type="text" id="f-nueva-cong" placeholder="¿No está? Escribila" aria-label="Nueva congregación"><button type="button" class="btn sec" data-act="cong-nueva">Agregar</button></div>';
    h += '<div class="par"><label class="campo" for="f-priv">Privilegio<select id="f-priv">' + opciones(PRIV, v.privilegio) + "</select></label>";
    h += '<label class="campo" for="f-prec">Precursorado<select id="f-prec">' + opciones(PREC, v.precursorado) + "</select></label></div>";
    h += '<label class="campo" for="f-exp">Experiencia<select id="f-exp">' + opciones(EXP, v.experiencia) + "</select></label></div>";

    h += '<div class="grupo"><span class="grupo-tit">Idiomas</span><div class="tags">';
    state.langs.forEach(function (l) {
      h += '<button type="button" class="tag" data-act="tag-idioma" data-v="' + esc(l) + '" aria-pressed="' + (pantalla.idiomas.indexOf(l) !== -1) + '">' + esc(l) + "</button>";
    });
    h += '</div><div class="agregar-a-lista"><input type="text" id="f-nuevo-idioma" placeholder="Otro idioma" aria-label="Otro idioma"><button type="button" class="btn sec" data-act="idioma-nuevo">Agregar</button></div></div>';

    h += '<div class="dos barra-guardar"><button class="btn sec" type="button" data-act="volver">Cancelar</button>';
    h += '<button class="btn" type="submit">' + (p ? "Guardar" : "Agregar") + "</button></div></form>";
    return h;
  }
  // Guarda lo escrito en el formulario antes de redibujarlo (al agregar un idioma o congregación).
  function borrador() {
    if (pantalla.tipo !== "form") return;
    function v(id) { var e = document.getElementById(id); return e ? e.value : ""; }
    var gF = document.getElementById("g-f");
    pantalla.draft = {
      nombre: v("f-nombre"), apellido: v("f-apellido"), genero: gF && gF.checked ? "F" : "M",
      celular: v("f-celular"), mail: v("f-mail"), congregacion: v("f-cong"),
      privilegio: v("f-priv") || "ninguno", precursorado: v("f-prec") || "no", experiencia: v("f-exp") || "comun"
    };
  }

  /* ---------- hoja de búsqueda ---------- */
  function vistaPicker() {
    if (!picker) return "";
    var h = '<div class="hoja"><button class="hoja-fondo" data-act="cerrar-picker" aria-label="Cerrar"></button>';
    h += '<div class="hoja-panel" role="dialog" aria-label="' + esc(picker.titulo) + '"><div class="asa"></div>';
    h += '<div class="hoja-head"><strong>' + esc(picker.titulo) + '</strong><button data-act="cerrar-picker">Cerrar</button></div>';
    h += '<div class="buscar">' + ICONOS.lupa + '<input type="search" id="picker-q" placeholder="Buscar hermano…" aria-label="Buscar hermano"></div>';
    h += '<select id="picker-cong" aria-label="Filtrar por congregación">' + opcionesCong(pickerCong, "Todas las congregaciones") + "</select>";
    h += '<ul class="res-lista" id="picker-lista"></ul></div></div>';
    return h;
  }
  function llenarPicker(q) {
    var ul = document.getElementById("picker-lista");
    if (!ul || !picker) return;
    var items = picker.fuente().filter(function (it) { return filtraCong(it.p, pickerCong) && (!q || coincide(it.p, q)); });
    var h = "";
    if (picker.sinOpcion && !q) {
      h += '<li><button class="res" data-act="pick" data-id=""><span class="fila-txt"><b>' + esc(picker.sinOpcion) + "</b></span></button></li>";
    }
    items.forEach(function (it) {
      var d = detalle(it.p);
      h += '<li><button class="res" data-act="pick" data-id="' + it.p.id + '"><span class="ini">' + esc(iniciales(it.p)) + '</span><span class="fila-txt"><b>' + esc(alfa(it.p)) + "</b>" +
        (d ? "<span>" + esc(d) + "</span>" : "") + (it.info ? '<span class="res-info">' + esc(it.info) + "</span>" : "") + (it.tag ? '<span class="res-tag">' + esc(it.tag) + "</span>" : "") + "</span></button></li>";
    });
    if (!items.length) h += '<li class="res-sin">Nadie coincide con la búsqueda.</li>';
    ul.innerHTML = h;
  }
  function abrirPicker(p) { pickerCong = ""; picker = p; render(); }
  // Agregar un fijo al turno elegido en Fijos.
  function abrirTurno(turno) {
    var semana = semFijos;
    abrirPicker({
      titulo: SABADOS[semana - 1] + " · " + TURNOS[turno],
      fuente: function () {
        var enEste = {}, enOtro = {};
        state.asigs.forEach(function (a) {
          if (a.semana !== semana) return;
          if (a.turno === turno) enEste[a.publicador_id] = true; else enOtro[a.publicador_id] = true;
        });
        return state.pubs.filter(function (p) { return !enEste[p.id]; }).map(function (p) {
          return { p: p, tag: enOtro[p.id] ? "Ya tiene otro turno ese sábado" : "" };
        });
      },
      elegir: function (id) { if (id) agregarAsig(semana, turno, id); }
    });
  }
  // Agregar un reemplazo para la fecha elegida; primero los que menos reemplazos hicieron.
  function abrirExtra(turno) {
    var f = fecha, iso = isoFecha(f), semana = semanaDe(f);
    abrirPicker({
      titulo: "Reemplazo · " + f.getDate() + " de " + MESES[f.getMonth()] + " · " + TURNOS[turno],
      fuente: function () {
        var aqui = {}, otros = {};
        plantel(iso, semana, turno).forEach(function (x) { aqui[x.p.id] = true; });
        TURNOS.forEach(function (h, t) {
          if (t !== turno) presentes(plantel(iso, semana, t)).forEach(function (x) { otros[x.p.id] = true; });
        });
        return state.pubs.filter(function (p) { return !aqui[p.id]; }).map(function (p) {
          var n = contarReemplazos(p.id);
          return { p: p, n: n, info: n ? textoCuenta(n) : "", tag: otros[p.id] ? "Ya tiene otro turno ese día" : "" };
        }).sort(function (a, b) { return a.n - b.n; });
      },
      elegir: function (id) { if (id) agregarExtra(iso, semana, turno, id); }
    });
  }
  // Elegir cónyuge: solo personas del otro género.
  function abrirConyuge(id) {
    var yo = pub(id);
    if (!yo) return;
    abrirPicker({
      titulo: "Cónyuge de " + completo(yo),
      sinOpcion: yo.conyuge_id ? "Quitar cónyuge" : "",
      fuente: function () {
        return state.pubs.filter(function (o) { return o.id !== id && o.genero !== yo.genero; }).map(function (o) {
          var otro = o.conyuge_id && o.conyuge_id !== id ? pub(o.conyuge_id) : null;
          return { p: o, tag: otro ? "Hoy figura con " + completo(otro) : "" };
        });
      },
      elegir: function (nuevo) { setConyuge(id, nuevo || null); }
    });
  }

  /* ---------- render ---------- */
  function nav() {
    var items = [["sabados", "Sábados"], ["fijos", "Fijos"], ["hermanos", "Hermanos"], ["resumen", "Resumen"]];
    var h = '<nav class="nav" aria-label="Secciones"><div class="nav-in">';
    items.forEach(function (it, i) {
      h += '<button class="nav-btn" data-act="tab" data-v="' + it[0] + '" title="' + it[1] + " (" + (i + 1) + ')"' + (tab === it[0] ? ' aria-current="page"' : "") + '><span class="nav-ico">' + ICONOS[it[0]] + "</span>" + it[1] + "</button>";
    });
    return h + "</div></nav>";
  }
  // En computadora, Hermanos se ve en dos columnas: la lista y al lado la ficha.
  // El formulario ocupa todo el ancho, en dos columnas.
  function dividido() { return ANCHO.matches && tab === "hermanos" && pantalla.tipo !== "form"; }
  function vistaDetalle() {
    if (pantalla.tipo === "ficha" && pub(pantalla.id)) return vistaFicha(pantalla.id);
    return '<p class="detalle-vacio">Elegí un hermano de la lista para ver su ficha.</p>';
  }
  function vistaActual() {
    if (dividido()) return '<div class="split"><div class="col-lista">' + vistaLista() + '</div><div class="col-detalle">' + vistaDetalle() + "</div></div>";
    // En computadora, al lado de Sábados va "Para resolver" (solo se ve si hay lugar, ver CSS).
    if (tab === "sabados") return ANCHO.matches ? '<div class="sab-cols"><div class="sab-main">' + vistaSabados() + '</div><aside class="sab-lado">' + bloquePendientes() + "</aside></div>" : vistaSabados();
    if (tab === "fijos") return vistaFijos();
    if (tab === "resumen") return vistaResumen();
    if (pantalla.tipo === "ficha") return vistaFicha(pantalla.id);
    if (pantalla.tipo === "form") return vistaForm();
    return vistaLista();
  }
  // Para devolver el foco al mismo botón después de redibujar (lectores de pantalla y teclado).
  function firma(el) {
    if (!el || !app.contains(el) || el === document.body) return null;
    if (el.id) return "#" + CSS.escape(el.id);
    var sel = "";
    ["data-act", "data-id", "data-turno", "data-k", "data-v", "data-pid"].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v !== null) sel += "[" + a + '="' + CSS.escape(v) + '"]';
    });
    return sel || null;
  }
  function render() {
    var foco = firma(document.activeElement);
    ocultarTarjeta();
    var h = vistaActual() + nav();
    if (toast) h += '<div class="toast' + (toast.err ? " err" : "") + '" id="toast" role="status">' + esc(toast.texto) + "</div>";
    h += vistaPicker();
    app.classList.toggle("ancho", ANCHO.matches);
    app.innerHTML = h;

    if (animar && animar.dia && tab === "sabados") {
      var tl = app.querySelector(".turnos");
      if (tl) tl.classList.add(animar.dia > 0 ? "entra-der" : "entra-izq");
    } else if (animar && animar.abrir) {
      var art = app.querySelector('article.turno[data-k="' + animar.abrir + '"] .cuerpo');
      if (art) art.classList.add("abre");
    }
    animar = null;
    if (!picker && foco) {
      try { var fe = app.querySelector(foco); if (fe) fe.focus({ preventScroll: true }); } catch (e) {}
    }
    if (picker) {
      llenarPicker("");
      var q = document.getElementById("picker-q");
      if (q) q.focus();
    }
    // Altura de la barra superior, para que las letras de Hermanos queden fijas justo debajo.
    var barra = app.querySelector(".top");
    if (barra) document.documentElement.style.setProperty("--top-h", barra.offsetHeight + "px");
    // Centra la fecha elegida en la tira sin mover la página.
    if (tab === "sabados") {
      var tira = app.querySelector(".fechas"), sel = app.querySelector('.dia[aria-pressed="true"]');
      if (tira && sel) tira.scrollLeft = sel.offsetLeft - (tira.clientWidth - sel.offsetWidth) / 2;
    }
  }
  function irArriba() { if (!dividido()) window.scrollTo(0, 0); }
  function irFecha(nueva) {
    animar = { dia: nueva > fecha ? 1 : -1 };
    fecha = nueva; reemplazar(); render();
    anunciar(fechaLarga(fecha));
  }
  // Después de ir a un turno, lo muestra centrado.
  function mostrarTurno(t) {
    var art = t !== null && app.querySelectorAll(".turnos .turno")[+t];
    if (art) art.scrollIntoView({ block: "center" }); else irArriba();
  }
  if (ANCHO.addEventListener) ANCHO.addEventListener("change", function () { if (state) render(); });

  /* ---------- acciones (data-act de cada botón) ---------- */
  // Cada una recibe el botón tocado y su data-id.
  var acciones = {
    // navegación
    tab: function (b) {
      var v = b.getAttribute("data-v"), antes = tab + pantalla.tipo;
      if (tab === v && v === "hermanos") pantalla = { tipo: "lista" };
      tab = v; picker = null; confirmar = false;
      if (tab + pantalla.tipo !== antes) apilar();
      render(); irArriba();
    },
    hoy: function () { irFecha(proximoSabado()); irArriba(); },
    fecha: function (b) { irFecha(desdeIso(b.getAttribute("data-v"))); },
    "ir-turno": function (b) {
      fecha = desdeIso(b.getAttribute("data-v")); tab = "sabados"; apilar(); render();
      mostrarTurno(b.getAttribute("data-turno"));
    },
    "ir-fijo": function (b) {
      semFijos = +b.getAttribute("data-v"); tab = "fijos"; apilar(); render();
      mostrarTurno(b.getAttribute("data-turno"));
    },
    sem: function (b) { semFijos = parseInt(b.getAttribute("data-v"), 10); reemplazar(); render(); },
    "ficha-desde": function (b, id) {
      var desde = tab === "hermanos" ? (pantalla.tipo === "ficha" && pub(pantalla.id) ? completo(pub(pantalla.id)) : "Hermanos")
        : { sabados: "Sábados", fijos: "Fijos", resumen: "Resumen" }[tab];
      tab = "hermanos"; pantalla = { tipo: "ficha", id: id, desde: desde }; confirmar = false; apilar(); render(); irArriba();
    },
    ficha: function (b, id) { pantalla = { tipo: "ficha", id: id }; confirmar = false; apilar(); render(); irArriba(); },
    "fila-ficha": function (b, id) { acciones.ficha(b, id); },
    "copiar-cel": function (b, id) {
      var p = pub(id);
      if (!p || !p.celular) return;
      function fallo() { avisar("No se pudo copiar el celular.", true); render(); }
      try { navigator.clipboard.writeText(p.celular).then(function () { avisar("Celular copiado."); render(); }, fallo); } catch (err) { fallo(); }
    },
    ordenar: function (b) {
      var col = b.getAttribute("data-v");
      orden = { col: col, asc: orden.col === col ? !orden.asc : true }; render();
    },
    volver: function () {
      if (profundidad() > 0) { history.back(); return; }
      if (pantalla.tipo === "form" && pantalla.id) pantalla = { tipo: "ficha", id: pantalla.id };
      else pantalla = { tipo: "lista" };
      confirmar = false; reemplazar(); render(); irArriba();
    },

    // tarjetas de turno
    "menu-turno": function (b) {
      var k = b.getAttribute("data-k");
      menuTurno = menuTurno === k ? null : k; render();
    },
    "turno-abrir": function (b) {
      var k = b.getAttribute("data-k");
      animar = { abrir: k }; render();
      var bt = app.querySelector('article.turno[data-k="' + k + '"] .gente button');
      if (bt) bt.focus({ preventScroll: true });
    },
    "turno-plegar": function (b) { delete abiertos[b.getAttribute("data-k")]; render(); },
    ausente: function (b) {
      var pid = b.getAttribute("data-pid");
      marcarAusente(isoFecha(fecha), semanaDe(fecha), parseInt(b.getAttribute("data-turno"), 10), pid); cambio(); vibrar();
      var p = pub(pid); if (p) anunciar(completo(p) + " no viene");
    },
    "quitar-exc": function (b, id) { quitarExc(id); cambio(); vibrar(); anunciar("Listo"); },
    quitar: function (b, id) { quitarAsig(id); cambio(); vibrar(); anunciar("Quitado del turno"); },
    suspender: function (b) {
      var t = b.getAttribute("data-turno");
      state.susp[isoFecha(fecha) + "|" + t] = true; cambio(); vibrar();
      anunciar("Turno de " + TURNOS[+t] + " suspendido");
    },
    reactivar: function (b) {
      var t = b.getAttribute("data-turno");
      delete state.susp[isoFecha(fecha) + "|" + t]; aviso = null; cambio(); vibrar();
      anunciar("Turno de " + TURNOS[+t] + " reactivado");
    },
    aviso: function (b) {
      aviso = isoFecha(fecha) + "|" + b.getAttribute("data-turno"); render(); ajustarAviso();
    },
    pedido: function () { aviso = isoFecha(fecha) + "|pedido"; render(); ajustarAviso(); },
    "aviso-cerrar": function () { aviso = null; render(); },
    copiar: function () {
      var txt = document.getElementById("aviso-txt");
      var marcar = function () {
        txt.focus(); txt.select(); avisar("Mantené apretado el texto y elegí Copiar.", true); render();
        var t2 = document.getElementById("aviso-txt"); if (t2) { t2.focus(); t2.select(); }
      };
      try {
        navigator.clipboard.writeText(txt.value).then(function () { avisar("Copiado. Ya lo podés pegar en WhatsApp."); render(); }, marcar);
      } catch (err) { marcar(); }
    },

    // hoja de búsqueda
    "abrir-extra": function (b) { apilar({ picker: true }); abrirExtra(parseInt(b.getAttribute("data-turno"), 10)); },
    "abrir-turno": function (b) {
      if (b.hasAttribute("data-sem")) semFijos = +b.getAttribute("data-sem"); // tabla de Fijos en computadora
      apilar({ picker: true }); abrirTurno(parseInt(b.getAttribute("data-turno"), 10)); },
    "abrir-conyuge": function (b, id) { apilar({ picker: true }); abrirConyuge(id); },
    pick: function (b, id) {
      var fn = picker && picker.elegir;
      picker = null;
      if (fn) fn(id);
      cambio(); vibrar();
      if (id && pub(id)) anunciar(completo(pub(id)) + " agregado");
      if (history.state && history.state.picker) history.back();
    },
    "cerrar-picker": function () {
      picker = null;
      if (history.state && history.state.picker) history.back(); else render();
    },

    // hermanos
    nuevo: function () {
      pantalla = { tipo: "form", id: null, idiomas: [] }; apilar(); render(); irArriba();
      var n = document.getElementById("f-nombre"); if (n) n.focus();
    },
    editar: function (b, id) {
      var p = pub(id);
      pantalla = { tipo: "form", id: id, idiomas: p ? p.idiomas.slice() : [] }; apilar(); render(); irArriba();
      var foco = b.getAttribute("data-foco"), fe = foco && document.getElementById(foco);
      if (fe) { fe.scrollIntoView({ block: "center" }); fe.focus(); }
    },
    "borrar-pedir": function () { confirmar = true; render(); },
    "borrar-no": function () { confirmar = false; render(); },
    "borrar-si": function (b, id) {
      var nom = pub(id) ? completo(pub(id)) : "";
      borrarPub(id); confirmar = false; pantalla = { tipo: "lista" }; reemplazar();
      avisar(nom + " fue borrado."); cambio(); irArriba(); vibrar();
    },
    "tag-idioma": function (b) {
      var lang = b.getAttribute("data-v"), pos = pantalla.idiomas.indexOf(lang);
      if (pos === -1) pantalla.idiomas.push(lang); else pantalla.idiomas.splice(pos, 1);
      b.setAttribute("aria-pressed", String(pos === -1));
    },
    "idioma-nuevo": function () {
      borrador();
      var ni = document.getElementById("f-nuevo-idioma").value.trim();
      if (!ni) return;
      var nl = sinRepetir(state.langs, ni);
      if (pantalla.idiomas.indexOf(nl) === -1) pantalla.idiomas.push(nl);
      cambio();
    },
    "cong-nueva": function () {
      borrador();
      var nc = document.getElementById("f-nueva-cong").value.trim();
      if (nc) { pantalla.draft.congregacion = sinRepetir(state.congs, nc); cambio(); }
    },

    // datos de ejemplo
    vaciar: function () { state = estadoVacio(); pantalla = { tipo: "lista" }; cambio(); },
    quedarme: function () { state.ejemplo = false; cambio(); }
  };

  /* ---------- eventos ---------- */
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    if (act !== "tag-idioma") toast = null;
    if (act !== "menu-turno") menuTurno = null;
    // Un turno en el que se está trabajando queda abierto aunque pase a estar cubierto.
    var card = b.closest("article.turno[data-k]");
    if (card && act !== "menu-turno") abiertos[card.getAttribute("data-k")] = true;
    if (acciones[act]) acciones[act](b, b.getAttribute("data-id"));
  });

  app.addEventListener("input", function (e) {
    var el = e.target;
    if (el.id === "picker-q") llenarPicker(el.value);
    else if (el.id === "picker-cong") {
      pickerCong = el.value;
      var pq = document.getElementById("picker-q");
      llenarPicker(pq ? pq.value : "");
    } else if (el.id === "filtro" || el.id === "filtro-cong" || el.id === "filtro-gen") {
      if (el.id === "filtro") filtro = el.value;
      else if (el.id === "filtro-cong") filtroCong = el.value;
      else filtroGen = el.value;
      var cont = document.getElementById("lista");
      if (cont) cont.innerHTML = listaHTML();
    }
  });

  // Con mouse: al dejar el cursor sobre un nombre en Sábados o Fijos, una tarjeta con sus datos.
  var CON_MOUSE = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: false };
  var tarjetaTimer = null;
  function ocultarTarjeta() { clearTimeout(tarjetaTimer); tarjeta.className = "tarjeta"; }
  function mostrarTarjeta(b) {
    var p = pub(b.getAttribute("data-id"));
    if (!p || !b.isConnected) return;
    var h = "<b>" + esc(completo(p)) + "</b>";
    if (p.celular) h += '<span class="mono">' + esc(p.celular) + "</span>";
    if (p.congregacion) h += "<span>" + esc(p.congregacion) + "</span>";
    h += "<span>" + esc(textoCuenta(contarReemplazos(p.id))) + "</span>";
    tarjeta.innerHTML = h;
    tarjeta.className = "tarjeta visible";
    var r = b.getBoundingClientRect(), w = tarjeta.offsetWidth, alto = tarjeta.offsetHeight;
    var x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var y = r.bottom + 6 + alto > window.innerHeight ? r.top - alto - 6 : r.bottom + 6;
    tarjeta.style.left = x + "px"; tarjeta.style.top = y + "px";
  }
  app.addEventListener("mouseover", function (e) {
    if (!CON_MOUSE.matches || arrastrado) return;
    var b = e.target.closest && e.target.closest('button.nom[data-act="ficha-desde"]');
    if (!b || (tab !== "sabados" && tab !== "fijos")) return;
    clearTimeout(tarjetaTimer);
    tarjetaTimer = setTimeout(function () { mostrarTarjeta(b); }, 450);
  });
  app.addEventListener("mouseout", function (e) {
    var b = e.target.closest && e.target.closest('button.nom[data-act="ficha-desde"]');
    if (b && !b.contains(e.relatedTarget)) ocultarTarjeta();
  });
  window.addEventListener("scroll", ocultarTarjeta, { passive: true });

  // Arrastrar un fijo a otra celda de la tabla de Fijos (computadora).
  var arrastrado = null;
  function soltarEn(e) { return arrastrado && e.target.closest && e.target.closest("td.tf-celda"); }
  app.addEventListener("dragstart", function (e) {
    var el = e.target.closest && e.target.closest(".tf-p[data-asig]");
    if (!el) return;
    arrastrado = el.getAttribute("data-asig");
    ocultarTarjeta();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", arrastrado);
    el.classList.add("arrastrando");
  });
  app.addEventListener("dragover", function (e) {
    var td = soltarEn(e);
    if (!td) return;
    e.preventDefault();
    app.querySelectorAll("td.destino").forEach(function (x) { if (x !== td) x.classList.remove("destino"); });
    td.classList.add("destino");
  });
  app.addEventListener("drop", function (e) {
    var td = soltarEn(e);
    if (!td) return;
    e.preventDefault();
    var id = arrastrado;
    arrastrado = null;
    if (moverAsig(id, +td.getAttribute("data-sem"), +td.getAttribute("data-turno"))) { cambio(); anunciar("Turno cambiado"); }
    else render();
  });
  app.addEventListener("dragend", function () {
    arrastrado = null;
    app.querySelectorAll(".arrastrando, td.destino").forEach(function (x) { x.classList.remove("arrastrando", "destino"); });
  });

  // Guardar el formulario de un hermano.
  app.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id !== "form-pub") return;
    function val(i) { return document.getElementById(i).value.trim(); }
    var nombre = val("f-nombre");
    if (!nombre) {
      borrador(); avisar("Escribí al menos el nombre.", true); render();
      var n = document.getElementById("f-nombre"); if (n) n.focus();
      return;
    }
    var datos = {
      nombre: nombre, apellido: val("f-apellido"),
      genero: document.getElementById("g-f").checked ? "F" : "M",
      celular: val("f-celular"), mail: val("f-mail"), congregacion: document.getElementById("f-cong").value,
      privilegio: document.getElementById("f-priv").value,
      precursorado: document.getElementById("f-prec").value,
      experiencia: document.getElementById("f-exp").value,
      idiomas: pantalla.idiomas.slice()
    };
    var destino, editado = !!pantalla.id;
    if (editado) {
      var p = pub(pantalla.id);
      if (p) {
        if (p.genero !== datos.genero && p.conyuge_id) setConyuge(p.id, null);
        Object.keys(datos).forEach(function (k) { p[k] = datos[k]; });
      }
      destino = pantalla.id;
      avisar("Cambios guardados.");
    } else {
      datos.id = uid(); datos.conyuge_id = null;
      state.pubs.push(base(datos));
      destino = datos.id;
      avisar(completo(datos) + " agregado.");
    }
    ordenar();
    // Editar vuelve a la ficha de la que vino; uno nuevo reemplaza el formulario por su ficha.
    pantalla = { tipo: "ficha", id: destino };
    cambio(); irArriba();
    if (editado && profundidad() > 0) history.back(); else reemplazar();
  });

  /* ---------- historial: el botón atrás del celular navega dentro de la app ---------- */
  function profundidad() { return (history.state && history.state.app && history.state.n) || 0; }
  function foto(extra) {
    return Object.assign({
      app: 1, n: profundidad(), tab: tab, sem: semFijos, fecha: fecha ? isoFecha(fecha) : null,
      pantalla: { tipo: pantalla.tipo, id: pantalla.id || null, desde: pantalla.desde || null }
    }, extra);
  }
  function apilar(extra) { history.pushState(foto(Object.assign({ n: profundidad() + 1 }, extra)), ""); }
  function reemplazar() { history.replaceState(foto(), ""); }
  function restaurar(s) {
    picker = null; confirmar = false; aviso = null;
    if (!s || !s.app) return;
    tab = s.tab; semFijos = s.sem;
    if (s.fecha) fecha = desdeIso(s.fecha);
    if (s.pantalla.tipo === "form") {
      var p = s.pantalla.id && state ? pub(s.pantalla.id) : null;
      pantalla = { tipo: "form", id: s.pantalla.id, idiomas: p ? p.idiomas.slice() : [] };
    } else {
      pantalla = { tipo: s.pantalla.tipo, id: s.pantalla.id, desde: s.pantalla.desde || null };
    }
  }
  window.addEventListener("popstate", function (e) {
    restaurar(e.state);
    if (state) { render(); irArriba(); }
  });
  if (history.state && history.state.app) restaurar(history.state); // al recargar, queda donde estaba
  else history.replaceState(foto({ n: 0 }), "");

  /* ---------- gestos: deslizar entre sábados y bajar para actualizar ---------- */
  var toque = null, actualizando = false;
  function libre() { return state && !picker && !aviso && !confirmar && pantalla.tipo !== "form"; }
  function actualizar() {
    if (actualizando || almacen.ocupado()) return;
    actualizando = true;
    indicador.textContent = "Actualizando…"; indicador.className = "tirar visible";
    almacen.cargar().then(function (s) { aplicar(s); mostrarMarca("Actualizado ✓", "ok"); }, function () {
      avisar("No se pudo actualizar. Revisá la conexión.", true); render();
    }).then(function () { actualizando = false; indicador.className = "tirar"; indicador.style.transform = ""; });
  }
  app.addEventListener("touchstart", function (e) {
    if (!libre() || e.touches.length !== 1) { toque = null; return; }
    var t = e.touches[0];
    toque = { x: t.clientX, y: t.clientY, arriba: window.scrollY <= 0, enTira: !!e.target.closest(".fechas") };
  }, { passive: true });
  app.addEventListener("touchmove", function (e) {
    if (!toque || !toque.arriba || actualizando) return;
    var t = e.touches[0], dy = t.clientY - toque.y, dx = t.clientX - toque.x;
    if (dy > 10 && dy > Math.abs(dx)) {
      var d = Math.min(dy, 120);
      indicador.textContent = d >= 80 ? "Soltá para actualizar" : "Bajá para actualizar";
      indicador.className = "tirar visible"; indicador.style.transform = "translate(-50%, " + (d / 2) + "px)";
    }
  }, { passive: true });
  app.addEventListener("touchend", function (e) {
    if (!toque) return;
    var t = e.changedTouches[0], dx = t.clientX - toque.x, dy = t.clientY - toque.y, ini = toque;
    toque = null;
    if (ini.arriba && dy >= 80 && dy > Math.abs(dx)) { actualizar(); return; }
    if (!actualizando) { indicador.className = "tirar"; indicador.style.transform = ""; }
    if (tab === "sabados" && !ini.enTira && Math.abs(dx) > 70 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      irFecha(sumarDias(fecha, dx < 0 ? 7 : -7)); irArriba();
    }
  });

  /* ---------- teclado: / busca, Esc cierra, Enter elige, ↑ ↓ recorren resultados, ← → cambian de sábado,
     1–4 cambian de pestaña, H va al próximo sábado, N agrega un hermano ---------- */
  var PESTANAS = ["sabados", "fijos", "hermanos", "resumen"];
  function escribiendo(el) { return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); }
  document.addEventListener("keydown", function (e) {
    if (!state || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    if (e.key === "Escape") {
      if (picker) acciones["cerrar-picker"]();
      else if (menuTurno || aviso || confirmar) { menuTurno = null; aviso = null; confirmar = false; render(); }
      else return;
      e.preventDefault();
      return;
    }
    // Enter en el buscador elige el primer resultado (si se escribió algo).
    if (e.key === "Enter" && el && el.id === "picker-q") {
      var primero = el.value.trim() && app.querySelector('#picker-lista .res:not([data-id=""])');
      if (primero) { e.preventDefault(); primero.click(); }
      return;
    }
    if (picker && (e.key === "ArrowDown" || e.key === "ArrowUp") && el && (el.id === "picker-q" || el.closest("#picker-lista"))) {
      e.preventDefault();
      var res = Array.prototype.slice.call(app.querySelectorAll("#picker-lista .res"));
      var i = res.indexOf(el), sig = e.key === "ArrowDown" ? i + 1 : i - 1;
      if (sig < 0) document.getElementById("picker-q").focus();
      else if (res[sig]) { res[sig].focus(); res[sig].scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (escribiendo(el)) return;
    if (!picker && "1234".indexOf(e.key) !== -1) {
      var b = app.querySelector('[data-act="tab"][data-v="' + PESTANAS[+e.key - 1] + '"]');
      if (b) { e.preventDefault(); b.click(); }
      return;
    }
    if (!picker && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      if (tab !== "sabados") { tab = "sabados"; apilar(); }
      acciones.hoy();
      return;
    }
    if (!picker && (e.key === "n" || e.key === "N") && pantalla.tipo !== "form") {
      e.preventDefault();
      tab = "hermanos"; confirmar = false; acciones.nuevo();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      if (picker) { var pq = document.getElementById("picker-q"); if (pq) pq.focus(); return; }
      if (!document.getElementById("filtro")) {
        tab = "hermanos"; pantalla = { tipo: "lista" }; confirmar = false; apilar(); render(); irArriba();
      }
      var f = document.getElementById("filtro");
      if (f) f.focus();
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && tab === "sabados" && libre()) {
      e.preventDefault();
      irFecha(sumarDias(fecha, e.key === "ArrowRight" ? 7 : -7));
    }
  });

  /* ---------- carga ---------- */
  function aplicar(s) {
    state = preparar(s);
    ordenar();
    render();
  }
  function errorCarga() {
    app.innerHTML = top("Exhibidor Boulogne", "Sin conexión") +
      '<p class="nota">No se pudieron cargar los datos. Revisá la conexión y recargá la página.</p>';
  }
  (function esqueleto() {
    var h = '<div class="esq esq-tit"></div><div class="esq esq-fechas"></div>';
    for (var i = 0; i < 4; i++) h += '<div class="esq esq-turno"></div>';
    app.innerHTML = '<div aria-busy="true" aria-label="Cargando">' + h + "</div>";
  })();
  almacen.cargar().then(aplicar, errorCarga);

  // Al volver a la app, trae lo que hayan cambiado otros (si no estás en medio de algo).
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !state) return;
    if (picker || aviso || confirmar || pantalla.tipo === "form" || almacen.ocupado()) return;
    almacen.cargar().then(aplicar, function () {});
  });
}
