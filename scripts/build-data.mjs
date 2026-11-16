// Mon Ciné Tracker — robot de données (lancé par GitHub Actions toutes les 3 h)
// Produit à la racine du site :
//   news.json         → actus de nombreux sites, traduites en français, étiquetées (officiel / rumeur / spoiler / bande-annonce / box-office)
//   tops.json         → Top 10 officiel Netflix France + tendances par plateforme, box-office mondial, Stremio, avec l'évolution des places
//   tops-history.json → mémoire des classements (pour calculer « +3 places », « 12 jours dans le top »)
// Node 20+ (fetch intégré), aucune dépendance.
import { readFile, writeFile } from 'node:fs/promises';

const TMDB = process.env.TMDB_KEY || '7b414afa4f9c5e683e830f4ed503579f';
const UA = 'Mozilla/5.0 (compatible; CineTrackerBot/1.0; +https://github.com/max65654/cine-tracker)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

async function get(url, type = 'text', tries = 2, ms = 30000) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(ms) });
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return type === 'json' ? await r.json() : await r.text();
    } catch (e) { if (i === tries - 1) { console.warn('⚠️', String(e.message || e).slice(0, 160)); return null; } await sleep(1500); }
  }
}
const tmdb = (path, q = '') => get(`https://api.themoviedb.org/3${path}?api_key=${TMDB}&language=fr-FR${q}`, 'json');

/* ======================= ACTUS ======================= */
const SOURCES = [
  { n: 'AlloCiné', u: 'https://www.allocine.fr/rss/news.xml', l: 'fr' },
  { n: 'AlloCiné Séries', u: 'https://www.allocine.fr/rss/news-series.xml', l: 'fr' },
  { n: 'Écran Large', u: 'https://www.ecranlarge.com/rss', l: 'fr' },
  { n: 'CinéSérie', u: 'https://www.cineserie.com/feed/', l: 'fr' },
  { n: 'Serieously', u: 'https://www.serieously.com/feed/', l: 'fr' },
  { n: 'CinéChronicle', u: 'https://www.cinechronicle.com/feed/', l: 'fr' },
  { n: 'Deadline', u: 'https://deadline.com/feed/', l: 'en' },
  { n: 'Variety', u: 'https://variety.com/feed/', l: 'en' },
  { n: 'The Hollywood Reporter', u: 'https://www.hollywoodreporter.com/feed/', l: 'en' },
  { n: 'Screen Rant', u: 'https://screenrant.com/feed/', l: 'en' },
  { n: 'Collider', u: 'https://collider.com/feed/', l: 'en' },
  { n: 'AlloCiné Cinéma', u: 'https://www.allocine.fr/rss/news-cine.xml', l: 'fr' },
  { n: 'Télérama Cinéma', u: 'https://www.telerama.fr/rss/cinema.xml', l: 'fr' },
  { n: 'Konbini Biiinge', u: 'https://biiinge.konbini.com/feed/', l: 'fr' },
  { n: 'Numerama Pop culture', u: 'https://www.numerama.com/pop-culture/feed/', l: 'fr' },
  { n: 'Les Inrocks Cinéma', u: 'https://www.lesinrocks.com/cinema/feed/', l: 'fr' },
  { n: 'Horreur Québec', u: 'https://horreur.quebec/feed/', l: 'fr', hor: 1 },
  { n: 'Bloody Disgusting', u: 'https://bloody-disgusting.com/feed/', l: 'en', hor: 1 },
  { n: 'Dread Central', u: 'https://www.dreadcentral.com/feed/', l: 'en', hor: 1 },
  { n: 'IndieWire', u: 'https://www.indiewire.com/feed/', l: 'en' },
  { n: '/Film', u: 'https://www.slashfilm.com/feed/', l: 'en' },
  { n: 'JoBlo', u: 'https://www.joblo.com/feed/', l: 'en' },
  { n: 'Den of Geek', u: 'https://www.denofgeek.com/feed/', l: 'en' },
  { n: 'ComingSoon', u: 'https://www.comingsoon.net/feed', l: 'en' },
  { n: 'TVLine', u: 'https://tvline.com/feed/', l: 'en' },
  { n: 'THR Films', u: 'https://www.hollywoodreporter.com/c/movies/feed/', l: 'en' },
  { n: 'Google Actu Séries', u: 'https://news.google.com/rss/search?q=s%C3%A9rie+saison+OR+netflix+OR+%22prime+video%22+OR+disney%2B&hl=fr&gl=FR&ceid=FR:fr', l: 'fr', gn: 1 },
  { n: 'Google Actu Cinéma', u: 'https://news.google.com/rss/search?q=film+cin%C3%A9ma+sortie+OR+bande-annonce&hl=fr&gl=FR&ceid=FR:fr', l: 'fr', gn: 1 }
];
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = s => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
function parseRss(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const x = m[0];
    let t = strip(tag(x, 'title')), link = strip(tag(x, 'link')) || (x.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i) || [])[1] || '';
    let s = src.n;
    if (src.gn) { const mm = t.match(/^(.*) - ([^-]{2,60})$/); if (mm) { t = mm[1]; s = mm[2]; } }
    const raw = decode(tag(x, 'description') || tag(x, 'content:encoded'));
    let img = (x.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i) || [])[1] || (x.match(/<enclosure[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || [])[1] || (raw.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    const d = Date.parse(strip(tag(x, 'pubDate')) || strip(tag(x, 'dc:date'))) || Date.now();
    let desc = strip(raw); if (src.gn || desc.startsWith(t.slice(0, 30))) desc = '';
    if (t) out.push({ t, d: desc.slice(0, 420), u: link, i: img.replace(/&amp;/g, '&'), s, ts: d, l: src.l, hor: src.hor ? 1 : 0 });
  }
  return out;
}
async function translate(text) {
  if (!text) return text;
  const j = await get('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=' + encodeURIComponent(text.slice(0, 1800)), 'json', 2);
  if (!j || !Array.isArray(j[0])) return text;
  return j[0].map(p => p[0]).join('');
}
const RX = {
  rumeur: /\b(rumeurs?|selon (nos|des|plusieurs) (informations|sources)|d'apr[èe]s (nos|des|plusieurs) sources|serait en (pourparlers|discussions?|n[ée]gociations?)|pourrait (revenir|rejoindre|jouer|incarner|[êe]tre annul[ée]e?)|en pourparlers|en n[ée]gociations?|insider|leak(ed)?|fuites?|reportedly|rumou?red|in (early )?talks|being eyed|is eyeing|could return|may return)\b/i,
  officiel: /\b(officiel|officiellement|confirm[ée]|annonc[ée]|d[ée]voil[ée]|date de sortie|officially|confirmed|announced|renouvel[ée]|renewed|bande-annonce officielle|official trailer)/i,
  spoiler: /\b(spoilers?|explication de la fin|fin expliqu[ée]e|ending explained|twist final|plot twist|cliffhanger|qui est le tueur|r[ée]v[ée]lation finale|ce qui vous attend)\b|\b(meurt|mort|tu[ée]e?|dies|killed|death)\b.{0,50}\b(saison|[ée]pisode|s[ée]rie|season|episode|finale)\b/i,
  ba: /\b(bande[- ]annonce|teaser|trailer|premi[èe]res? images)/i,
  bo: /\b(box[- ]office|entr[ée]es|recettes|millions de dollars|record d'audience)/i
};
// un article doit parler de cinéma, de séries ou de streaming (les sites généralistes publient aussi d'autres sujets)
const CINE = /\b(films?|cin[ée](ma|aste)?|s[ée]ries?|saisons?|[ée]pisodes?|netflix|prime video|disney\+?|canal\+|hbo|max|apple tv|paramount|crunchyroll|bande[- ]annonce|teaser|trailer|acteurs?|actrices?|r[ée]alisat|casting|box[- ]office|streaming|anim[ée]|marvel|star wars|pixar|ghibli|oscars?|c[ée]sar|cannes|sundance|venise|movies?|tv (show|series)|showrunner|sequel|prequel|remake|reboot|spin-?off|biopic|horreur|horror|thriller|documentaire|sitcom|blockbuster|studio|warner|universal|sony pictures|a24|lionsgate)\b/i;
const OFF = /\b(vpn|box tv|forfait|smartphone|pr[ée]nom|recette de cuisine|horoscope|m[ée]t[ée]o|bourse|imp[ôo]ts?|ligue 1|football|nba|nfl|élection|election|bitcoin)\b/i;
async function buildNews() {
  let all = [];
  for (const s of SOURCES) {
    const xml = await get(s.u); if (!xml) continue;
    const l = parseRss(xml, s).slice(0, s.gn ? 30 : 20).filter(x => { const t = x.t + ' ' + x.d; return (s.hor || CINE.test(t)) && !OFF.test(x.t); });
    console.log(`📰 ${s.n}: ${l.length}`); all = all.concat(l);
  }
  const seen = new Set(), weekAgo = Date.now() - 3 * 864e5;
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 7).join(' ');
  all = all.filter(x => x.ts > weekAgo && x.ts < Date.now() + 36e5).sort((a, b) => b.ts - a.ts).filter(x => { const k = norm(x.t); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 300);
  // traduction des articles anglais (titre + résumé), avec mémoire pour ne pas retraduire
  let cache = {}; try { cache = JSON.parse(await readFile('news.json', 'utf8')).tr || {}; } catch (_) {}
  const tr = {};
  for (const x of all) {
    if (x.l !== 'en') continue;
    const key = x.u || x.t;
    if (cache[key]) { Object.assign(x, cache[key]); tr[key] = cache[key]; continue; }
    const t = await translate(x.t); await sleep(120); const d = x.d ? await translate(x.d) : ''; await sleep(120);
    x.o = x.t; x.t = t; x.d = d; tr[key] = { t, d, o: x.o };
  }
  for (const x of all) {
    const txt = (x.o || '') + ' ' + x.t + ' ' + x.d, k = [];
    if (RX.officiel.test(txt)) k.push('officiel'); else if (RX.rumeur.test(txt)) k.push('rumeur');
    if (RX.ba.test(txt)) k.push('ba'); if (RX.bo.test(txt)) k.push('bo');
    if (x.hor || /(horreur|horror|slasher|[ée]pouvante|possession|exorcis|zombie|found footage)/i.test(txt)) k.push('horreur');
    delete x.hor;
    x.k = k; delete x.l;
  }
  return { updated: new Date().toISOString(), items: all, tr, yt: await youtube() };
}

/* ======================= CHAÎNES YOUTUBE (lues ici car les relais publics du navigateur ne marchent plus) ======================= */
const YT = [{ h: 'FilmsActu', id: 'UC_i8X3p8oZNaik8X513Zn1Q' }, { h: 'matteosapin' }, { h: 'landri_', id: 'UCoUwu6fnB6xYt4f1rPwHHQw' }, { h: 'marvelfr' }, { h: 'Regelegorila', id: 'UCouHAi3jWpC8lAqsoeM_zOA' }];
async function youtube() {
  const out = [];
  for (const c of YT) {
    let id = c.id;
    if (!id) { const html = await get('https://www.youtube.com/@' + c.h); id = html && ((html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/) || [])[1]); }
    if (!id) { console.log(`📺 @${c.h}: introuvable`); continue; }
    const xml = await get('https://www.youtube.com/feeds/videos.xml?channel_id=' + id); if (!xml) continue;
    const name = strip(tag(xml, 'title')) || c.h; let n = 0;
    for (const m of xml.matchAll(/<entry>[\s\S]*?<\/entry>/gi)) {
      const x = m[0], vid = strip(tag(x, 'yt:videoId')); if (!vid) continue;
      const link = (x.match(/<link[^>]+href="([^"]+)"/) || [])[1] || '';
      out.push({ vid, cid: id, h: c.h, ch: name, t: strip(tag(x, 'title')), d: strip(tag(x, 'media:description')).slice(0, 600), ts: Date.parse(strip(tag(x, 'published'))) || Date.now(), short: /\/shorts\//.test(link) ? 1 : 0 }); n++;
    }
    console.log(`📺 ${name}: ${n} vidéos`);
  }
  return out;
}

/* ======================= TOPS ======================= */
const tmdbCache = new Map();
async function findTmdb(title, kind) { // kind : 'movie' | 'tv'
  const k = kind + ':' + title; if (tmdbCache.has(k)) return tmdbCache.get(k);
  const q = title.replace(/:\s*(Season|Saison|Limited Series|Partie|Part|Volume)\b.*$/i, '').trim();
  let d = await tmdb(`/search/${kind}`, '&query=' + encodeURIComponent(q));
  let r = d && d.results && d.results[0];
  if (!r) { d = await tmdb('/search/multi', '&query=' + encodeURIComponent(q)); r = d && d.results && d.results.find(x => x.media_type === 'movie' || x.media_type === 'tv'); if (r) kind = r.media_type; }
  const out = r ? { id: r.id, mt: kind, t: r.title || r.name || title, p: r.poster_path || '', b: r.backdrop_path || '' } : null;
  tmdbCache.set(k, out); await sleep(60); return out;
}
const slim = (r, mt) => ({ id: r.id, mt, t: r.title || r.name, p: r.poster_path || '', b: r.backdrop_path || '' });

async function netflix() {
  const tsv = await get('https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv', 'text', 3, 180000);
  if (!tsv) return null;
  const rows = [];
  for (const line of tsv.split('\n')) { if (!line.startsWith('France\t')) continue; const c = line.split('\t'); rows.push({ week: c[2], cat: c[3], rank: +c[4], title: c[5], season: c[6], weeks: +c[7] || 1 }); }
  const weeks = [...new Set(rows.map(r => r.week))].sort().reverse(); if (!weeks.length) return null;
  const [w0, w1] = weeks, out = { week: w0, films: [], tv: [] };
  for (const cat of ['Films', 'TV']) {
    const cur = rows.filter(r => r.week === w0 && r.cat === cat).sort((a, b) => a.rank - b.rank);
    const prev = rows.filter(r => r.week === w1 && r.cat === cat);
    for (const r of cur) {
      const pr = prev.find(x => x.title === r.title);
      const m = await findTmdb(r.title, cat === 'TV' ? 'tv' : 'movie');
      (cat === 'TV' ? out.tv : out.films).push({ r: r.rank, p0: pr ? pr.rank : 0, w: r.weeks, s: r.season !== 'N/A' ? r.season : '', ...(m || { t: r.title }) });
    }
  }
  console.log(`🔴 Netflix France semaine ${w0}: ${out.films.length} films, ${out.tv.length} séries`);
  return out;
}
const PROVIDERS = [{ k: 'netflix', n: 'Netflix', id: 8 }, { k: 'prime', n: 'Prime Video', id: 119 }, { k: 'disney', n: 'Disney+', id: 337 }, { k: 'canal', n: 'Canal+', id: 381 }, { k: 'max', n: 'Max', id: 1899 }, { k: 'apple', n: 'Apple TV+', id: 350 }, { k: 'paramount', n: 'Paramount+', id: 531 }];
// Tendances DU JOUR par plateforme : les titres les plus regardés aujourd'hui (TMDB, mis à jour en continu),
// rangés par plateforme selon où ils sont disponibles en abonnement EN FRANCE. Complété par la popularité de la plateforme si besoin.
/* Classement DU JOUR en France (JustWatch, mis à jour plusieurs fois par jour), filtré plateforme par plateforme */
const JW = { netflix: ['nfx', 'nfa'], prime: ['prv'], disney: ['dnp'], canal: ['cpd', 'cns'], max: ['mxx'], apple: ['atp'], paramount: ['pmp', 'ppp'], tf1: ['tf1'], m6: ['sxp'] };
const JW_N = { tf1: 'TF1+', m6: 'M6+' };
const JWQ = `query T($f:TitleFilter){popularTitles(country:FR,first:100,filter:$f,sortBy:POPULAR){edges{node{content(country:FR,language:"fr"){title externalIds{tmdbId}} streamingCharts(country:FR){edges{streamingChartInfo{rank trend daysInTop10 updatedAt}}}}}}}`;
async function jwChart(pk, ot) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch('https://apis.justwatch.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ query: JWQ, variables: { f: { packages: pk, objectTypes: [ot] } } }), signal: AbortSignal.timeout(30000) });
      const j = await r.json(); const E = (j && j.data && j.data.popularTitles && j.data.popularTitles.edges) || [];
      return E.map(e => { const n = e.node, c = (n.streamingCharts && n.streamingCharts.edges && n.streamingCharts.edges[0] && n.streamingCharts.edges[0].streamingChartInfo) || null; return { tmdb: +(n.content && n.content.externalIds && n.content.externalIds.tmdbId) || 0, t: n.content && n.content.title, c }; })
        .filter(x => x.c && x.c.rank && x.tmdb).sort((a, b) => a.c.rank - b.c.rank);
    } catch (e) { console.warn('⚠️ JustWatch', String(e.message || e).slice(0, 120)); await sleep(1500); }
  }
  return [];
}
async function justwatch() {
  const out = {}; let at = '';
  for (const [k, pk] of Object.entries(JW)) {
    out[k] = { n: (PROVIDERS.find(p => p.k === k) || {}).n || JW_N[k], films: [], tv: [], src: 'jw' };
    for (const [ot, mt, cat] of [['MOVIE', 'movie', 'films'], ['SHOW', 'tv', 'tv']]) {
      const L = (await jwChart(pk, ot)).slice(0, 10);
      for (const x of L) {
        const d = await tmdb(`/${mt}/${x.tmdb}`); await sleep(30);
        out[k][cat].push({ ...(d ? slim(d, mt) : { id: x.tmdb, mt, t: x.t, p: '', b: '' }), day: 1, jw: x.c.rank, tr: x.c.trend, d10: x.c.daysInTop10 || 0 });
        if (x.c.updatedAt > at) at = x.c.updatedAt;
      }
    }
    console.log(`📅 ${out[k].n}: ${out[k].films.length} films, ${out[k].tv.length} séries (JustWatch du jour)`);
  }
  return { out, at };
}
async function providers() {
  const J = await justwatch();
  let T = null;
  // JustWatch d'abord ; l'ancienne estimation ne sert que si JustWatch n'a rien donné pour une plateforme
  for (const k of Object.keys(J.out)) { for (const cat of ['films', 'tv']) if (J.out[k][cat].length < 5 && PROVIDERS.some(p => p.k === k)) { T = T || await providersTmdb(); J.out[k][cat] = T[k][cat]; J.out[k].src = 'tmdb'; } }
  J.out._at = J.at; return J.out;
}
async function providersTmdb() {
  const out = {}; PROVIDERS.forEach(p => { out[p.k] = { n: p.n, films: [], tv: [] }; });
  const byId = Object.fromEntries(PROVIDERS.map(p => [p.id, p.k]));
  for (const [mt, cat] of [['movie', 'films'], ['tv', 'tv']]) {
    const seen = new Set(), trend = [];
    for (let pg = 1; pg <= (mt === 'movie' ? 12 : 8); pg++) { const d = await tmdb(`/trending/${mt}/day`, '&page=' + pg); ((d && d.results) || []).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); trend.push(r); } }); }
    for (const r of trend) {
      if (PROVIDERS.every(p => out[p.k][cat].length >= 10)) break;
      const w = await get(`https://api.themoviedb.org/3/${mt}/${r.id}/watch/providers?api_key=${TMDB}`, 'json'); await sleep(35);
      const fr = (w && w.results && w.results.FR && w.results.FR.flatrate) || [];
      for (const f of fr) { const k = byId[f.provider_id]; if (k && out[k][cat].length < 10 && !out[k][cat].some(x => x.id === r.id)) out[k][cat].push({ ...slim(r, mt), day: 1 }); }
    }
  }
  // si une plateforme a moins de 10 titres du jour, on complète avec ses titres les plus populaires
  for (const p of PROVIDERS) {
    for (const [mt, cat] of [['movie', 'films'], ['tv', 'tv']]) {
      if (out[p.k][cat].length >= 10) continue;
      const q = `&watch_region=FR&with_watch_providers=${p.id}&with_watch_monetization_types=flatrate&sort_by=popularity.desc${mt === 'movie' ? '&vote_count.gte=20' : '&vote_count.gte=10'}`;
      const d = await tmdb(`/discover/${mt}`, q);
      for (const r of ((d && d.results) || [])) { if (out[p.k][cat].length >= 10) break; if (!out[p.k][cat].some(x => x.id === r.id)) out[p.k][cat].push(slim(r, mt)); }
    }
    console.log(`📺 ${p.n}: ${out[p.k].films.filter(x => x.day).length}/10 films du jour, ${out[p.k].tv.filter(x => x.day).length}/10 séries du jour`);
  }
  return out;
}
async function boxOffice() {
  const ids = new Map();
  for (const pg of [1, 2, 3]) { const d = await tmdb('/movie/now_playing', '&page=' + pg); ((d && d.results) || []).forEach(r => ids.set(r.id, r)); }
  const det = [];
  for (const id of ids.keys()) { const d = await tmdb(`/movie/${id}`); if (d && d.revenue > 0) det.push({ ...slim(d, 'movie'), rev: d.revenue }); await sleep(40); }
  det.sort((a, b) => b.rev - a.rev); console.log(`🎟️ Box-office: ${det.length} films avec recettes`); return det.slice(0, 10);
}
async function stremio() {
  const out = {};
  for (const [k, type, mt] of [['films', 'movie', 'movie'], ['tv', 'series', 'tv']]) {
    const d = await get(`https://v3-cinemeta.strem.io/catalog/${type}/top.json`, 'json');
    const metas = ((d && d.metas) || []).slice(0, 10), l = [];
    for (const m of metas) {
      const f = m.imdb_id || m.id; let r = null;
      if (f && /^tt\d+/.test(f)) { const x = await tmdb(`/find/${f}`, '&external_source=imdb_id'); r = x && (x[mt + '_results'] || [])[0]; await sleep(40); }
      l.push(r ? slim(r, mt) : { t: m.name, p: '', id: 0, mt });
    }
    out[k] = l;
  }
  console.log(`🟣 Stremio: ${out.films.length}+${out.tv.length}`); return out;
}
// évolution des places (pour tout sauf Netflix, qui a ses propres données officielles)
function withHistory(tops, hist) {
  const lists = {};
  for (const [pk, v] of Object.entries(tops.prov || {})) { if (!v || !v.films) continue; lists['prov.' + pk + '.films'] = v.films; lists['prov.' + pk + '.tv'] = v.tv; }
  if (tops.stremio) { lists['stremio.films'] = tops.stremio.films; lists['stremio.tv'] = tops.stremio.tv; }
  if (tops.bo) lists['bo'] = tops.bo;
  for (const [key, list] of Object.entries(lists)) {
    const h = hist[key] = hist[key] || {};
    h[today] = list.map(x => x.mt + '_' + x.id);
    const dates = Object.keys(h).sort(); const prevDate = dates.filter(d => d < today).pop();
    list.forEach((x, i) => {
      const id = x.mt + '_' + x.id; x.r = i + 1;
      x.p0 = prevDate ? (h[prevDate].indexOf(id) + 1) : 0;
      let n = 0; for (let j = dates.length - 1; j >= 0 && h[dates[j]].includes(id); j--) n++; x.dd = n; // jours d'affilée dans le top
    });
    for (const d of Object.keys(h)) if (d < new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)) delete h[d];
  }
  return hist;
}

/* ======================= MAIN ======================= */
const only = process.argv[2];
if (!only || only === 'news') {
  const news = await buildNews();
  await writeFile('news.json', JSON.stringify(news));
  console.log(`✅ news.json : ${news.items.length} articles`);
}
if (!only || only === 'tops') {
  let hist = {}; try { hist = JSON.parse(await readFile('tops-history.json', 'utf8')); } catch (_) {}
  const prov = await providers(), chartAt = prov._at; delete prov._at;
  const tops = { updated: new Date().toISOString(), chartAt, netflix: await netflix(), prov, bo: await boxOffice(), stremio: await stremio() };
  if (!tops.netflix) { try { tops.netflix = JSON.parse(await readFile('tops.json', 'utf8')).netflix || null; } catch (_) {} }
  hist = withHistory(tops, hist);
  await writeFile('tops.json', JSON.stringify(tops));
  await writeFile('tops-history.json', JSON.stringify(hist));
  console.log('✅ tops.json');
}
