/**
 * POLE CLUB — TEST SUITE (DIRECT DISPATCH / IN-PROCESS)
 * Prueba los endpoints y la lógica de negocio sin depender de sockets de red del sistema.
 */

const { EventEmitter } = require('node:events');
const db = require('./db.js');
const server = require('./server.js');

// Obtener la función listener del servidor
const requestListener = server.listeners('request')[0];

function simulateRequest({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { 'user-agent': 'TestRunner', ...headers };
    req.socket = { remoteAddress: '127.0.0.1' };

    let resHeaders = {};
    let statusCode = 200;
    let resBody = '';

    const res = new EventEmitter();
    res.setHeader = (k, v) => { resHeaders[k.toLowerCase()] = v; };
    res.getHeader = (k) => resHeaders[k.toLowerCase()];
    res.writeHead = (code, headersObj = {}) => {
      statusCode = code;
      if (headersObj) {
        for (const [k, v] of Object.entries(headersObj)) {
          resHeaders[k.toLowerCase()] = v;
        }
      }
    };
    res.write = (chunk) => {
      resBody += chunk;
    };
    res.end = (chunk) => {
      if (chunk) resBody += chunk;
      let parsedJson = null;
      try { parsedJson = JSON.parse(resBody); } catch (e) { parsedJson = resBody; }
      resolve({ statusCode, headers: resHeaders, body: parsedJson });
    };

    // Ejecutar listener
    requestListener(req, res);

    // Emitir payload si existe
    if (body) {
      const dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.emit('data', Buffer.from(dataStr));
    }
    req.emit('end');
  });
}

async function runTests() {
  console.log('\n--- POLE CLUB: PRUEBAS AUTOMATIZADAS DE API Y PERSISTENCIA ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await simulateRequest({ method: 'GET', url: '/api/health' });
    assert(health.statusCode === 200 && health.body.status === 'ok', 'GET /api/health devuelve 200 OK');

    // 2. Validación de campos requeridos
    const invalidLead = await simulateRequest({
      method: 'POST',
      url: '/api/leads',
      headers: { 'content-type': 'application/json' },
      body: { full_name: 'Ana' }
    });
    assert(invalidLead.statusCode === 400 && invalidLead.body.error === 'VALIDATION_ERROR', 'POST /api/leads valida y rechaza datos incompletos');

    // 3. Creación exitosa de lead
    const uniqueEmail = `valentina.test.${Date.now()}@example.com`;
    const validLead = await simulateRequest({
      method: 'POST',
      url: '/api/leads',
      headers: { 'content-type': 'application/json' },
      body: {
        full_name: 'Valentina Gómez Restrepo',
        email: uniqueEmail,
        instagram: '@valeg_pole',
        pole_experience: 'Entre 1 y 3 años',
        preferred_benefits: ['Descuentos en academias', 'Workshops y talleres', 'Conocer personas de la comunidad'],
        willingness_to_pay: 'Sí, me interesa participar',
        additional_benefits: 'Me gustaría masterclasses de acrobacias y flexibilidad.',
        privacy_consent: true
      }
    });
    assert(validLead.statusCode === 201 && validLead.body.success === true, 'POST /api/leads guarda registro correctamente en SQLite');

    // 4. Detección de duplicados
    const duplicate = await simulateRequest({
      method: 'POST',
      url: '/api/leads',
      headers: { 'content-type': 'application/json' },
      body: {
        full_name: 'Valentina Clon',
        email: uniqueEmail,
        instagram: '@valeg_pole',
        pole_experience: 'Más de 3 años',
        preferred_benefits: ['Workshops y talleres'],
        willingness_to_pay: 'Sí, me interesa participar',
        privacy_consent: true
      }
    });
    assert(duplicate.statusCode === 409 && duplicate.body.error === 'DUPLICATE_EMAIL', 'POST /api/leads previene registros duplicados por correo (409)');

    // 5. Autenticación Admin
    const loginFail = await simulateRequest({
      method: 'POST',
      url: '/api/admin/login',
      headers: { 'content-type': 'application/json' },
      body: { password: 'wrongpassword' }
    });
    assert(loginFail.statusCode === 401, 'POST /api/admin/login rechaza contraseña errónea');

    const loginSuccess = await simulateRequest({
      method: 'POST',
      url: '/api/admin/login',
      headers: { 'content-type': 'application/json' },
      body: { password: 'poleclub2026' }
    });
    assert(loginSuccess.statusCode === 200 && Boolean(loginSuccess.body.token), 'POST /api/admin/login autentica y entrega token');
    const token = loginSuccess.body.token;

    // 6. Stats de validación
    const stats = await simulateRequest({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { 'authorization': `Bearer ${token}` }
    });
    assert(stats.statusCode === 200 && stats.body.stats.totalLeads >= 6, 'GET /api/admin/stats calcula métricas reales de la base de datos');

    // 7. Consulta de leads filtrados
    const filteredLeads = await simulateRequest({
      method: 'GET',
      url: '/api/admin/leads?willingness=S%C3%AD%2C%20me%20interesa%20participar',
      headers: { 'authorization': `Bearer ${token}` }
    });
    assert(filteredLeads.statusCode === 200 && filteredLeads.body.leads.length > 0, 'GET /api/admin/leads filtra por disposición de pago correctamente');

    // 8. Exportación CSV
    const csvExport = await simulateRequest({
      method: 'GET',
      url: `/api/admin/export.csv?token=${token}`
    });
    assert(csvExport.statusCode === 200 && csvExport.body.includes('Nombre Completo') && csvExport.body.includes(uniqueEmail), 'GET /api/admin/export.csv genera exportación con todos los campos');

    console.log(`\n========================================`);
    console.log(`RESULTADO: ${passed} pruebas pasadas de ${passed + failed}`);
    console.log(`========================================\n`);

    server.close();
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('Error durante la ejecución de pruebas:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
