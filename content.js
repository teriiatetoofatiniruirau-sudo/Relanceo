/**
 * content.js — Modèles de relance en français (réutilisés du prototype)
 * Ton × niveau (1=amical, 2=suivi, 3=dernière relance avant mise en demeure).
 * Variables : {client} {numero} {montant} {date} {lien} {entreprise} {sender}
 */

const SUBJECTS = {
  ferme: {
    1: 'Facture {numero} — règlement attendu',
    2: 'Facture {numero} — échéance dépassée depuis plusieurs jours',
    3: 'Facture {numero} — dernière relance avant mise en demeure',
  },
  commercial: {
    1: 'Facture {numero} — petit point sur notre collaboration',
    2: 'Facture {numero} — nous avons besoin de votre retour',
    3: 'Facture {numero} — action requise sous 7 jours',
  },
  courtois: {
    1: 'Facture {numero} — petit rappel amical',
    2: 'Facture {numero} — toujours en attente de votre règlement',
    3: 'Facture {numero} — nous avons besoin de votre aide',
  },
};

const OPENERS = {
  courtois: {
    1: 'Bonjour {client},\n\nNous espérons que tout va bien de votre côté. Un petit oubli est si facile…\n\nLa facture {numero} d\'un montant de {montant}, arrivée à échéance le {date}, semble toujours en attente de règlement.',
    2: 'Bonjour {client},\n\nNous nous permettons de revenir vers vous au sujet de la facture {numero} ({montant}), dont l\'échéance du {date} est dépassée.',
    3: 'Bonjour {client},\n\nNous avons besoin de votre aide pour clôturer la facture {numero} ({montant}), impayée depuis le {date}.',
  },
  commercial: {
    1: 'Bonjour {client},\n\nMerci pour votre confiance. Afin de maintenir une collaboration sereine, nous vous signalons que la facture {numero} ({montant}) est arrivée à échéance le {date}.',
    2: 'Bonjour {client},\n\nUn point sur notre collaboration : la facture {numero} ({montant}), échue le {date}, n\'a pas encore été réglée.',
    3: 'Bonjour {client},\n\nLa facture {numero} ({montant}) présente un retard de paiement important depuis le {date}.',
  },
  ferme: {
    1: 'Bonjour {client},\n\nNous attirons votre attention sur la facture {numero} ({montant}), arrivée à échéance le {date}.',
    2: 'Bonjour {client},\n\nLa facture {numero} ({montant}), échue le {date}, reste impayée malgré notre précédente relance.',
    3: 'Bonjour {client},\n\nNous constatons que la facture {numero} ({montant}) reste impayée depuis le {date}, malgré plusieurs relances.',
  },
};

const CLOSERS = {
  courtois: {
    1: '\n\nSi le règlement est déjà parti, merci d\'ignorer ce message. Dans le cas contraire, vous trouverez ci-dessous un lien de paiement sécurisé qui ne prend qu\'une minute :\n🔗 {lien}\n\nMerci infiniment pour votre confiance.',
    2: '\n\nPour régler en une minute, utilisez simplement ce lien de paiement sécurisé :\n🔗 {lien}\n\nSi vous rencontrez la moindre difficulté, répondre à cet email nous suffit pour trouver une solution ensemble.',
    3: '\n\nNous vous remercions de bien vouloir régulariser sans attendre via ce lien de paiement :\n🔗 {lien}\n\nÀ défaut de règlement sous 7 jours, nous devrons appliquer les intérêts de retard et l\'indemnité forfaitaire de recouvrement prévus par la loi, puis envisager une mise en demeure. Nous préférerions éviter cette issue.',
  },
  commercial: {
    1: '\n\nUn lien de paiement sécurisé est à votre disposition pour régulariser rapidement :\n🔗 {lien}\n\nRestant à votre disposition pour toute question, nous vous remercions de votre confiance.',
    2: '\n\nNous vous remercions de régulariser via ce lien de paiement sécurisé :\n🔗 {lien}\n\nNotre objectif est de trouver une issue rapide et sans friction, dans l\'intérêt de notre collaboration.',
    3: '\n\nNous vous demandons de régulariser sous 7 jours via ce lien :\n🔗 {lien}\n\nÀ défaut, nous appliquerons les pénalités légales (intérêts de retard et indemnité forfaitaire de 40 €) et confierons le dossier à une procédure de recouvrement. Nous comptons sur votre réactivité pour éviter cette démarche.',
  },
  ferme: {
    1: '\n\nNous vous remercions de procéder au règlement via ce lien de paiement sécurisé :\n🔗 {lien}\n\nEn cas de difficulté, contactez-nous rapidement afin d\'éviter toute pénalité.',
    2: '\n\nSans règlement sous 7 jours, nous appliquerons les intérêts de retard ainsi que l\'indemnité forfaitaire de recouvrement (40 €) prévus par la réglementation. Vous pouvez régulariser immédiatement ici :\n🔗 {lien}',
    3: '\n\nCeci est notre dernière relance avant mise en demeure. Nous vous demandons de régulariser sous 7 jours via ce lien de paiement :\n🔗 {lien}\n\nÀ défaut, le dossier sera transmis aux voies de recouvrement prévues par la loi, entraînant des frais supplémentaires à votre charge.',
  },
};

const NIVEAUX = ['Rappel amical', 'Relance de suivi', 'Dernière relance avant mise en demeure'];

function replace(tpl, v) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

/**
 * Génère l'objet { subject, body } pour une facture, un niveau (1-3) et un ton.
 * invoice: { numero, client, montant, date_echeance }
 * settings: { company, sender, paymentLink(id) -> string }
 */
function generate({ invoice, niveau, tone, settings, paymentLink }) {
  const lien = typeof paymentLink === 'function' ? paymentLink(invoice) : String(paymentLink || '');
  const v = {
    client: invoice.client || 'cher client',
    numero: invoice.numero || '#0000',
    montant: invoice.montant == null ? '' : euro(invoice.montant),
    date: fmtFR(invoice.date_echeance),
    lien,
    entreprise: settings.company || 'Votre entreprise',
    sender: settings.sender || '',
  };
  const toneKey = ['courtois', 'commercial', 'ferme'].includes(tone) ? tone : 'courtois';
  const subject = replace(SUBJECTS[toneKey][niveau], v);
  const body = replace(OPENERS[toneKey][niveau], v)
    + replace(CLOSERS[toneKey][niveau], v)
    + `\n\nBien cordialement,\n${v.entreprise}\n${v.sender}`;
  return { subject, body };
}

function euro(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}
function fmtFR(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

module.exports = { generate, NIVEAUX, euro, fmtFR };
