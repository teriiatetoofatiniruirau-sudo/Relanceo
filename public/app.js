/* app.js — espace de travail Relancéo (SaaS) */
const $=s=>document.querySelector(s);
let toastT;function toast(m,ok){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),3400);}
async function api(p,o={}){const r=await fetch(p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||r.status);return d;}
const euro=v=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v)||0);
const dFR=s=>{if(!s)return '—';const x=new Date(s);return isNaN(x)?s:new Date(String(s).length===10?s+'T12:00:00':s).toLocaleDateString('fr-FR');};

let DATA=null;
async function boot(){
  try{const me=await api('/api/me');if(!me.loggedIn){location.href='/';return;}}catch{location.href='/';return;}
  await load();
}
async function load(){
  DATA=await api('/api/data');
  render();
}
function render(){
  const u=DATA.user;
  const pb=$('#plan-badge');
  pb.textContent= u.paid ? '● '+u.planLabel : (u.planState==='trial'? '○ Découverte — essai ('+u.trialDaysLeft+' j)':'○ Essai terminé');
  pb.className='badge '+(u.paid?'b-green':(u.planState==='trial'?'b-amber':'b-gray'));
  $('#who').textContent=u.company||u.email;
  $('#btn-portal').classList.toggle('hidden',!u.paid);
  // réglages
  const s=DATA.settings;$('#s-company').value=s.company;$('#s-sender').value=s.sender;$('#s-tone').value=s.tone;$('#s-d1').value=s.delays[0];$('#s-d2').value=s.delays[1];$('#s-d3').value=s.delays[2];
  // KPI
  const o=DATA.overview;$('#k-impayees').textContent=o.unpaid;$('#k-retard').textContent=o.overdue;$('#k-recouvre').textContent=euro(o.recovered);$('#k-envoyees').textContent=o.sent;
  // Factures
  const invs=DATA.invoices;
  const invHead='<thead><tr><th>N°</th><th>Client</th><th>Montant</th><th>Échéance</th><th>Retard</th><th>Niveau</th><th></th><th></th></tr></thead>';
  $('#inv-empty').textContent=invs.length?'':(u.paid?'Aucune facture. Importez un CSV ou ajoutez-en une.':'Importez votre première facture ci-dessous.');
  $('#inv-table').innerHTML=invHead+'<tbody>'+invs.map(i=>{
    const lv=i.niveau;
    const badge= i.statut==='paye'?'<span class="badge b-green">Payée</span>':(lv===0?'<span class="badge b-gray">à échoir</span>':`<span class="badge ${lv>=3?'b-amber':lv>=2?'b-amber':'b-amber'}">N${lv}</span>`);
    return `<tr data-id="${i.id}">
      <td><strong>${i.numero}</strong></td><td>${i.client||'—'}${i.email?'<br><span class="hint">'+i.email+'</span>':''}</td>
      <td>${euro(i.montant)}</td><td>${dFR(i.date_echeance)}</td>
      <td>${i.statut==='impayee'&&i.retardJours>0?i.retardJours+' j':'—'}</td><td>${badge}</td>
      <td>${i.statut==='impayee'?`<button class="btn sm ghost" data-act="pay">💶 Payée</button>`:'<span class="hint">'+dFR(i.date_paiement)+'</span>'}</td>
      <td><button class="btn sm ghost" data-act="del">🗑</button></td></tr>`;
  }).join('')+'</tbody>';
  // Relances
  const rems=DATA.reminders;
  $('#rem-empty').textContent=rems.length?'':'Cliquez sur « Générer les relances dues » pour créer les brouillons.';
  $('#rem-table').innerHTML='<thead><tr><th>Facture</th><th>Client</th><th>Niveau</th><th>Objet</th><th>Statut</th><th>Action</th></tr></thead><tbody>'+rems.map(r=>{
    const inv=DATA.invoices.find(i=>i.id===r.invoiceId);
    const sent=r.statut==='envoye';
    return `<tr data-rem="${r.id}">
      <td>${inv?inv.numero:''}</td><td>${inv?inv.client:''}</td>
      <td>N${r.niveau}</td><td style="max-width:340px;white-space:normal">${r.subject}</td>
      <td>${sent?'<span class="badge b-green">Envoyée</span>':'<span class="badge b-amber">Brouillon</span>'}</td>
      <td>${sent?`<span class="hint">${new Date(r.dateEnvoi).toLocaleString('fr-FR')}</span>`
        :`<div style="display:flex;gap:6px"><button class="btn sm ghost" data-act="preview">👁</button><button class="btn sm" data-act="send">📤 Envoyer</button></div>`}</td></tr>`;
  }).join('')+'</tbody>';
  $('#journal').textContent=(DATA.log||[]).map(e=>`[${new Date(e.ts).toLocaleString('fr-FR')}] ${e.texte}`).join('\n');
}
function bindInv(id,act){}
document.body.addEventListener('click',async e=>{
  const pay=e.target.closest('[data-act="pay"]');if(pay){const tr=pay.closest('tr');try{await api('/api/invoices/'+tr.dataset.id+'/pay',{method:'POST',body:'{}'});toast('Facture marquée payée 💶','ok');await load();}catch(x){toast('❌ '+x.message);}return;}
  const del=e.target.closest('[data-act="del"]');if(del){const tr=del.closest('tr');if(!confirm('Supprimer cette facture ?'))return;try{await api('/api/invoices/'+tr.dataset.id,{method:'DELETE'});await load();}catch(x){toast('❌ '+x.message);}return;}
  const snd=e.target.closest('[data-act="send"]');if(snd){const tr=snd.closest('tr');try{const r=await api('/api/reminders/'+tr.dataset.rem+'/send',{method:'POST',body:'{}'});toast('Relance envoyée 📤 '+ (r.note||''),'ok');await load();}catch(x){toast('❌ '+x.message);}return;}
  const prv=e.target.closest('[data-act="preview"]');if(prv){const tr=prv.closest('tr');const rem=DATA.reminders.find(r=>r.id===tr.dataset.rem);if(rem)alert('OBJET : '+rem.subject+'\n\n'+rem.body);return;}
});

$('#btn-sample').onclick=async()=>{try{const r=await api('/api/invoices/import',{method:'POST',body:JSON.stringify({csv:SAMPLE_CSV})});toast(r.added+' facture(s) ajoutée(s) ✨','ok');await load();}catch(x){toast('❌ '+x.message);}};
$('#btn-csv-demo').onclick=()=>{$('#csv').value=SAMPLE_CSV;};
$('#btn-import').onclick=async()=>{try{const r=await api('/api/invoices/import',{method:'POST',body:JSON.stringify({csv:$('#csv').value})});toast(r.added+' importée(s)'+(r.skipped.length?', '+r.skipped.length+' ignorée(s) (limite atteinte)':''),'ok');await load();}catch(x){toast('❌ '+x.message);}};
$('#btn-add').onclick=async()=>{try{await api('/api/invoices',{method:'POST',body:JSON.stringify({numero:$('#m-numero').value,client:$('#m-client').value,email:$('#m-email').value,montant:$('#m-montant').value,date_echeance:$('#m-echeance').value})});toast('Facture ajoutée ➕','ok');await load();$('#m-numero').value=$('#m-montant').value=$('#m-client').value=$('#m-email').value=$('#m-echeance').value='';}catch(x){toast('❌ '+x.message);}};
$('#btn-generate').onclick=async()=>{try{const r=await api('/api/reminders/generate',{method:'POST',body:'{}'});toast(r.created+' brouillon(s) généré(s) 📝','ok');await load();}catch(x){toast('❌ '+x.message);}};
$('#btn-save').onclick=async()=>{try{await api('/api/me/settings',{method:'PATCH',body:JSON.stringify({company:$('#s-company').value,sender:$('#s-sender').value,tone:$('#s-tone').value,delays:[$('#s-d1').value,$('#s-d2').value,$('#s-d3').value].map(Number)})});toast('Réglages enregistrés 💾','ok');await load();}catch(x){toast('❌ '+x.message);}};
$('#btn-logout').onclick=async()=>{await api('/api/logout',{method:'POST',body:'{}'});location.href='/';};
$('#btn-portal').onclick=async()=>{try{const r=await api('/api/portal',{method:'POST',body:'{}'});if(r.url)location.href=r.url;else{toast('Gérez votre abonnement sur la page publique','ok');}}catch(x){toast('❌ '+x.message);}};

const SAMPLE_CSV=`numero ; client ; email ; montant ; date_echeance ; statut
F-2026-0102 ; SARL Dupont Bâtiment ; contact@dupont.fr ; 2450,00 ; ${dPast(12)} ; impayee
F-2026-0098 ; Cabinet Morel & Fils ; gestion@morel.fr ; 1890,50 ; ${dPast(4)} ; impayee
F-2026-0105 ; Boulangerie Martin ; compta@martin.fr ; 760,00 ; ${dPast(9)} ; impayee
F-2026-0087 ; SCI Lacroix ; gerance@lacroix.fr ; 3200,00 ; ${dPast(18)} ; impayee
F-2026-0079 ; Agence Horizon ; finance@horizon.fr ; 980,00 ; ${dPast(35)} ; impayee
F-2026-0074 ; Restaurant Le Comptoir ; direction@comptoir.fr ; 1450,00 ; ${dPast(46)} ; impayee`;
function dPast(n){const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('fr-FR');}

boot();
