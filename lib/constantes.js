// Datos fijos del exhibidor: turnos, textos de las opciones e íconos.

export var HORAS = [["7", "9"], ["9", "11"], ["11", "13"], ["13", "15"], ["15", "17"]];
export var TURNOS = ["7:00 a 9:00", "9:00 a 11:00", "11:00 a 13:00", "13:00 a 15:00", "15:00 a 17:00"];
export var SABADOS = ["1er sábado", "2do sábado", "3er sábado", "4to sábado", "5to sábado"];
export var ORD = ["1er", "2do", "3er", "4to", "5to"];
export var MAX = 4; // personas por turno

export var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export var MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export var PRIV = { ninguno: "Ninguno", siervo: "Siervo ministerial", anciano: "Anciano" };
export var PREC = { no: "No", regular: "Regular", especial: "Especial", sc: "Superintendente de circuito" };
export var EXP = { principiante: "Principiante", comun: "Común", mentor: "Mentor" };
export var IDIOMAS_BASE = ["Español", "Inglés", "Portugués", "Italiano", "Lengua de señas", "Chino"];

export var ICONOS = {
  sabados: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2.2 2.2 4.8-4.8"/></svg>',
  fijos: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/></svg>',
  hermanos: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16.2 14.6c2.4.2 4.2 1.8 4.8 4.4"/></svg>',
  enviar: '<svg viewBox="0 0 24 24"><path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/></svg>',
  resumen: '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/></svg>',
  lupa: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
};

// Contacto que figura en el pedido de reemplazos.
export var CONTACTO = "+54 11 3096-5689 (Luciano Becchia)";
