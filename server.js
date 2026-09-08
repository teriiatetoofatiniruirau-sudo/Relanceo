/**
 * Paylora — micro-SaaS (serveur)
 * Comptes + sessions (cookie signé), facturation Stripe réelle (ou simulation
 * si STRIPE_SECRET_KEY absent), moteur de relances, envoi d'emails (Resend ou outbox).
 */

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const store = require('./store');
const engine = require('./engine');
const emailMod = require('./email');

const { PLANS } = store;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-moi';
const PORT = process.env.PORT || 3000;

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/* ── Sessions (cookie signé) ────────────────────────────────────────────── */

function sign(email) {
  const payload = Buffer.from(`${email}|${Date.now()}`).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verify(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const email = Buffer.from(payload, 'base64url').toString().split('|')[0];
  return email || null;
}
function cookieToken(req) {
  const m = /relanceo_sid=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : null;
}
function bearerToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}
function currentUser(req) {
  // Jeton accepté via en-tête Authorization (primaire) ou cookie (repli)
  const token = bearerToken(req) || cookieToken(req);
  const email = verify(token);
  return email ? store.getUser(email) : null;
}
function setCookie(res, token) {
  const secure = BASE_URL.startsWith('https://');
  res.setHeader('Set-Cookie',
    `relanceo_sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? '; Secure' : ''}`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', 'relanceo_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function pushLog(user, texte) {
  user.log = user.log || [];
  user.log.unshift({ ts: new Date().toISOString(), texte });
  user.log = user.log.slice(0, 400);
}
function publicUser(user) {
  const ps = store.planState(user);
  return {
    email: user.email,
    company: user.company || '',
    plan: user.plan,
    planState: ps.state,
    planLabel: ps.def.label,
    planLimit: ps.def.limit,
    paid: ps.state === 'active',
    canSend: store.canSend(user),
    trialDaysLeft: user.plan === 'decouverte' && ps.state === 'trial'
      ? Math.max(0, Math.ceil((new Date(ps.trialEnd).getTime() - Date.now()) / 86400000)) : 0,
  };
}
function enrichInvoice(user, inv) {
  const od = engine.daysOverdue(inv);
  let niveau = 0;
  for (let i = 0; i < 3; i++) if (od >= (user.delays[i] || 999)) niveau = i + 1;
  return { ...inv, retardJours: od, niveau };
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Non connecté' });
  req.user = user;
  next();
}

/* ── Stripe (facturation) ───────────────────────────────────────────────── */

const PLAN_BY_PRICE = {};
if (process.env.STRIPE_PRICE_ESSENTIEL) PLAN_BY_PRICE[process.env.STRIPE_PRICE_ESSENTIEL] = 'essentiel';
if (process.env.STRIPE_PRICE_PRO) PLAN_BY_PRICE[process.env.STRIPE_PRICE_PRO] = 'pro';

function priceFor(plan) {
  if (plan === 'essentiel') return process.env.STRIPE_PRICE_ESSENTIEL;
  if (plan === 'pro') return process.env.STRIPE_PRICE_PRO;
  return null;
}

async function checkoutFor(user, plan) {
  if (!PLANS[plan] || plan === 'decouverte') throw new Error('Plan invalide');
  // Mode simulation (pas de Stripe configuré) : on active directement
  if (!stripe || !priceFor(plan)) {
    const u = store.getUser(user.email);
    u.plan = plan;
    u.stripeSubStatus = 'active';
    pushLog(u, `💳 Abonnement ${PLANS[plan].label} activé (${PLANS[plan].price.toFixed(2)} €/mois) — mode simulation`);
    store.saveUser(u);
    return { url: null, simulated: true };
  }
  // Mode réel : création du client + Checkout Session Stripe
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({ email: user.email, name: user.company || undefined, metadata: { app: 'relanceo' } });
    customerId = c.id;
    const u = store.getUser(user.email);
    u.stripeCustomerId = customerId;
    store.saveUser(u);
  }
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceFor(plan), quantity: 1 }],
    success_url: `${BASE_URL}/app?paid=1&plan=${plan}`,
    cancel_url: `${BASE_URL}/app?cancel=1`,
    client_reference_id: user.email,
    metadata: { plan, email: user.email },
    subscription_data: { metadata: { email: user.email, plan } },
  });
  return { url: session.url, simulated: false };
}

/* ── Application Express ────────────────────────────────────────────────── */

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

/* --- Webhook Stripe (body brut pour signature) --- */
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(200).end(); // simulation
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) { return res.status(400).send(`Webhook signature: ${e.message}`); }

  if (event.type === 'checkout.session.completed') {
    const sess = event.data.object;
    const email = sess.client_reference_id || (sess.customer_details && sess.customer_details.email);
    const plan = (sess.subscription_data && sess.subscription_data.metadata && sess.subscription_data.metadata.plan)
      || (sess.metadata && sess.metadata.plan) || 'essentiel';
    if (email && PLANS[plan]) {
      const u = store.getUser(email);
      if (u) {
        u.plan = plan; u.stripeSubStatus = 'active';
        pushLog(u, `💳 Paiement confirmé — abonnement ${PLANS[plan].label} actif (${PLANS[plan].price.toFixed(2)} €/mois)`);
        store.saveUser(u);
      }
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const email = (event.data.object.metadata && event.data.object.metadata.email);
    if (email) {
      const u = store.getUser(email);
      if (u) { u.plan = 'decouverte'; u.trialStartedAt = new Date().toISOString(); u.stripeSubStatus = 'canceled'; pushLog(u, '↩️ Abonnement résilié — retour à Découverte'); store.saveUser(u); }
    }
  }
  res.status(200).end();
});

/* --- Authentification --- */
app.post('/api/signup', async (req, res) => {
  const { email, password, company } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return res.status(400).json({ error: 'Email invalide' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });
  if (store.getUser(em)) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  const u = store.newUser(em);
  u.pwHash = bcrypt.hashSync(String(password), 10);
  u.company = String(company || '').trim();
  store.saveUser(u);
  const token = sign(em);
  setCookie(res, token);
  res.json({ user: publicUser(u), token });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  const u = store.getUser(em);
  if (!u || !bcrypt.compareSync(String(password || ''), u.pwHash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  const token = sign(em);
  setCookie(res, token);
  res.json({ user: publicUser(u), token });
});

app.post('/api/logout', (req, res) => { clearCookie(res); res.json({ ok: true }); });

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json({ loggedIn: !!u, user: u ? publicUser(u) : null });
});

/* --- Données de l'espace de travail --- */
app.get('/api/data', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    user: publicUser(u),
    settings: { company: u.company, sender: u.sender, tone: u.tone, delays: u.delays },
    invoices: u.invoices.map((i) => enrichInvoice(u, i)),
    reminders: u.reminders,
    overview: engine.overview(u),
    log: u.log || [],
  });
});

app.patch('/api/me/settings', requireAuth, (req, res) => {
  const u = req.user;
  const b = req.body || {};
  if (typeof b.company === 'string') u.company = b.company.trim();
  if (typeof b.sender === 'string') u.sender = b.sender.trim();
  if (['courtois', 'commercial', 'ferme'].includes(b.tone)) u.tone = b.tone;
  if (Array.isArray(b.delays) && b.delays.length === 3 && b.delays.every((n) => Number.isFinite(n) && n >= 0)) {
    u.delays = b.delays.map(Number);
  }
  pushLog(u, '⚙️ Réglages enregistrés');
  store.saveUser(u);
  res.json({ ok: true, settings: { company: u.company, sender: u.sender, tone: u.tone, delays: u.delays } });
});

/* --- Factures --- */
const importRows = (u, rows) => {
  const limit = PLANS[u.plan].limit;
  let added = 0; const skipped = [];
  for (const r of rows) {
    const unpaid = u.invoices.filter((i) => i.statut !== 'paye').length;
    if (r.statut === 'impayee' && unpaid >= limit) { skipped.push(r.numero); continue; }
    u.invoices.push({
      id: store.uid(), numero: r.numero, client: r.client, email: r.email,
      montant: Number(r.montant) || 0, date_echeance: r.date_echeance,
      statut: r.statut, date_paiement: r.date_paiement || null,
    });
    added++;
  }
  return { added, skipped };
};

app.post('/api/invoices/import', requireAuth, (req, res) => {
  const u = req.user;
  const csv = (req.body && req.body.csv) || '';
  if (!csv.trim()) return res.status(400).json({ error: 'Aucun CSV fourni' });
  const rows = engine.parseCSV(csv);
  if (!rows.length) return res.status(400).json({ error: 'Format CSV non reconnu (attendu : numero ; client ; email ; montant ; date_echeance ; statut)' });
  const r = importRows(u, rows);
  pushLog(u, `📥 ${r.added} facture(s) importée(s)` + (r.skipped.length ? ` — ${r.skipped.length} ignorée(s) (limite ${PLANS[u.plan].label})` : ''));
  store.saveUser(u);
  res.json({ ok: true, added: r.added, skipped: r.skipped, limit: PLANS[u.plan].limit });
});

app.post('/api/invoices', requireAuth, (req, res) => {
  const u = req.user;
  const b = req.body || {};
  const numero = String(b.numero || '').trim();
  if (!numero) return res.status(400).json({ error: 'Numéro de facture requis' });
  const unpaid = u.invoices.filter((i) => i.statut !== 'paye').length;
  if (unpaid >= PLANS[u.plan].limit) return res.status(402).json({ error: `Limite ${PLANS[u.plan].label} atteinte (${PLANS[u.plan].limit} impayées)` });
  const inv = {
    id: store.uid(), numero, client: String(b.client || '').trim(), email: String(b.email || '').trim(),
    montant: Number(b.montant) || 0, date_echeance: engine.parseDate(b.date_echeance) || engine.todayISO(),
    statut: 'impayee', date_paiement: null,
  };
  u.invoices.push(inv);
  pushLog(u, `➕ Facture ${inv.numero} ajoutée (${inv.client || 'client'})`);
  store.saveUser(u);
  res.json({ ok: true, invoice: inv });
});

app.post('/api/invoices/:id/pay', requireAuth, (req, res) => {
  const u = req.user;
  const inv = u.invoices.find((i) => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  inv.statut = 'paye'; inv.date_paiement = engine.todayISO();
  pushLog(u, `💶 Facture ${inv.numero} marquée payée (${inv.client}) — ${Number(inv.montant).toFixed(2)} €`);
  store.saveUser(u);
  res.json({ ok: true, invoice: inv });
});

app.delete('/api/invoices/:id', requireAuth, (req, res) => {
  const u = req.user;
  u.invoices = u.invoices.filter((i) => i.id !== req.params.id);
  u.reminders = u.reminders.filter((r) => r.invoiceId !== req.params.id);
  store.saveUser(u);
  res.json({ ok: true });
});

/* --- Relances --- */
app.post('/api/reminders/generate', requireAuth, (req, res) => {
  const u = req.user;
  const r = engine.generateDrafts(u);
  pushLog(u, `📝 Génération des relances dues : ${r.created} nouveau(x) brouillon(s)`);
  store.saveUser(u);
  res.json({ ok: true, ...r });
});

app.post('/api/reminders/:id/send', requireAuth, async (req, res) => {
  const u = req.user;
  const rem = u.reminders.find((r) => r.id === req.params.id);
  if (!rem) return res.status(404).json({ error: 'Relance introuvable' });
  const inv = u.invoices.find((i) => i.id === rem.invoiceId);
  if (!inv) return res.status(404).json({ error: 'Facture liée introuvable' });
  if (rem.statut === 'envoye') return res.status(400).json({ error: 'Cette relance a déjà été envoyée (jamais deux fois le même niveau)' });
  if (!store.canSend(u)) return res.status(402).json({ error: 'Essai terminé — choisissez une formule (Essentiel 9,99 € ou Pro 19,99 €) pour envoyer' });
  if (!inv.email) return res.status(400).json({ error: 'Aucun email client sur cette facture' });

  const out = await emailMod.sendEmail({ to: inv.email, subject: rem.subject, body: rem.body, company: u.company || u.email });
  rem.statut = 'envoye'; rem.dateEnvoi = new Date().toISOString();
  pushLog(u, `📤 Relance niveau ${rem.niveau} envoyée pour ${inv.numero} (${inv.client})${out.real ? '' : ' — ' + out.note}`);
  store.saveUser(u);
  res.json({ ok: true, sent: true, note: out.note });
});

/* --- Abonnement --- */
app.post('/api/checkout', requireAuth, async (req, res) => {
  try {
    const plan = req.body && req.body.plan;
    const r = await checkoutFor(req.user, plan);
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/portal', requireAuth, async (req, res) => {
  const u = req.user;
  if (stripe && u.stripeCustomerId) {
    const s = await stripe.billingPortal.sessions.create({ customer: u.stripeCustomerId, return_url: `${BASE_URL}/app` });
    return res.json({ url: s.url });
  }
  res.json({ url: null }); // simulation : gérer via la page
});

/* --- Pages --- */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

app.listen(PORT, () => {
  console.log(`✅ Paylora (micro-SaaS) → ${BASE_URL}`);
  console.log(`   Stripe : ${stripe ? 'réel' : 'SIMULATION (ajoutez STRIPE_SECRET_KEY)'} · Emails : ${process.env.RESEND_API_KEY ? 'réels' : 'SIMULATION (outbox)'}`);
});
