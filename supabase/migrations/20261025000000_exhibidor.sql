-- Exhibidor Boulogne · se aplica sola al pushear (integración GitHub de Supabase).
-- Las tablas llevan el prefijo "exhibidor_" para poder convivir con otras apps en el mismo proyecto.
-- Sin login: cualquiera con el link puede leer y editar (RLS abierto para anon).

create table if not exists exhibidor_publicadores (
  id text primary key,
  nombre text not null default '',
  apellido text not null default '',
  genero text not null default 'M' check (genero in ('M', 'F')),
  celular text not null default '',
  mail text not null default '',
  congregacion text not null default '',
  privilegio text not null default 'ninguno' check (privilegio in ('ninguno', 'siervo', 'anciano')),
  precursorado text not null default 'no' check (precursorado in ('no', 'regular', 'especial', 'sc')),
  idiomas text[] not null default '{}',
  experiencia text not null default 'comun' check (experiencia in ('principiante', 'comun', 'mentor')),
  conyuge_id text
);

-- Patrón fijo: (sábado del mes, turno) -> persona
create table if not exists exhibidor_asignaciones (
  id text primary key,
  semana smallint not null check (semana between 1 and 5),
  turno smallint not null check (turno between 0 and 4),
  publicador_id text not null references exhibidor_publicadores (id) on delete cascade,
  fijo boolean not null default true
);

-- Cambios por fecha: ausente = un fijo no viene; extra = reemplazo
create table if not exists exhibidor_excepciones (
  id text primary key,
  fecha date not null,
  semana smallint not null check (semana between 1 and 5),
  turno smallint not null check (turno between 0 and 4),
  publicador_id text not null references exhibidor_publicadores (id) on delete cascade,
  tipo text not null check (tipo in ('ausente', 'extra'))
);
create index if not exists exhibidor_excepciones_fecha on exhibidor_excepciones (fecha);

-- Turnos suspendidos por mal clima. id = 'AAAA-MM-DD|turno'
create table if not exists exhibidor_suspensiones (
  id text primary key,
  fecha date not null,
  turno smallint not null check (turno between 0 and 4)
);

-- Congregaciones e idiomas. id = 'cong|Boulogne' o 'idioma|Inglés'
create table if not exists exhibidor_listas (
  id text primary key,
  tipo text not null check (tipo in ('cong', 'idioma')),
  valor text not null
);

-- Configuración: 'inicio' (AAAA-MM-DD) y 'ejemplo' ('1' / '0')
create table if not exists exhibidor_config (
  id text primary key,
  valor text
);

do $$
declare t text;
begin
  foreach t in array array['exhibidor_publicadores', 'exhibidor_asignaciones', 'exhibidor_excepciones',
                           'exhibidor_suspensiones', 'exhibidor_listas', 'exhibidor_config']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "abierto" on %I', t);
    execute format('create policy "abierto" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
