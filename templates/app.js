const SNAP_PATTERNS = {
    "Instagram": /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv|stories\/[A-Za-z0-9_.]+|stories\/highlights)?\/?[A-Za-z0-9._-]*/i,

    "TikTok": /https?:\/\/(?:www\.|m\.)?(?:vm\.|vt\.)?tiktok\.com\/[^\s]+/i,

    "Pin": /https?:\/\/(?:(?:www\.|[a-z]{2}\.)?pinterest\.[a-z.]+\/pin\/\d+|pin\.it\/[A-Za-z0-9]+)\/?/i,

    "X": /https?:\/\/(?:www\.|m\.)?(?:twitter\.com|x\.com)\/[\w._-]+\/status\/\d+/i,

    "FaceBook": /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch|fb\.com)\/.*/i,

    "Threads": /https?:\/\/(?:www\.)?threads\.(?:com|net)\/.*/i,

    "TwitchClip": /https?:\/\/(?:www\.|m\.)?(?:twitch\.tv\/clip\/[\w-]+|clips\.twitch\.tv\/[\w-]+|twitch\.tv\/[\w-]+\/clip\/[\w-]+)/i,

    "KickClip": /https?:\/\/(?:www\.)?kick\.com\/[\w._-]+\/clips\/[\w-]+/i,

    "SoraAi": /^https:\/\/sora\.chatgpt\.com\/p\/s_[0-9a-fA-F]{32}\?psh=[A-Za-z0-9\-_\.]+$/,

    "SunoAi": /^https:\/\/suno\.com\/song\/[0-9a-fA-F\-]{36}\/?$/,

    "Reddit": /https?:\/\/(?:www\.|m\.)?reddit\.com\/r\/[\w-]+\/(?:comments\/[\w-]+\/.*|s\/[\w-]+)/i,

    "SnapChat": /https?:\/\/(?:www\.)?snapchat\.com\/.*/i
};


const MUSIC_PATTERNS = {
    "Deezer": /https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/i,

    "SoundCloud": /https?:\/\/(?:(?:www\.|m\.)?soundcloud\.com|on\.soundcloud\.com|snd\.sc)\/.*/i,

    "JioSaavn": /https?:\/\/(?:www\.)?jiosaavn\.com\/(song|album|playlist|featured)\/[^\/]+\/([A-Za-z0-9_]+)/i,

    "Spotify": /https?:\/\/(?:open\.|www\.)?spotify\.com\/(album|track|playlist|artist)\/([A-Za-z0-9]+)/i,

    "Tidal": /https?:\/\/(?:www\.|listen\.)?tidal\.com\/(?:browse\/)?(track|album|playlist)\/([a-zA-Z0-9-]+)/i,

    "Gaana": /https?:\/\/(?:www\.)?gaana\.com\/(song|album|playlist|artist)\/([A-Za-z0-9\-]+)/i,

    "mxplayer": /https?:\/\/(?:www\.)?mxplayer\.in\/(?:show|movie|shorts)\/.*/i,

    "TwitchVideo": /https?:\/\/(?:www\.|m\.)?twitch\.tv\/(?:videos|[\w._-]+\/video)\/\d+/i,

    "KickVideo": /https?:\/\/(?:www\.)?kick\.com\/[\w._-]+\/videos\/[a-fA-F0-9-]+/i
};

const urlInput = document.getElementById('url-input');
const downloadBtn = document.getElementById('download-btn');
const platformBadge = document.getElementById('platform-badge');
const statusMessage = document.getElementById('status-message');
const loader = document.getElementById('loader');
const resultContainer = document.getElementById('result-container');
const mainContent = document.getElementById('main-content');

let turnstileToken = '';
let pendingAction = null;
let turnstileId = null;

const turnstileSiteKey = window.turnstileSiteKey;

window.initTurnstile = function () {

    if (!turnstileSiteKey || turnstileId !== null) return;

    turnstileId = turnstile.render('#turnstile-container', {
        sitekey: turnstileSiteKey,
        size: "invisible",
        callback: (token) => {
            turnstileToken = token;
            onTurnstileSuccess(token);
        },
        "error-callback": () => {
            showError("Verification failed");
            hideLoader();
            pendingAction = null;
        }
    });

};

if (window.turnstileReady) {
    window.initTurnstile();
}

urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim();
    const platform = detectPlatform(url);

    statusMessage.classList.add('hidden');

    if (platform) {
        platformBadge.innerText = platform;
        platformBadge.classList.remove('hidden');
        downloadBtn.disabled = false;
    } else {
        platformBadge.classList.add('hidden');
        downloadBtn.disabled = true;
    }
});

urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !downloadBtn.disabled) {
        event.preventDefault();
        downloadBtn.click();
    }
});

function detectPlatform(url) {
    for (const [name, regex] of Object.entries(SNAP_PATTERNS)) {
        if (regex.test(url)) return name;
    }
    for (const [name, regex] of Object.entries(MUSIC_PATTERNS)) {
        if (regex.test(url)) return name;
    }
    return null;
}


downloadBtn.addEventListener('click', async () => {

    const url = urlInput.value.trim();
    const platform = detectPlatform(url);

    if (!url || !platform) return;

    resetUI();
    showLoader();

    pendingAction = { type: 'main', url };

    if (turnstileId !== null) {
        turnstile.reset(turnstileId);
        turnstile.execute(turnstileId);
    } else {
        onTurnstileSuccess('');
    }

});

async function onTurnstileSuccess(token) {

    if (!pendingAction) return;

    const action = pendingAction;
    pendingAction = null;

    if (action.type === 'main') {
        const platform = detectPlatform(action.url);
        if (SNAP_PATTERNS[platform]) {
            await handleSnapWorkflow(action.url, token);
        } else {
            await handleMusicWorkflow(action.url, token);
        }
    } else if (action.type === 'music-dl') {
        await handleMusicDownload(action.url, action.button, token);
    }
}

async function handleSnapWorkflow(url, token) {
    try {
        const data = await apiCall('/api/snap', { url }, token);
        displaySnapResult(data);
    } catch (err) {
        showError(err.message || "Download failed");
    } finally {
        hideLoader();
    }
}

async function handleMusicWorkflow(url, token) {
    try {
        const data = await apiCall('/api/info', { url }, token);
        displayMusicResult(data);
    } catch (err) {
        showError(err.message || "Search failed");
    } finally {
        hideLoader();
    }
}

async function handleMusicDownload(url, button, token) {
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const data = await apiCall('/api/dl', { url }, token);
        if (data.cdnurl) {
            triggerDownload(data.cdnurl);
        } else {
            throw new Error("Download URL not found");
        }
    } catch (err) {
        showError(err.message || "Download failed");
    } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}


async function apiCall(endpoint, params, token) {

    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${endpoint}?${query}`, {
        headers: {
            "X-CF-Turnstile-Token": token
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "API failed");
    }

    return data;
}

function displaySnapResult(data) {
    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = '';
    resultContainer.setAttribute('aria-busy', 'false');
    statusMessage.classList.add('hidden');

    const card = document.createElement('div');
    card.className = 'glass result-card';

    const header = document.createElement('div');
    header.className = 'result-header';

    const title = document.createElement('h2');
    title.textContent = data.title || 'Result';
    header.appendChild(title);
    card.appendChild(header);

    let mainThumbnail = '';
    if (data.videos && data.videos.length > 0 && data.videos[0].thumbnail) {
        mainThumbnail = data.videos[0].thumbnail;
    } else if (data.images && data.images.length > 0) {
        mainThumbnail = data.images[0];
    }

    if (mainThumbnail) {
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'thumbnail-container';
        const img = document.createElement('img');
        img.src = mainThumbnail;
        img.alt = data.title ? `${data.title} thumbnail` : 'Media thumbnail';
        img.loading = 'lazy';
        img.decoding = 'async';
        thumbContainer.appendChild(img);
        card.appendChild(thumbContainer);
    }

    // Videos
    if (data.videos && data.videos.length > 0) {
        const videoSection = document.createElement('div');
        videoSection.className = 'download-section';
        videoSection.innerHTML = '<h3>Videos</h3>';

        const grid = document.createElement('div');
        grid.className = 'download-grid';

        data.videos.forEach((video, index) => {
            const btn = document.createElement('button');
            const label = data.videos.length > 1 ? `Download Video ${index + 1}` : 'Download Video';
            btn.innerHTML = `<i class="fas fa-video"></i> ${label}`;
            btn.onclick = () => triggerDownload(video.url);
            grid.appendChild(btn);
        });

        videoSection.appendChild(grid);
        card.appendChild(videoSection);
    }

    // Audios
    if (data.audios && data.audios.length > 0) {
        const audioSection = document.createElement('div');
        audioSection.className = 'download-section';
        audioSection.innerHTML = '<h3>Audios</h3>';

        const grid = document.createElement('div');
        grid.className = 'download-grid';

        data.audios.forEach((audio, index) => {
            const btn = document.createElement('button');
            const label = data.audios.length > 1 ? `Download Audio ${index + 1}` : 'Download Audio';
            btn.className = 'btn-success';
            btn.innerHTML = `<i class="fas fa-music"></i> ${label}`;
            btn.onclick = () => triggerDownload(audio.url);
            grid.appendChild(btn);
        });

        audioSection.appendChild(grid);
        card.appendChild(audioSection);
    }

    // Images
    if (data.images && data.images.length > 0) {
        const imageSection = document.createElement('div');
        imageSection.className = 'download-section';
        imageSection.innerHTML = '<h3>Images</h3>';

        const grid = document.createElement('div');
        grid.className = 'image-grid';

        data.images.forEach((imgUrl) => {
            const imgItem = document.createElement('div');
            imgItem.className = 'image-item';

            const img = document.createElement('img');
            img.src = imgUrl;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = 'Downloadable media image';

            const overlay = document.createElement('div');
            overlay.className = 'image-overlay';
            overlay.innerHTML = '<i class="fas fa-image"></i>';

            imgItem.appendChild(img);
            imgItem.appendChild(overlay);

            imgItem.onclick = () => triggerDownload(imgUrl);
            grid.appendChild(imgItem);
        });

        imageSection.appendChild(grid);
        card.appendChild(imageSection);
    }

    resultContainer.appendChild(card);
}

function displayMusicResult(data) {
    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = '';
    resultContainer.setAttribute('aria-busy', 'false');
    statusMessage.classList.add('hidden');

    const list = document.createElement('div');
    list.className = 'track-list';

    if (!data.results || data.results.length === 0) {
        showError("No results found");
        return;
    }

    data.results.forEach(track => {
        const item = document.createElement('div');
        item.className = 'track-item glass';

        const durationStr = formatDuration(track.duration);

        const thumb = document.createElement('div');
        thumb.className = 'track-thumb';
        const thumbImg = document.createElement('img');
        thumbImg.src = track.thumbnail;
        thumbImg.alt = track.title ? `${track.title} cover` : 'Track cover';
        thumbImg.loading = 'lazy';
        thumbImg.decoding = 'async';
        thumb.appendChild(thumbImg);

        const info = document.createElement('div');
        info.className = 'track-info';

        const title = document.createElement('div');
        title.className = 'track-title';
        title.title = track.title;
        title.textContent = track.title;

        const meta = document.createElement('div');
        meta.className = 'track-meta';
        meta.innerHTML = `
            <span><i class="fas fa-user"></i> ${escapeHTML(track.channel)}</span>
            <span><i class="fas fa-clock"></i> ${durationStr}</span>
            <span><i class="fas fa-eye"></i> ${escapeHTML(track.views)}</span>
        `;

        info.appendChild(title);
        info.appendChild(meta);

        const dlContainer = document.createElement('div');
        dlContainer.className = 'track-download';
        const dlBtn = document.createElement('button');
        dlBtn.className = 'btn-small';
        dlBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        dlBtn.onclick = () => {
            resetUI();
            startMusicDownload(track.url, dlBtn);
        };
        dlContainer.appendChild(dlBtn);

        item.appendChild(thumb);
        item.appendChild(info);
        item.appendChild(dlContainer);

        list.appendChild(item);
    });

    resultContainer.appendChild(list);
}

function startMusicDownload(url, button) {
    pendingAction = { type: 'music-dl', url, button };

    if (turnstileId !== null) {
        turnstile.reset(turnstileId);
        turnstile.execute(turnstileId);
    } else {
        onTurnstileSuccess('');
    }
}

function triggerDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const fileName = url.split('/').pop().split('?')[0] || 'download';
    a.setAttribute('download', fileName);

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Fallback for some browsers or cross-origin restrictions
    setTimeout(() => {
        if (a.parentNode) {
            document.body.removeChild(a);
        }
    }, 100);
}

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function resetUI() {
    statusMessage.classList.add('hidden');
}

function showLoader() {
    mainContent?.setAttribute('aria-busy', 'true');
    loader.classList.remove('hidden');
    resultContainer.classList.add('hidden');
    resultContainer.setAttribute('aria-busy', 'true');
    statusMessage.innerText = 'Processing request...';
    statusMessage.className = 'status-message';
    statusMessage.classList.remove('hidden');
}

function hideLoader() {
    mainContent?.setAttribute('aria-busy', 'false');
    loader.classList.add('hidden');
}

function showError(msg) {
    statusMessage.innerText = msg;
    statusMessage.className = 'status-message status-error';
    statusMessage.classList.remove('hidden');
}
