const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

console.log('✅ 修仙秘境服务器启动中...');

// --- 游戏状态 ---
const players = {};
const monsters = {};
const drops = {};

// --- 配置 ---
const TICK_RATE = 30;
const PLAYER_SPEED = 3;
const MONSTER_BASE_SPEED = 1.2;
const MONSTER_SPAWN_INTERVAL = 4000;  // 每4秒一只
const DROP_LIFETIME = 15000;          // 掉落物15秒消失

// --- 境界系统 ---
const REALMS = [
    { name: '炼气期', level: 1, maxCultivation: 100, hpBonus: 0, attackBonus: 0 },
    { name: '筑基期', level: 2, maxCultivation: 300, hpBonus: 20, attackBonus: 5 },
    { name: '金丹期', level: 3, maxCultivation: 800, hpBonus: 50, attackBonus: 15 },
    { name: '元婴期', level: 4, maxCultivation: 2000, hpBonus: 100, attackBonus: 30 },
    { name: '化神期', level: 5, maxCultivation: 5000, hpBonus: 200, attackBonus: 60 },
];

// --- 工具函数：生成随机ID ---
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

// --- 生成妖兽 ---
function spawnMonster() {
    const types = [
        { name: '青风狼', radius: 22, hp: 60, damage: 12, speed: 1.4, color: '#6f9e6f', exp: 30 },
        { name: '赤焰虎', radius: 30, hp: 120, damage: 20, speed: 1.8, color: '#cc5533', exp: 60 },
        { name: '玄冰龟', radius: 35, hp: 200, damage: 8, speed: 0.8, color: '#4a90d9', exp: 100 },
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const id = genId();
    const x = 50 + Math.random() * (800 - 100);
    const y = 50 + Math.random() * (600 - 100);
    monsters[id] = {
        id,
        ...type,
        x, y,
        maxHp: type.hp,
        hp: type.hp,
        attackCooldown: 0,
    };
    console.log(`🐺 妖兽 ${type.name} 出现在 (${x.toFixed(0)}, ${y.toFixed(0)})`);
}

// --- 生成掉落物 ---
function createDrop(x, y, monster) {
    const types = [
        { name: '飞剑', damage: 15, radius: 8, color: '#aaccff', emoji: '🗡️' },
        { name: '护盾', damage: 0, radius: 10, color: '#66dd88', emoji: '🛡️' },
        { name: '灵符', damage: 25, radius: 6, color: '#ffaa66', emoji: '📜' },
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
    console.log(`💎 掉落 ${type.name} 在 (${x.toFixed(0)}, ${y.toFixed(0)})`);
}

// --- 玩家突破 ---
function breakthrough(player) {
    const currentRealmIndex = REALMS.findIndex(r => r.name === player.realm);
    if (currentRealmIndex >= REALMS.length - 1) return; // 已达最高境界
    const nextRealm = REALMS[currentRealmIndex + 1];
    player.realm = nextRealm.name;
    player.realmLevel = nextRealm.level;
    player.cultivation = 0;
    player.maxCultivation = nextRealm.maxCultivation;
    player.maxHp += nextRealm.hpBonus;
    player.hp = player.maxHp;
    player.attack += nextRealm.attackBonus;
    // 广播突破消息
    io.emit('realmUp', { id: player.id, newRealm: player.realm, newMaxHp: player.maxHp, newAttack: player.attack });
    console.log(`🌟 ${player.name} 突破至 ${player.realm}`);
}

// --- Socket.IO 事件 ---
io.on('connection', (socket) => {
    console.log(`✨ 修仙者 [${socket.id}] 进入秘境`);

    // 初始化玩家
    const initialRealm = REALMS[0];
    players[socket.id] = {
        id: socket.id,
        x: 200 + Math.random() * 200,
        y: 200 + Math.random() * 200,
        name: `散修_${Math.floor(Math.random() * 10000)}`,
        realm: initialRealm.name,
        realmLevel: initialRealm.level,
        cultivation: 0,
        maxCultivation: initialRealm.maxCultivation,
        hp: 100,
        maxHp: 100,
        attack: 10,
        defense: 2,
        radius: 18,
        speed: PLAYER_SPEED,
        targetX: null,
        targetY: null,
        artifacts: [],            // 已装备的法宝 { type, damage, angle, radius, cooldown }
        inventory: [],            // 背包中的法宝（备用）
        attackCooldown: 0,
    };

    // 发送当前状态
    socket.emit('currentPlayers', players);
    socket.emit('currentMonsters', monsters);
    socket.emit('currentDrops', drops);

    // 广播新玩家
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // --- 事件监听 ---
    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (p) { p.targetX = data.x; p.targetY = data.y; }
    });

    // 玩家攻击（点击鼠标或空格触发）
    socket.on('playerAttack', (data) => {
        const p = players[socket.id];
        if (!p) return;
        // 检查冷却（每秒攻击一次）
        if (p.attackCooldown > 0) return;
        p.attackCooldown = 1; // 1秒冷却（在游戏循环中递减）

        // 寻找攻击目标：最近且距离<100的妖兽
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
            // 造成伤害
            const damage = p.attack + Math.floor(Math.random() * 5);
            target.hp -= damage;
            // 如果妖兽死亡
            if (target.hp <= 0) {
                // 增加修为
                p.cultivation += target.exp || 30;
                // 检查突破
                if (p.cultivation >= p.maxCultivation) {
                    breakthrough(p);
                }
                // 掉落法宝（概率40%）
                if (Math.random() < 0.4) {
                    createDrop(target.x, target.y, target);
                }
                // 删除妖兽
                delete monsters[mid];
                io.emit('monsterKilled', { id: mid, killerId: p.id });
                // 广播更新
                io.emit('gameState', { players, monsters, drops });
            }
        }
    });

    // 拾取掉落物（当玩家靠近时自动拾取，在游戏循环中处理）
    // 玩家断开
    socket.on('disconnect', () => {
        console.log(`💨 修仙者 [${socket.id}] 离开秘境`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// --- 游戏主循环 ---
setInterval(() => {
    const now = Date.now();

    // 1. 玩家移动（平滑跟随目标）
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
        // 攻击冷却递减
        if (p.attackCooldown > 0) p.attackCooldown -= 1 / TICK_RATE;
        if (p.attackCooldown < 0) p.attackCooldown = 0;
    }

    // 2. 妖兽AI
    for (const mid in monsters) {
        const m = monsters[mid];
        // 追击最近玩家
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
            // 攻击玩家
            if (dist < m.radius + nearest.radius) {
                if (m.attackCooldown === undefined) m.attackCooldown = 0;
                if (m.attackCooldown <= 0) {
                    nearest.hp -= m.damage * 0.5;
                    m.attackCooldown = 1; // 每秒攻击一次
                    if (nearest.hp <= 0) {
                        // 玩家死亡：重置
                        nearest.hp = nearest.maxHp;
                        nearest.x = 200 + Math.random() * 200;
                        nearest.y = 200 + Math.random() * 200;
                        nearest.targetX = nearest.x;
                        nearest.targetY = nearest.y;
                        io.emit('playerDied', { id: nearest.id });
                    }
                }
            }
        }
        // 妖兽攻击冷却递减
        if (m.attackCooldown !== undefined && m.attackCooldown > 0) m.attackCooldown -= 1 / TICK_RATE;
        if (m.attackCooldown !== undefined && m.attackCooldown < 0) m.attackCooldown = 0;
    }

    // 3. 玩家自动拾取掉落物
    for (const pid in players) {
        const p = players[pid];
        for (const did in drops) {
            const d = drops[did];
            const dist = Math.hypot(p.x - d.x, p.y - d.y);
            if (dist < p.radius + d.radius) {
                // 拾取：加入玩家法宝（最多装备6个）
                if (p.artifacts.length < 6) {
                    p.artifacts.push({
                        type: d.name,
                        damage: d.damage || 10,
                        angle: Math.random() * Math.PI * 2,
                        radius: 40 + Math.random() * 20,
                        cooldown: 0,
                    });
                } else {
                    // 背包（简单丢弃）
                    p.inventory.push({ type: d.name, damage: d.damage || 10 });
                }
                delete drops[did];
                console.log(`📦 ${p.name} 拾取了 ${d.name}`);
            }
        }
    }

    // 4. 法宝自动攻击（每个法宝每2秒攻击一次）
    for (const pid in players) {
        const p = players[pid];
        p.artifacts.forEach((art, index) => {
            // 更新角度（旋转）
            art.angle += 0.03;
            // 计算法宝在世界中的位置
            const wx = p.x + Math.cos(art.angle) * art.radius;
            const wy = p.y + Math.sin(art.angle) * art.radius;
            // 攻击冷却
            if (art.cooldown === undefined) art.cooldown = 0;
            if (art.cooldown > 0) {
                art.cooldown -= 1 / TICK_RATE;
                return;
            }
            // 检测附近妖兽
            for (const mid in monsters) {
                const m = monsters[mid];
                const dist = Math.hypot(wx - m.x, wy - m.y);
                if (dist < art.radius + m.radius) {
                    // 攻击！
                    const damage = art.damage || 10;
                    m.hp -= damage;
                    art.cooldown = 2; // 冷却2秒
                    if (m.hp <= 0) {
                        // 妖兽死亡
                        const exp = m.exp || 30;
                        p.cultivation += exp;
                        if (p.cultivation >= p.maxCultivation) breakthrough(p);
                        if (Math.random() < 0.4) createDrop(m.x, m.y, m);
                        delete monsters[mid];
                        io.emit('monsterKilled', { id: mid, killerId: pid });
                    }
                    break; // 每帧只攻击一只妖兽
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

    // 6. 广播完整状态
    io.emit('gameState', { players, monsters, drops });

}, 1000 / TICK_RATE);

// --- 定时生成妖兽（开局先刷3只） ---
setInterval(spawnMonster, MONSTER_SPAWN_INTERVAL);
for (let i = 0; i < 3; i++) setTimeout(spawnMonster, i * 1000);

// --- 启动服务器 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 修仙秘境开启，访问 http://localhost:${PORT}`);
});