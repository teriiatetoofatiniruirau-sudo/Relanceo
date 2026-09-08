/**
 * email.js — envoi des relances.
 * Avec RESEND_API_KEY : envoi réel. Sinon : écrit dans ./outbox (simulation).
 */

const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const OUTBOX_DIR = path.resolve(process.env.OUTBOX_DIR || './outbox');

function outboxFile(company) {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  const safe = (company || 'outbox').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(OUTBOX_DIR, safe + '.json');
}
function pushOutbox(company, email) {
  const file = outboxFile(company);
  let box = [];
  try { box = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  box.unshift({ ...email, ts: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(box, null, 2));
}

async function sendEmail({ to, subject, body, company }) {
  const apiKey = process.env.RESEND_API_KEY;
  const email = { to, subject, body };
  if (apiKey) {
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM || 'Relanceo <relances@relanceo.app>';
    await resend.emails.send({ from, to, subject, text: body });
    return { sent: true, real: true };
  }
  pushOutbox(company, email);
  return { sent: true, real: false, note: 'simulé (pas de clé Resend) — voir ./outbox' };
}

module.exports = { sendEmail, pushOutbox };
