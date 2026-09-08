/**
 * store.js — stockage JSON par utilisateur (MVP). Échangeable contre une vraie
 * base de données (SQLite/Postgres) avant mise en production.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const FILE = path.join(DATA_DIR, 'users.json');

// Formules
const PLANS = {
  decouverte: { key: 'decouverte', label: 'Découverte', price: 0, limit: 10 },
  essentiel: { key: 'essentiel', label: 'Essentiel', price: 9.99, limit: 20 },
  pro: { key: 'pro', label: 'Pro', price: 19.99, limit: Infinity },
};
const TRIAL_DAYS = 14;
const DAY = 86400000;

function ensure() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function loadUsers() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsers(users) { ensure(); fs.writeFileSync(FILE, JSON.stringify(users, null, 2)); }

function newUser(email) {
  return {
    email,
    pwHash: '',
    plan: 'decouverte',
    trialStartedAt: new Date().toISOString(),
    stripeCustomerId: null,
    stripeSubStatus: null,
    company: '',
    sender: '',
    tone: 'courtois',
    delays: [7, 15, 30],
    invoices: [],       // {id, numero, client, email, montant, date_echeance, statut:'impayee'|'paye', date_paiement}
    reminders: [],      // {id, invoiceId, niveau, subject, body, statut:'brouillon'|'envoye', dateEnvoi}
    log: [],
    createdAt: new Date().toISOString(),
  };
}

function getUser(email) {
  const users = loadUsers();
  const u = users[String(email).toLowerCase()];
  return u ? JSON.parse(JSON.stringify(u)) : null; // clone
}
function saveUser(user) {
  const users = loadUsers();
  users[user.email] = user;
  saveUsers(users);
}

function uid() {
  return 'id' + crypto.randomBytes(6).toString('hex');
}

/* Plan courant : état dérivé (actif/trial/expired) */
function planState(user) {
  const def = PLANS[user.plan] || PLANS.decouverte;
  if (user.plan === 'decouverte') {
    const end = new Date(user.trialStartedAt).getTime() + TRIAL_DAYS * DAY;
    const active = Date.now() < end;
    return { plan: 'decouverte', def, state: active ? 'trial' : 'expired', trialEnd: new Date(end).toISOString() };
  }
  return { plan: user.plan, def, state: 'active' };
}
function canSend(user) {
  const s = planState(user);
  return s.state === 'trial' || s.state === 'active';
}

module.exports = { PLANS, TRIAL_DAYS, newUser, getUser, saveUser, loadUsers, uid, planState, canSend };
