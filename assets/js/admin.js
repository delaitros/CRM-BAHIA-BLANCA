/* ============================================
   Lo de Juan — Admin CRM JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------------------
     1. Sidebar Toggle for Mobile
  ------------------------------------------ */
  var sidebarToggle = document.getElementById('sidebar-toggle');
  var adminSidebar = document.getElementById('admin-sidebar');
  var sidebarOverlay = document.querySelector('.admin-sidebar-overlay');

  function openSidebar() {
    if (adminSidebar) {
      adminSidebar.classList.add('open');
      if (sidebarOverlay) sidebarOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeSidebar() {
    if (adminSidebar) {
      adminSidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  /* ------------------------------------------
     2. Calendar Navigation
  ------------------------------------------ */
  var calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  };

  var monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  var dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  var calPrev = document.querySelector('.cal-prev');
  var calNext = document.querySelector('.cal-next');
  var calendarGrid = document.querySelector('.calendar-grid');
  var calendarMonthDisplay = document.querySelector('.calendar-month-display');

  function renderCalendar() {
    if (!calendarGrid) return;

    var year = calendarState.year;
    var month = calendarState.month;

    // Update month display
    if (calendarMonthDisplay) {
      calendarMonthDisplay.textContent = monthNames[month] + ' ' + year;
    }

    // Clear the grid
    calendarGrid.innerHTML = '';

    // Add day headers
    dayNames.forEach(function (dayName) {
      var header = document.createElement('div');
      header.className = 'calendar-day-header text-center text-xs font-semibold text-gray-500 py-2';
      header.textContent = dayName;
      calendarGrid.appendChild(header);
    });

    // Get first day of month and total days
    var firstDay = new Date(year, month, 1).getDay();
    var totalDays = new Date(year, month + 1, 0).getDate();
    var today = new Date();

    // Empty cells before first day
    for (var i = 0; i < firstDay; i++) {
      var emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day calendar-day-empty p-2';
      calendarGrid.appendChild(emptyCell);
    }

    // Day cells
    for (var day = 1; day <= totalDays; day++) {
      var dayCell = document.createElement('div');
      dayCell.className = 'calendar-day p-2 text-center rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-sm';
      dayCell.setAttribute('data-date', year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
      dayCell.textContent = day;

      // Highlight today
      if (
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear()
      ) {
        dayCell.classList.add('bg-red-50', 'text-red-700', 'font-bold');
      }

      calendarGrid.appendChild(dayCell);
    }

    // Rebind day click listeners
    bindCalendarDayClicks();
  }

  if (calPrev) {
    calPrev.addEventListener('click', function () {
      calendarState.month--;
      if (calendarState.month < 0) {
        calendarState.month = 11;
        calendarState.year--;
      }
      renderCalendar();
    });
  }

  if (calNext) {
    calNext.addEventListener('click', function () {
      calendarState.month++;
      if (calendarState.month > 11) {
        calendarState.month = 0;
        calendarState.year++;
      }
      renderCalendar();
    });
  }

  /* ------------------------------------------
     3. Calendar Day Click — Show Event Modal
  ------------------------------------------ */
  function bindCalendarDayClicks() {
    var calendarDays = document.querySelectorAll('.calendar-day:not(.calendar-day-empty):not(.calendar-day-header)');

    calendarDays.forEach(function (dayEl) {
      dayEl.addEventListener('click', function () {
        var date = this.getAttribute('data-date');
        openNewEventModal(date);
      });
    });
  }

  /* ------------------------------------------
     4. New Event Modal
  ------------------------------------------ */
  var newEventModal = document.getElementById('new-event-modal');
  var newEventForm = document.getElementById('new-event-form');

  function openNewEventModal(prefilledDate) {
    if (!newEventModal) return;
    newEventModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Prefill date if provided
    if (prefilledDate) {
      var dateInput = newEventModal.querySelector('[name="event-date"]');
      if (dateInput) dateInput.value = prefilledDate;
    }
  }

  function closeNewEventModal() {
    if (!newEventModal) return;
    newEventModal.classList.remove('active');
    document.body.style.overflow = '';
    if (newEventForm) newEventForm.reset();
  }

  // Close modal when clicking overlay background
  if (newEventModal) {
    newEventModal.addEventListener('click', function (e) {
      if (e.target === newEventModal) closeNewEventModal();
    });

    var modalCloseBtn = newEventModal.querySelector('.modal-close');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeNewEventModal);
    }
  }

  // Handle form submission
  if (newEventForm) {
    newEventForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var eventName = newEventForm.querySelector('[name="event-name"]');
      if (eventName && !eventName.value.trim()) {
        window.showToast('Por favor, ingresá el nombre del evento.', 'error');
        return;
      }

      window.showToast('Evento creado con éxito.', 'success');
      closeNewEventModal();
    });
  }

  // Escape key closes modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeNewEventModal();
    }
  });

  /* ------------------------------------------
     5. Message Chat Functionality
  ------------------------------------------ */
  var chatInput = document.getElementById('chat-input');
  var chatSendBtn = document.getElementById('chat-send');
  var chatMessages = document.getElementById('chat-messages');

  function sendChatMessage() {
    if (!chatInput || !chatMessages) return;

    var text = chatInput.value.trim();
    if (!text) return;

    // Create message bubble
    var bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'flex justify-end mb-3';

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble sent';
    bubble.textContent = text;

    // Add timestamp
    var timestamp = document.createElement('div');
    timestamp.className = 'text-xs text-gray-400 text-right mt-1';
    var now = new Date();
    timestamp.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    bubbleWrapper.appendChild(bubble);
    chatMessages.appendChild(bubbleWrapper);
    chatMessages.appendChild(timestamp);

    // Clear input and scroll to bottom
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  /* ------------------------------------------
     6. Message List Filtering by Channel
  ------------------------------------------ */
  var channelFilters = document.querySelectorAll('.channel-filter');

  channelFilters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var channel = btn.getAttribute('data-channel');

      // Update active state
      channelFilters.forEach(function (f) { f.classList.remove('active', 'bg-red-50', 'text-red-700'); });
      btn.classList.add('active', 'bg-red-50', 'text-red-700');

      // Filter message items
      var messageItems = document.querySelectorAll('.message-item');
      messageItems.forEach(function (item) {
        var itemChannel = item.getAttribute('data-channel');
        if (channel === 'all' || itemChannel === channel) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  /* ------------------------------------------
     7. Inventory Search Filtering
  ------------------------------------------ */
  var inventorySearch = document.getElementById('inventory-search');

  if (inventorySearch) {
    inventorySearch.addEventListener('input', function () {
      var query = this.value.toLowerCase().trim();
      var rows = document.querySelectorAll('.inventory-row');

      rows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        if (text.includes(query)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  /* ------------------------------------------
     8. Inventory Pagination Simulation
  ------------------------------------------ */
  var paginationBtns = document.querySelectorAll('.pagination-btn');

  paginationBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Update active state
      paginationBtns.forEach(function (b) {
        b.classList.remove('bg-red-600', 'text-white');
        b.classList.add('text-gray-600');
      });
      btn.classList.add('bg-red-600', 'text-white');
      btn.classList.remove('text-gray-600');

      // Simulate page change with a brief loading indication
      var tableBody = document.querySelector('.inventory-table-body');
      if (tableBody) {
        tableBody.style.opacity = '0.5';
        setTimeout(function () {
          tableBody.style.opacity = '1';
        }, 300);
      }
    });
  });

  /* ------------------------------------------
     9. Dashboard Stats Animation (Count Up)
  ------------------------------------------ */
  var statNumbers = document.querySelectorAll('.stat-number');

  function animateCountUp(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    if (isNaN(target)) return;

    var duration = 1500;
    var startTime = null;
    var startValue = 0;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);

      // Ease out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(startValue + (target - startValue) * eased);

      el.textContent = current.toLocaleString('es-AR');

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target.toLocaleString('es-AR');
      }
    }

    requestAnimationFrame(step);
  }

  // Observe stat numbers and animate when visible
  if (statNumbers.length > 0 && 'IntersectionObserver' in window) {
    var statsObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCountUp(entry.target);
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(function (el) {
      statsObserver.observe(el);
    });
  } else {
    // Fallback: animate immediately
    statNumbers.forEach(animateCountUp);
  }

  /* ------------------------------------------
     10. Notifications Dropdown Toggle
  ------------------------------------------ */
  var notificationsBtn = document.getElementById('notifications-btn');
  var notificationsDropdown = document.querySelector('.notifications-dropdown');

  if (notificationsBtn && notificationsDropdown) {
    notificationsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      notificationsDropdown.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (!notificationsDropdown.contains(e.target) && e.target !== notificationsBtn) {
        notificationsDropdown.classList.remove('open');
      }
    });
  }

  /* ------------------------------------------
     11. Active Sidebar Link Highlighting
  ------------------------------------------ */
  var sidebarLinks = document.querySelectorAll('.sidebar-link');
  var currentPath = window.location.pathname;

  sidebarLinks.forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;

    var linkPath = href.replace(/\/+$/, '') || '/';
    var pagePath = currentPath.replace(/\/+$/, '') || '/';

    if (linkPath === pagePath || (linkPath !== '/' && pagePath.startsWith(linkPath))) {
      link.classList.add('active');
    }
  });

  /* ------------------------------------------
     12. Logout Confirmation Dialog
  ------------------------------------------ */
  var logoutLinks = document.querySelectorAll('.logout-link, .logout-btn');

  logoutLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var confirmed = confirm('¿Estás seguro de que querés cerrar sesión?');
      if (confirmed) {
        window.location.href = link.getAttribute('href') || '/login.html';
      }
    });
  });

  /* ------------------------------------------
     13. "New Event" Button Modal Trigger
  ------------------------------------------ */
  var newEventBtns = document.querySelectorAll('.new-event-btn');

  newEventBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      openNewEventModal(null);
    });
  });

  /* ------------------------------------------
     Initialize Calendar if present
  ------------------------------------------ */
  if (calendarGrid) {
    renderCalendar();
  }

});
