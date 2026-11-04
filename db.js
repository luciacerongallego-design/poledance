/**
 * POLE CLUB — DATABASE LAYER
 * 
 * Implementa almacenamiento persistente relacional:
 * 1. Base de datos SQLite integrada (vía node:sqlite nativo de Node 24).
 * 2. Adaptador para Supabase PostgreSQL (PostgREST API nativa) cuando se configuran
 *    las variables SUPABASE_URL y SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 */

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

// Ruta del archivo de base de datos local SQLite
const DB_PATH = path.join(__dirname, 'poleclub.db');

// Configuración de Supabase desde variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

let sqliteDb = null;

/**
 * Inicializa la base de datos local SQLite con esquemas e índices.
 */
function initSqlite() {
  sqliteDb = new DatabaseSync(DB_PATH);
  
  // Tabla de leads de membresía
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS membership_leads (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      instagram TEXT NOT NULL,
      pole_experience TEXT NOT NULL,
      preferred_benefits TEXT NOT NULL,
      willingness_to_pay TEXT NOT NULL,
      additional_benefits TEXT,
      privacy_consent INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      section_name TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_leads_email ON membership_leads(email);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON membership_leads(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_willingness ON membership_leads(willingness_to_pay);
  `);

  // Sembrado de datos iniciales representativos para la validación del PMV si está vacía
  const countStmt = sqliteDb.prepare('SELECT COUNT(*) as count FROM membership_leads');
  const leadCount = countStmt.get().count;

  if (leadCount === 0) {
    seedInitialValidationData();
  }
}

/**
 * Inserta datos de validación iniciales representativos de la comunidad de pole dance.
 */
function seedInitialValidationData() {
  const seedLeads = [
    {
      full_name: 'Camila Restrepo',
      email: 'camila.restrepo@example.com',
      instagram: '@cami_poleart',
      pole_experience: 'Entre 1 y 3 años',
      preferred_benefits: JSON.stringify(['Descuentos en academias', 'Workshops y talleres', 'Conocer personas de la comunidad']),
      willingness_to_pay: 'Sí, me interesa participar',
      additional_benefits: 'Me encantaría tener sesiones de fotos grupales periódicas y talleres de flexibilidad activa con fisioterapeutas.',
      privacy_consent: 1,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
    },
    {
      full_name: 'Valentina Osorio Gómez',
      email: 'vale.osorio@example.com',
      instagram: '@vale_moves',
      pole_experience: 'Más de 3 años',
      preferred_benefits: JSON.stringify(['Workshops y talleres', 'Eventos y experiencias', 'Beneficios con marcas']),
      willingness_to_pay: 'Sí, me interesa participar',
      additional_benefits: 'Sería genial invitar a instructoras internacionales para masterclasses exclusivas para el club.',
      privacy_consent: 1,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString()
    },
    {
      full_name: 'Sofía Calderón Silva',
      email: 'sofia.calderon@example.com',
      instagram: '@sofi.spin',
      pole_experience: 'Entre 6 meses y 1 año',
      preferred_benefits: JSON.stringify(['Descuentos en academias', 'Beneficios con marcas']),
      willingness_to_pay: 'Me interesa, pero quisiera conocer más',
      additional_benefits: 'Descuentos en ropa deportiva especializada para pole (grips, shorts, tops resistentes).',
      privacy_consent: 1,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
      full_name: 'Mariana Duarte Rivas',
      email: 'mariana.duarte@example.com',
      instagram: '@mariana.aerial',
      pole_experience: 'Menos de 6 meses',
      preferred_benefits: JSON.stringify(['Descuentos en academias', 'Workshops y talleres', 'Conocer personas de la comunidad']),
      willingness_to_pay: 'Sí, me interesa participar',
      additional_benefits: 'Tener una red de apoyo para principiantes que nos ayude a perder el miedo y prevenir lesiones.',
      privacy_consent: 1,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
    },
    {
      full_name: 'Laura Jimena Morales',
      email: 'laura.morales@example.com',
      instagram: '@lauraj_pole',
      pole_experience: 'Entre 1 y 3 años',
      preferred_benefits: JSON.stringify(['Eventos y experiencias', 'Conocer personas de la comunidad']),
      willingness_to_pay: 'Me interesa, pero quisiera conocer más',
      additional_benefits: 'Espacios de entrenamiento libre (open pole) compartidos entre diferentes estudios de la ciudad.',
      privacy_consent: 1,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    }
  ];

  const insert = sqliteDb.prepare(`
    INSERT INTO membership_leads (
      id, full_name, email, instagram, pole_experience, preferred_benefits, 
      willingness_to_pay, additional_benefits, privacy_consent, created_at, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lead of seedLeads) {
    insert.run(
      crypto.randomUUID(),
      lead.full_name,
      lead.email,
      lead.instagram,
      lead.pole_experience,
      lead.preferred_benefits,
      lead.willingness_to_pay,
      lead.additional_benefits,
      lead.privacy_consent,
      lead.created_at,
      '127.0.0.1',
      'Seed Generator'
    );
  }
}

// Inicializar SQLite al cargar el módulo
initSqlite();

/**
 * Busca un registro por correo electrónico.
 */
function findLeadByEmail(email) {
  const stmt = sqliteDb.prepare('SELECT * FROM membership_leads WHERE LOWER(email) = LOWER(?)');
  const result = stmt.get(email.trim());
  if (!result) return null;
  return {
    ...result,
    preferred_benefits: parseBenefits(result.preferred_benefits)
  };
}

/**
 * Inserta un nuevo lead en la base de datos (con soporte opcional para Supabase).
 */
async function createLead(leadData) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const benefitsJson = JSON.stringify(leadData.preferred_benefits || []);

  // 1. Guardar siempre en SQLite local
  const insert = sqliteDb.prepare(`
    INSERT INTO membership_leads (
      id, full_name, email, instagram, pole_experience, preferred_benefits,
      willingness_to_pay, additional_benefits, privacy_consent, created_at, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    id,
    leadData.full_name.trim(),
    leadData.email.trim(),
    leadData.instagram.trim(),
    leadData.pole_experience,
    benefitsJson,
    leadData.willingness_to_pay,
    leadData.additional_benefits?.trim() || null,
    leadData.privacy_consent ? 1 : 0,
    createdAt,
    leadData.ip_address || null,
    leadData.user_agent || null
  );

  // 2. Si Supabase está configurado, intentar sincronización con Supabase PostgreSQL
  let supabaseSynced = false;
  let supabaseError = null;

  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/membership_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          id,
          full_name: leadData.full_name.trim(),
          email: leadData.email.trim(),
          instagram: leadData.instagram.trim(),
          pole_experience: leadData.pole_experience,
          preferred_benefits: leadData.preferred_benefits,
          willingness_to_pay: leadData.willingness_to_pay,
          additional_benefits: leadData.additional_benefits?.trim() || null,
          privacy_consent: Boolean(leadData.privacy_consent),
          created_at: createdAt
        })
      });

      if (response.ok) {
        supabaseSynced = true;
      } else {
        const errorText = await response.text();
        supabaseError = `Supabase HTTP ${response.status}: ${errorText}`;
        console.error('Error sincronizando con Supabase:', supabaseError);
      }
    } catch (err) {
      supabaseError = err.message;
      console.error('Fallo de red hacia Supabase:', err.message);
    }
  }

  return {
    id,
    created_at: createdAt,
    storage: {
      sqlite: true,
      supabase: isSupabaseConfigured ? supabaseSynced : false,
      supabase_configured: isSupabaseConfigured,
      supabase_error: supabaseError
    }
  };
}

/**
 * Obtiene lista de leads con filtros, paginación y búsqueda.
 */
function getLeads({ search = '', willingness = '', experience = '', limit = 100, offset = 0 } = {}) {
  let query = 'SELECT * FROM membership_leads WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (full_name LIKE ? OR email LIKE ? OR instagram LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (willingness) {
    query += ' AND willingness_to_pay = ?';
    params.push(willingness);
  }

  if (experience) {
    query += ' AND pole_experience = ?';
    params.push(experience);
  }

  // Conteo total con filtros
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countStmt = sqliteDb.prepare(countQuery);
  const total = countStmt.get(...params).total;

  query += ' ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const selectStmt = sqliteDb.prepare(query);
  const rows = selectStmt.all(...params);

  const leads = rows.map(row => ({
    ...row,
    preferred_benefits: parseBenefits(row.preferred_benefits)
  }));

  return { total, leads, limit, offset };
}

/**
 * Obtiene métricas analíticas agregadas para el panel de administración.
 */
function getValidationStats() {
  const totalStmt = sqliteDb.prepare('SELECT COUNT(*) as total FROM membership_leads');
  const totalLeads = totalStmt.get().total;

  // Disposición de pago
  const willingnessStmt = sqliteDb.prepare(`
    SELECT willingness_to_pay, COUNT(*) as count 
    FROM membership_leads 
    GROUP BY willingness_to_pay
  `);
  const willingnessRows = willingnessStmt.all();

  // Experiencia en pole dance
  const experienceStmt = sqliteDb.prepare(`
    SELECT pole_experience, COUNT(*) as count 
    FROM membership_leads 
    GROUP BY pole_experience
  `);
  const experienceRows = experienceStmt.all();

  // Beneficios más elegidos
  const allLeadsStmt = sqliteDb.prepare('SELECT preferred_benefits FROM membership_leads');
  const allRows = allLeadsStmt.all();
  const benefitsCount = {};

  for (const row of allRows) {
    const benefits = parseBenefits(row.preferred_benefits);
    for (const b of benefits) {
      benefitsCount[b] = (benefitsCount[b] || 0) + 1;
    }
  }

  const sortedBenefits = Object.entries(benefitsCount)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // Registro de los últimos 7 días
  const timelineStmt = sqliteDb.prepare(`
    SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
    FROM membership_leads
    GROUP BY substr(created_at, 1, 10)
    ORDER BY date DESC
    LIMIT 14
  `);
  const timeline = timelineStmt.all().reverse();

  // Conteo de analítica de eventos
  let eventStats = {};
  try {
    const eventsStmt = sqliteDb.prepare(`
      SELECT event_name, COUNT(*) as count 
      FROM analytics_events 
      GROUP BY event_name
    `);
    const eventRows = eventsStmt.all();
    for (const row of eventRows) {
      eventStats[row.event_name] = row.count;
    }
  } catch (err) {
    // ignorar si no hay eventos
  }

  return {
    totalLeads,
    foundingSlotsTarget: 20,
    foundingSlotsRemaining: Math.max(0, 20 - totalLeads),
    willingnessDistribution: willingnessRows.map(r => ({
      label: r.willingness_to_pay,
      count: r.count,
      percentage: totalLeads > 0 ? Math.round((r.count / totalLeads) * 100) : 0
    })),
    experienceDistribution: experienceRows.map(r => ({
      label: r.pole_experience,
      count: r.count,
      percentage: totalLeads > 0 ? Math.round((r.count / totalLeads) * 100) : 0
    })),
    topBenefits: sortedBenefits,
    timeline,
    eventStats,
    storageStatus: {
      type: isSupabaseConfigured ? 'supabase_and_sqlite' : 'sqlite_local',
      local_file: DB_PATH,
      supabase_configured: isSupabaseConfigured,
      supabase_url: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 25)}...` : null
    }
  };
}

/**
 * Registra un evento anónimo de navegación o conversión.
 */
function recordEvent(eventName, sectionName = null, metadata = {}) {
  try {
    const insert = sqliteDb.prepare(`
      INSERT INTO analytics_events (id, event_name, section_name, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run(
      crypto.randomUUID(),
      eventName,
      sectionName,
      JSON.stringify(metadata),
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Error registrando evento de analítica:', err.message);
  }
}

/**
 * Parsea el campo preferred_benefits de forma segura.
 */
function parseBenefits(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [String(raw)];
  }
}

module.exports = {
  createLead,
  findLeadByEmail,
  getLeads,
  getValidationStats,
  recordEvent,
  isSupabaseConfigured,
  DB_PATH
};
