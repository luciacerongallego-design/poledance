/**
 * POLE CLUB — BACKEND SERVER
 * 
 * Servidor HTTP de alto rendimiento en Node.js nativo.
 * Incluye servidor de estáticos, API REST para leads, autenticación
 * para el panel administrativo, métricas analíticas y exportación a CSV.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Cargar variables de entorno desde .env manualmente sin dependencias
loadEnvFile(path.join(__dirname, '.env'));

const db = require('./db.js');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'poleclub2026';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Almacén en memoria de tokens de sesión válidos para administradores
const validSessions = new Map();

// Limpieza periódica de tokens expirados (24 horas de vigencia)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of validSessions.entries()) {
    if (now - session.createdAt > 24 * 60 * 60 * 1000) {
      validSessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * Función principal de enrutamiento HTTP
 */
const server = http.createServer(async (req, res) => {
  // Configurar encabezados de seguridad y CORS para entorno web
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // Manejo de peticiones preflight CORS si fuera necesario
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // =========================================================================
    // RUTAS DE LA API REST
    // =========================================================================

    // 1. POST /api/leads — Registro de nuevo lead
    if (pathname === '/api/leads' && method === 'POST') {
      const body = await parseJsonBody(req);
      const validation = validateLeadInput(body);

      if (!validation.isValid) {
        return sendJson(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Por favor completa todos los campos obligatorios correctamente.',
          details: validation.errors
        });
      }

      // Validar si el correo ya existe
      const existing = db.findLeadByEmail(body.email);
      if (existing) {
        return sendJson(res, 409, {
          error: 'DUPLICATE_EMAIL',
          message: 'Este correo electrónico ya se encuentra registrado en nuestra lista de espera de miembros fundadores.'
        });
      }

      // Obtener IP y User-Agent para fines analíticos
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      const leadData = {
        full_name: sanitizeString(body.full_name),
        email: body.email.toLowerCase().trim(),
        instagram: sanitizeString(body.instagram),
        pole_experience: body.pole_experience,
        preferred_benefits: Array.isArray(body.preferred_benefits) ? body.preferred_benefits : [],
        willingness_to_pay: body.willingness_to_pay,
        additional_benefits: body.additional_benefits ? sanitizeString(body.additional_benefits) : null,
        privacy_consent: Boolean(body.privacy_consent),
        ip_address: ip,
        user_agent: userAgent
      };

      const result = await db.createLead(leadData);

      // Registrar evento de conversión para validación del PMV
      db.recordEvent('lead_registered', 'membership_modal', {
        id: result.id,
        willingness: leadData.willingness_to_pay,
        experience: leadData.pole_experience
      });

      return sendJson(res, 201, {
        success: true,
        message: '¡Qué bueno tenerte aquí! Tu interés en Pole Club ha sido registrado con éxito.',
        leadId: result.id,
        storage: result.storage
      });
    }

    // 2. POST /api/analytics/event — Registro de eventos anónimos de comportamiento
    if (pathname === '/api/analytics/event' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.eventName) {
        db.recordEvent(
          sanitizeString(body.eventName),
          body.sectionName ? sanitizeString(body.sectionName) : null,
          body.metadata || {}
        );
      }
      return sendJson(res, 200, { success: true });
    }

    // 3. POST /api/admin/login — Inicio de sesión de administradores
    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await parseJsonBody(req);
      const providedPassword = body.password ? String(body.password) : '';

      if (providedPassword === ADMIN_PASSWORD) {
        const token = 'pc_adm_' + crypto.randomBytes(32).toString('hex');
        validSessions.set(token, {
          createdAt: Date.now(),
          ip: req.socket.remoteAddress
        });

        return sendJson(res, 200, {
          success: true,
          token,
          message: 'Autenticación exitosa'
        });
      } else {
        return sendJson(res, 401, {
          error: 'UNAUTHORIZED',
          message: 'Contraseña de administrador incorrecta.'
        });
      }
    }

    // 4. GET /api/admin/check-auth — Verificación de sesión activa
    if (pathname === '/api/admin/check-auth' && method === 'GET') {
      const token = extractToken(req, reqUrl);
      if (token && validSessions.has(token)) {
        return sendJson(res, 200, { authenticated: true });
      }
      return sendJson(res, 401, { authenticated: false });
    }

    // 5. GET /api/admin/stats — Métricas del panel administrativo
    if (pathname === '/api/admin/stats' && method === 'GET') {
      if (!isAuthorized(req, reqUrl)) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Acceso no autorizado' });
      }

      const stats = db.getValidationStats();
      return sendJson(res, 200, { success: true, stats });
    }

    // 6. GET /api/admin/leads — Lista de leads con filtros
    if (pathname === '/api/admin/leads' && method === 'GET') {
      if (!isAuthorized(req, reqUrl)) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Acceso no autorizado' });
      }

      const search = reqUrl.searchParams.get('search') || '';
      const willingness = reqUrl.searchParams.get('willingness') || '';
      const experience = reqUrl.searchParams.get('experience') || '';
      const limit = parseInt(reqUrl.searchParams.get('limit'), 10) || 50;
      const offset = parseInt(reqUrl.searchParams.get('offset'), 10) || 0;

      const data = db.getLeads({ search, willingness, experience, limit, offset });
      return sendJson(res, 200, { success: true, ...data });
    }

    // 7. GET /api/admin/export.csv — Descarga de registros en CSV
    if (pathname === '/api/admin/export.csv' && method === 'GET') {
      if (!isAuthorized(req, reqUrl)) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Acceso no autorizado' });
      }

      const { leads } = db.getLeads({ limit: 10000 });
      const csvContent = generateCsv(leads);
      const dateStr = new Date().toISOString().split('T')[0];

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pole_club_leads_${dateStr}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      // Incluir BOM UTF-8 (\uFEFF) para que Excel en español reconozca tildes y caracteres especiales
      res.write('\uFEFF');
      return res.end(csvContent);
    }

    // 8. GET /api/health — Endpoint de estado
    if (pathname === '/api/health' && method === 'GET') {
      const stats = db.getValidationStats();
      return sendJson(res, 200, {
        status: 'ok',
        service: 'POLE CLUB Backend',
        uptime: process.uptime(),
        totalLeads: stats.totalLeads,
        storage: stats.storageStatus,
        timestamp: new Date().toISOString()
      });
    }

    // =========================================================================
    // SERVIDOR DE ARCHIVOS ESTÁTICOS
    // =========================================================================

    // Mapeo amigable de rutas URL
    let safePath = pathname;
    if (safePath === '/' || safePath === '/index') {
      safePath = '/index.html';
    } else if (safePath === '/admin' || safePath === '/dashboard') {
      safePath = '/admin.html';
    } else if (safePath === '/privacidad' || safePath === '/privacy') {
      safePath = '/privacy.html';
    }

    // Prevención de path traversal
    const normalizedPath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(PUBLIC_DIR, normalizedPath);

    // Si no tiene extensión, verificar si existe con .html
    if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
      filePath += '.html';
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const isCodeFile = ['.html', '.css', '.js', '.json'].includes(ext);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': isCodeFile ? 'no-cache, must-revalidate' : 'public, max-age=86400'
      });
      const fileStream = fs.createReadStream(filePath);
      return fileStream.pipe(res);
    }

    // Si la ruta no se encuentra, servir 404
    sendJson(res, 404, {
      error: 'NOT_FOUND',
      message: 'El recurso solicitado no fue encontrado.'
    });

  } catch (error) {
    console.error('Error procesando solicitud:', error);
    sendJson(res, 500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocurrió un error inesperado en el servidor.'
    });
  }
});

/**
 * Valida los campos recibidos en el formulario de inscripción
 */
function validateLeadInput(data) {
  const errors = {};

  if (!data.full_name || typeof data.full_name !== 'string' || data.full_name.trim().length < 3) {
    errors.full_name = 'Ingresa tu nombre completo (mínimo 3 caracteres).';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || typeof data.email !== 'string' || !emailRegex.test(data.email.trim())) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }

  if (!data.instagram || typeof data.instagram !== 'string' || data.instagram.trim().length < 2) {
    errors.instagram = 'Ingresa tu usuario de Instagram.';
  }

  const validExperiences = [
    'Menos de 6 meses',
    'Entre 6 meses y 1 año',
    'Entre 1 y 3 años',
    'Más de 3 años'
  ];
  if (!data.pole_experience || !validExperiences.includes(data.pole_experience)) {
    errors.pole_experience = 'Selecciona tu tiempo de práctica en pole dance.';
  }

  if (!Array.isArray(data.preferred_benefits) || data.preferred_benefits.length === 0) {
    errors.preferred_benefits = 'Selecciona al menos un beneficio de tu interés.';
  }

  const validWillingness = [
    'Sí, me interesa participar',
    'Me interesa, pero quisiera conocer más',
    'No pagaría ese valor'
  ];
  if (!data.willingness_to_pay || !validWillingness.includes(data.willingness_to_pay)) {
    errors.willingness_to_pay = 'Selecciona tu respuesta sobre la membresía mensual.';
  }

  if (!data.privacy_consent) {
    errors.privacy_consent = 'Debes aceptar la política de tratamiento de datos personales.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Sanitiza cadenas de texto para prevenir XSS básico
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Parsea el cuerpo JSON de peticiones POST
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Límite de seguridad de 1MB para payload
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Extrae token de autenticación desde el header Authorization o parámetro de consulta
 */
function extractToken(req, reqUrl) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (reqUrl && reqUrl.searchParams && reqUrl.searchParams.get('token')) {
    return reqUrl.searchParams.get('token');
  }
  return null;
}

/**
 * Comprueba si la solicitud está autorizada para rutas protegidas
 */
function isAuthorized(req, reqUrl) {
  const token = extractToken(req, reqUrl);
  if (!token) return false;
  return validSessions.has(token);
}

/**
 * Genera contenido CSV con formato RFC 4180
 */
function generateCsv(leads) {
  const headers = [
    'ID',
    'Fecha de Registro',
    'Nombre Completo',
    'Correo Electrónico',
    'Instagram',
    'Tiempo Practicando',
    'Disposición de Pago ($39.000 COP)',
    'Beneficios de Interés',
    'Comentarios / Sugerencias',
    'Consentimiento Datos'
  ];

  const escapeCsv = (field) => {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = leads.map(l => {
    const benefits = Array.isArray(l.preferred_benefits) ? l.preferred_benefits.join('; ') : String(l.preferred_benefits);
    return [
      escapeCsv(l.id),
      escapeCsv(l.created_at),
      escapeCsv(l.full_name),
      escapeCsv(l.email),
      escapeCsv(l.instagram),
      escapeCsv(l.pole_experience),
      escapeCsv(l.willingness_to_pay),
      escapeCsv(benefits),
      escapeCsv(l.additional_benefits || ''),
      escapeCsv(l.privacy_consent ? 'SÍ' : 'NO')
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Envía respuestas JSON consistentes
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

/**
 * Carga variables de entorno simples desde archivo .env
 */
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (err) {
    console.error('No se pudo leer .env:', err.message);
  }
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  POLE CLUB — Servidor Web & API Activo`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
  console.log(`  Clave Admin por defecto: ${ADMIN_PASSWORD}`);
  console.log(`  Persistencia: ${db.isSupabaseConfigured ? 'Supabase + SQLite Local' : 'SQLite Local (poleclub.db)'}`);
  console.log(`=======================================================`);
});

module.exports = server;
