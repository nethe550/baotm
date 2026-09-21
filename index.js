const WIDTH = 48;
const HEIGHT = 36;
const FPS = 30;
const ASPECT = WIDTH / HEIGHT;
const LENGTH = WIDTH * HEIGHT;
const FRAME_TIME = 1000 / FPS;

const CHARACTERS_LIGHT = ['🌑', '🌘', '🌒', '🌗', '🌓', '🌔', '🌖', '🌕'];
const CHARACTERS_DARK = ['🌕', '🌖', '🌔', '🌓', '🌗', '🌘', '🌒', '🌑'];

const DISPLAY_MARGIN = 0.1;
const display = document.getElementById('display');
const cellText = new Array(LENGTH);
const indices = new Uint8Array(LENGTH);
indices.fill(255);

const playpause = document.getElementById('playpause');
const pauseico = document.getElementById('playpause-pause');
const playico = document.getElementById('playpause-play');
const scrubber = document.getElementById('scrubber');
const time = document.getElementById('time');
const invert = document.getElementById('invert');
const audio = document.getElementById('player');

let fontScale = 1;
let frame = 0;
let playing = false;
let lid = -1;
let data;
let lit = true;

customElements.define('load-file', class extends HTMLElement {
    async connectedCallback(
        src = this.getAttribute('src'),
        shadowRoot = this.shadowRoot || this.attachShadow({ mode: 'open' })
    ) {
        shadowRoot.innerHTML = await (await fetch(src)).text();
        shadowRoot.append(...this.querySelectorAll('[shadowRoot]'));
        this.hasAttribute('replaceWith') && this.replaceWith(...shadowRoot.childNodes);
    }
});

/**
 * @param {Uint8Array} frame 
 * @param {Array<string>} chars 
 * @param {Array<Text>} textNodes
 * @param {Array<}
 */
const decodeFrame = (frame, chars, textNodes) => {
    let j = 0;
    const l = frame.length;

    for (let i = 0; i < l; i += 2) {
        const count = frame[i];
        const byte = frame[i + 1];
        const high = (byte >> 4) & 0x0F;
        const low = byte & 0x0F;
        for (let c = 0; c < count; c++) {
            if (indices[j] !== high) {
                indices[j] = high;
                textNodes[j].data = chars[high];
            }
            j++;
            if (indices[j] !== low) {
                indices[j] = low;
                textNodes[j].data = chars[low];
            }
            j++;
        }
    }
};

/**
 * @async
 * @param {string} url
 * @returns {Array<Array<[count: number, byte: number]>>}
 */
const load = async (url='data.bin') => {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to retrieve data. HTTP ${res.status} - ${res.statusText}`);
        
        const buf = await res.arrayBuffer();
        const view = new DataView(buf);
        const frames = [];
        let offset = 0;

        while (offset < buf.byteLength) {
            const pairCount = view.getUint16(offset);
            offset += 2;

            const byteLength = pairCount * 2;
            const frame = new Uint8Array(buf, offset, byteLength);
            frames.push(frame);
            offset += byteLength;
        }
        return frames;
    }
    catch (err) {
        alert('Failed to retrieve data.');
        console.error(err);
    }
    return [];
};

const computeFontScale = () => {
    const c = new OffscreenCanvas(1, 1);
    const ctx = c.getContext('2d');
    const ff = window.getComputedStyle(display).fontFamily || 'monospace';

    const test = 100;
    const htest = test * 0.5;
    ctx.font = `${test}px ${ff}`;

    let scale = 1;
    for (let i = 0; i < CHARACTERS_LIGHT.length; i++) {
        const m = ctx.measureText(CHARACTERS_LIGHT[i]);

        const ascent = m.actualBoundingBoxAscent || htest;
        const descent = m.actualBoundingBoxDescent || htest;
        const height = ascent + descent;

        const left = m.actualBoundingBoxLeft || 0;
        const right = m.actualBoundingBoxRight || test;
        const width = left + right;

        const sh = test / height;
        const sw = test / width;
        scale = Math.min(scale, sh, sw);
    }
    return scale;
};

const resize = () => {
    const rect = display.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const d = Math.min(w, h);
    const m = d * DISPLAY_MARGIN;
    const aw = w - m;
    const ah = h - m;
    let dw, dh;
    if (aw / ah > ASPECT) {
        dh = ah;
        dw = dh * ASPECT;
    }
    else {
        dw = aw;
        dh = dw / ASPECT;
    }
    const cs = dh / HEIGHT;
    display.style.setProperty('--cell-size', `${cs}px`);
    display.style.setProperty('--font-size', `${cs * fontScale}px`);
    display.style.width = `${dw}px`;
    display.style.height = `${dh}px`;
    display.style.left = `${(w - dw) / 2}px`;
    display.style.top = `${(h - dh) / 2}px`;
};

/**
 * @param {number} frame 
 * @returns {string}
 */
const formatTime = frame => {
    const tsec = Math.floor(frame / FPS);
    const min = Math.floor(tsec / 60);
    const sec = tsec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const updateUI = () => {
    scrubber.value = frame;
    const curr = formatTime(frame);
    const total = formatTime(data.length - 1);
    time.textContent = `${curr} / ${total}`;
};

/**
 * @param {number} frame 
 */
const draw = frame => {
    if (!data[frame]) return;
    decodeFrame(data[frame], lit ? CHARACTERS_LIGHT : CHARACTERS_DARK, cellText);
    updateUI();
};

const loop = () => {
    if (!playing) return;

    const audioTime = audio.currentTime;
    const targetFrame = Math.min(Math.floor(audioTime * FPS), data.length - 1);

    if (targetFrame !== frame) {
        frame = targetFrame;
        draw(frame);
    }

    if (audio.ended || frame >= data.length - 1) {
        pause();
        return;
    }

    lid = requestAnimationFrame(loop);
};

async function play() {
    if (playing || data.length === 0) return;
    if (frame >= data.length - 1) {
        frame = 0;
        audio.currentTime = 0;
    }

    try {
        await audio.play();
        playing = true;
        playpause.title = 'Pause';
        pauseico.style.display = 'unset';
        playico.style.display = 'none';

        lid = requestAnimationFrame(loop);
    }
    catch (err) {
        console.warn('Audio playback prevented by browser policy.', err);
        pause();
    }
}

function pause() {
    playing = false;
    audio.pause();
    playpause.title = 'Play';
    playico.style.display = 'unset';
    pauseico.style.display = 'none';
    if (lid) {
        cancelAnimationFrame(lid);
        lid = -1;
    }
}

const togglePlayback = () => {
    if (playing) pause();
    else play();
};

const toggleCharset = () => {
    lit = !lit;
    invert.innerText = lit ? '🌕' : '🌑';
    indices.fill(255);
    draw(frame);
};

/**
 * @async
 */
const init = async () => {
    data = await load();

    if (!data || data.length === 0) {
        alert(`Failed to retrieve data.`);
        return;
    }

    display.style.gridTemplateColumns = `repeat(${WIDTH}, 1fr)`;
    display.style.gridTemplateRows = `repeat(${HEIGHT}, 1fr)`;

    fontScale = computeFontScale();
    display.style.setProperty('--font-scale', fontScale);

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < LENGTH; i++) {
        const span = document.createElement('span');
        const textNode = document.createTextNode('');
        span.appendChild(textNode);
        fragment.appendChild(span);
        cellText[i] = textNode;
    }
    display.appendChild(fragment);

    resize();
    window.addEventListener('resize', resize);

    scrubber.max = data.length - 1;
    scrubber.addEventListener('input', e => {
        frame = Number.parseInt(e.target.value, 10);
        audio.currentTime = frame / FPS;
        indices.fill(255);
        draw(frame);
    });

    playpause.addEventListener('click', togglePlayback);
    invert.addEventListener('click', toggleCharset);

    draw(0);
};

window.addEventListener('DOMContentLoaded', init);