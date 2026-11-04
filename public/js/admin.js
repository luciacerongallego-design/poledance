/**
 * POLE CLUB — ADMIN DASHBOARD JAVASCRIPT
 * Controlador de métricas de validación, autenticación, filtrado de leads
 * y exportación de datos.
 */

const TOKEN_KEY = 'poleclub_admin_token';
const STATIC_MODE_KEY = 'poleclub_static_mode';
let currentToken = sessionStorage.getItem(TOKEN_KEY);
let isStaticMode = sessionStorage.getItem(STATIC_MODE_KEY) === 'true';
let currentLeads = [];

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  initTableFilters();
  initDetailModal();
});

/**
 * 1. AUTENTICACIÓN Y SESIÓN DEL PANEL
 */
function initAdminAuth() {
  const loginForm = document.getElementById('adminLoginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  if (currentToken) {
    verifySession();
  } else {
    showLogin();
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.classList.remove('visible');
      const password = document.getElementById('adminPasswordInput').value.trim();

      // Intentar primero autenticar con el servidor backend si responde
      let authenticated = false;
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.token) {
            currentToken = data.token;
            isStaticMode = false;
            sessionStorage.removeItem(STATIC_MODE_KEY);
            sessionStorage.setItem(TOKEN_KEY, currentToken);
            showDashboard();
            loadDashboardData();
            authenticated = true;
          }
        } else if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          loginError.textContent = data.message || 'Contraseña incorrecta';
          loginError.classList.add('visible');
          return;
        }
      } catch (err) {
        // En GitHub Pages o sin servidor local disponible
      }

      // Si el backend no está disponible (GitHub Pages), validar con la clave estándar
      if (!authenticated) {
        if (password === 'poleclub2026') {
          currentToken = 'static_admin_token_' + Date.now();
          isStaticMode = true;
          sessionStorage.setItem(STATIC_MODE_KEY, 'true');
          sessionStorage.setItem(TOKEN_KEY, currentToken);
          showDashboard();
          loadDashboardData();
        } else {
          loginError.textContent = 'Contraseña incorrecta';
          loginError.classList.add('visible');
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      currentToken = null;
      isStaticMode = false;
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(STATIC_MODE_KEY);
      showLogin();
    });
  }
}

async function verifySession() {
  if (isStaticMode || currentToken?.startsWith('static_admin_token_')) {
    isStaticMode = true;
    showDashboard();
    loadDashboardData();
    return;
  }

  try {
    const res = await fetch('/api/admin/check-auth', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (res.ok) {
      showDashboard();
      loadDashboardData();
    } else {
      showLogin();
    }
  } catch (err) {
    if (currentToken) {
      isStaticMode = true;
      showDashboard();
      loadDashboardData();
    } else {
      showLogin();
    }
  }
}

function showLogin() {
  document.getElementById('loginWrapper').style.display = 'flex';
  document.getElementById('dashboardWrapper').classList.remove('visible');
}

function showDashboard() {
  document.getElementById('loginWrapper').style.display = 'none';
  document.getElementById('dashboardWrapper').classList.add('visible');
}

/**
 * 2. CARGA DE DATOS Y MÉTRICAS
 */
async function loadDashboardData() {
  await Promise.all([
    fetchStats(),
    fetchLeads()
  ]);
  updateExportLink();
}

async function fetchStats() {
  if (isStaticMode) {
    const leads = getLocalLeads();
    const totalLeads = leads.length;
    const foundingSlotsRemaining = Math.max(0, 20 - totalLeads);

    const options = [
      'Sí, me interesa participar',
      'Me interesa, pero quisiera conocer más',
      'No pagaría ese valor'
    ];
    const willingnessDistribution = options.map(label => {
      const count = leads.filter(l => l.willingness_to_pay === label).length;
      const percentage = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
      return { label, count, percentage };
    });

    const benefitCounts = {};
    for (const l of leads) {
      const arr = Array.isArray(l.preferred_benefits) ? l.preferred_benefits : [];
      for (const b of arr) {
        benefitCounts[b] = (benefitCounts[b] || 0) + 1;
      }
    }
    const topBenefits = Object.entries(benefitCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    document.getElementById('kpiTotalLeads').textContent = totalLeads;
    document.getElementById('kpiRemainingSlots').textContent = `${foundingSlotsRemaining} / 20`;

    const yesObj = willingnessDistribution.find(d => d.label.includes('Sí'));
    document.getElementById('kpiPositiveRate').textContent = `${yesObj ? yesObj.percentage : 0}%`;

    const maybeObj = willingnessDistribution.find(d => d.label.includes('quisiera conocer más'));
    document.getElementById('kpiMaybeRate').textContent = `${maybeObj ? maybeObj.percentage : 0}%`;

    document.getElementById('storageStatusText').textContent = 'Navegador Web (GitHub Pages / Local)';
    renderWillingnessBars(willingnessDistribution);
    renderTopBenefitsBars(topBenefits);
    return;
  }

  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    const stats = data.stats;

    // Renderizar KPIs
    document.getElementById('kpiTotalLeads').textContent = stats.totalLeads;
    document.getElementById('kpiRemainingSlots').textContent = `${stats.foundingSlotsRemaining} / 20`;

    // Tasa positiva
    const yesObj = stats.willingnessDistribution.find(d => d.label.includes('Sí'));
    const yesPercent = yesObj ? yesObj.percentage : 0;
    document.getElementById('kpiPositiveRate').textContent = `${yesPercent}%`;

    // Tasa tal vez
    const maybeObj = stats.willingnessDistribution.find(d => d.label.includes('quisiera conocer más'));
    const maybePercent = maybeObj ? maybeObj.percentage : 0;
    document.getElementById('kpiMaybeRate').textContent = `${maybePercent}%`;

    // Estado del almacenamiento
    const statusText = stats.storageStatus.supabase_configured
      ? 'Supabase PostgreSQL + SQLite Local'
      : 'SQLite Local (poleclub.db)';
    document.getElementById('storageStatusText').textContent = statusText;

    // Renderizar Gráfica de Disposición de Pago
    renderWillingnessBars(stats.willingnessDistribution);

    // Renderizar Gráfica de Beneficios más votados
    renderTopBenefitsBars(stats.topBenefits);

  } catch (err) {
    console.error('Error cargando estadísticas:', err);
  }
}

function renderWillingnessBars(dist) {
  const container = document.getElementById('willingnessBarsContainer');
  if (!container) return;

  container.innerHTML = dist.map(item => {
    let fillClass = 'medium';
    if (item.label.includes('Sí')) fillClass = 'high';
    if (item.label.includes('No pagaría')) fillClass = 'low';

    return `
      <div class="metric-bar-item">
        <div class="metric-bar-header">
          <span class="metric-bar-label">${escapeHtml(item.label)}</span>
          <span class="metric-bar-stats">${item.count} (${item.percentage}%)</span>
        </div>
        <div class="metric-bar-track">
          <div class="metric-bar-fill ${fillClass}" style="width: ${item.percentage}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTopBenefitsBars(benefits) {
  const container = document.getElementById('benefitsBarsContainer');
  if (!container) return;

  container.innerHTML = benefits.slice(0, 5).map(item => `
    <div class="metric-bar-item">
      <div class="metric-bar-header">
        <span class="metric-bar-label">${escapeHtml(item.name)}</span>
        <span class="metric-bar-stats">${item.count} votos (${item.percentage}%)</span>
      </div>
      <div class="metric-bar-track">
        <div class="metric-bar-fill" style="width: ${item.percentage}%;"></div>
      </div>
    </div>
  `).join('');
}

/**
 * 3. CONSULTA Y TABLA DE LEADS
 */
async function fetchLeads() {
  const search = document.getElementById('tableSearchInput')?.value || '';
  const willingness = document.getElementById('willingnessFilterSelect')?.value || '';
  const experience = document.getElementById('experienceFilterSelect')?.value || '';

  if (isStaticMode) {
    let list = getLocalLeads();
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => 
        (l.full_name && l.full_name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.instagram && l.instagram.toLowerCase().includes(q))
      );
    }
    if (willingness) {
      list = list.filter(l => l.willingness_to_pay === willingness);
    }
    if (experience) {
      list = list.filter(l => l.pole_experience === experience);
    }
    currentLeads = list;
    renderLeadsTable(currentLeads);
    return;
  }

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (willingness) params.append('willingness', willingness);
  if (experience) params.append('experience', experience);

  try {
    const res = await fetch(`/api/admin/leads?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    currentLeads = data.leads || [];
    renderLeadsTable(currentLeads);
  } catch (err) {
    console.error('Error cargando lista de leads:', err);
  }
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById('leadsTableBody');
  const emptyState = document.getElementById('tableEmptyState');
  if (!tbody) return;

  if (leads.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  tbody.innerHTML = leads.map(lead => {
    const dateFormatted = formatDateTime(lead.created_at);
    const cleanIg = lead.instagram.replace('@', '');

    let badgeClass = 'badge-maybe';
    if (lead.willingness_to_pay.includes('Sí')) badgeClass = 'badge-yes';
    if (lead.willingness_to_pay.includes('No pagaría')) badgeClass = 'badge-no';

    const benefitsStr = Array.isArray(lead.preferred_benefits) 
      ? lead.preferred_benefits.slice(0, 2).join(', ') + (lead.preferred_benefits.length > 2 ? ` (+${lead.preferred_benefits.length - 2})` : '')
      : lead.preferred_benefits;

    return `
      <tr>
        <td style="color: #8C867C; font-size: 0.78rem;">${dateFormatted}</td>
        <td style="font-weight: 500; color: #ffffff;">${escapeHtml(lead.full_name)}</td>
        <td>
          <a href="mailto:${escapeHtml(lead.email)}" style="color: var(--color-sand); text-decoration: underline;">
            ${escapeHtml(lead.email)}
          </a>
        </td>
        <td>
          <a href="https://instagram.com/${escapeHtml(cleanIg)}" target="_blank" rel="noopener" style="color: #C2B7A8;">
            ${escapeHtml(lead.instagram)}
          </a>
        </td>
        <td>${escapeHtml(lead.pole_experience)}</td>
        <td>
          <span class="badge-pill ${badgeClass}">${escapeHtml(lead.willingness_to_pay)}</span>
        </td>
        <td style="font-size: 0.78rem; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(benefitsStr)}
        </td>
        <td>
          <button type="button" class="action-view-btn" data-view-lead="${lead.id}">
            Ver Detalle
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Asociar evento ver detalle
  tbody.querySelectorAll('[data-view-lead]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-view-lead');
      const lead = currentLeads.find(l => l.id === id);
      if (lead) openDetailModal(lead);
    });
  });
}

/**
 * 4. FILTROS Y BÚSQUEDA EN TIEMPO REAL
 */
function initTableFilters() {
  const searchInput = document.getElementById('tableSearchInput');
  const willingnessSelect = document.getElementById('willingnessFilterSelect');
  const experienceSelect = document.getElementById('experienceFilterSelect');

  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchLeads();
      }, 300);
    });
  }

  if (willingnessSelect) {
    willingnessSelect.addEventListener('change', fetchLeads);
  }

  if (experienceSelect) {
    experienceSelect.addEventListener('change', fetchLeads);
  }
}

function updateExportLink() {
  const exportBtn = document.getElementById('exportCsvBtn');
  if (!exportBtn) return;

  if (isStaticMode) {
    exportBtn.href = '#';
    exportBtn.onclick = (e) => {
      e.preventDefault();
      downloadLocalCsv(currentLeads && currentLeads.length > 0 ? currentLeads : getLocalLeads());
    };
  } else if (currentToken) {
    exportBtn.onclick = null;
    exportBtn.href = `/api/admin/export.csv?token=${encodeURIComponent(currentToken)}`;
  }
}

function downloadLocalCsv(leads) {
  const headers = [
    'ID',
    'Fecha Registro',
    'Nombre Completo',
    'Correo Electronico',
    'Instagram',
    'Tiempo Experiencia',
    'Disposicion de Pago ($39k)',
    'Beneficios de Mayor Interes',
    'Sugerencias Adicionales',
    'Habeas Data Aceptado'
  ];

  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = leads.map(l => [
    escapeCsv(l.id),
    escapeCsv(l.created_at),
    escapeCsv(l.full_name),
    escapeCsv(l.email),
    escapeCsv(l.instagram),
    escapeCsv(l.pole_experience),
    escapeCsv(l.willingness_to_pay),
    escapeCsv(Array.isArray(l.preferred_benefits) ? l.preferred_benefits.join('; ') : l.preferred_benefits),
    escapeCsv(l.additional_benefits || ''),
    escapeCsv(l.privacy_consent ? 'Sí' : 'No')
  ].join(','));

  const csvText = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `poleclub_leads_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Almacenamiento local para modo estático (GitHub Pages)
 */
const STORAGE_LEADS_KEY = 'poleclub_leads_store';
const DEFAULT_SEED_LEADS = [
  {
    id: "lead_1",
    full_name: "Camila Restrepo",
    email: "camila.restrepo@example.com",
    instagram: "@cami_poleart",
    pole_experience: "Entre 1 y 3 años",
    preferred_benefits: ["Descuentos en academias", "Workshops y talleres", "Conocer personas de la comunidad"],
    willingness_to_pay: "Sí, me interesa participar",
    additional_benefits: "Me encantaría tener sesiones de fotos grupales periódicas y talleres de flexibilidad activa con fisioterapeutas.",
    privacy_consent: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
  },
  {
    id: "lead_2",
    full_name: "Valentina Osorio Gómez",
    email: "vale.osorio@example.com",
    instagram: "@vale_moves",
    pole_experience: "Más de 3 años",
    preferred_benefits: ["Workshops y talleres", "Eventos y experiencias", "Beneficios con marcas"],
    willingness_to_pay: "Sí, me interesa participar",
    additional_benefits: "Sería genial invitar a instructoras internacionales para masterclasses exclusivas para el club.",
    privacy_consent: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString()
  },
  {
    id: "lead_3",
    full_name: "Sofía Calderón Silva",
    email: "sofia.calderon@example.com",
    instagram: "@sofi.spin",
    pole_experience: "Entre 6 meses y 1 año",
    preferred_benefits: ["Descuentos en academias", "Beneficios con marcas"],
    willingness_to_pay: "Me interesa, pero quisiera conocer más",
    additional_benefits: "Descuentos en ropa deportiva especializada para pole (grips, shorts, tops resistentes).",
    privacy_consent: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
  },
  {
    id: "lead_4",
    full_name: "Mariana Duarte Rivas",
    email: "mariana.duarte@example.com",
    instagram: "@mariana.aerial",
    pole_experience: "Menos de 6 meses",
    preferred_benefits: ["Descuentos en academias", "Workshops y talleres", "Conocer personas de la comunidad"],
    willingness_to_pay: "Sí, me interesa participar",
    additional_benefits: "Tener una red de apoyo para principiantes que nos ayude a perder el miedo y prevenir lesiones.",
    privacy_consent: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
  },
  {
    id: "lead_5",
    full_name: "Laura Jimena Morales",
    email: "laura.morales@example.com",
    instagram: "@lauraj_pole",
    pole_experience: "Entre 1 y 3 años",
    preferred_benefits: ["Eventos y experiencias", "Conocer personas de la comunidad"],
    willingness_to_pay: "Me interesa, pero quisiera conocer más",
    additional_benefits: "Espacios de entrenamiento libre (open pole) compartidos entre diferentes estudios de la ciudad.",
    privacy_consent: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
  }
];

function getLocalLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_LEADS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_LEADS_KEY, JSON.stringify(DEFAULT_SEED_LEADS));
      return [...DEFAULT_SEED_LEADS];
    }
    return JSON.parse(raw);
  } catch (e) {
    return [...DEFAULT_SEED_LEADS];
  }
}

function saveLocalLeads(leads) {
  try {
    localStorage.setItem(STORAGE_LEADS_KEY, JSON.stringify(leads));
  } catch (e) {}
}

/**
 * 5. MODAL DE DETALLE DE RESPUESTAS
 */
function initDetailModal() {
  const overlay = document.getElementById('adminDetailModal');
  const closeBtn = document.getElementById('closeDetailModalBtn');

  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  }
}

function openDetailModal(lead) {
  const overlay = document.getElementById('adminDetailModal');
  const content = document.getElementById('detailModalContent');
  if (!overlay || !content) return;

  const benefitsList = Array.isArray(lead.preferred_benefits)
    ? lead.preferred_benefits.map(b => `• ${escapeHtml(b)}`).join('<br>')
    : escapeHtml(lead.preferred_benefits);

  content.innerHTML = `
    <div class="detail-row">
      <span class="detail-row-label">Nombre Completo</span>
      <span class="detail-row-value" style="font-weight: 600; font-size: 1.1rem; color: #ffffff;">
        ${escapeHtml(lead.full_name)}
      </span>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div class="detail-row">
        <span class="detail-row-label">Correo Electrónico</span>
        <span class="detail-row-value">${escapeHtml(lead.email)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-row-label">Instagram</span>
        <span class="detail-row-value">${escapeHtml(lead.instagram)}</span>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div class="detail-row">
        <span class="detail-row-label">Tiempo Practicando Pole Dance</span>
        <span class="detail-row-value">${escapeHtml(lead.pole_experience)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-row-label">Disposición de Pago ($39.000 COP)</span>
        <span class="detail-row-value" style="color: var(--color-sand); font-weight: 600;">
          ${escapeHtml(lead.willingness_to_pay)}
        </span>
      </div>
    </div>

    <div class="detail-row">
      <span class="detail-row-label">Beneficios de Mayor Interés</span>
      <div class="detail-row-value" style="line-height: 1.8;">
        ${benefitsList}
      </div>
    </div>

    <div class="detail-row">
      <span class="detail-row-label">Sugerencias o Beneficios Adicionales (Cualitativo)</span>
      <div class="detail-comments-box">
        "${escapeHtml(lead.additional_benefits || 'Sin comentarios adicionales')}"
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; font-size: 0.78rem; color: #736E65;">
      <div>
        <span class="detail-row-label">Fecha y Hora de Registro</span>
        <div>${formatDateTime(lead.created_at)}</div>
      </div>
      <div>
        <span class="detail-row-label">Consentimiento Habeas Data</span>
        <div>${lead.privacy_consent ? 'Aceptado explícitamente' : 'No'}</div>
      </div>
    </div>
  `;

  overlay.classList.add('active');
}

/**
 * Utilidades
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoStr;
  }
}
