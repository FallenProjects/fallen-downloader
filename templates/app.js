const YOUTUBE_MESSAGE = document.body.dataset.youtubeMessage;
const $ = (id) => document.getElementById(id);
const urlInput = $('url-input');
const status = $('status');
const results = $('results');
const platformChips = [...document.querySelectorAll('.chip[data-hosts]')];
let activeRequest = null;
let busy = false;
let widgetId = null;
let pendingVerification = null;

function youtubeHost(host) {
  return document.body.dataset.youtubeHosts.split(',').some((domain) => host === domain || host.endsWith('.' + domain));
}
function classify(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return { error: 'Paste a complete media link, starting with https://.' }; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.hash) return { error: 'Enter a standard public media link.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (youtubeHost(host)) return { error: YOUTUBE_MESSAGE, blocked: true };
  const chip = platformChips.find((item) => item.dataset.hosts.split(',').some((domain) => host === domain || host.endsWith('.' + domain)));
  return chip ? { name: chip.textContent.trim(), kind: chip.closest('#music-platforms') ? 'music' : 'social' } : { error: 'This platform is not supported yet. Try one of the links listed below.' };
}
function safeLink(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || youtubeHost(host) || host === 'localhost' || host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return raw;
  } catch { return null; }
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
function message(text, error = false) {
  status.textContent = text;
  status.className = 'status' + (error ? ' error' : '');
  status.classList.remove('hidden');
}
function clearMessage() { status.classList.add('hidden'); status.textContent = ''; }
function setBusy(next, label) {
  busy = next;
  $('extract-button').disabled = next;
  $('search-button').disabled = next;
  if (next) message(label || 'Checking the link…');
}
function updateDetection() {
  const badge = $('detected-platform');
  const raw = urlInput.value.trim();
  if (!raw) { badge.classList.add('hidden'); clearMessage(); return; }
  const found = classify(raw);
  badge.textContent = found.name || (found.blocked ? 'Temporarily unavailable' : 'Unsupported link');
  badge.className = 'detected' + (found.blocked ? ' blocked' : '');
  if (found.blocked) message(YOUTUBE_MESSAGE, true);
  else if (!busy) clearMessage();
}
urlInput.addEventListener('input', updateDetection);
$('paste-button').addEventListener('click', async () => {
  try { urlInput.value = await navigator.clipboard.readText(); updateDetection(); urlInput.focus(); }
  catch { message('Clipboard access is unavailable. Paste your link into the field instead.', true); }
});
function activate(tab) {
  const link = tab === 'link';
  $('tab-link').classList.toggle('active', link); $('tab-search').classList.toggle('active', !link);
  $('tab-link').setAttribute('aria-selected', String(link)); $('tab-search').setAttribute('aria-selected', String(!link));
  $('panel-link').classList.toggle('hidden', !link); $('panel-search').classList.toggle('hidden', link);
  clearMessage(); results.classList.add('hidden');
  (link ? urlInput : $('search-input')).focus();
  activeRequest?.abort();
}
$('tab-link').addEventListener('click', () => activate('link'));
$('tab-search').addEventListener('click', () => activate('search'));

function finishVerification(error, token) {
  if (!pendingVerification) return;
  const { resolve, reject, timer } = pendingVerification;
  pendingVerification = null;
  clearTimeout(timer);
  if (error) reject(error);
  else resolve(token);
}
async function verificationToken() {
  if (!document.body.dataset.turnstileKey) return '';
  const started = Date.now();
  while (!window.turnstile && Date.now() - started < 6000) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!window.turnstile) throw new Error('Verification could not load. Refresh the page and try again.');
  if (pendingVerification) throw new Error('Verification is already in progress.');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finishVerification(new Error('Verification did not finish. If you use Brave, allow this site in Shields and try again.')), 30000);
    pendingVerification = { resolve, reject, timer };
    try {
      if (widgetId === null) {
        widgetId = turnstile.render('#turnstile-container', {
          sitekey: document.body.dataset.turnstileKey, appearance: 'interaction-only', execution: 'execute',
          callback: (token) => finishVerification(null, token),
          'error-callback': () => { finishVerification(new Error('Verification failed. Please try again.')); return true; },
          'expired-callback': () => finishVerification(new Error('Verification expired. Please try again.')),
          'unsupported-callback': () => finishVerification(new Error('Verification is not supported by this browser. Update it and try again.'))
        });
        if (widgetId === null || widgetId === undefined) throw new Error('Widget did not render');
      } else turnstile.reset(widgetId);
      turnstile.execute(widgetId);
    } catch { finishVerification(new Error('Verification could not start. Refresh the page and try again.')); }
  });
}
async function request(path, params) {
  activeRequest?.abort();
  const controller = new AbortController(); activeRequest = controller;
  let timeout;
  try {
    const token = await verificationToken();
    timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(path + '?' + new URLSearchParams(params), { signal: controller.signal, headers: token ? { 'X-CF-Turnstile-Token': token } : {}, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || 'The request failed. Please try again.');
    return data;
  } finally { clearTimeout(timeout); if (activeRequest === controller) activeRequest = null; }
}
function unwrap(data) { return data && typeof data === 'object' && data.data && typeof data.data === 'object' ? data.data : data; }
function isYouTubeItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.platform === 'string' && /youtube|youtu\.be/i.test(item.platform)) return true;
  const raw = item.url || item.link || '';
  try { return youtubeHost(new URL(raw).hostname.toLowerCase()); } catch { return false; }
}
function trackArray(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['results', 'tracks', 'items']) if (Array.isArray(data?.[key])) return data[key];
  return data && typeof data === 'object' && (data.title || data.url) ? [data] : [];
}
function isCollectionURL(raw) {
  try {
    const u = new URL(raw);
    return /\/(album|playlist|artist|section|show|featured|sets)\//i.test(u.pathname) || (u.hostname === 'podcasts.apple.com' && !u.searchParams.has('i'));
  }
  catch { return false; }
}
function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '';
  const s = Math.floor(Number(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function addArtwork(parent, source, alt, className) {
  const safe = safeLink(source);
  if (!safe) return;
  const img = el('img', className); img.src = safe; img.alt = alt || ''; img.loading = 'lazy'; img.decoding = 'async'; parent.append(img);
}
function addDownload(parent, raw, label) {
  const safe = safeLink(raw); if (!safe) return false;
  const anchor = el('a', 'media-link', label);
  anchor.href = safe; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
  anchor.title = 'Opens the file from the media host. Your browser may open it in a new tab.';
  parent.append(anchor); return true;
}
function resultHeading(title, count) {
  results.replaceChildren(); results.classList.remove('hidden');
  const head = el('div', 'results-head'); head.append(el('h2', '', title), el('span', '', count)); results.append(head);
}
function renderSocial(raw, platformName) {
  const data = unwrap(raw);
  const entries = Array.isArray(data?.items) ? data.items : [data];
  resultHeading('Available files', platformName);
  let shown = 0;
  entries.forEach((entry, index) => {
    if (!entry || isYouTubeItem(entry)) return;
    const card = el('article', 'result-card');
    const main = el('div', 'result-main');
    addArtwork(main, entry.thumbnail || entry.cover || entry.videos?.[0]?.thumbnail, '', 'result-art');
    const copy = el('div', 'result-copy');
    copy.append(el('h3', 'result-title', entry.title || (entries.length > 1 ? 'Item ' + (index + 1) : 'Media from ' + platformName)));
    const meta = [entry.author || entry.creator || entry.channel, formatDuration(entry.duration)].filter(Boolean).join(' · ');
    if (meta) copy.append(el('p', 'result-meta', meta));
    main.append(copy); card.append(main);
    const links = el('div', 'media-list');
    const videos = Array.isArray(entry.videos) ? entry.videos : [];
    const audios = Array.isArray(entry.audios) ? entry.audios : [];
    videos.forEach((v, i) => addDownload(links, typeof v === 'string' ? v : v?.url, (v?.quality || v?.format || 'Video') + (videos.length > 1 && !v?.quality && !v?.format ? ' ' + (i + 1) : '')));
    audios.forEach((a, i) => addDownload(links, typeof a === 'string' ? a : a?.url, (a?.quality || a?.format || 'Audio') + (audios.length > 1 && !a?.quality && !a?.format ? ' ' + (i + 1) : '')));
    if (Array.isArray(entry.media)) entry.media.forEach((m, i) => addDownload(links, m?.url, m?.quality || m?.format || m?.type || 'Media ' + (i + 1)));
    if (links.childElementCount) card.append(links);
    const images = [...(Array.isArray(entry.images) ? entry.images : []), ...(Array.isArray(entry.live_photos) ? entry.live_photos : [])];
    if (images.length) {
      const gallery = el('div', 'gallery');
      images.forEach((value, i) => {
        const rawURL = typeof value === 'string' ? value : value?.url;
        const safe = safeLink(rawURL); if (!safe) return;
        const link = el('a', 'gallery-item'); link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer';
        addArtwork(link, safe, 'Image ' + (i + 1), ''); link.append(el('span', '', 'Open image ' + (i + 1))); gallery.append(link);
      });
      if (gallery.childElementCount) card.append(gallery);
    }
    if (links.childElementCount || images.length) { results.append(card); shown++; }
  });
  if (!shown) message('No files were available for this link. Try another post or track.', true);
  else clearMessage();
}
function renderTracks(raw, title) {
  const tracks = trackArray(unwrap(raw)).filter((t) => t && !isYouTubeItem(t));
  resultHeading(title, tracks.length + (tracks.length === 1 ? ' result' : ' results'));
  if (!tracks.length) { message('No tracks found. Try another search or music link.', true); return; }
  clearMessage();
  const list = el('div', 'track-list');
  tracks.forEach((track) => {
    const card = el('article', 'track-card');
    addArtwork(card, track.thumbnail || track.artwork || track.cover, '', '');
    const copy = el('div', 'result-copy'); copy.append(el('h3', 'result-title', track.title || 'Untitled track'));
    const meta = [track.artist || track.channel || track.creator, formatDuration(track.duration), track.platform].filter(Boolean).join(' · ');
    if (meta) copy.append(el('p', 'result-meta', meta));
    card.append(copy);
    const trackURL = track.url || track.link;
    if (trackURL && classify(trackURL).kind === 'music') {
      const collection = isCollectionURL(trackURL);
      const button = el('button', 'resolve-button', collection ? 'View tracks' : 'Get file link'); button.type = 'button';
      button.addEventListener('click', () => collection ? openCollection(trackURL) : resolveTrack(trackURL, button)); card.append(button);
    }
    list.append(card);
  });
  results.append(list);
}
async function openCollection(raw) {
  if (busy) return;
  const found = classify(raw);
  if (found.blocked) { message(YOUTUBE_MESSAGE, true); return; }
  if (found.kind !== 'music') { message('This collection link is unavailable.', true); return; }
  setBusy(true, 'Loading tracks…');
  try { renderTracks(await request('/api/extract', { url: raw }), 'Tracks in this collection'); }
  catch (error) { message(error.name === 'AbortError' ? 'Request cancelled.' : error.message, true); }
  finally { setBusy(false); }
}
async function resolveTrack(trackURL, button) {
  if (busy) return;
  const found = classify(trackURL);
  if (found.blocked) { message(YOUTUBE_MESSAGE, true); return; }
  if (found.kind !== 'music') { message('This track cannot be resolved from its returned link.', true); return; }
  setBusy(true, 'Getting the file link…'); button.disabled = true;
  try {
    const data = unwrap(await request('/api/resolve', { url: trackURL }));
    if (data?.key) throw new Error('This track uses an encrypted stream and cannot be opened directly here. Try another track.');
    const file = safeLink(data?.cdnurl || data?.cdnUrl);
    if (!file) throw new Error('The service did not return a media link for this track.');
    const telegram = /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(file);
    const stream = new URL(file).pathname.toLowerCase().endsWith('.m3u8');
    const link = el('a', 'media-link', telegram ? 'Open in Telegram' : stream ? 'Open stream' : 'Open media'); link.href = file; link.target = '_blank'; link.rel = 'noopener noreferrer';
    button.replaceWith(link); message(telegram ? 'This link opens a Telegram message.' : stream ? 'This is an HLS stream. Open it with a compatible player.' : 'Media link ready. Your browser may open or download it.');
  } catch (error) { message(error.name === 'AbortError' ? 'Request cancelled.' : error.message, true); button.disabled = false; }
  finally { setBusy(false); }
}
$('link-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return;
  const raw = urlInput.value.trim(); const found = classify(raw);
  if (found.error) { message(found.error, true); return; }
  results.classList.add('hidden'); setBusy(true, 'Checking the link…');
  try {
    const data = await request('/api/extract', { url: raw });
    if (found.kind === 'music') renderTracks(data, 'Tracks from ' + found.name);
    else renderSocial(data, found.name);
  } catch (error) { message(error.name === 'AbortError' ? 'Request cancelled.' : error.message, true); }
  finally { setBusy(false); }
});
$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return;
  const q = $('search-input').value.trim();
  if (q.split(/\s+/).some((word) => classify(word.replace(/^[\[(<"']+|[\])>,.;"']+$/g, '')).blocked)) { message(YOUTUBE_MESSAGE, true); return; }
  if (q.length < 2 || q.length > 120) { message('Enter at least two characters to search music.', true); return; }
  results.classList.add('hidden'); setBusy(true, 'Searching for tracks…');
  try { renderTracks(await request('/api/search', { q, platform: $('search-platform').value }), 'Matching tracks'); }
  catch (error) { message(error.name === 'AbortError' ? 'Request cancelled.' : error.message, true); }
  finally { setBusy(false); }
});
