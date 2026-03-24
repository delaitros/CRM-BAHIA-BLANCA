/* ============================================
   Lo de Juan — Public Site JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------------------
     1. Mobile Menu Toggle
  ------------------------------------------ */
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuClose = document.getElementById('mobile-menu-close');
  const mobileOverlay = document.querySelector('.mobile-menu-overlay');

  function openMobileMenu() {
    if (mobileMenu) {
      mobileMenu.classList.add('active');
      if (mobileOverlay) mobileOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeMobileMenu() {
    if (mobileMenu) {
      mobileMenu.classList.remove('active');
      if (mobileOverlay) mobileOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
  if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

  /* ------------------------------------------
     2. Scroll Progress Dots
  ------------------------------------------ */
  const scrollDots = document.querySelectorAll('.scroll-dot');

  function updateScrollDots() {
    if (scrollDots.length === 0) return;

    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;

    if (docHeight <= 0) return;

    const scrollPercent = scrollTop / docHeight;
    const activeIndex = Math.min(
      Math.floor(scrollPercent * scrollDots.length),
      scrollDots.length - 1
    );

    scrollDots.forEach(function (dot, i) {
      dot.classList.toggle('active', i === activeIndex);
    });
  }

  if (scrollDots.length > 0) {
    window.addEventListener('scroll', updateScrollDots, { passive: true });
    updateScrollDots();
  }

  /* ------------------------------------------
     3. Active Navigation Highlighting
  ------------------------------------------ */
  const navLinks = document.querySelectorAll('.nav-link');
  const currentPath = window.location.pathname;

  navLinks.forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;

    // Normalize: strip trailing slashes for comparison
    var linkPath = href.replace(/\/+$/, '') || '/';
    var pagePath = currentPath.replace(/\/+$/, '') || '/';

    if (linkPath === pagePath || (linkPath !== '/' && pagePath.startsWith(linkPath))) {
      link.classList.add('active');
    }
  });

  /* ------------------------------------------
     4. Contact Form Submission Handler
  ------------------------------------------ */
  var contactForms = document.querySelectorAll('.contact-form');

  contactForms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Validate required fields
      var requiredFields = form.querySelectorAll('[required]');
      var allValid = true;

      requiredFields.forEach(function (field) {
        if (!field.value.trim()) {
          allValid = false;
          field.classList.add('border-red-500');
          field.addEventListener('input', function handler() {
            field.classList.remove('border-red-500');
            field.removeEventListener('input', handler);
          });
        }
      });

      if (!allValid) {
        window.showToast('Por favor, completá todos los campos requeridos.', 'error');
        return;
      }

      // Simulate successful submission
      window.showToast('¡Mensaje enviado con éxito! Te responderemos pronto.', 'success');
      form.reset();
    });
  });

  /* ------------------------------------------
     5. Gallery Filter Buttons
  ------------------------------------------ */
  var galleryFilters = document.querySelectorAll('.gallery-filter');
  var galleryItems = document.querySelectorAll('.gallery-item');

  galleryFilters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var category = btn.getAttribute('data-category');

      // Update active filter
      galleryFilters.forEach(function (f) { f.classList.remove('active'); });
      btn.classList.add('active');

      // Filter items
      galleryItems.forEach(function (item) {
        var itemCat = item.getAttribute('data-category');

        if (category === 'all' || itemCat === category) {
          item.classList.remove('hidden');
          item.style.opacity = '0';
          item.style.transform = 'scale(0.95)';
          requestAnimationFrame(function () {
            item.style.opacity = '1';
            item.style.transform = 'scale(1)';
          });
        } else {
          item.classList.add('hidden');
        }
      });
    });
  });

  /* ------------------------------------------
     6. Smooth Scroll for Anchor Links
  ------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;

      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeMobileMenu();
      }
    });
  });

  /* ------------------------------------------
     7. Navbar Background Change on Scroll
  ------------------------------------------ */
  var navbar = document.querySelector('.glass-nav');

  function handleNavScroll() {
    if (!navbar) return;

    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  if (navbar) {
    window.addEventListener('scroll', handleNavScroll, { passive: true });
    handleNavScroll();
  }

  /* ------------------------------------------
     8. Toast Notification Function
  ------------------------------------------ */
  window.showToast = function (message, type) {
    type = type || 'success';

    // Remove any existing toast
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-success');

    var icon = type === 'error' ? 'error' : 'check_circle';
    toast.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:20px">' + icon + '</span>' +
      '<span>' + message + '</span>';

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('show');
      });
    });

    // Auto-dismiss after 4 seconds
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 4000);
  };

  /* ------------------------------------------
     9. "Load More" Gallery Button Simulation
  ------------------------------------------ */
  var loadMoreBtn = document.querySelector('.load-more-gallery');

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function () {
      var btn = this;
      var originalText = btn.textContent;

      btn.textContent = 'Cargando...';
      btn.disabled = true;

      setTimeout(function () {
        var gallery = document.querySelector('.gallery-container');
        if (!gallery) return;

        // Clone the first few visible items as "new" content
        var visibleItems = gallery.querySelectorAll('.gallery-item:not(.hidden)');
        var count = Math.min(visibleItems.length, 4);

        for (var i = 0; i < count; i++) {
          var clone = visibleItems[i].cloneNode(true);
          clone.style.opacity = '0';
          clone.style.transform = 'translateY(20px)';
          gallery.appendChild(clone);

          (function (el) {
            requestAnimationFrame(function () {
              el.style.transition = 'all 0.4s ease';
              el.style.opacity = '1';
              el.style.transform = 'translateY(0)';
            });
          })(clone);
        }

        btn.textContent = originalText;
        btn.disabled = false;

        window.showToast('Se cargaron más imágenes.', 'success');
      }, 1000);
    });
  }

  /* ------------------------------------------
     10. WhatsApp Floating Button
  ------------------------------------------ */
  var whatsappBtn = document.querySelector('.whatsapp-float');

  if (whatsappBtn) {
    // Add entrance animation after page load
    whatsappBtn.style.opacity = '0';
    whatsappBtn.style.transform = 'scale(0)';

    setTimeout(function () {
      whatsappBtn.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      whatsappBtn.style.opacity = '1';
      whatsappBtn.style.transform = 'scale(1)';
    }, 1500);

    // Pulse animation on periodic interval
    setInterval(function () {
      whatsappBtn.style.transform = 'scale(1.15)';
      setTimeout(function () {
        whatsappBtn.style.transform = 'scale(1)';
      }, 300);
    }, 5000);
  }

});
