/*
 * Lo de Juan — Admin Auth
 *
 * Para cambiar la contraseña: editá ADMIN_PASSWORD abajo y reiniciá nginx.
 * docker compose restart nginx
 */

var ADMIN_PASSWORD = 'lodejuan2026';
var SESSION_KEY = 'lodejuan_admin';
var SESSION_VALUE = 'ok_v1';

function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === SESSION_VALUE;
}

function login(password) {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, SESSION_VALUE);
    return true;
  }
  return false;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = '/admin/login.html';
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/admin/login.html';
  }
}

// Google Calendar: pegá acá la URL de embed de tu calendario de Google.
// Cómo obtenerla: Google Calendar → Configuración (tuercas) → Seleccioná tu calendario
// → "Integrar el calendario" → Copiá la URL del iframe (solo la parte del src="...")
var GOOGLE_CALENDAR_EMBED_URL = '';
// Ejemplo: 'https://calendar.google.com/calendar/embed?src=tu_id%40gmail.com&ctz=America%2FArgentina%2FBuenos_Aires'
