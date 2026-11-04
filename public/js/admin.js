/**
 * POLE CLUB — ADMIN DASHBOARD JAVASCRIPT
 * Controlador de métricas de validación, autenticación, filtrado de leads
 * y exportación de datos.
 */

const TOKEN_KEY = 'poleclub_admin_token';
let currentToken = sessionStorage.getItem(TOKEN_KEY);
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
      const password = document.getElementById('adminPasswordInput').value;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (res.ok && data.token) {
          currentToken = data.token;
          sessionStorage.setItem(TOKEN_KEY, currentToken);
          showDashboard();
          loadDashboardData();
        } else {
          loginError.textContent = data.message || 'Contraseña incorrecta';
          loginError.classList.add('visible');
        }
      } catch (err) {
        loginError.textContent = 'Error de conexión con el servidor.';
        loginError.classList.add('visible');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      currentToken = null;
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin();
    });
  }
}

async function verifySession() {
  try {
    const res = await fetch('/api/admin/check-auth', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (res.ok) {
      showDashboard();
      loadDashboardData();
    } else {
      currentToken = null;
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin();
    }
  } catch (err) {
    showLogin();
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
  if (exportBtn && currentToken) {
    exportBtn.href = `/api/admin/export.csv?token=${encodeURIComponent(currentToken)}`;
  }
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
