/**
 * POLE CLUB — CLIENT APPLICATION SCRIPT
 * Maneja la navegación, acordeones, modales, interactividad de opciones,
 * validación del formulario de membresía y analítica anónima.
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFaqAccordion();
  initMembershipModal();
  initLeadForm();
  initAnalyticsTracker();
  fetchInitialSlots();
});

/**
 * 1. NAVEGACIÓN Y HEADER STICKY
 */
function initNavigation() {
  const header = document.querySelector('.site-header');
  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const mobileDrawer = document.querySelector('.mobile-nav-drawer');
  const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

  // Efecto sticky con clase .scrolled
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });

  // Toggle menú hamburguesa móvil
  if (hamburgerBtn && mobileDrawer) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = hamburgerBtn.classList.toggle('active');
      mobileDrawer.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Cerrar al hacer clic en un enlace móvil
    mobileDrawer.querySelectorAll('.mobile-nav-link, .btn').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerBtn.classList.remove('active');
        mobileDrawer.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // Smooth scroll y actualización de link activo
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const targetId = href.substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const headerOffset = 80;
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
          trackEvent('navigation_click', href);
        }
      }
    });
  });
}

/**
 * 2. ACORDEÓN DE PREGUNTAS FRECUENTES (FAQ)
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question-btn');
    if (!questionBtn) return;

    questionBtn.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Cerrar otros acordeones si se desea comportamiento exclusivo
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
          const btn = otherItem.querySelector('.faq-question-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });

      item.classList.toggle('active', !isActive);
      questionBtn.setAttribute('aria-expanded', !isActive ? 'true' : 'false');
      
      if (!isActive) {
        trackEvent('faq_opened', questionBtn.textContent.trim());
      }
    });
  });
}

/**
 * 3. MODAL DE MIEMBRO FUNDADOR
 */
function initMembershipModal() {
  const modalOverlay = document.getElementById('membershipModal');
  const openButtons = document.querySelectorAll('[data-open-modal="membership"]');
  const closeButtons = document.querySelectorAll('[data-close-modal]');
  const returnHomeBtn = document.getElementById('modalReturnHomeBtn');

  if (!modalOverlay) return;

  function openModal() {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    trackEvent('modal_opened', 'membership_lead_form');
    // Enfocar primer campo
    const firstInput = modalOverlay.querySelector('input:not([type="hidden"])');
    if (firstInput) setTimeout(() => firstInput.focus(), 150);
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  openButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  closeButtons.forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  if (returnHomeBtn) {
    returnHomeBtn.addEventListener('click', () => {
      closeModal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Cerrar al hacer clic fuera del contenedor
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  // Cerrar con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });
}

/**
 * 4. GESTIÓN Y VALIDACIÓN DEL FORMULARIO DE LEAD
 */
function initLeadForm() {
  const form = document.getElementById('membershipForm');
  const confirmationScreen = document.getElementById('confirmationScreen');
  const alertBox = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitLeadBtn');

  if (!form) return;

  // Manejo visual de opciones Pills (Experiencia)
  const experienceInputs = form.querySelectorAll('input[name="pole_experience"]');
  experienceInputs.forEach(input => {
    input.addEventListener('change', () => {
      form.querySelectorAll('.pill-option-label').forEach(lbl => lbl.classList.remove('checked'));
      if (input.checked) {
        input.closest('.pill-option-label').classList.add('checked');
      }
    });
  });

  // Manejo visual de opciones Tags (Beneficios - Multi-select)
  const benefitInputs = form.querySelectorAll('input[name="preferred_benefits"]');
  benefitInputs.forEach(input => {
    input.addEventListener('change', () => {
      const label = input.closest('.tag-checkbox-label');
      if (input.checked) {
        label.classList.add('checked');
      } else {
        label.classList.remove('checked');
      }
    });
  });

  // Manejo visual de opciones Cards (Disposición de pago)
  const paymentInputs = form.querySelectorAll('input[name="willingness_to_pay"]');
  paymentInputs.forEach(input => {
    input.addEventListener('change', () => {
      form.querySelectorAll('.payment-option-card').forEach(card => card.classList.remove('checked'));
      if (input.checked) {
        input.closest('.payment-option-card').classList.add('checked');
      }
    });
  });

  // Envío del formulario
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    // Recopilar datos
    const formData = new FormData(form);
    const fullName = (formData.get('full_name') || '').trim();
    const email = (formData.get('email') || '').trim();
    let instagram = (formData.get('instagram') || '').trim();
    if (instagram && !instagram.startsWith('@')) {
      instagram = '@' + instagram;
    }
    const poleExperience = formData.get('pole_experience');
    const preferredBenefits = formData.getAll('preferred_benefits');
    const willingnessToPay = formData.get('willingness_to_pay');
    const additionalBenefits = (formData.get('additional_benefits') || '').trim();
    const privacyConsent = formData.get('privacy_consent') === 'on';

    // Validaciones en cliente
    if (!fullName || fullName.length < 3) {
      showAlert('Por favor ingresa tu nombre completo.');
      form.querySelector('#fullNameInput').focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showAlert('Por favor ingresa un correo electrónico válido.');
      form.querySelector('#emailInput').focus();
      return;
    }

    if (!instagram || instagram.length < 2) {
      showAlert('Por favor ingresa tu usuario de Instagram.');
      form.querySelector('#instagramInput').focus();
      return;
    }

    if (!poleExperience) {
      showAlert('Por favor indica cuánto tiempo llevas practicando pole dance.');
      return;
    }

    if (!preferredBenefits || preferredBenefits.length === 0) {
      showAlert('Por favor selecciona al menos un beneficio que te interese.');
      return;
    }

    if (!willingnessToPay) {
      showAlert('Por favor indícanos tu respuesta sobre la membresía mensual.');
      return;
    }

    if (!privacyConsent) {
      showAlert('Debes aceptar la política de tratamiento de datos personales para continuar.');
      return;
    }

    // Preparar estado de carga en el botón
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> ENVIANDO TU SOLICITUD...';

    const payload = {
      full_name: fullName,
      email,
      instagram,
      pole_experience: poleExperience,
      preferred_benefits: preferredBenefits,
      willingness_to_pay: willingnessToPay,
      additional_benefits: additionalBenefits,
      privacy_consent: privacyConsent
    };

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Éxito: ocultar formulario y mostrar pantalla de confirmación
        form.style.display = 'none';
        confirmationScreen.classList.add('visible');
        updateRemainingSlots();
        trackEvent('form_completed_success', { willingness: willingnessToPay });
      } else {
        // Error conocido del backend
        showAlert(data.message || 'No fue posible registrar tu solicitud. Por favor intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error enviando formulario:', err);
      showAlert('Ocurrió un error de conexión al enviar tus datos. Por favor verifica tu red e inténtalo nuevamente.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  });

  function showAlert(msg) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = 'form-alert error visible';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.className = 'form-alert';
    alertBox.textContent = '';
  }
}

/**
 * 5. CONSULTA DINÁMICA DE CUPOS DISPONIBLES
 */
async function fetchInitialSlots() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      const total = data.totalLeads || 0;
      updateSlotsDisplay(total);
    }
  } catch (e) {
    // Silencioso en caso de fallback
  }
}

function updateSlotsDisplay(totalLeads) {
  const target = 20;
  const remaining = Math.max(0, target - totalLeads);
  const elements = document.querySelectorAll('.slots-counter');
  elements.forEach(el => {
    el.textContent = `${remaining} de ${target} disponibles`;
  });
}

function updateRemainingSlots() {
  const elements = document.querySelectorAll('.slots-counter');
  elements.forEach(el => {
    const text = el.textContent;
    const match = text.match(/(\d+)\s*de/);
    if (match) {
      const current = parseInt(match[1], 10);
      const next = Math.max(0, current - 1);
      el.textContent = `${next} de 20 disponibles`;
    }
  });
}

/**
 * 6. TRACKING ANÓNIMO DE EVENTOS DEL PMV
 */
function initAnalyticsTracker() {
  // Registrar vista de página
  trackEvent('page_view', window.location.pathname);

  // Registrar clics en botones de acción principales
  document.querySelectorAll('[data-track]').forEach(el => {
    el.addEventListener('click', () => {
      const eventName = el.getAttribute('data-track');
      trackEvent(eventName, el.textContent.trim());
    });
  });
}

function trackEvent(eventName, sectionOrMeta = null) {
  try {
    const payload = {
      eventName,
      sectionName: typeof sectionOrMeta === 'string' ? sectionOrMeta : null,
      metadata: typeof sectionOrMeta === 'object' ? sectionOrMeta : { path: window.location.pathname }
    };
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {
    // Silencioso para no interrumpir al usuario
  }
}
