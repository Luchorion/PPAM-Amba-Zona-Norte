"use client";

import { useEffect, useRef } from "react";
import { iniciar } from "@/lib/exhibidor";
import { crearAlmacen } from "@/lib/almacen";

// La app es el mismo código vanilla de index.html: React solo le da el contenedor.
export default function Exhibidor() {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && !ref.current.dataset.listo) {
      ref.current.dataset.listo = "1";
      iniciar(ref.current, crearAlmacen());
    }
  }, []);
  return <div id="app" ref={ref} />;
}
