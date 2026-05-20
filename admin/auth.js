/*
 * Lo de Juan — Admin Auth & Config
 *
 * La contraseña por defecto está acá abajo (DEFAULT_PASSWORD).
 * Si la cambiás desde la página de Configuración, se guarda en localStorage
 * y queda activa en ese navegador.
 */

var DEFAULT_PASSWORD = 'lodejuan2026';

var SESSION_KEY = 'lodejuan_admin';
var SESSION_VALUE = 'ok_v1';
var PASSWORD_KEY = 'lodejuan_admin_password';
var CW_URL_KEY = 'lodejuan_chatwoot_url';
var GCAL_ICS_KEY = 'lodejuan_gcal_ics_url';

function getPassword() {
  return localStorage.getItem(PASSWORD_KEY) || DEFAULT_PASSWORD;
}

function setPassword(nuevoPwd) {
  localStorage.setItem(PASSWORD_KEY, nuevoPwd);
}

function getChatwootUrl() {
  return localStorage.getItem(CW_URL_KEY) || (window.location.protocol + '//' + window.location.hostname + ':3000');
}

function setChatwootUrl(url) {
  if (url) localStorage.setItem(CW_URL_KEY, url);
  else localStorage.removeItem(CW_URL_KEY);
}

function getGoogleCalendarIcsUrl() {
  return localStorage.getItem(GCAL_ICS_KEY) || '';
}

function setGoogleCalendarIcsUrl(url) {
  if (url) localStorage.setItem(GCAL_ICS_KEY, url);
  else localStorage.removeItem(GCAL_ICS_KEY);
}

function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === SESSION_VALUE;
}

function login(password) {
  if (password === getPassword()) {
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
