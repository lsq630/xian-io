console.log('✅ client.js 加载（含账户系统）');

// --- DOM 元素 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const loginOverlay = document.getElementById('loginOverlay');
const registerOverlay = document.getElementById('registerOverlay');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginMessage = document.getElementById('loginMessage');
const registerUsername = document.getElementById('registerUsername');
const registerPassword = document.getElementById('registerPassword');
const registerPasswordConfirm = document.getElementById('registerPasswordConfirm')
const registerBtn = document.getElementById('registerBtn');
const registerMessage = document.getElementById('registerMessage');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');

// --- 游戏状态 ---
let players = {};
let monsters = {};
let drops = {};
let myId = null;
let myUsername = null;
let authToken = null;

// --- Socket 连接（延迟连接，先不自动连接） ---
let socket = null;

// --- 辅助函数 ---
function showMessage(el, msg, isError = true) {
    el.textContent = msg;
    el.style.color = isError ? '#ff6b6b' : '#6bff6b';
}

// --- 登录 ---
async function login(username, password) {
    if (!socket) socket = io();
    socket.emit('login', { username, password });
    // 等待结果（通过事件监听处理）
}

// --- 注册 ---
async function register(username, password) {
    if (!socket) socket = io();
    socket.emit('register', { username, password });
}

// --- 进入游戏（收到 token 后） ---
function enterGame(token) {
    if (!socket) socket = io();
    socket.emit('enterGame', { token });
}

// --- Socket 事件绑定 ---
function setupSocketEvents() {
    socket.on('connect', () => console.log('🔗 已连接到服务器'));

    socket.on('loginResult', (data) => {
        if (data.success) {
            showMessage(loginMessage, '登录成功！', false);
            authToken = data.token;
            myUsername = data.username;
            // 保存 token 到 localStorage
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('username', data.username);
            // 进入游戏
            enterGame(data.token);
        } else {
            showMessage(loginMessage, data.message);
        }
    });

    socket.on('registerResult', (data) => {
        if (data.success) {
            showMessage(registerMessage, data.message, false);
            setTimeout(() => {
                registerOverlay.style.display = 'none';
                loginOverlay.style.display = 'flex';
            }, 1000);
        } else {
            showMessage(registerMessage, data.message);
        }
    });

    socket.on('enterGameResult', (data) => {
        if (data.success) {
            // 隐藏登录界面
            loginOverlay.style.display = 'none';
            registerOverlay.style.display = 'none';
            // 开始游戏渲染（已经在后面启动）
            console.log('🎮 进入游戏成功');
        } else {
            showMessage(loginMessage, data.message);
        }
    });

    socket.on('kicked', (data) => {
        alert(data.message);
        // 退出登录状态
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        location.reload();
    });

    // 原有游戏事件（与之前相同，但需要重新绑定）
    socket.on('currentPlayers', (data) => { players = data; myId = socket.id; });
    socket.on('currentMonsters', (data) => { monsters = data; });
    socket.on('currentDrops', (data) => { drops = data; });
    socket.on('playerJoined', (data) => { players[data.id] = data; });
    socket.on('playerLeft', (id) => { delete players[id]; });
    socket.on('monsterKilled', (data) => { console.log(`💀 妖兽 ${data.id} 被击杀`); });
    socket.on('realmUp', (data) => { console.log(`🌟 突破！${data.newRealm}`); });
    socket.on('playerDied', (data) => {
        if (data.id === myId) alert('💀 你被妖兽击败，已重生！修为保留。');
    });

    socket.on('gameState', (state) => {
        console.log('📡 收到游戏状态，妖兽数量:', Object.keys(state.monsters).length);
        monsters = state.monsters || {};
        for (const id in state.players) {
            if (players[id]) {
                players[id].x = state.players[id].x;
                players[id].y = state.players[id].y;
                players[id].hp = state.players[id].hp;
                players[id].cultivation = state.players[id].cultivation;
                players[id].maxCultivation = state.players[id].maxCultivation;
                players[id].realm = state.players[id].realm;
                players[id].artifacts = state.players[id].artifacts || [];
            } else {
                players[id] = state.players[id];
            }
        }
        monsters = state.monsters || {};
        drops = state.drops || {};
        // UI 更新（如果你有 UI 元素）
        updateUI();
    });
}

// --- UI 更新（可复用原来的） ---
function updateUI() {
    const me = players[myId];
    if (!me) return;
    // ... 更新名称、境界、血量条等
    const expBar = document.getElementById('playerExp');
    const expText = document.getElementById('expText');
    const expPercent = document.getElementById('expPercent');
    if (expBar) {
        const percent = me.maxCultivation ? (me.cultivation / me.maxCultivation) * 100 : 0;
        expBar.style.width = `${Math.min(100, percent)}%`;
    }
    if (expText) {
        expText.textContent = `${Math.floor(me.cultivation)} / ${me.maxCultivation}`;
    }
    if (expPercent) {
        const percent = me.maxCultivation ? (me.cultivation / me.maxCultivation) * 100 : 0;
        expPercent.textContent = `${Math.min(100, percent).toFixed(1)}%`;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const me = players[myId];
    let offsetX = 0, offsetY = 0;
    if (me) {
        offsetX = canvas.width / 2 - me.x;
        offsetY = canvas.height / 2 - me.y;
    } else {
        // 如果没有自身玩家，偏移量置0，并绘制其他实体（如果有）
        console.warn('⚠️ 自身玩家数据缺失，偏移量为0');
    }
    // 调试：打印实体数量
    console.log(`绘制：玩家 ${Object.keys(players).length} 个，妖兽 ${Object.keys(monsters).length} 个，掉落物 ${Object.keys(drops).length} 个`);
    // 灵纹点缀
    for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fill();
    }

    // --- 绘制掉落物（坐标加偏移） ---
    for (const id in drops) {
        const d = drops[id];
        const drawX = d.x + offsetX;
        const drawY = d.y + offsetY;
        if (drawX < -100 || drawX > canvas.width + 100 || drawY < -100 || drawY > canvas.height + 100) continue;
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji || '💎', drawX, drawY);
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.fillText(d.name, drawX, drawY + 22);
    }

    // --- 绘制妖兽（坐标加偏移） ---
    for (const id in monsters) {
        const m = monsters[id];
        const drawX = m.x + offsetX;
        const drawY = m.y + offsetY;
        if (drawX < -100 || drawX > canvas.width + 100 || drawY < -100 || drawY > canvas.height + 100) continue;
        // 身体
        ctx.beginPath();
        ctx.arc(drawX, drawY, m.radius, 0, Math.PI * 2);
        ctx.fillStyle = m.color || '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(drawX - 8, drawY - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 8, drawY - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(drawX - 9, drawY - 8, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 7, drawY - 8, 2, 0, Math.PI * 2);
        ctx.fill();
        // 名字和血条
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, drawX, drawY - m.radius - 10);
        const hpPercent = m.hp / m.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(drawX - 25, drawY - m.radius - 18, 50, 5);
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(drawX - 25, drawY - m.radius - 18, 50 * hpPercent, 5);
    }

    // --- 绘制玩家 ---
    for (const id in players) {
        const p = players[id];
        const isMe = (id === myId);
        const drawX = p.x + offsetX;
        const drawY = p.y + offsetY;
        if (drawX < -100 || drawX > canvas.width + 100 || drawY < -100 || drawY > canvas.height + 100) continue;
        // 身体
        ctx.beginPath();
        ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(p.x-5, p.y-5, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, isMe ? '#f5e6d3' : '#d4c5a9');
        grad.addColorStop(1, isMe ? '#c4a882' : '#a88b6e');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = isMe ? '#ffd700' : '#8a7a6a';
        ctx.lineWidth = isMe ? 2.5 : 1.5;
        ctx.stroke();
        // 道袍
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.radius * 0.3, p.radius * 0.85, 0, Math.PI);
        ctx.fillStyle = isMe ? 'rgba(60, 130, 210, 0.7)' : 'rgba(100, 100, 120, 0.5)';
        ctx.fill();
        // 名字和境界
        ctx.fillStyle = isMe ? '#ffd700' : '#c8c8c8';
        ctx.font = `${isMe ? 'bold ' : ''}14px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.username || p.name || '无名', drawX, drawY - p.radius - 12);
        ctx.fillStyle = '#7ec8e3';
        ctx.font = '11px sans-serif';
        ctx.fillText(p.realm || '凡人', drawX, drawY - p.radius - 28);

        // 法宝
        if (p.artifacts && p.artifacts.length > 0) {
            p.artifacts.forEach(art => {
                const wx = p.x + Math.cos(art.angle) * art.radius + offsetX;
                const wy = p.y + Math.sin(art.angle) * art.radius + offsetY;
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🗡️', wx, wy);
            });
        }                                                                                                                                                                                                                      

        // 自己的指示光环和血量条
        if (isMe) {
            ctx.beginPath();
            ctx.arc(drawX, drawY, p.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            // 血量条
            const hpPercent = p.hp / p.maxHp;
            ctx.fillStyle = '#333';
            ctx.fillRect(drawX - 30, drawY - p.radius - 34, 60, 6);
            ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(drawX - 30, drawY - p.radius - 34, 60 * hpPercent, 6);
        }
    }

    requestAnimationFrame(draw);
}

window.addEventListener('beforeunload', () => {
    if (socket) socket.disconnect();
});

// --- 初始化 ---
function init() {
    // 创建 socket 连接
    socket = io('https://xian-io.onrender.com');
    setupSocketEvents();

    // 检查 localStorage 是否有 token
    const savedToken = localStorage.getItem('authToken');
    const savedUsername = localStorage.getItem('username');
    if (savedToken && savedUsername) {
        // 尝试自动登录
        loginUsername.value = savedUsername;
        loginPassword.value = ''; // 密码需重新输入，或者我们也可增加“记住密码”功能（不推荐明文存储）
        // 但我们仍显示登录界面，让用户输入密码或点击登录，但可以自动填充用户名
        showMessage(loginMessage, `欢迎回来，${savedUsername}，请输密码登录`, false);
    }

    // 绑定按钮事件
    loginBtn.onclick = () => {
        const uname = loginUsername.value.trim();
        const pwd = loginPassword.value.trim();
        if (!uname || !pwd) {
            showMessage(loginMessage, '请填写完整信息');
            return;
        }
        login(uname, pwd);
    };

    registerBtn.onclick = () => {
        const uname = registerUsername.value.trim();
        const pwd = registerPassword.value.trim();
        const pwdConfirm = registerPasswordConfirm.value.trim();
        if (!uname || !pwd || !pwdConfirm) {
            showMessage(registerMessage, '请填写完整信息');
            return;
        }
        if (pwd !== pwdConfirm) {
            showMessage(registerMessage, '两次输入的密码不一致');
            return;
        }
        register(uname, pwd);
    };

    showRegister.onclick = () => {
        loginOverlay.style.display = 'none';
        registerOverlay.style.display = 'flex';
    };
    showLogin.onclick = () => {
        registerOverlay.style.display = 'none';
        loginOverlay.style.display = 'flex';
    };

    // 回车键触发登录
    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });
    registerPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerBtn.click();
    });
    registerPasswordConfirm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerBtn.click();
    });

    // 鼠标/键盘交互
    canvas.addEventListener('mousemove', (e) => {
        if (!myId || !socket) return;
        const rect = canvas.getBoundingClientRect();
        socket.emit('playerMove', { x: e.clientX - rect.left, y: e.clientY - rect.top });
    });
    canvas.addEventListener('click', () => {
        if (socket) socket.emit('playerAttack', {});
    });
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            if (socket) socket.emit('playerAttack', {});
        }
    });

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // 启动渲染循环
    draw();
}

// 页面加载时初始化
init();