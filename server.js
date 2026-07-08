const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

console.log('✅ 修仙秘境服务器启动中...');

// --- 常量配置 ---
const TICK_RATE = 30;
const PLAYER_SPEED = 3;
const MONSTER_BASE_SPEED = 1.2;
const MONSTER_SPAWN_INTERVAL = 4000;
const DROP_LIFETIME = 15000;
const HP_REGEN_RATE = 2;
const HEAL_POTION_AMOUNT = 30;
const DATA_FILE = path.join(__dirname, 'players.json');

// --- 境界系统 ---
const REALMS = [
    { name: '炼气期', level: 1, maxCultivation: 100, hpBonus: 0, attackBonus: 0 },
    { name: '筑基期', level: 2, maxCultivation: 300, hpBonus: 20, attackBonus: 5 },
    { name: '金丹期', level: 3, maxCultivation: 800, hpBonus: 50, attackBonus: 15 },
    { name: '元婴期', level: 4, maxCultivation: 2000, hpBonus: 100, attackBonus: 30 },
    { name: '化神期', level: 5, maxCultivation: 5000, hpBonus: 200, attackBonus: 60 },
];

// --- 游戏状态（内存） ---
const players = {};        // socket.id -> 玩家对象（游戏中使用）
const monsters = {};
const drops = {};
const sessions = {};       // token -> username
let playersData = {};      // username -> 永久数据（从文件加载）

// --- 工具函数 ---
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function getRealmIndex(realmName) { return REALMS.findIndex(r => r.name === realmName); }

// --- 文件读写 ---
async function loadPlayersData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        playersData = JSON.parse(data);
    } catch (err) {
        playersData = {};
        await savePlayersData();
    }
}
async function savePlayersData() {
    await fs.writeFile(DATA_FILE, JSON.stringify(playersData, null, 2));
}

// --- 根据用户名创建玩家数据 ---
function createPlayerData(username) {
    const initialRealm = REALMS[0];
    return {
        username,
        passwordHash: '', // 注册时设置
        realm: initialRealm.name,
        realmLevel: initialRealm.level,
        cultivation: 0,
        maxCultivation: initialRealm.maxCultivation,
        hp: 100,
        maxHp: 100,
        attack: 10,
        defense: 2,
        artifacts: [],
        inventory: [],
    };
}

// --- 从持久数据构建游戏玩家对象 ---
function buildGamePlayer(username, socketId) {
    const data = playersData[username];
    if (!data) return null;
    return {
        id: socketId,
        username: username,
        x: 200 + Math.random() * 200,
        y: 200 + Math.random() * 200,
        targetX: null,
        targetY: null,
        realm: data.realm,
        realmLevel: data.realmLevel,
        cultivation: data.cultivation,
        maxCultivation: data.maxCultivation,
        hp: data.hp,
        maxHp: data.maxHp,
        attack: data.attack,
        defense: data.defense,
        radius: 18,
        speed: PLAYER_SPEED,
        artifacts: data.artifacts || [],
        inventory: data.inventory || [],
        attackCooldown: 0,
    };
}

// --- 保存玩家数据回文件（从游戏对象同步） ---
function syncPlayerData(socketId) {
    const p = players[socketId];
    if (!p) return;
    const username = p.username;
    if (!playersData[username]) return;
    const data = playersData[username];
    data.realm = p.realm;
    data.realmLevel = p.realmLevel;
    data.cultivation = p.cultivation;
    data.maxCultivation = p.maxCultivation;
    data.hp = p.hp;
    data.maxHp = p.maxHp;
    data.attack = p.attack;
    data.defense = p.defense;
    data.artifacts = p.artifacts;
    data.inventory = p.inventory;
}

// --- 妖兽生成 ---
function spawnMonster() {
    const types = [
        { name: '青风狼', radius: 22, hp: 60, damage: 12, speed: 1.4, color: '#6f9e6f', exp: 30 },
        { name: '赤焰虎', radius: 30, hp: 120, damage: 20, speed: 1.8, color: '#cc5533', exp: 60 },
        { name: '玄冰龟', radius: 35, hp: 200, damage: 8, speed: 0.8, color: '#4a90d9', exp: 100 },
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const id = genId();
    const x = -800 + Math.random() * 1600; // -800 ~ 800
    const y = -800 + Math.random() * 1600;
    monsters[id] = {
        id,
        ...type,
        x, y,
        maxHp: type.hp,
        hp: type.hp,
        attackCooldown: 0,
    };
}

// --- 掉落物生成 ---
function createDrop(x, y, monster) {
    const types = [
        { name: '飞剑', damage: 15, radius: 8, color: '#aaccff', emoji: '🗡️', hpRestore: 0 },
        { name: '护盾', damage: 0, radius: 10, color: '#66dd88', emoji: '🛡️', hpRestore: 0 },
        { name: '灵符', damage: 25, radius: 6, color: '#ffaa66', emoji: '📜', hpRestore: 0 },
        { name: '回血丹', damage: 0, radius: 8, color: '#ff6b81', emoji: '💊', hpRestore: HEAL_POTION_AMOUNT },
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const id = genId();
    drops[id] = {
        id,
        x, y,
        ...type,
        spawnTime: Date.now(),
        monsterId: monster.id,
    };
}

// --- 玩家突破 ---
function breakthrough(player) {
    const currentIndex = getRealmIndex(player.realm);
    if (currentIndex >= REALMS.length - 1) return;
    const next = REALMS[currentIndex + 1];
    player.realm = next.name;
    player.realmLevel = next.level;
    player.cultivation = 0;
    player.maxCultivation = next.maxCultivation;
    player.maxHp += next.hpBonus;
    player.hp = player.maxHp;
    player.attack += next.attackBonus;
    io.emit('realmUp', { id: player.id, newRealm: player.realm });
    console.log(`🌟 ${player.username} 突破至 ${player.realm}`);
}

// --- Socket.IO ---
io.on('connection', (socket) => {
    console.log(`🔗 新连接: ${socket.id}`);

    // ---- 注册事件 ----
    socket.on('register', async (data) => {
        const { username, password } = data;
        if (!username || !password) {
            socket.emit('registerResult', { success: false, message: '用户名和密码不能为空' });
            return;
        }
        if (playersData[username]) {
            socket.emit('registerResult', { success: false, message: '用户名已存在' });
            return;
        }
        // 创建账户
        const hashed = await bcrypt.hash(password, 10);
        const newData = createPlayerData(username);
        newData.passwordHash = hashed;
        playersData[username] = newData;
        await savePlayersData();
        socket.emit('registerResult', { success: true, message: '注册成功，请登录' });
        console.log(`📝 新用户注册: ${username}`);
    });

    // ---- 登录事件 ----
    socket.on('login', async (data) => {
        const { username, password } = data;
        if (!username || !password) {
            socket.emit('loginResult', { success: false, message: '用户名和密码不能为空' });
            return;
        }
        const userData = playersData[username];
        if (!userData) {
            socket.emit('loginResult', { success: false, message: '用户名不存在' });
            return;
        }
        const match = await bcrypt.compare(password, userData.passwordHash);
        if (!match) {
            socket.emit('loginResult', { success: false, message: '密码错误' });
            return;
        }
        // 生成 token
        const token = uuidv4();
        sessions[token] = username;
        socket.emit('loginResult', { success: true, token, username });
        console.log(`✅ 用户 ${username} 登录，token: ${token}`);
    });

    // ---- 使用 token 进入游戏 ----
    socket.on('enterGame', (data) => {
        const { token } = data;
        if (!token || !sessions[token]) {
            socket.emit('enterGameResult', { success: false, message: '无效的会话，请重新登录' });
            return;
        }
        const username = sessions[token];
        // 检查该用户是否已有在线连接（踢掉旧的）
        for (const sid in players) {
            if (players[sid].username === username) {
                // 通知旧连接被踢出
                io.to(sid).emit('kicked', { message: '你的账号在另一设备登录' });
                // 保存旧玩家数据
                syncPlayerData(sid);
                // 删除旧玩家
                delete players[sid];
                io.emit('playerLeft', sid);
                // 断开旧 socket
                io.sockets.sockets.get(sid)?.disconnect(true);
                break;
            }
        }
        // 构建游戏玩家对象
        const player = buildGamePlayer(username, socket.id);
        if (!player) {
            socket.emit('enterGameResult', { success: false, message: '加载数据失败' });
            return;
        }
        // 将玩家加入游戏世界
        players[socket.id] = player;
        // 发送当前游戏状态给该玩家
        socket.emit('currentPlayers', players);
        socket.emit('currentMonsters', monsters);
        socket.emit('currentDrops', drops);
        // 广播新玩家
        socket.broadcast.emit('playerJoined', player);
        socket.emit('enterGameResult', { success: true });
        console.log(`🎮 ${username} 进入游戏`);
    });

    // ---- 移动事件 ----
    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (p) {
            p.targetX = data.x;
            p.targetY = data.y;
        }
    });

    // ---- 攻击事件 ----
    socket.on('playerAttack', () => {
        console.log('⚔️ 收到攻击请求');
        const p = players[socket.id];
        if (!p || p.attackCooldown > 0) return;
        p.attackCooldown = 1;
        // 寻找最近的妖兽
        let target = null;
        let minDist = Infinity;
        for (const mid in monsters) {
            const m = monsters[mid];
            const d = Math.hypot(m.x - p.x, m.y - p.y);
            if (d < 120 && d < minDist) {
                minDist = d;
                target = m;
            }
        }
        if (target) {
            const damage = p.attack + Math.floor(Math.random() * 5);
            target.hp -= damage;
            console.log(`💥 对 ${target.name} 造成 ${damage} 伤害，剩余 ${target.hp} HP`);
            if (target.hp <= 0) {
                // 妖兽死亡
                p.cultivation += target.exp || 30;
                if (p.cultivation >= p.maxCultivation) breakthrough(p);
                if (Math.random() < 0.4) createDrop(target.x, target.y, target);
                delete monsters[mid];
                io.emit('monsterKilled', { id: mid, killerId: p.id });
            }
        }
    });

    // ---- 断开连接 ----
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const p = players[socket.id];
            console.log(`💨 ${p.username} 离开游戏`);
            // 保存数据
            syncPlayerData(socket.id);
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
        }
        // 清除 session（但保留 token 关联，可让用户重新进入）
        // 注意：这里不删除 sessions[token]，允许用户通过 token 重新进入
    });
});

// --- 游戏主循环 ---
setInterval(async () => {
    const now = Date.now();

    // 1. 玩家移动 + 自动回血
    for (const id in players) {
        const p = players[id];
        if (p.targetX !== null && p.targetY !== null) {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
                const step = Math.min(dist, p.speed || PLAYER_SPEED);
                p.x += (dx / dist) * step;
                p.y += (dy / dist) * step;
            }
        }
        // 回血
        if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + HP_REGEN_RATE / TICK_RATE);
        }
        if (p.attackCooldown > 0) p.attackCooldown -= 1 / TICK_RATE;
        if (p.attackCooldown < 0) p.attackCooldown = 0;
    }

    // 2. 妖兽AI
    for (const mid in monsters) {
        const m = monsters[mid];
        let nearest = null;
        let minDist = Infinity;
        for (const pid in players) {
            const p = players[pid];
            const d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d < minDist) { minDist = d; nearest = p; }
        }
        if (nearest && minDist < 300) {
            const dx = nearest.x - m.x;
            const dy = nearest.y - m.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                const step = Math.min(dist, m.speed || MONSTER_BASE_SPEED);
                m.x += (dx / dist) * step;
                m.y += (dy / dist) * step;
            }
            if (dist < m.radius + nearest.radius) {
                if (!m.attackCooldown) m.attackCooldown = 0;
                if (m.attackCooldown <= 0) {
                    nearest.hp -= m.damage * 0.5;
                    m.attackCooldown = 1;
                    if (nearest.hp <= 0) {
                        // 玩家死亡：重置位置和血量，保留其他数据
                        nearest.hp = nearest.maxHp;
                        nearest.x = 200 + Math.random() * 200;
                        nearest.y = 200 + Math.random() * 200;
                        nearest.targetX = nearest.x;
                        nearest.targetY = nearest.y;
                        io.emit('playerDied', { id: nearest.id });
                        // 保存数据
                        syncPlayerData(nearest.id);
                    }
                }
            }
        }
        if (m.attackCooldown !== undefined && m.attackCooldown > 0) m.attackCooldown -= 1 / TICK_RATE;
        if (m.attackCooldown !== undefined && m.attackCooldown < 0) m.attackCooldown = 0;
    }

    // 3. 拾取掉落物
    for (const pid in players) {
        const p = players[pid];
        for (const did in drops) {
            const d = drops[did];
            const dist = Math.hypot(p.x - d.x, p.y - d.y);
            if (dist < p.radius + d.radius) {
                if (d.hpRestore > 0) {
                    p.hp = Math.min(p.maxHp, p.hp + d.hpRestore);
                    console.log(`💚 ${p.username} 拾取了回血丹`);
                } else {
                    if (p.artifacts.length < 6) {
                        p.artifacts.push({
                            type: d.name,
                            damage: d.damage || 10,
                            angle: Math.random() * Math.PI * 2,
                            radius: 40 + Math.random() * 20,
                            cooldown: 0,
                        });
                    } else {
                        p.inventory.push({ type: d.name, damage: d.damage || 10 });
                    }
                    console.log(`📦 ${p.username} 拾取了 ${d.name}`);
                }
                delete drops[did];
            }
        }
    }

    // 4. 法宝自动攻击
    for (const pid in players) {
        const p = players[pid];
        p.artifacts.forEach(art => {
            art.angle += 0.03;
            const wx = p.x + Math.cos(art.angle) * art.radius;
            const wy = p.y + Math.sin(art.angle) * art.radius;
            if (art.cooldown === undefined) art.cooldown = 0;
            if (art.cooldown > 0) {
                art.cooldown -= 1 / TICK_RATE;
                return;
            }
            for (const mid in monsters) {
                const m = monsters[mid];
                const dist = Math.hypot(wx - m.x, wy - m.y);
                if (dist < art.radius + m.radius) {
                    const damage = art.damage || 10;
                    m.hp -= damage;
                    art.cooldown = 2;
                    if (m.hp <= 0) {
                        p.cultivation += m.exp || 30;
                        if (p.cultivation >= p.maxCultivation) breakthrough(p);
                        if (Math.random() < 0.4) createDrop(m.x, m.y, m);
                        delete monsters[mid];
                        io.emit('monsterKilled', { id: mid, killerId: pid });
                    }
                    break;
                }
            }
        });
    }

    // 5. 清理过期掉落物
    for (const did in drops) {
        if (now - drops[did].spawnTime > DROP_LIFETIME) {
            delete drops[did];
        }
    }

    // 6. 广播状态
    io.emit('gameState', { players, monsters, drops });

    // 7. 定期保存所有玩家数据（每30秒）
    if (Math.floor(now / 30000) > Math.floor((now - 1000) / 30000)) {
        for (const id in players) {
            syncPlayerData(id);
        }
        await savePlayersData();
        console.log('💾 玩家数据已自动保存');
    }
}, 1000 / TICK_RATE);

// --- 定时生成妖兽 ---
setInterval(spawnMonster, MONSTER_SPAWN_INTERVAL);
for (let i = 0; i < 3; i++) setTimeout(spawnMonster, i * 1000);

// --- 启动服务器 ---
(async () => {
    await loadPlayersData();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`🚀 修仙秘境开启，访问 http://localhost:${PORT}`);
        console.log(`📂 已加载 ${Object.keys(playersData).length} 个账户`);
    });
})();

// --- 优雅退出 ---
process.on('SIGINT', async () => {
    console.log('🛑 正在保存数据并退出...');
    for (const id in players) syncPlayerData(id);
    await savePlayersData();
    process.exit();
});