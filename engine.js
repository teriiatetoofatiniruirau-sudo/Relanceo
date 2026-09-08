/**
 * engine.js — moteur de relances (réutilisé du prototype)
 * + import CSV + logique de paliers.
 */

const { generate } = require('./content');
const store = require('./store');
const DAY = 86400000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function toISO(d) {
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
}
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10); if (y < 100) y += 2000;
    return toISO(new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toISO(new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toISO(d);
}

function daysOverdue(inv) {
  if (inv.statut === 'paye') return 0;
  const due = new Date((inv.date_echeance || '') + 'T12:00:00').getTime();
  return Math.floor((Date.now() - due) / DAY);
}

/* ── Import CSV ─────────────────────────────────────────────────────────── */
function parseNumber(s) {
  if (s == null) return 0;
  return Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
  const header = lines[0].split(sep).map((h) => normalize(h));
  const rows = lines.slice(1).map((l) => l.split(sep));
  const find = (names) => header.findIndex((h) => names.includes(h));

  const iNum = find(['numero', 'numéro', 'n', 'no', 'facture', 'invoice']);
  const iClient = find(['client', 'customer', 'societe', 'société', 'nom', 'company', 'raison_sociale']);
  const iEmail = find(['email', 'mail', 'courriel', 'email_client']);
  const iMontant = find(['montant', 'total', 'amount', 'prix', 'montant_ttc', 'ht', 'ttc', 'solde', 'due']);
  const iDate = find(['date_echeance', 'échéance', 'echeance', 'date', 'due_date', 'deadline', 'date_due']);
  const iStatut = find(['statut', 'status', 'etat', 'paye', 'paid']);
  const iPayeJ = find(['jours_retard', 'retard', 'delai', 'days_late']);

  const out = [];
  for (const row of rows) {
    const get = (idx) => (idx >= 0 && row[idx] != null ? row[idx].trim() : '');
    const numero = get(iNum) || '';
    if (!numero) continue;
    const statut = (get(iStatut) || 'impayee').toLowerCase();
    const paid = ['paye', 'paid', 'true', 'regle', 'réglé', 'oui'].includes(statut);
    out.push({
      numero,
      client: get(iClient),
      email: get(iEmail),
      montant: iMontant >= 0 ? parseNumber(get(iMontant)) : 0,
      date_echeance: parseDate(get(iDate)) || todayISO(),
      statut: paid ? 'paye' : 'impayee',
      date_paiement: paid ? todayISO() : null,
      retard_jours: iPayeJ >= 0 ? Number(get(iPayeJ)) || 0 : null,
    });
  }
  return out;
}

function normalize(h) {
  return String(h).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/* ── Génération des brouillons de relances dues ────────────────────────── */
function generateDrafts(user) {
  let created = 0;
  for (const inv of user.invoices) {
    if (inv.statut === 'paye') continue;
    const od = daysOverdue(inv);
    if (od <= 0) continue;
    for (let i = 0; i < 3; i++) {
      if (od < (user.delays[i] || 999)) break;
      const niveau = i + 1;
      const exists = user.reminders.some((r) => r.invoiceId === inv.id && r.niveau === niveau);
      if (exists) continue;
      const c = generate({
        invoice: inv,
        niveau,
        tone: user.tone,
        settings: user,
        paymentLink: 'https://pay.tresoleo.app/' + inv.numero,
      });
      user.reminders.push({
        id: store.uid(), invoiceId: inv.id, niveau,
        subject: c.subject, body: c.body,
        statut: 'brouillon', dateCreation: todayISO(),
      });
      created++;
    }
  }
  return { created, totalDrafts: user.reminders.filter((r) => r.statut === 'brouillon').length };
}

/* Résumé / KPI */
function overview(user) {
  const paid = user.invoices.filter((i) => i.statut === 'paye');
  const unpaid = user.invoices.filter((i) => i.statut !== 'paye');
  const overdue = unpaid.filter((i) => daysOverdue(i) > 0);
  const recovered = paid.reduce((s, i) => s + (i.montant || 0), 0);
  const sent = user.reminders.filter((r) => r.statut === 'envoye').length;
  const byLevel = [1, 2, 3].map((l) => ({
    niveau: l,
    count: overdue.filter((i) => daysOverdue(i) > (user.delays[l - 1] || 999)).length,
  }));
  return { unpaid: unpaid.length, overdue: overdue.length, paid: paid.length, recovered, sent, byLevel };
}

module.exports = { todayISO, parseDate, parseCSV, parseNumber, daysOverdue, generateDrafts, overview };
