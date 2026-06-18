# OGTIC RRHH Cloud

Versión inicial profesional para llevar la app a Supabase.

## Estructura

- `index.html`: pantalla principal.
- `styles.css`: diseño responsive.
- `src/config.example.js`: copiar como `src/config.js`.
- `src/supabaseClient.js`: conexión Supabase.
- `src/utils.js`: fechas DD/MM/AAAA, cédulas, dinero.
- `src/api.js`: operaciones de base de datos.
- `src/app.js`: lógica de interfaz.
- `supabase/schema.sql`: tablas, roles y políticas RLS.
- `supabase/create_first_admin.sql`: asignar usuario admin.

## Roles

- `admin`: carga nómina, modifica feriados, respalda, aprueba.
- `operador`: consulta y ejecuta solicitudes, certificaciones, inactivos y tickets. No modifica nómina, feriados ni respaldo.

## Fechas

Todas las fechas se muestran como `DD/MM/AAAA`.


## v1.2
- Se corrige el logo institucional.
- Se agrega el fondo real de certificación.
- La vista previa ya no rompe el layout.


## Configuración incluida

Esta versión ya trae `src/config.js` configurado con el proyecto Supabase indicado por el usuario.
No es necesario copiar manualmente el archivo `config.js`.


## v1.5 - Nómina histórica

Cambios:
- La nómina histórica usa columnas: Nombre, Cedula, Genero, Fecha de Ingreso, Departamento, Cargo, Salario, Tipo de Servidor Público, Categoría de Servidores Públicos, Estatus.
- `estatus_nomina` se usa para certificaciones:
  - Activo => "labora"
  - Desvinculado/Inactivo => "laboró"
- El estatus histórico no marca empleados como inactivos para liquidación de vacaciones.
- Solo se contemplarán para vacaciones no disfrutadas los colaboradores marcados por el sistema como inactivos desde el 25/06/2026.
- Incluye SQL `supabase/import_nomina_historica_libro4asdfg.sql` para cargar la nómina subida por el usuario.
- Se detectaron cédulas duplicadas en el Excel; el import omite duplicados posteriores para evitar error de upsert.


## GitHub / despliegue inicial

Esta versión está lista para subirse a GitHub como sitio estático.

Archivos principales:
- index.html
- styles.css
- src/
- assets/
- supabase/

Configuración incluida:
- src/config.js ya contiene la conexión Supabase indicada por el usuario.
- La llave usada es publishable/anon, no service_role.

Importante:
- Nunca subir una llave `service_role`.
- Mantener Row Level Security activo en Supabase.
