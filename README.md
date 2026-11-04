# POLE CLUB — Plataforma Web Full Stack & Validación de PMV

> **Eslogan:** Más que entrenar. Pertenecer.  
> **Concepto:** Comunidad y membresía exclusiva para personas que practican pole dance.  
> **Modelo de negocio:** Suscripción mensual ($39.000 COP regular / $29.000 COP miembros fundadores).  
> **Fase:** Prototipo funcional y experimento comercial para validación de hipótesis de negocio.

---

## 1. Visión de Marca y Dirección de Arte

**POLE CLUB** trasciende el concepto de gimnasio tradicional o plataforma transaccional de descuentos. Es un espacio de conexión, bienestar, aprendizaje y pertenencia diseñado para bailarinas y practicantes de pole dance.

- **Estética:** Minimalismo de *wellness* contemporáneo inspirado en spas boutique, editoriales de lifestyle premium, luz natural, arquitectura orgánica y texturas de lino y piedra.
- **Paleta de Color Oficial:**
  - Beige arena: `#D8C9B5`
  - Marfil cálido: `#F5F1E9`
  - Crema: `#EAE2D6`
  - Taupe: `#A89B8B`
  - Negro profundo: `#171715`
  - Gris piedra: `#77736C`
- **Tipografía:** Fusión de serif editorial de alto contraste (*Cormorant Garamond*) para titulares y sans-serif geométrica y legible (*Plus Jakarta Sans*) para interfaz y navegación.

---

## 2. Arquitectura del Proyecto

El proyecto está diseñado bajo una arquitectura limpia, modular y de cero fricción:

```text
poledance/
├── public/                       # Frontend estático y assets optimizados
│   ├── index.html                # Landing page principal
│   ├── admin.html                # Panel administrativo protegido
│   ├── privacy.html              # Política de tratamiento de datos personales
│   ├── css/
│   │   ├── styles.css            # Sistema de estilos y dirección de arte
│   │   └── admin.css             # Estilos del panel de control
│   └── js/
│       ├── app.js                # Interacciones, validaciones y analítica
│       └── admin.js              # Controlador del dashboard y exportación
├── server.js                     # Servidor HTTP nativo Node.js y API REST
├── db.js                         # Capa de datos dual (SQLite local + Supabase)
├── supabase_schema.sql           # DDL PostgreSQL con Row Level Security (RLS)
├── test.js                       # Suite automatizada de pruebas de integración
├── package.json                  # Definición del paquete
├── .env                          # Variables de entorno activas
├── .env.example                  # Plantilla de variables de entorno
├── start.bat                     # Lanzador de un solo clic para Windows
└── poleclub.db                   # Base de datos persistente SQLite (creada al iniciar)
```

---

## 3. Características Funcionales

### A. Frontend
- **Navegación Sticky & Responsive:** Transición de altura suave, indicador de sección y menú hamburguesa táctil para dispositivos móviles.
- **Hero de Impacto Editorial:** Composición tipo portada de revista con fotografía editorial de alta calidad y contador dinámico de cupos restantes.
- **Sección de Beneficios:** Tarjetas con microinteracciones sutiles al pasar el cursor y etiquetas descriptivas.
- **Sección de Membresía (Bloque de Contraste Oscuro):** Comparativa entre el plan regular proyectado ($39.000 COP) y la oferta de Miembro Fundador ($29.000 COP para las primeras 20 inscritas).
- **Acordeón FAQ Interactivo:** Respuestas desplegables con transiciones suaves y control por teclado.
- **Formulario Modal de Validación:**
  - Nombre completo.
  - Correo electrónico (con validación de formato y detección de duplicados).
  - Usuario de Instagram.
  - Tiempo practicando pole dance (pills interactivas).
  - Beneficios de mayor interés (multi-select interactivo).
  - Disposición de pago de la membresía ($39.000 COP).
  - Beneficios adicionales o sugerencias cualitativas.
  - Casilla de aceptación de Habeas Data obligatoria.
- **Pantalla de Confirmación:** Mensaje claro de manifestación de interés sin generar falsas expectativas de cobro.
- **Tracking Anónimo de Funnel:** Registro de eventos de navegación y conversión para el PMV.

### B. Backend y Base de Datos
- **Persistencia Real Inmediata:** Base de datos SQLite (`poleclub.db`) integrada a través de `node:sqlite`, con almacenamiento real en disco, transacciones y prevención de inyecciones.
- **Endpoints REST:**
  - `POST /api/leads`: Registro, sanitización, validación y control de duplicados (HTTP 409).
  - `POST /api/analytics/event`: Registro anónimo de eventos del embudo.
  - `POST /api/admin/login`: Autenticación con contraseña y generación de tokens de sesión seguros.
  - `GET /api/admin/check-auth`: Verificación de sesión activa.
  - `GET /api/admin/stats`: Métricas de conversión, porcentajes y distribución de respuestas.
  - `GET /api/admin/leads`: Consulta filtrada por nombre, correo, disposición de pago o experiencia.
  - `GET /api/admin/export.csv`: Generador de CSV en estándar RFC 4180 con BOM UTF-8 (compatible con Excel).
  - `GET /api/health`: Estado del servicio y modo de persistencia.

### C. Panel Administrativo Protegido (`/admin`)
- **Acceso Restringido:** Protegido por contraseña (clave predeterminada: `poleclub2026`).
- **Métricas PMV Clave:**
  - Total de personas registradas.
  - Cupos restantes del piloto fundador (meta: 20 cupos).
  - Tasa porcentual de disposición de pago ("Sí pagaría", "Quisiera conocer más", "No pagaría").
  - Ranking visual de beneficios más votados.
- **Filtros Dinámicos:** Búsqueda en tiempo real y filtrado por disposición de pago y tiempo de práctica.
- **Detalle Individual de Respuestas:** Modal para leer las sugerencias cualitativas de cada bailarina.
- **Exportación CSV con un Clic:** Descarga inmediata para análisis en hojas de cálculo.

---

## 4. Instrucciones de Ejecución

### Opción 1: Lanzador de un Clic en Windows
Haz doble clic sobre el archivo `start.bat`. El script iniciará el servidor y abrirá tu navegador automáticamente en `http://localhost:3000`.

### Opción 2: Ejecución por Terminal
Abre PowerShell o CMD en la carpeta del proyecto y ejecuta:

```powershell
.\node.cmd server.js
```

O si tienes Node.js instalado globalmente:

```bash
npm start
```

### Ejecutar Pruebas Automatizadas

Para validar todos los endpoints, reglas de negocio y persistencia:

```powershell
.\node.cmd test.js
```

---

## 5. Configuración de Supabase (Despliegue en Producción)

El sistema opera de forma nativa e inmediata con SQLite local. Si deseas sincronizar la persistencia en la nube con Supabase PostgreSQL:

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. En el **SQL Editor** de Supabase, ejecuta el script `supabase_schema.sql` provisto en la raíz del proyecto. Este script creará la tabla `membership_leads`, las políticas de seguridad RLS y los índices requeridos.
3. Copia la URL del proyecto y la API Key (`service_role` o `anon`).
4. Edita el archivo `.env`:
   ```env
   PORT=3000
   ADMIN_PASSWORD=poleclub2026
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_ANON_KEY=tu-anon-key
   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
   ```
5. Reinicia el servidor. La consola indicará: `Persistencia: Supabase + SQLite Local`.

---

## 6. Credenciales de Acceso

- **URL de la Landing Page:** `http://localhost:3000/`
- **URL del Panel Administrativo:** `http://localhost:3000/admin`
- **Contraseña de Administrador por defecto:** `poleclub2026`
  *(Puedes modificar esta clave en el archivo `.env` mediante la variable `ADMIN_PASSWORD`)*
