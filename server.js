const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

console.log('✅ 服务器脚本开始执行...');

// --- 游戏状态 ---
const players = {};
const monsters = {};

// --- 配置参数 ---
const TICK_RATE = 30;          // 每秒更新30次
const MOVE_SPEED = 3;          // 玩家移动速度
const MONSTER_SPEED = 1.2;     // 妖兽移动速度
const MONSTER_SPAWN_INTERVAL = 5000; // 每5秒生成一只

// --- 生成妖兽 ---
function spawnMonster() {
    const id = 'm' + Date.now() + Math.random();
    const x = 100 + Math.random() * 600;
    const y = 100 + Math.random() * 400;
    monsters[id] = {
        id: id,
        x: x,
        y: y,
        radius: 25,
        hp: 50,
        maxHp: 50,
        damage: 10,
        speed: MONSTER_SPEED,
        color: '#e74c3c',
        name: '青风狼',
    };
    console.log(`🐺 妖兽 ${id} 出现在 (${x.toFixed(0)}, ${y.toFixed(0)})`);
}

// 定时生成妖兽
setInterval(spawnMonster, MONSTER_SPAWN_INTERVAL);
// 开局先刷两只
setTimeout(() => { spawnMonster(); spawnMonster(); }, 1000);

// --- Socket.IO 事件处理 ---
io.on('connection', (socket) => {
    console.log(`✨ 修仙者 [${socket.id}] 进入了秘境`);

    // 初始化玩家
    players[socket.id] = {
        id: socket.id,
        x: 200 + Math.random() * 200,
        y: 200 + Math.random() * 200,
        name: `散修_${Math.floor(Math.random() * 1000)}`,
        realm: '炼气期',
        realmLevel: 1,
        cultivation: 0,
        maxCultivation: 100,
        hp: 100,
        maxHp: 100,
        attack: 10,
        defense: 2,
        radius: 18,
        targetX: null,
        targetY: null,
    };

    // 发送当前所有玩家和妖兽
    socket.emit('currentPlayers', players);
    socket.emit('currentMonsters', monsters);

    // 广播新玩家
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 监听移动
    socket.on('playerMove', (data) => {
        const player = players[socket.id];
        if (player) {
            player.targetX = data.x;
            player.targetY = data.y;
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log(`💨 修仙者 [${socket.id}] 离开了秘境`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// --- 游戏主循环（更新所有逻辑） ---
setInterval(() => {
    // 1. 移动玩家（平滑插值）
    for (const id in players) {
        const p = players[id];
        if (p.targetX !== null && p.targetY !== null) {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
                const step = Math.min(dist, MOVE_SPEED);
                p.x += (dx / dist) * step;
                p.y += (dy / dist) * step;
            }
        }
    }

    // 2. 妖兽 AI：追击最近的玩家
    for (const mId in monsters) {
        const monster = monsters[mId];
        let nearest = null;
        let minDist = Infinity;
        for (const pId in players) {
            const p = players[pId];
            const d = Math.hypot(p.x - monster.x, p.y - monster.y);
            if (d < minDist) {
                minDist = d;
                nearest = p;
            }
        }
        if (nearest && minDist < 300) { // 检测范围内才追击
            const dx = nearest.x - monster.x;
            const dy = nearest.y - monster.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                const step = Math.min(dist, monster.speed);
                monster.x += (dx / dist) * step;
                monster.y += (dy / dist) * step;
            }
            // 碰撞检测：妖兽碰到玩家，玩家掉血
            if (dist < monster.radius + nearest.radius) {
                nearest.hp -= monster.damage * 0.2; // 每次碰撞掉2点血
                if (nearest.hp <= 0) {
                    // 玩家死亡（简单处理：重置位置和血量）
                    nearest.hp = nearest.maxHp;
                    nearest.x = 200 + Math.random() * 200;
                    nearest.y = 200 + Math.random() * 200;
                    nearest.targetX = nearest.x;
                    nearest.targetY = nearest.y;
                    // 广播死亡事件（可选）
                    io.emit('playerDied', { id: nearest.id });
                }
            }
        }
    }

    // 3. 检查玩家是否击杀妖兽（玩家主动攻击，暂时用手动点击模拟，或者后续用法宝）
    // 目前简化：玩家靠近妖兽并按下空格键攻击（暂不实现，留待法宝系统）

    // 4. 广播所有状态
    io.emit('gameState', { players, monsters });
}, 1000 / TICK_RATE);

// --- 启动服务器 ---
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 修仙秘境已开启，请访问 http://localhost:${PORT}`);
});