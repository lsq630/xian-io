console.log('✅ client.js 加载成功（完整修仙版）');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- UI 元素 ---
const nameEl = document.getElementById('playerName');
const realmEl = document.getElementById('playerRealm');
const hpEl = document.getElementById('playerHp');
const expEl = document.getElementById('playerExp'); // 新增修为条

// 创建修为条（如果没有，在 HTML 中补一个）
const uiDiv = document.getElementById('ui');
if (!document.getElementById('playerExp')) {
    const expDiv = document.createElement('div');
    expDiv.innerHTML = `<div style="margin-top:6px;font-size:12px;color:#aaa;">修为</div>
                        <div style="width:150px;height:6px;background:#333;border-radius:3px;">
                            <div id="playerExp" style="height:100%;width:0%;background:#9b59b6;border-radius:3px;"></div>
                        </div>`;
    uiDiv.appendChild(expDiv);
}
const expBar = document.getElementById('playerExp');

const socket = io(); // 自动连接当前域名

let players = {};
let monsters = {};
let drops = {};
let myId = null;

// --- Socket 事件 ---
socket.on('connect', () => console.log('✅ 连接服务器'));
socket.on('currentPlayers', (data) => { players = data; myId = socket.id; });
socket.on('currentMonsters', (data) => { monsters = data; });
socket.on('currentDrops', (data) => { drops = data; });
socket.on('playerJoined', (data) => { players[data.id] = data; });
socket.on('playerLeft', (id) => { delete players[id]; });
socket.on('monsterKilled', (data) => { console.log(`💀 妖兽 ${data.id} 被击杀`); });
socket.on('realmUp', (data) => {
    console.log(`🌟 突破！${data.newRealm}`);
    // 可播放特效（这里简单提示）
});
socket.on('playerDied', (data) => {
    if (data.id === myId) alert('💀 你被妖兽击败，已重生！');
});

socket.on('gameState', (state) => {
    // 更新玩家
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
    // 更新妖兽
    monsters = state.monsters || {};
    // 更新掉落物
    drops = state.drops || {};

    // 更新自己的UI
    const me = players[myId];
    if (me) {
        nameEl.textContent = me.name || '无名';
        realmEl.textContent = `境界：${me.realm}`;
        hpEl.style.width = `${Math.max(0, (me.hp / me.maxHp) * 100)}%`;
        if (expBar) {
            const expPercent = me.maxCultivation ? (me.cultivation / me.maxCultivation) * 100 : 0;
            expBar.style.width = `${Math.min(100, expPercent)}%`;
        }
    }
});

// --- 鼠标/键盘交互 ---
canvas.addEventListener('mousemove', (e) => {
    if (!myId) return;
    const rect = canvas.getBoundingClientRect();
    socket.emit('playerMove', { x: e.clientX - rect.left, y: e.clientY - rect.top });
});

// 鼠标点击攻击（或按下空格）
canvas.addEventListener('click', () => {
    socket.emit('playerAttack', {});
});
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        socket.emit('playerAttack', {});
    }
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// --- 渲染循环 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 灵纹点缀
    for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fill();
    }

    // --- 绘制掉落物 ---
    for (const id in drops) {
        const d = drops[id];
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji || '💎', d.x, d.y);
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.fillText(d.name, d.x, d.y + 22);
    }

    // --- 绘制妖兽 ---
    for (const id in monsters) {
        const m = monsters[id];
        // 身体
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        ctx.fillStyle = m.color || '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(m.x - 8, m.y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(m.x + 8, m.y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(m.x - 9, m.y - 8, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(m.x + 7, m.y - 8, 2, 0, Math.PI * 2);
        ctx.fill();
        // 名字和血条
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, m.x, m.y - m.radius - 10);
        const hpPercent = m.hp / m.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(m.x - 25, m.y - m.radius - 18, 50, 5);
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(m.x - 25, m.y - m.radius - 18, 50 * hpPercent, 5);
    }

    // --- 绘制玩家 ---
    for (const id in players) {
        const p = players[id];
        const isMe = (id === myId);
        // 身体
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
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
        // 名字 & 境界
        ctx.fillStyle = isMe ? '#ffd700' : '#c8c8c8';
        ctx.font = `${isMe ? 'bold ' : ''}14px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - p.radius - 12);
        ctx.fillStyle = '#7ec8e3';
        ctx.font = '11px sans-serif';
        ctx.fillText(p.realm || '凡人', p.x, p.y - p.radius - 28);

        // 绘制法宝（围绕玩家）
        if (p.artifacts && p.artifacts.length > 0) {
            p.artifacts.forEach(art => {
                const wx = p.x + Math.cos(art.angle) * art.radius;
                const wy = p.y + Math.sin(art.angle) * art.radius;
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🗡️', wx, wy);
            });
        }

        // 自己的指示光环
        if (isMe) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            // 血量条
            const hpPercent = p.hp / p.maxHp;
            ctx.fillStyle = '#333';
            ctx.fillRect(p.x - 30, p.y - p.radius - 34, 60, 6);
            ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(p.x - 30, p.y - p.radius - 34, 60 * hpPercent, 6);
        }
    }

    requestAnimationFrame(draw);
}
draw();

window.addEventListener('beforeunload', () => socket.disconnect());