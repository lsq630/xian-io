console.log('✅ client.js 已加载（含妖兽）');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const socket = io();

let players = {};
let monsters = {};
let myId = null;

// --- Socket 事件 ---
socket.on('connect', () => {
    console.log('✅ 已连接到服务器，ID:', socket.id);
});

socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    myId = socket.id;
});

socket.on('currentMonsters', (serverMonsters) => {
    monsters = serverMonsters;
});

socket.on('playerJoined', (playerData) => {
    players[playerData.id] = playerData;
});

socket.on('playerLeft', (id) => {
    delete players[id];
});

socket.on('gameState', (state) => {
    // 更新玩家
    for (const id in state.players) {
        if (players[id]) {
            players[id].x = state.players[id].x;
            players[id].y = state.players[id].y;
            players[id].hp = state.players[id].hp;
        } else {
            players[id] = state.players[id];
        }
    }
    // 更新妖兽
    monsters = state.monsters || {};
});

socket.on('playerDied', (data) => {
    console.log(`💀 ${data.id} 被击杀了`);
});

// --- 鼠标移动 ---
canvas.addEventListener('mousemove', (e) => {
    if (!myId) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    socket.emit('playerMove', { x, y });
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// --- 渲染循环 ---
function draw() {
    // 背景
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制妖兽
    for (const id in monsters) {
        const m = monsters[id];
        // 身体（红色）
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        ctx.fillStyle = m.color || '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 眼睛（两个白点）
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
        ctx.fillText(m.name || '妖兽', m.x, m.y - m.radius - 8);
        // 血条
        const hpPercent = m.hp / m.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(m.x - 25, m.y - m.radius - 20, 50, 5);
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(m.x - 25, m.y - m.radius - 20, 50 * hpPercent, 5);
    }

    // 绘制玩家
    for (const id in players) {
        const p = players[id];
        const isMe = (id === myId);
        // 身体
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(p.x-5, p.y-5, 0, p.x, p.y, p.radius);
        gradient.addColorStop(0, isMe ? '#f5e6d3' : '#d4c5a9');
        gradient.addColorStop(1, isMe ? '#c4a882' : '#a88b6e');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = isMe ? '#ffd700' : '#8a7a6a';
        ctx.lineWidth = isMe ? 2.5 : 1.5;
        ctx.stroke();
        // 名字和境界
        ctx.fillStyle = isMe ? '#ffd700' : '#c8c8c8';
        ctx.font = `${isMe ? 'bold ' : ''}14px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - p.radius - 12);
        ctx.fillStyle = '#7ec8e3';
        ctx.font = '11px sans-serif';
        ctx.fillText(p.realm || '凡人', p.x, p.y - p.radius - 28);
        // 自己的光环
        if (isMe) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            // 血量条（玩家头顶）
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

window.addEventListener('beforeunload', () => {
    socket.disconnect();
});