import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/Omega-devj';
const SUPA = 'https://emcoqnvxriyrchmfpunq.supabase.co/functions/v1';
const CLE_PUBLIQUE = 'sb_publishable_mhLyot9Dv_VCtWpCbYpngg_evMB79C3';
const DELAI = 20000;
const JOURS = 90;
const SEUIL_PANNE = 2; // nombre de passages en echec avant d ouvrir un incident

// ---------------------------------------------------------------- composants

const COMPOSANTS = [
  {
    cle: 'client',
    nom: 'Mise a jour du client',
    detail: 'Le fichier que chaque client retelecharge au demarrage',
    url: `${RAW}/nexium-client/refs/heads/main/resources/equicord/renderer.js`,
    critique: true,
    async verifier(txt) {
      if (txt.length < 500000) return 'fichier trop court (' + txt.length + ' car.)';
      const v = txt.match(/_NXUP\.VERSION="(\d+)"/);
      if (!v) return 'numero de version absent';
      const mods = (txt.match(/var _NX[A-Za-z]*=window\._NX/g) || []).length;
      if (mods < 20) return 'seulement ' + mods + ' modules declares';
      const attendu = nxSum(txt);
      const sum = (await texte(`${RAW}/nexium-client/refs/heads/main/resources/equicord/renderer.js.nxsum`)).trim();
      if (sum !== attendu) return 'somme de controle incoherente (' + sum + ' vs ' + attendu + ')';
      return { info: 'v' + v[1] };
    }
  },
  {
    cle: 'blocklist',
    nom: 'Protection des liens',
    detail: 'La base de domaines malveillants',
    url: `${RAW}/blacklist-url-nexium-client/refs/heads/main/blocklist.txt`,
    verifier(txt) {
      const n = txt.split('\n').length;
      if (n < 1000) return 'liste anormalement courte (' + n + ' lignes)';
      if (/^(www\.)?discord\.(com|gg)$/m.test(txt)) return 'un domaine Discord legitime est dans la liste';
      return { info: n.toLocaleString('fr-FR') + ' domaines' };
    }
  },
  {
    cle: 'banlist',
    nom: 'Liste de bannissement',
    detail: 'Le verrou des comptes bannis',
    url: `${RAW}/bl-client-nexium/refs/heads/main/ban`,
    verifier(txt) {
      if (txt.length > 200000) return 'liste anormalement longue';
      return { info: txt.trim() ? txt.trim().split('\n').length + ' entree(s)' : 'vide' };
    }
  },
  {
    cle: 'changelog',
    nom: 'Notes de version',
    detail: 'Ce que le client affiche apres une mise a jour',
    url: `${RAW}/changelog-client-nexium/refs/heads/main/changelog.txt`,
    verifier(txt) {
      if (!txt.trim()) return 'changelog vide';
      return { info: (txt.match(/^## /gm) || []).length + ' version(s)' };
    }
  },
  {
    cle: 'musique',
    nom: 'Bibliotheque musicale',
    detail: 'Les pistes proposees dans Nexium Music',
    url: `${RAW}/music-client-nexium/refs/heads/main/music.txt`
  },
  {
    cle: 'sponsor',
    nom: 'Partenariats',
    detail: 'Le contenu de la page Sponsor',
    url: `${RAW}/inv-sponsor-nexium/refs/heads/main/sponsor`
  },
  {
    cle: 'signalements',
    nom: 'Signalements',
    detail: 'L envoi d un domaine suspect depuis le client',
    url: `${SUPA}/report`,
    methode: 'OPTIONS',
    accepte: [200, 204, 400, 401, 405]
  },
  {
    cle: 'communaute',
    nom: 'Renseignement communautaire',
    detail: 'Les domaines signales par les autres utilisateurs',
    url: `${SUPA}/community`,
    accepte: [200, 204, 400, 401, 405]
  }
];

// ---------------------------------------------------------------- utilitaires

function nxSum(t) {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0;
  return 'nx' + h.toString(16) + '-' + t.length;
}

async function texte(url) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), DELAI);
  try {
    const r = await fetch(url, { signal: c.signal, cache: 'no-store' });
    return await r.text();
  } finally { clearTimeout(to); }
}

function lire(f, defaut) {
  const p = join(RACINE, f);
  if (!existsSync(p)) return defaut;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return defaut; }
}

function ecrire(f, obj) {
  writeFileSync(join(RACINE, f), JSON.stringify(obj, null, 2) + '\n');
}

const jour = (d) => new Date(d).toISOString().slice(0, 10);

// ---------------------------------------------------------------- sondage

async function sonder(c) {
  const t0 = Date.now();
  const res = { cle: c.cle, nom: c.nom, detail: c.detail || '', critique: !!c.critique };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), DELAI);
  try {
    const r = await fetch(c.url, {
      method: c.methode || 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'nexium-status/1' }
    });
    res.latenceMs = Date.now() - t0;
    const ok = (c.accepte || [200]).includes(r.status);
    if (!ok) { res.etat = 'panne'; res.pourquoi = 'reponse HTTP ' + r.status; return res; }
    if (c.verifier && (c.methode || 'GET') === 'GET') {
      const verdict = await c.verifier(await r.text());
      if (typeof verdict === 'string') { res.etat = 'degrade'; res.pourquoi = verdict; return res; }
      if (verdict && verdict.info) res.info = verdict.info;
    }
    res.etat = res.latenceMs > 8000 ? 'degrade' : 'operationnel';
    if (res.etat === 'degrade') res.pourquoi = 'reponse lente (' + res.latenceMs + ' ms)';
    return res;
  } catch (e) {
    res.latenceMs = Date.now() - t0;
    res.etat = 'panne';
    res.pourquoi = e.name === 'AbortError' ? 'aucune reponse en ' + (DELAI / 1000) + ' s' : String(e.message || e).slice(0, 120);
    return res;
  } finally { clearTimeout(to); }
}

// ---------------------------------------------------------------- incidents

function incidentsManuels() {
  const d = join(RACINE, 'incidents');
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(readFileSync(join(d, f), 'utf8')); } catch { return null; } })
    .filter(Boolean);
}

// Alertes ouvertes par un administrateur depuis le client. Supabase est la
// source de verite ; on les recopie dans status.json pour que la page et le
// client continuent de les voir meme si Supabase tombe.
async function alertesAdmin() {
  const champs = 'id,titre,resume,gravite,etat,composant,versions_touchees,correctif,debut,fin,maj';
  try {
    const c = new AbortController();
    const to = setTimeout(() => c.abort(), DELAI);
    const r = await fetch(`${SUPA.replace('/functions/v1', '')}/rest/v1/nx_alertes?select=${champs}&order=debut.desc&limit=40`, {
      signal: c.signal,
      headers: { apikey: CLE_PUBLIQUE, Accept: 'application/json' },
      cache: 'no-store'
    });
    clearTimeout(to);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const lignes = await r.json();
    return lignes.map(a => ({
      id: a.id,
      source: 'admin',
      composant: a.composant || null,
      titre: a.titre,
      gravite: a.gravite,
      etat: a.etat,
      debut: a.debut,
      fin: a.fin,
      versionsTouchees: a.versions_touchees || undefined,
      correctif: a.correctif || undefined,
      resume: a.resume,
      maj: Array.isArray(a.maj) ? a.maj : []
    }));
  } catch (e) {
    console.log('alertes admin illisibles : ' + (e.message || e));
    return null; // null = on garde celles de la passe precedente
  }
}

function majIncidentsAuto(precedents, resultats, maintenant) {
  const auto = precedents.filter(i => i.auto);
  const sortie = [];
  for (const r of resultats) {
    const ouvert = auto.find(i => i.composant === r.cle && !i.fin);
    const casse = r.etat === 'panne' || r.etat === 'degrade';
    if (casse) {
      if (ouvert) {
        const dernier = ouvert.maj[ouvert.maj.length - 1];
        if (!dernier || dernier.texte !== r.pourquoi) {
          ouvert.maj.push({ a: maintenant, etat: ouvert.etat, texte: r.pourquoi });
        }
      } else {
        const echecs = (r._echecs || 0) + 1;
        if (echecs >= SEUIL_PANNE) {
          sortie.push({
            id: jour(maintenant) + '-' + r.cle,
            auto: true,
            composant: r.cle,
            titre: r.nom + (r.etat === 'panne' ? ' injoignable' : ' degrade'),
            gravite: r.critique ? 'majeur' : 'mineur',
            etat: 'enquete',
            debut: maintenant,
            fin: null,
            resume: 'Detecte automatiquement : ' + r.pourquoi,
            maj: [{ a: maintenant, etat: 'enquete', texte: r.pourquoi }]
          });
        }
      }
    } else if (ouvert) {
      ouvert.etat = 'resolu';
      ouvert.fin = maintenant;
      ouvert.maj.push({ a: maintenant, etat: 'resolu', texte: 'Le service repond a nouveau normalement.' });
    }
  }
  return [...auto, ...sortie];
}

// ---------------------------------------------------------------- historique

function majHistorique(histo, resultats, maintenant) {
  const j = jour(maintenant);
  for (const r of resultats) {
    const h = histo[r.cle] || (histo[r.cle] = {});
    const c = h[j] || (h[j] = { ok: 0, degrade: 0, panne: 0 });
    if (r.etat === 'operationnel') c.ok++;
    else if (r.etat === 'degrade') c.degrade++;
    else c.panne++;
  }
  const limite = jour(Date.now() - JOURS * 86400000);
  for (const cle of Object.keys(histo)) {
    for (const d of Object.keys(histo[cle])) if (d < limite) delete histo[cle][d];
  }
  return histo;
}

// ---------------------------------------------------------------- programme

const maintenant = new Date().toISOString();
const precedent = lire('status.json', { incidents: [], composants: [] });
const histo = lire('history.json', {});

const resultats = [];
for (const c of COMPOSANTS) {
  const r = await sonder(c);
  const av = (precedent.composants || []).find(x => x.cle === c.cle);
  r._echecs = (av && (av.etat === 'panne' || av.etat === 'degrade')) ? (av._echecs || 1) : 0;
  if (r.etat === 'panne' || r.etat === 'degrade') r._echecs++;
  r.verifieA = maintenant;
  resultats.push(r);
  console.log(`${r.etat.padEnd(13)} ${r.nom}  ${r.latenceMs} ms  ${r.pourquoi || r.info || ''}`);
}

const admin = await alertesAdmin();
const gardees = admin !== null ? admin : (precedent.incidents || []).filter(i => i.source === 'admin');
console.log('alertes administrateur : ' + gardees.length + (admin === null ? ' (reprises de la passe precedente)' : ''));

const incidents = [
  ...majIncidentsAuto(precedent.incidents || [], resultats, maintenant),
  ...incidentsManuels(),
  ...gardees
].sort((a, b) => String(b.debut).localeCompare(String(a.debut)));

const ouverts = incidents.filter(i => !i.fin && i.etat !== 'resolu');
const pire = resultats.some(r => r.etat === 'panne' && r.critique) ? 'panne'
  : resultats.some(r => r.etat === 'panne') ? 'degrade'
    : resultats.some(r => r.etat === 'degrade') ? 'degrade'
      : ouverts.length ? 'degrade' : 'operationnel';

const resume = pire === 'operationnel'
  ? 'Tous les services sont operationnels'
  : ouverts.length
    ? ouverts[0].titre
    : resultats.filter(r => r.etat !== 'operationnel').map(r => r.nom).join(', ') + ' : anomalie detectee';

ecrire('status.json', {
  genereA: maintenant,
  etat: pire,
  resume,
  composants: resultats,
  incidents: incidents.slice(0, 40)
});
ecrire('history.json', majHistorique(histo, resultats, maintenant));

console.log('\netat global : ' + pire + ' — ' + resume);
