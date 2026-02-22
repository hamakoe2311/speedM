// =================================================================
//  ▼ ドット絵データ (LED用)
// =================================================================
const TRAIN_GRAPHICS = [
    "                                                                                                                                                      ",
    "                                                                                                                                                      ",
    "                                                                                                                                                      ",
    "                                                                                                                                                      ",
    "                                                                                                                                                      ",
    "                                               ..                                                                                                     ",
    "                      ...................      .                                                                                                     ",
    "                     . .    .    .    ....................................  ................................................................  ........",
    "                    .  .    .    .    ....    ...    ...    ...    ...  ..  ..    ...    ...    ...    ...    ...    ...    ...    .........  ........",
    "                   .  ..    .    .    ...      .      .      .      .    .  .      .      .      .      .      .      .      .      ........  ........",
    "                  .......................      .      .      .      .    .  .      .      .      .      .      .      .      .      ........  ........",
    "                 .   .....................    ...    ...    ...    ...  ..  ..    ...    ...    ...    ...    ...    ...    ...    .........  ........",
    "                .   ......................................................  ................................................................  ........",
    "                ..........................................................  ................................................................  ........",
    "                ....  ..      ..                            ..      ..   ....   ..      ..                                    ..       ..  ....  ..   ",
    "                .    .  .    .  .                          .  .    .  .        .  .    .  .                                  .   .    .  .      .  .  ",
    "                      ..      ..                            ..      ..          ..      ..                                    ..       ..        ..   ",
    "......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......  ......",
    "                                                                                                                                                      ",
    "                                                                                                                                                      " 
];

// === 定数・設定 ===
const LED_HEIGHT = 30;
const LED_WIDTH_TOTAL = 180; 
const MAX_SPEED_DEMO = 160;

// 計器スタイルのリスト (Meter 5削除)
const METER_STYLES = [
    { id: 'meter-1', type: 'analog', max: 140, needleId: 'needle-1' },
    { id: 'meter-2', type: 'analog', max: 120, needleId: 'needle-2' },
    { id: 'meter-3', type: 'cockpit' },
    { id: 'meter-4', type: 'retro-box' }
];

// === 状態管理 ===
const state = {
    speed: 0,
    targetSpeed: 0,   
    notch: 0,         
    mode: 'demo',     
    meterIndex: 0,    
    isShinkansen: false,
    
    // 物理挙動用
    needleAngle: -135,
    needleVelocity: 0,
    
    // ATCシミュレーション用
    atcLimit: 270,
    atcBraking: false,
    lastAtcUpdate: 0
};

// GPS用
let lastPosition = null;
let lastTime = null;
let wakeLock = null;
let watchId = null;

// Canvas
const ledCanvas = document.getElementById('led-canvas');
const ctx = ledCanvas.getContext('2d', { alpha: false });
let railOffset = 0;

// DOM Elements
const els = {
    meterContainer: document.getElementById('meter-container'),
    modeVal: document.getElementById('mode-val'),
    notchVal: document.getElementById('notch-val'),
    controls: document.getElementById('controls'),
    shPanel: document.getElementById('shinkansen-panel'),
    shControlsPlace: document.getElementById('sh-controls-placeholder'),
    dashboard: document.getElementById('dashboard'),
    
    // Shinkansen
    shVal: document.getElementById('sh-val'),
    shBar: document.getElementById('sh-bar'),
    shMarker: document.getElementById('sh-marker'),
    shLimit: document.getElementById('sh-limit-val'),
    shRing: document.getElementById('sh-atc-ring'),
    shMsg: document.getElementById('sh-msg'),

    // Meter 3 (Cockpit)
    cockpitSpeed: document.getElementById('cockpit-speed-val'),
    cockpitBarFill: document.getElementById('bar-fill'),
    cockpitAtcVal: document.getElementById('cockpit-atc-val'),
    cockpitAtcSignal: document.getElementById('cockpit-atc-signal'),

    // Meter 4 (Retro)
    retroSpeed: document.getElementById('retro-speed-val'),
};

// === 初期化 ===
window.onload = () => {
    initCanvas();
    initMeters();
    setupEvents();
    updateMeterVisibility();
    requestAnimationFrame(gameLoop);
};

function initCanvas() {
    ledCanvas.width = LED_WIDTH_TOTAL; 
    ledCanvas.height = LED_HEIGHT;
    ctx.imageSmoothingEnabled = false;
}

function initMeters() {
    // Type 1 (White)
    drawTicks(document.getElementById('analog-face-1'), 140, 20);
    // Type 2 (Black)
    drawTicks(document.getElementById('analog-face-2'), 120, 20);

    // Type 3 (Cockpit Bar Setup)
    const bar = document.getElementById('bar-fill');
    if(bar) {
        const length = bar.getTotalLength();
        bar.style.strokeDasharray = length;
        bar.style.strokeDashoffset = length; // 初期状態は非表示
        bar.dataset.totalLength = length;
    }
}

function drawTicks(container, maxSpeed, step, scale = 1.0) {
    for (let i = 0; i <= maxSpeed; i += 5) {
        const ratio = i / maxSpeed;
        const angle = -135 + (ratio * 270);
        
        const isLarge = (i % step === 0);
        const tick = document.createElement('div');
        tick.className = isLarge ? 'tick large' : 'tick';
        
        const dist = isLarge ? 42 : 45;
        tick.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-${125 * scale}px)`;
        container.appendChild(tick);

        if (isLarge) {
            const num = document.createElement('div');
            num.className = 'num';
            num.textContent = i;
            const rad = (angle - 90) * (Math.PI / 180);
            const r = 32 * scale;
            const left = 50 + Math.cos(rad) * r;
            const top = 50 + Math.sin(rad) * r;
            num.style.left = `${left}%`;
            num.style.top = `${top}%`;
            container.appendChild(num);
        }
    }
}

// === イベント登録 ===
function setupEvents() {
    const bindBtn = (id, downFn, upFn, clickFn) => {
        const btn = document.getElementById(id);
        if(!btn) return;
        if(downFn) {
            btn.addEventListener('mousedown', downFn);
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); downFn(); }, {passive: false});
        }
        if(upFn) {
            btn.addEventListener('mouseup', upFn);
            btn.addEventListener('touchend', (e) => { e.preventDefault(); upFn(); }, {passive: false});
        }
        if(clickFn) {
            btn.addEventListener('click', clickFn);
        }
    };

    bindBtn('btn-accel', () => setNotch(1), () => setNotch(0));
    bindBtn('btn-brake', () => setNotch(-1), () => setNotch(0));
    bindBtn('btn-coast', null, null, () => setNotch(0));

    document.getElementById('btn-change').addEventListener('click', toggleMeter);
    document.getElementById('btn-gps').addEventListener('click', toggleGPS);
    document.getElementById('btn-shinkansen').addEventListener('click', toggleShinkansen);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            lastTime = Date.now();
            requestAnimationFrame(gameLoop);
        }
    });
}

// === メインループ ===
function gameLoop() {
    if (document.hidden) return;

    updatePhysics();
    updateATC();
    drawLED();
    drawMeters();

    requestAnimationFrame(gameLoop);
}

// === 物理演算 ===
function updatePhysics() {
    if (state.mode === 'gps') {
        const diff = state.targetSpeed - state.speed;
        if (Math.abs(diff) > 0.1) state.speed += diff * 0.05;
        else state.speed = state.targetSpeed;
    } else {
        if (state.atcBraking) {
            if (state.speed > 0) state.speed -= 0.8; 
        } else {
            if (state.notch === 1) {
                if (state.speed < MAX_SPEED_DEMO) state.speed += 0.4;
            } else if (state.notch === -1) {
                if (state.speed > 0) state.speed -= 0.6;
            } else {
                if (state.speed > 0) state.speed -= 0.02;
            }
        }
        if (state.speed < 0) state.speed = 0;
    }

    // アナログ針の物理 (バネ・ダンパー)
    const currentMax = METER_STYLES[state.meterIndex].max || 140;
    const displaySpeed = Math.min(state.speed, currentMax * 1.1);
    
    const targetAngle = -135 + (displaySpeed / currentMax) * 270;
    const k = 0.08; 
    const d = 0.85; 
    
    const force = (targetAngle - state.needleAngle) * k;
    state.needleVelocity += force;
    state.needleVelocity *= d;
    state.needleAngle += state.needleVelocity;

    if (state.speed > 0) {
        railOffset += state.speed * 0.02;
    }
}

// === ATC制御 ===
function updateATC() {
    const isCockpit = (METER_STYLES[state.meterIndex].type === 'cockpit');
    // 新幹線モードまたはコクピットモード(Meter3)で動作
    if ((!state.isShinkansen && !isCockpit) || state.mode === 'gps') return;

    const now = Date.now();
    if (now - state.lastAtcUpdate > 5000) { 
        const signals = [0, 30, 70, 120, 170, 230, 270, 300];
        const r = Math.random();
        if (r > 0.7) {
             state.atcLimit = signals[Math.floor(Math.random() * signals.length)];
        } else if (r > 0.4) {
             state.atcLimit = 300; // 進行
        }
        state.lastAtcUpdate = now;
    }

    // ブレーキ判定
    if (state.speed > state.atcLimit + 2) {
        state.atcBraking = true;
        els.shMsg.style.display = 'block';
        els.shRing.classList.remove('signal-green');
        els.shRing.classList.add('signal-red');
        
        // Cockpit UI update
        if(els.cockpitAtcSignal) els.cockpitAtcSignal.style.borderColor = '#f44336';
    } else if (state.speed < state.atcLimit - 5) {
        state.atcBraking = false;
        els.shMsg.style.display = 'none';
        els.shRing.classList.add('signal-green');
        els.shRing.classList.remove('signal-red');

        // Cockpit UI update
        if(els.cockpitAtcSignal) els.cockpitAtcSignal.style.borderColor = '#00e676';
    }

    els.shLimit.textContent = state.atcLimit;
}

// === 描画 ===
function drawMeters() {
    const intSpeed = Math.floor(state.speed);

    // 1. 新幹線オーバーレイ
    if (state.isShinkansen) {
        els.shVal.textContent = intSpeed;
        const ratio = Math.min(state.speed / 320, 1) * 100;
        els.shBar.style.width = `${ratio}%`;
        els.shMarker.style.left = `${ratio}%`;
        return;
    }

    // 2. メイン計器
    const style = METER_STYLES[state.meterIndex];

    if (style.type === 'analog') {
        const needle = document.getElementById(style.needleId);
        if(needle) needle.style.transform = `translate(-50%, -90%) rotate(${state.needleAngle}deg)`;
    }
    else if (style.type === 'cockpit') {
        els.cockpitSpeed.textContent = intSpeed;
        els.cockpitAtcVal.textContent = state.atcLimit;
        
        // SVGバーグラフ制御
        if (els.cockpitBarFill) {
            const total = parseFloat(els.cockpitBarFill.dataset.totalLength);
            // 350km/hでフル
            const pct = Math.min(state.speed / 350, 1);
            const offset = total * (1 - pct);
            els.cockpitBarFill.style.strokeDashoffset = offset;
        }
    }
    else if (style.type === 'retro-box') {
        els.retroSpeed.textContent = intSpeed;
    }
}

// === LED描画 (変更なし) ===
function drawLED() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ledCanvas.width, ledCanvas.height);

    const speedNum = state.speed;
    const text = Math.floor(speedNum).toString();
    ctx.fillStyle = '#FD7E00';
    // DSEGではなくCinzel/Serifで描画
    ctx.font = 'bold 16px "Cinzel", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 2, LED_HEIGHT / 2);
    
    const textWidth = ctx.measureText(text).width;
    ctx.font = 'bold 10px "Cinzel", serif';
    ctx.fillText('k', 2 + textWidth + 1, (LED_HEIGHT / 2) + 2);

    const startX = ledCanvas.width; 
    const targetX = 2 + textWidth + 15;
    
    let trainX = startX;
    if (speedNum >= 120) trainX = targetX;
    else if (speedNum > 40) {
        const ratio = (speedNum - 40) / (80);
        trainX = startX - (ratio * (startX - targetX));
    }

    const vOffset = 5;
    const RAIL_ROW = 17;

    for (let y = 0; y < TRAIN_GRAPHICS.length; y++) {
        const rowStr = TRAIN_GRAPHICS[y];
        if (y === RAIL_ROW) {
            for (let cx = 0; cx < ledCanvas.width; cx++) {
                let charIndex = Math.floor(cx - railOffset) % rowStr.length;
                if (charIndex < 0) charIndex += rowStr.length;
                if (rowStr[charIndex] === '.') ctx.fillRect(cx, y + vOffset, 1, 1);
            }
        } else {
            for (let x = 0; x < rowStr.length; x++) {
                if (x >= 150) break;
                if (rowStr[x] === '.') {
                    const drawX = Math.floor(trainX) + x;
                    if (drawX >= 0 && drawX < ledCanvas.width) ctx.fillRect(drawX, y + vOffset, 1, 1);
                }
            }
        }
    }
}

// === 操作関数 ===
function setNotch(val) {
    if (state.mode === 'gps') return;
    state.notch = val;
    let t = "N (惰行)";
    if (val === 1) t = "P (加速)";
    if (val === -1) t = "B (減速)";
    els.notchVal.textContent = t;
}

function toggleMeter() {
    const prev = document.getElementById(METER_STYLES[state.meterIndex].id);
    prev.classList.remove('active');
    state.meterIndex = (state.meterIndex + 1) % METER_STYLES.length;
    const next = document.getElementById(METER_STYLES[state.meterIndex].id);
    next.classList.add('active');
}

function updateMeterVisibility() {
    METER_STYLES.forEach((m, i) => {
        const el = document.getElementById(m.id);
        if (i === state.meterIndex) el.classList.add('active');
        else el.classList.remove('active');
    });
}

function toggleShinkansen() {
    state.isShinkansen = !state.isShinkansen;
    if (state.isShinkansen) {
        els.shControlsPlace.appendChild(els.controls);
        els.shPanel.classList.add('active');
        state.atcLimit = 270;
    } else {
        els.dashboard.appendChild(els.controls);
        els.shPanel.classList.remove('active');
    }
}

// === GPS処理 ===
async function toggleGPS() {
    const btn = document.getElementById('btn-gps');
    
    if (state.mode === 'demo') {
        if (!navigator.geolocation) {
            alert("GPS非対応です");
            return;
        }
        try {
            if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        } catch(e) { console.log(e); }

        state.mode = 'gps';
        els.modeVal.textContent = "GPS捕捉中";
        els.modeVal.style.color = "#4db6ac";
        btn.classList.add('active');
        document.getElementById('manual-row').style.opacity = '0.3';
        document.getElementById('manual-row').style.pointerEvents = 'none';

        watchId = navigator.geolocation.watchPosition(
            position => {
                const speedMS = calculateSpeed(position);
                state.targetSpeed = speedMS * 3.6;
                els.modeVal.textContent = "GPS受信中";
            },
            err => {
                console.error(err);
                alert("位置情報を取得できません");
                toggleGPS();
            },
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    } else {
        state.mode = 'demo';
        els.modeVal.textContent = "DEMO";
        els.modeVal.style.color = "#fff";
        btn.classList.remove('active');
        if (watchId) navigator.geolocation.clearWatch(watchId);
        if (wakeLock) wakeLock.release().catch(e=>{});
        state.targetSpeed = 0;
        document.getElementById('manual-row').style.opacity = '1';
        document.getElementById('manual-row').style.pointerEvents = 'auto';
    }
}

function calculateSpeed(position) {
    if (position.coords.speed !== null && position.coords.speed >= 0) {
        lastPosition = position;
        lastTime = Date.now();
        return position.coords.speed;
    }
    if (!lastPosition) {
        lastPosition = position;
        lastTime = Date.now();
        return 0;
    }
    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff < 1) return 0;

    const dist = getDistanceFromLatLonInM(
        lastPosition.coords.latitude, lastPosition.coords.longitude,
        position.coords.latitude, position.coords.longitude
    );
    const calcSpeed = dist / timeDiff;
    lastPosition = position;
    lastTime = now;
    return calcSpeed;
}

function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371000; 
    const dLat = deg2rad(lat2-lat1);
    const dLon = deg2rad(lon2-lon1); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
              Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}
function deg2rad(deg) { return deg * (Math.PI/180); }