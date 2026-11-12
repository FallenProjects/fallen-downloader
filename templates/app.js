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
let readyVerification = null;
let verificationPromise = null;
let linkTimer = null;
let linkRevision = 0;
let loadingLink = '';
let lastLoadedLink = '';

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
function message(text, error = false, loading = false) {
  status.textContent = text;
  status.className = 'status' + (error ? ' error' : loading ? ' loading' : '');
  status.classList.remove('hidden');
}
function clearMessage() { status.classList.add('hidden'); status.textContent = ''; }
function setBusy(next, label) {
  busy = next;
  $('extract-button').disabled = next;
  $('search-button').disabled = next;
  if (next) message(label || 'Checking the link…', false, true);
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
function scheduleLink(delay = 550) {
  clearTimeout(linkTimer);
  const raw = urlInput.value.trim();
  if (loadingLink && loadingLink === raw) return;
  linkRevision++;
  if (loadingLink && loadingLink !== raw) activeRequest?.abort();
  if (raw !== lastLoadedLink) results.classList.add('hidden');
  const found = classify(raw);
  if (found.error) { if (!found.blocked) clearMessage(); return; }
  warmVerification();
  $('extract-button-label').textContent = 'Show available files';
  const revision = linkRevision;
  linkTimer = setTimeout(() => extractLink(raw, revision), delay);
}
urlInput.addEventListener('input', (event) => {
  updateDetection();
  scheduleLink(event.inputType === 'insertFromPaste' ? 100 : 550);
});
$('paste-button').addEventListener('click', async () => {
  try { urlInput.value = await navigator.clipboard.readText(); updateDetection(); scheduleLink(100); urlInput.focus(); }
  catch { message('Clipboard access is unavailable. Paste your link into the field instead.', true); }
});
function activate(tab) {
  const link = tab === 'link';
  $('tab-link').classList.toggle('active', link); $('tab-search').classList.toggle('active', !link);
  $('tab-link').setAttribute('aria-selected', String(link)); $('tab-search').setAttribute('aria-selected', String(!link));
  $('panel-link').classList.toggle('hidden', !link); $('panel-search').classList.toggle('hidden', link);
  clearMessage(); results.classList.add('hidden');
  clearTimeout(linkTimer); linkRevision++;
  (link ? urlInput : $('search-input')).focus();
  activeRequest?.abort();
  if (link && urlInput.value.trim()) { updateDetection(); scheduleLink(150); }
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
function aborted() { return new DOMException('Request cancelled.', 'AbortError'); }
async function generateVerification() {
  const started = Date.now();
  while (!window.turnstile && Date.now() - started < 6000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!window.turnstile) throw new Error('Verification could not load. Refresh the page and try again.');
  if (pendingVerification) throw new Error('Verification is already in progress.');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finishVerification(new Error('Verification did not finish. If you use Brave, allow this site in Shields and try again.')), 30000);
    pendingVerification = { resolve, reject, timer };
    try {
      if (widgetId === null) {
        widgetId = turnstile.render('#turnstile-container', {
          sitekey: document.body.dataset.turnstileKey, appearance: 'interaction-only', execution: 'execute', 'refresh-expired': 'manual',
          callback: (token) => finishVerification(null, token),
          'error-callback': () => { finishVerification(new Error('Verification failed. Please try again.')); return true; },
          'expired-callback': () => { readyVerification = null; finishVerification(new Error('Verification expired. Please try again.')); },
          'timeout-callback': () => finishVerification(new Error('Verification timed out. Please try again.')),
          'unsupported-callback': () => finishVerification(new Error('Verification is not supported by this browser. Update it and try again.'))
        });
        if (widgetId === null || widgetId === undefined) throw new Error('Widget did not render');
      } else turnstile.reset(widgetId);
      turnstile.execute(widgetId);
    } catch { finishVerification(new Error('Verification could not start. Refresh the page and try again.')); }
  });
}
function prepareVerification() {
  if (!document.body.dataset.turnstileKey) return Promise.resolve('');
  if (readyVerification && Date.now() - readyVerification.created < 240000) return Promise.resolve(readyVerification.value);
  readyVerification = null;
  if (!verificationPromise) {
    verificationPromise = generateVerification().then((value) => {
      readyVerification = { value, created: Date.now() };
      return value;
    }).finally(() => { verificationPromise = null; });
  }
  return verificationPromise;
}
function warmVerification() {
  if (document.hidden || !document.body.dataset.turnstileKey) return;
  prepareVerification().catch(() => {});
}
function waitWithAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(aborted()); };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}
async function takeVerificationToken(signal) {
  if (!document.body.dataset.turnstileKey) return '';
  for (;;) {
    const token = await waitWithAbort(prepareVerification(), signal);
    if (signal.aborted) throw aborted();
    if (readyVerification?.value === token && Date.now() - readyVerification.created < 240000) {
      readyVerification = null;
      return token;
    }
  }
}
if (document.body.dataset.turnstileKey) {
  document.addEventListener('DOMContentLoaded', warmVerification, { once: true });
  document.addEventListener('visibilitychange', warmVerification);
  urlInput.addEventListener('focus', warmVerification);
  $('search-input').addEventListener('focus', warmVerification);
}
async function request(path, params) {
  activeRequest?.abort();
  const controller = new AbortController(); activeRequest = controller;
  let timeout;
  let tokenUsed = false;
  try {
    const token = await takeVerificationToken(controller.signal);
    if (controller.signal.aborted) throw aborted();
    tokenUsed = Boolean(token);
    timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(path + '?' + new URLSearchParams(params), { signal: controller.signal, headers: token ? { 'X-CF-Turnstile-Token': token } : {}, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || 'The request failed. Please try again.');
    return data;
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) activeRequest = null;
    if (tokenUsed) warmVerification();
  }
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
function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '';
  const s = Math.floor(Number(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function addArtwork(parent, source, alt, className, fallback) {
  const safe = safeLink(source);
  if (!safe) return;
  const img = el('img', className); img.src = safe; img.alt = alt || ''; img.loading = 'lazy'; img.decoding = 'async';
  if (fallback) img.addEventListener('error', () => { img.remove(); parent.append(icon(fallback)); }, { once: true });
  parent.append(img);
}
const ICONS = {
  open: '<path d="M13 5h6v6m0-6-9 9"/><path d="M19 13v6H5V5h6"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1"/><path d="m3 17 5-5 4 4 3-3 6 5"/>',
  audio: '<path d="M9 18V5l11-2v13M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3h3m11 0c0 2-2 3-4 3s-3-1-3-2 2-3 4-3h3"/>'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}
function fileAction(file, featured = false, position = '') {
  const link = el('a', featured ? 'file-action featured-action' : 'file-action');
  link.href = file.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Download ' + file.kind.toLowerCase() + (position ? ' ' + position : ''));
  link.title = 'Download from the media host. Your browser may preview the file.';
  link.append(icon('open'));
  if (featured) link.append(el('span', '', 'Download'));
  return link;
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
  let totalFiles = 0;
  entries.forEach((entry) => {
    if (!entry || isYouTubeItem(entry)) return;
    const audios = Array.isArray(entry.audios) ? entry.audios : [];
    const audioURLs = new Set(audios.map((a) => typeof a === 'string' ? a : a?.url));
    const videos = (Array.isArray(entry.videos) ? entry.videos : []).filter((v) => !audioURLs.has(typeof v === 'string' ? v : v?.url));
    const images = Array.isArray(entry.images) ? entry.images : [];
    const files = [];
    const seen = new Set();
    const addFile = (item, kind) => {
      const rawURL = typeof item === 'string' ? item : item?.url;
      const url = safeLink(rawURL);
      if (!url || seen.has(url)) return;
      seen.add(url);
      files.push({ url, kind, detail: typeof item === 'object' ? item?.quality || item?.format || '' : '', thumbnail: typeof item === 'object' ? item?.thumbnail : '' });
    };
    videos.forEach((item) => addFile(item, 'Video'));
    audios.forEach((item) => addFile(item, 'Audio'));
    if (Array.isArray(entry.media)) entry.media.forEach((item) => {
      const type = String(item?.type || '').toLowerCase();
      addFile(item, type.includes('audio') ? 'Audio' : type.includes('image') || type.includes('photo') ? 'Image' : type.includes('video') ? 'Video' : 'Media');
    });
    images.forEach((item) => addFile(item, 'Image'));
    if (!files.length) return;
    totalFiles += files.length;
    const single = files.length === 1;
    const card = el('article', 'result-card ' + (single ? 'is-single' : 'is-multiple'));
    const main = el('div', 'result-main');
    const previewURL = single && files[0].kind === 'Image' ? files[0].url : files[0].thumbnail || entry.thumbnail || entry.cover || entry.videos?.[0]?.thumbnail;
    const preview = el('div', 'result-preview');
    if (safeLink(previewURL)) addArtwork(preview, previewURL, '', 'result-art', files[0].kind === 'Image' ? 'image' : files[0].kind === 'Audio' ? 'audio' : 'video');
    else preview.append(icon(files[0].kind === 'Image' ? 'image' : files[0].kind === 'Audio' ? 'audio' : 'video'));
    main.append(preview);
    const copy = el('div', 'result-copy');
    if (single) copy.append(el('span', 'result-kind', files[0].kind));
    copy.append(el('h3', 'result-title', entry.title || 'Media from ' + platformName));
    const meta = [entry.author || entry.creator || entry.channel, formatDuration(entry.duration)].filter(Boolean).join(' · ');
    if (meta) copy.append(el('p', 'result-meta', meta));
    if (single && files[0].detail) copy.append(el('p', 'result-detail', String(files[0].detail)));
    if (single) {
      const actions = el('div', 'featured-actions');
      actions.append(fileAction(files[0], true));
      copy.append(actions);
    } else copy.append(el('p', 'result-available', files.length + ' files available'));
    main.append(copy); card.append(main);
    if (!single) {
      for (const [kind, heading, visual] of [['Video', 'Videos', true], ['Image', 'Photos', true], ['Audio', 'Audio', false], ['Media', 'Other files', false]]) {
        const groupFiles = files.filter((file) => file.kind === kind);
        if (!groupFiles.length) continue;
        const section = el('section', 'file-section');
        section.append(el('h4', 'file-section-title', heading));
        const list = el('div', visual ? 'visual-grid' : 'file-list');
        groupFiles.forEach((file, index) => {
          const tile = el('div', visual ? 'visual-tile' : 'file-row');
          const thumb = el('div', visual ? 'visual-thumb' : 'file-thumb');
          const thumbURL = kind === 'Image' ? file.url : file.thumbnail;
          if (safeLink(thumbURL)) addArtwork(thumb, thumbURL, '', '', kind === 'Image' ? 'image' : 'video');
          else thumb.append(icon(kind === 'Audio' ? 'audio' : kind === 'Image' ? 'image' : 'video'));
          const actions = el('div', 'file-actions');
          const position = groupFiles.length > 1 ? index + 1 + ' of ' + groupFiles.length : '';
          actions.append(fileAction(file, false, position));
          tile.append(thumb);
          if (!visual) tile.append(el('span', 'file-detail', String(file.detail || (kind === 'Audio' ? 'Audio file' : 'Media file'))));
          tile.append(actions); list.append(tile);
        });
        section.append(list); card.append(section);
      }
    }
    results.append(card); shown++;
  });
  if (!shown) { results.classList.add('hidden'); message('No files were available for this link. Try another post or song.', true); }
  else {
    if (totalFiles === 1) results.querySelector('.results-head h2').textContent = 'Your file is ready';
    clearMessage();
  }
}
function renderTracks(raw, title) {
  const tracks = trackArray(unwrap(raw)).filter((t) => t && !isYouTubeItem(t));
  resultHeading(title, tracks.length + (tracks.length === 1 ? ' result' : ' results'));
  if (!tracks.length) { message('No songs found. Try another search or music link.', true); return; }
  clearMessage();
  const list = el('div', 'track-list');
  tracks.forEach((track) => {
    const card = el('article', 'track-card');
    addArtwork(card, track.thumbnail || track.artwork || track.cover, '', '');
    const copy = el('div', 'result-copy'); copy.append(el('h3', 'result-title', track.title || 'Untitled song'));
    const meta = [track.artist || track.channel || track.creator, formatDuration(track.duration), track.platform].filter(Boolean).join(' · ');
    if (meta) copy.append(el('p', 'result-meta', meta));
    card.append(copy);
    const trackURL = track.url || track.link;
    if (trackURL && classify(trackURL).kind === 'music') {
      const button = el('button', 'resolve-button', 'Download'); button.type = 'button';
      button.addEventListener('click', () => resolveTrack(trackURL, button)); card.append(button);
    }
    list.append(card);
  });
  results.append(list);
}
async function resolveTrack(trackURL, button) {
  if (busy) return;
  const found = classify(trackURL);
  if (found.blocked) { message(YOUTUBE_MESSAGE, true); return; }
  if (found.kind !== 'music') { message('This song cannot be downloaded from its link.', true); return; }
  setBusy(true, 'Preparing download…'); button.disabled = true;
  try {
    const data = unwrap(await request('/api/resolve', { url: trackURL }));
    if (data?.key) throw new Error('This song uses an encrypted stream and cannot be downloaded here. Try another song.');
    const file = safeLink(data?.cdnurl || data?.cdnUrl);
    if (!file) throw new Error('No download link is available for this song.');
    const stream = new URL(file).pathname.toLowerCase().endsWith('.m3u8');
    button.replaceWith(fileAction({ url: file, kind: 'Audio' }, true));
    message(stream ? 'Stream link ready. Your browser may need a compatible player.' : 'Download ready. Your browser may preview the file.');
  } catch (error) { message(error.name === 'AbortError' ? 'Request cancelled.' : error.message, true); button.disabled = false; }
  finally { setBusy(false); }
}
async function extractLink(raw, revision, manual = false) {
  if (revision !== linkRevision || raw !== urlInput.value.trim() || $('panel-link').classList.contains('hidden')) return;
  const found = classify(raw);
  if (found.error) { if (manual) message(found.error, true); return; }
  if (!manual && raw === lastLoadedLink && !results.classList.contains('hidden')) return;
  if (busy) { linkTimer = setTimeout(() => extractLink(raw, revision, manual), 100); return; }
  loadingLink = raw;
  results.classList.add('hidden'); setBusy(true, 'Checking the link…');
  try {
    const data = await request('/api/extract', { url: raw });
    if (revision !== linkRevision || raw !== urlInput.value.trim()) return;
    if (found.kind === 'music') renderTracks(data, 'Songs from ' + found.name);
    else renderSocial(data, found.name);
    lastLoadedLink = raw;
    $('extract-button-label').textContent = 'Check again';
  } catch (error) {
    if (revision === linkRevision) message(error.name === 'AbortError' ? 'The request took too long. Try again.' : error.message, true);
  } finally {
    if (loadingLink === raw) { loadingLink = ''; setBusy(false); }
  }
}
$('link-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(linkTimer);
  extractLink(urlInput.value.trim(), linkRevision, true);
});
$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return;
  const q = $('search-input').value.trim();
  if (q.split(/\s+/).some((word) => classify(word.replace(/^[\[(<"']+|[\])>,.;"']+$/g, '')).blocked)) { message(YOUTUBE_MESSAGE, true); return; }
  if (q.length < 2 || q.length > 120) { message('Enter at least two characters to search music.', true); return; }
  results.classList.add('hidden'); setBusy(true, 'Searching for songs…');
  try { renderTracks(await request('/api/search', { q, platform: $('search-platform').value }), 'Matching songs'); }
  catch (error) { message(error.name === 'AbortError' ? 'Request cancelled.' : error.message, true); }
  finally { setBusy(false); }
});
