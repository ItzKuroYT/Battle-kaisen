const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1100;
canvas.height = 560;

const WORLD = {
    gravity: 1800,
    floorY: 492,
    roundTime: 150,
    maxHealth: 100,
    maxStamina: 100,
    maxCursed: 100
};

const DOMAIN_DURATION = 12;
const DOMAIN_CLASH_WIN_DURATION = 14;
const SHOP_KEY = 'battleKaisen.shopState';
const SHOP_WIN_POINTS = 3;
const ITEM_COSTS = { glasses: 3, kamotoke: 4 };

const input = {};
const physicalMouseState = { left: false, right: false };
const mouseState = { left: false, right: false };
const prevMouseState = { left: false, right: false };
const mousePos = { x: canvas.width * 0.5, y: canvas.height * 0.5 };
window.addEventListener('keydown', (e) => {
    input[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    input[e.code] = false;
});
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        physicalMouseState.left = true;
        mouseState.left = true;
    }
    if (e.button === 2) {
        physicalMouseState.right = true;
        mouseState.right = true;
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        physicalMouseState.left = false;
        mouseState.left = false;
    }
    if (e.button === 2) {
        physicalMouseState.right = false;
        mouseState.right = false;
    }
});
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mousePos.x = (e.clientX - rect.left) * scaleX;
    mousePos.y = (e.clientY - rect.top) * scaleY;
});

const MIN_SKILL_COOLDOWN = 10;

const CHARACTER_DATA = {
    gojo: {
        name: 'Gojo',
        color: '#7ad7ff',
        edge: '#f1fbff',
        aura: '#62d5ff',
        hair: '#f4fbff',
        skills: [
            { key: 'Q', codeP1: 'KeyQ', codeP2: 'KeyU', name: 'Red', stamina: 14, cursed: 20, damage: 11, cooldown: 1.4, range: 125, knock: 280 },
            { key: 'E', codeP1: 'KeyE', codeP2: 'KeyI', name: 'Blue', stamina: 17, cursed: 24, damage: 14, cooldown: 1.8, range: 145, knock: 320 },
            { key: 'R', codeP1: 'KeyR', codeP2: 'KeyO', name: 'Purple', stamina: 30, cursed: 35, damage: 38, cooldown: 3.2, range: 180, knock: 560 }
        ],
        ult: { key: 'G', codeP1: 'KeyG', codeP2: 'KeyP', name: 'Infinite Void', stamina: 20, cursed: 100, damage: 35, cooldown: 10, range: 250, knock: 540 }
    },
    sukuna: {
        name: 'Sukuna',
        color: '#ff6f7d',
        edge: '#ffe3e7',
        aura: '#ff4e61',
        hair: '#30171b',
        skills: [
            { key: 'Q', codeP1: 'KeyQ', codeP2: 'KeyU', name: 'Dismantle', stamina: 12, cursed: 18, damage: 10, cooldown: 1.2, range: 130, knock: 250 },
            { key: 'E', codeP1: 'KeyE', codeP2: 'KeyI', name: 'Cleave', stamina: 18, cursed: 24, damage: 16, cooldown: 2.0, range: 86, knock: 460 },
            { key: 'R', codeP1: 'KeyR', codeP2: 'KeyO', name: 'Fuga', stamina: 30, cursed: 30, damage: 24, cooldown: 3.4, range: 195, knock: 460 }
        ],
        ult: { key: 'F', codeP1: 'KeyF', codeP2: 'KeyP', name: 'Malevolent Shrine', stamina: 24, cursed: 100, damage: 38, cooldown: 10, range: 260, knock: 560 }
    }
};

const projectiles = [];
const effects = [];
const prevInput = {};
const timedActions = [];
const overlayState = {
    flashTimer: 0,
    flashColor: '#ffffff',
    chantTimer: 0,
    chantDuration: 0,
    chantLines: []
};

function keyPressed(code) {
    return !!input[code] && !prevInput[code];
}

function keyReleased(code) {
    return !input[code] && !!prevInput[code];
}

function scheduleAction(delay, fn) {
    timedActions.push({ delay, fn });
}

function updateTimedActions(dt) {
    for (let i = timedActions.length - 1; i >= 0; i -= 1) {
        timedActions[i].delay -= dt;
        if (timedActions[i].delay <= 0) {
            const action = timedActions[i].fn;
            timedActions.splice(i, 1);
            if (typeof action === 'function') {
                action();
            }
        }
    }
}

function showChant(lines, duration = 1.0) {
    overlayState.chantLines = lines;
    overlayState.chantDuration = duration;
    overlayState.chantTimer = duration;
}

function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawLine(x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function drawModelAt(x, y, scale, fighter, pose = 'idle', facing = 1, pulse = 0) {
    const body = fighter.color;
    const skin = '#f4eadf';
    const edge = fighter.edge;
    const hair = fighter.hair;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * facing, scale);

    const castLean = pose === 'cast' ? 4 : 0;
    const blockLean = pose === 'block' ? -7 : 0;
    const lean = castLean + blockLean;

    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.8;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-16 + lean, -70, 32, 46, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(lean, -88, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#10121e';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(lean, -96, 10, Math.PI, Math.PI * 2);
    ctx.fill();

    const armReach = pose === 'cast' ? 36 : 10;
    drawLine(-14 + lean, -54, -24, -22, 6, body);
    drawLine(14 + lean, -56, 14 + armReach + lean, -24, 6, body);

    const legOffset = pose === 'run' ? Math.sin(pulse * 12) * 7 : 2;
    drawLine(-7 + lean, -24, -10 - legOffset, 8, 7, body);
    drawLine(7 + lean, -24, 10 + legOffset, 8, 7, body);

    if (pose === 'cast' || pose === 'block') {
        const px = 14 + armReach + lean;
        const py = -24;
        const r = pose === 'cast' ? 8 + Math.sin(pulse * 20) * 2 : 13;
        const grad = ctx.createRadialGradient(px, py, 2, px, py, r + 12);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, fighter.aura);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, r + 7, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function spawnSparkBurst(x, y, color, count = 10, speed = 230, life = 0.35) {
    for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const vx = Math.cos(angle) * speed * (0.55 + Math.random() * 0.55);
        const vy = Math.sin(angle) * speed * (0.55 + Math.random() * 0.55);
        effects.push({
            type: 'spark', x, y, vx, vy, r: 2 + Math.random() * 2.4, color,
            life, age: 0
        });
    }
}

function spawnRing(x, y, color, maxR = 70, life = 0.28) {
    effects.push({ type: 'ring', x, y, color, maxR, life, age: 0 });
}

function spawnSlashEffect(x, y, facing, color = '#ffd4d9') {
    effects.push({
        type: 'slash',
        x,
        y,
        facing,
        color,
        life: 0.22,
        age: 0,
        len: 60 + Math.random() * 26
    });
}

function createDefaultShopState() {
    return {
        p1Points: 0,
        p2Points: 0,
        p1: { glasses: false, kamotokeCharges: 0 },
        p2: { glasses: false, kamotokeCharges: 0 }
    };
}

function loadShopState() {
    const raw = JSON.parse(localStorage.getItem(SHOP_KEY) || '{}');
    return {
        p1Points: Number.isFinite(raw.p1Points) ? raw.p1Points : 0,
        p2Points: Number.isFinite(raw.p2Points) ? raw.p2Points : 0,
        p1: {
            glasses: !!(raw.p1 && raw.p1.glasses),
            kamotokeCharges: Number.isFinite(raw.p1 && raw.p1.kamotokeCharges) ? raw.p1.kamotokeCharges : 0
        },
        p2: {
            glasses: !!(raw.p2 && raw.p2.glasses),
            kamotokeCharges: Number.isFinite(raw.p2 && raw.p2.kamotokeCharges) ? raw.p2.kamotokeCharges : 0
        }
    };
}

function saveShopState(state) {
    localStorage.setItem(SHOP_KEY, JSON.stringify(state));
}

function applyHit(victim, attacker, damage, knock, hitType) {
    if (victim.dodgePerfectTimer > 0) {
        victim.lastHitText = 'Perfect Dodge!';
        victim.messageLife = 0.35;
        victim.vx -= attacker.facing * 120;
        spawnRing(victim.x + victim.w * 0.5, victim.y + victim.h * 0.45, '#d9fbff', 68, 0.2);
        spawnSparkBurst(victim.x + victim.w * 0.5, victim.y + victim.h * 0.45, '#bdf6ff', 10, 220, 0.24);
        return;
    }

    let finalDamage = damage;
    if (victim.blocking) {
        finalDamage *= 0.48;
    }
    victim.health = Math.max(0, victim.health - finalDamage);
    victim.vx += attacker.facing * (knock / 3.4);
    victim.hitFlash = 1;
    victim.lastHitText = victim.blocking ? 'Blocked' : `-${finalDamage.toFixed(0)} HP`;

    const impactX = victim.x + victim.w * 0.5;
    const impactY = victim.y + victim.h * 0.45;
    if (hitType === 'slash') {
        spawnSlashEffect(impactX, impactY, attacker.facing, '#ffe3e7');
        spawnSparkBurst(impactX, impactY, '#ff8f9a', 8, 210, 0.26);
    } else if (hitType === 'fire') {
        spawnSparkBurst(impactX, impactY, '#ffbc6a', 16, 280, 0.36);
        spawnRing(impactX, impactY, '#ff6a2a', 95, 0.24);
    } else if (hitType === 'void') {
        spawnRing(impactX, impactY, '#e9d8ff', 120, 0.42);
        spawnSparkBurst(impactX, impactY, '#c2a7ff', 14, 260, 0.4);
    } else {
        spawnSparkBurst(impactX, impactY, '#9ee6ff', 10, 220, 0.28);
        spawnRing(impactX, impactY, '#75cfff', 58, 0.2);
    }
}

class Projectile {
    constructor(config) {
        this.type = config.type;
        this.owner = config.owner;
        this.enemy = config.enemy;
        this.skill = config.skill;
        this.x = config.x;
        this.y = config.y;
        this.vx = config.vx || 0;
        this.vy = config.vy || 0;
        this.w = config.w;
        this.h = config.h;
        this.life = config.life;
        this.age = 0;
        this.color = config.color;
        this.extra = config.extra || {};
        this.dead = false;
        this.hitTargets = new Set();
    }

    getRect() {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    update(dt) {
        this.age += dt;
        if (this.age > this.life) {
            if (this.type === 'blueVacuum' && !this.extra.imploded) {
                this.onHit();
            } else {
                this.dead = true;
            }
            return;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.type === 'blueVacuum') {
            this.vx *= 0.94;
            this.vy *= 0.94;
            const cx = this.x + this.w * 0.5;
            const cy = this.y + this.h * 0.5;
            const ex = this.enemy.x + this.enemy.w * 0.5;
            const ey = this.enemy.y + this.enemy.h * 0.5;
            const dx = cx - ex;
            const dy = cy - ey;
            const dist = Math.hypot(dx, dy);

            this.extra.radius = Math.min(220, this.extra.radius + 120 * dt);
            if (dist < this.extra.radius) {
                const pullStrength = clamp((this.extra.radius - dist) * 16, 280, 1450);
                this.enemy.vx += (dx / Math.max(1, dist)) * pullStrength * dt;
                this.enemy.vy += (dy / Math.max(1, dist)) * pullStrength * dt;
                this.enemy.moveLockTimer = Math.max(this.enemy.moveLockTimer, 0.11);
            }
            spawnSparkBurst(cx, cy, '#8bd6ff', 2, 50, 0.2);
            if (Math.random() < 0.5) {
                spawnRing(cx, cy, '#69d4ff', this.extra.radius * 0.45, 0.24);
            }

            if (dist < 24 && !this.extra.imploded) {
                this.onHit();
                return;
            }
        }

        if (this.type === 'blueWisdom') {
            const targetX = this.owner.isAI
                ? (this.enemy.x + this.enemy.w * 0.5)
                : (Number.isFinite(this.owner.netMouseX) ? this.owner.netMouseX : mousePos.x);
            const targetY = this.owner.isAI
                ? (this.enemy.y + this.enemy.h * 0.4)
                : (Number.isFinite(this.owner.netMouseY) ? this.owner.netMouseY : mousePos.y);
            const cx = this.x + this.w * 0.5;
            const cy = this.y + this.h * 0.5;
            this.x += (targetX - cx) * 0.18;
            this.y += (targetY - cy) * 0.18;
            this.extra.radius = Math.min(230, (this.extra.radius || 170) + 20 * dt);

            const ex = this.enemy.x + this.enemy.w * 0.5;
            const ey = this.enemy.y + this.enemy.h * 0.5;
            const dx = (this.x + this.w * 0.5) - ex;
            const dy = (this.y + this.h * 0.5) - ey;
            const dist = Math.max(1, Math.hypot(dx, dy));
            if (dist < this.extra.radius) {
                const pullStrength = clamp((this.extra.radius - dist) * 20, 320, 1800);
                this.enemy.vx += (dx / dist) * pullStrength * dt;
                this.enemy.vy += (dy / dist) * pullStrength * dt;
                this.enemy.moveLockTimer = Math.max(this.enemy.moveLockTimer, 0.16);
                // Keep targets tethered to max Blue so they are visibly dragged by the singularity.
                const dragStrength = clamp((this.extra.radius - dist) * 0.22, 0, 16);
                this.enemy.x += (dx / dist) * dragStrength;
                this.enemy.y += (dy / dist) * dragStrength * 0.75;
                this.enemy.x = clamp(this.enemy.x, 10, canvas.width - this.enemy.w - 10);
                this.enemy.y = clamp(this.enemy.y, 0, WORLD.floorY - this.enemy.h);
                this.extra.tick = (this.extra.tick || 0.14) - dt;
                if (this.extra.tick <= 0) {
                    this.extra.tick = 0.14;
                    applyHit(this.enemy, this.owner, this.skill.damage * 0.16, this.skill.knock * 0.08, 'energy');
                }
            }

            spawnSparkBurst(this.x + this.w * 0.5, this.y + this.h * 0.5, '#a7edff', 2, 55, 0.14);
        }

        if (this.type === 'purpleWave') {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.w += 44 * dt;
            this.h += 44 * dt;
            this.vx *= 0.995;
            this.vy *= 0.99;
            spawnSparkBurst(this.x + this.w * 0.5, this.y + this.h * 0.5, '#bfa6ff', 1, 70, 0.16);
        }

        if (this.type === 'dismantleSlash') {
            this.vx += this.owner.facing * 40 * dt;
            this.y += Math.sin((this.age * 26) + this.extra.phase) * 1.8;
        }

        if (this.type === 'fugaArrow') {
            spawnSparkBurst(this.x + this.w * 0.5, this.y + this.h * 0.5, '#ff8f4d', 2, 95, 0.2);
        }

        if (this.x < -160 || this.x > canvas.width + 160 || this.y < -160 || this.y > canvas.height + 160) {
            this.dead = true;
            return;
        }

        const targetRect = {
            x: this.enemy.x,
            y: this.enemy.y,
            w: this.enemy.w,
            h: this.enemy.h
        };

        if (this.type !== 'blueVacuum' && this.type !== 'blueWisdom' && rectsOverlap(this.getRect(), targetRect)) {
            this.onHit();
        }
    }

    onHit() {
        if (this.type === 'redOrb') {
            const dMult = this.extra.damageMult || 1;
            const kMult = this.extra.knockMult || 1;
            applyHit(this.enemy, this.owner, this.skill.damage * dMult, this.skill.knock * kMult, 'energy');
            spawnRing(this.x + this.w * 0.5, this.y + this.h * 0.5, '#ff5a76', 80 + (this.extra.scale || 1) * 30, 0.24);
            if (this.extra.maxOutput) {
                this.enemy.moveLockTimer = Math.max(this.enemy.moveLockTimer, 0.75);
                spawnSparkBurst(this.enemy.x + this.enemy.w * 0.5, this.enemy.y + this.enemy.h * 0.4, '#ffd6df', 30, 360, 0.42);
                overlayState.flashTimer = 0.62;
                overlayState.flashColor = '#ffffff';
                effects.push({
                    type: 'ring',
                    x: this.x + this.w * 0.5,
                    y: this.y + this.h * 0.5,
                    color: '#fff7fb',
                    maxR: 320,
                    life: 0.62,
                    age: 0
                });
                applyHit(this.enemy, this.owner, this.skill.damage * 1.25, this.skill.knock * 0.9, 'energy');
            }
        } else if (this.type === 'blueVacuum') {
            this.extra.imploded = true;
            applyHit(this.enemy, this.owner, this.skill.damage, this.skill.knock * 0.3, 'energy');
            this.enemy.vx -= this.owner.facing * 300;
            this.enemy.moveLockTimer = Math.max(this.enemy.moveLockTimer, 0.36);
            spawnRing(this.x + this.w * 0.5, this.y + this.h * 0.5, '#66d6ff', 130, 0.42);
            spawnSparkBurst(this.x + this.w * 0.5, this.y + this.h * 0.5, '#9ce8ff', 26, 330, 0.4);
        } else if (this.type === 'purpleWave') {
            applyHit(this.enemy, this.owner, this.skill.damage * 1.3, this.skill.knock * 1.1, 'void');
            spawnRing(this.x + this.w * 0.5, this.y + this.h * 0.5, '#b79dff', 190, 0.44);
            spawnSparkBurst(this.x + this.w * 0.5, this.y + this.h * 0.5, '#d5c8ff', 26, 360, 0.4);
        } else if (this.type === 'dismantleSlash') {
            applyHit(this.enemy, this.owner, this.skill.damage, this.skill.knock, 'slash');
            spawnSlashEffect(this.x + this.w * 0.5, this.y + this.h * 0.5, this.owner.facing, '#ffd0d6');
        } else if (this.type === 'fugaArrow') {
            applyHit(this.enemy, this.owner, this.skill.damage * 0.5, this.skill.knock * 0.45, 'fire');
            this.enemy.burnTimer = Math.max(this.enemy.burnTimer, 4.8);
            this.enemy.burnTickTimer = 0.14;

            const beamX = this.x + (this.owner.facing === 1 ? 10 : -canvas.width);
            const beamW = canvas.width;
            effects.push({
                type: 'beam',
                x: beamX,
                y: this.y - 24,
                w: beamW,
                h: 70,
                color: '#ff7e36',
                life: 0.26,
                age: 0,
                facing: this.owner.facing
            });

            if (this.enemy.y + this.enemy.h > this.y - 36 && this.enemy.y < this.y + 62) {
                applyHit(this.enemy, this.owner, this.skill.damage * 0.8, this.skill.knock * 0.9, 'fire');
            }

            spawnSparkBurst(this.x + this.w * 0.5, this.y + this.h * 0.5, '#ffcb66', 30, 360, 0.44);
            spawnRing(this.x + this.w * 0.5, this.y + this.h * 0.5, '#ff7f3a', 160, 0.38);
        }

        this.dead = true;
    }

    draw() {
        const alpha = clamp(1 - (this.age / this.life), 0.16, 1);
        ctx.save();
        ctx.globalAlpha = alpha;

        if (this.type === 'redOrb') {
            const gx = this.x + this.w * 0.5;
            const gy = this.y + this.h * 0.5;
            const grad = ctx.createRadialGradient(gx, gy, 4, gx, gy, this.w * 0.65);
            grad.addColorStop(0, '#ffd9de');
            grad.addColorStop(0.35, '#ff657a');
            grad.addColorStop(1, 'rgba(255, 44, 76, 0.1)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, gy, this.w * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'blueVacuum') {
            const gx = this.x + this.w * 0.5;
            const gy = this.y + this.h * 0.5;
            const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, this.w * 0.7);
            grad.addColorStop(0, '#d9f8ff');
            grad.addColorStop(0.45, '#51cbff');
            grad.addColorStop(1, 'rgba(80, 200, 255, 0.06)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, gy, this.w * 0.56, 0, Math.PI * 2);
            ctx.fill();
            drawLine(gx - 18, gy, gx + 18, gy, 2, '#dff9ff');
            drawLine(gx, gy - 18, gx, gy + 18, 2, '#dff9ff');
            ctx.strokeStyle = 'rgba(157, 228, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(gx, gy, this.extra.radius || 65, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'purpleWave') {
            const gx = this.x + this.w * 0.5;
            const gy = this.y + this.h * 0.5;
            const radius = this.w * 0.5;
            const grad = ctx.createRadialGradient(gx, gy, 8, gx, gy, radius + 16);
            grad.addColorStop(0, '#faf3ff');
            grad.addColorStop(0.35, '#ba9dff');
            grad.addColorStop(1, 'rgba(126, 95, 255, 0.08)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, gy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#d7c8ff';
            ctx.lineWidth = 2.8;
            ctx.stroke();

            for (let i = 0; i < 4; i += 1) {
                const a = Math.random() * Math.PI * 2;
                const b = a + (Math.random() * 0.8 - 0.4);
                const x1 = gx + Math.cos(a) * radius * 0.2;
                const y1 = gy + Math.sin(a) * radius * 0.2;
                const x2 = gx + Math.cos(b) * radius * 0.9;
                const y2 = gy + Math.sin(b) * radius * 0.9;
                drawLine(x1, y1, x2, y2, 1.8, 'rgba(235, 220, 255, 0.85)');
            }
        } else if (this.type === 'dismantleSlash') {
            const x = this.x + this.w * 0.5;
            const y = this.y + this.h * 0.5;
            drawLine(x - 18, y - 12, x + 18, y + 12, 3.5, '#ffdbe1');
            drawLine(x - 16, y + 12, x + 16, y - 12, 1.6, '#ff9aa7');
        } else if (this.type === 'fugaArrow') {
            ctx.fillStyle = '#ffbe7a';
            ctx.beginPath();
            ctx.moveTo(this.x + this.w, this.y + this.h * 0.5);
            ctx.lineTo(this.x + 10, this.y + 2);
            ctx.lineTo(this.x + 10, this.y + this.h - 2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffd69b';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (this.type === 'blueWisdom') {
            const gx = this.x + this.w * 0.5;
            const gy = this.y + this.h * 0.5;
            const radius = this.w * 0.5;
            const grad = ctx.createRadialGradient(gx, gy, 8, gx, gy, radius + 24);
            grad.addColorStop(0, '#ecfdff');
            grad.addColorStop(0.35, '#7fe4ff');
            grad.addColorStop(1, 'rgba(126, 226, 255, 0.08)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, gy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(212, 247, 255, 0.9)';
            ctx.lineWidth = 2.4;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(130, 223, 255, 0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(gx, gy, this.extra.radius || 170, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

class Fighter {
    constructor(config) {
        this.name = config.name;
        this.character = config.character;
        this.color = config.color;
        this.edge = config.edge;
        this.aura = config.aura;
        this.hair = config.hair;
        this.x = config.x;
        this.y = config.y;
        this.w = 58;
        this.h = 108;
        this.vx = 0;
        this.vy = 0;
        this.facing = config.facing;
        this.controls = config.controls;
        this.isAI = !!config.isAI;

        this.health = WORLD.maxHealth;
        this.stamina = WORLD.maxStamina;
        this.cursed = 25;
        this.blocking = false;
        this.grounded = false;

        this.skillData = config.skillData;
        this.cooldowns = {};
        this.attackTimer = 0;
        this.attackWindow = 0.34;
        this.pendingSkill = null;
        this.lastHitText = '';
        this.hitFlash = 0;

        this.anim = 0;
        this.messageLife = 0;

        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.moveLockTimer = 0;
        this.dodgeTimer = 0;
        this.dodgePerfectTimer = 0;
        this.dodgeCooldown = 0;
        this.basicAttackTimer = 0;

        this.redCharging = false;
        this.redChargeTime = 0;
        this.redSkill = null;
        this.redTarget = null;
        this.redKey = '';

        this.blueCharging = false;
        this.blueChargeTime = 0;
        this.blueSkill = null;
        this.blueTarget = null;
        this.blueKey = '';
        this.aiActionTimer = 0;

        this.hasGlasses = !!config.hasGlasses;
        this.kamotokeCharges = config.kamotokeCharges || 0;
        this.itemUseCooldown = 0;
        this.itemKey = this.controls.isP1 ? 'KeyT' : 'KeyL';
        this.netMouseX = canvas.width * 0.5;
        this.netMouseY = canvas.height * 0.5;
    }

    update(dt, enemy, roundOver) {
        this.facing = this.x < enemy.x ? 1 : -1;
        this.anim += dt;
        this.aiEnemy = enemy;

        this.moveLockTimer = Math.max(0, this.moveLockTimer - dt);
        this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
        this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
        this.dodgePerfectTimer = Math.max(0, this.dodgePerfectTimer - dt);
        this.basicAttackTimer = Math.max(0, this.basicAttackTimer - dt);
        this.aiActionTimer = Math.max(0, this.aiActionTimer - dt);
        this.itemUseCooldown = Math.max(0, this.itemUseCooldown - dt);

        if (this.burnTimer > 0) {
            this.burnTimer -= dt;
            this.burnTickTimer -= dt;
            if (this.burnTickTimer <= 0) {
                this.burnTickTimer = 0.24;
                this.health = Math.max(0, this.health - 1.4);
                spawnSparkBurst(this.x + this.w * 0.5, this.y + 36, '#ff8f42', 4, 120, 0.18);
            }
        }

        Object.keys(this.cooldowns).forEach((key) => {
            this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
        });

        if (!roundOver) {
            this.handleMovement(dt, enemy);
            this.handleBlock(dt);
            this.handleSkills(dt, enemy);
            this.regenResources(dt);
        }

        this.applyPhysics(dt);

        if (this.attackTimer > 0) {
            this.attackTimer -= dt;
            if (this.attackTimer <= 0) {
                this.pendingSkill = null;
            }
        }

        this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
        this.messageLife = Math.max(0, this.messageLife - dt);
    }

    handleMovement(dt, enemy) {
        if (this.isAI) {
            this.handleAIMovement(dt, enemy);
            return;
        }

        const moveSpeed = 300;
        const jumpVel = -760;
        let move = 0;

        if (input[this.controls.left]) move -= 1;
        if (input[this.controls.right]) move += 1;

        const movementLocked = this.moveLockTimer > 0;
        if (this.blocking || this.attackTimer > 0 || movementLocked || this.dodgeTimer > 0) {
            move = 0;
        }

        if (keyPressed(this.controls.dodge) && this.grounded && this.dodgeCooldown <= 0 && this.attackTimer <= 0) {
            this.dodgeTimer = 0.24;
            this.dodgePerfectTimer = 0.12;
            this.dodgeCooldown = 0.8;
            this.vx = -this.facing * 620;
            this.lastHitText = 'Perfect Dodge Window';
            this.messageLife = 0.35;
        }

        if (movementLocked) {
            this.vx *= 0.93;
        } else {
            this.vx = move * moveSpeed;
        }

        if (input[this.controls.jump] && this.grounded && !this.blocking && this.attackTimer <= 0 && this.moveLockTimer <= 0) {
            this.vy = jumpVel;
            this.grounded = false;
        }

        this.x += this.vx * dt;
        this.x = clamp(this.x, 10, canvas.width - this.w - 10);
    }

    handleAIMovement(dt, enemy) {
        const moveSpeed = 260;
        const distance = (enemy.x + enemy.w * 0.5) - (this.x + this.w * 0.5);
        const absDist = Math.abs(distance);
        let move = 0;

        if (absDist > 165) move = Math.sign(distance);
        else if (absDist < 90) move = -Math.sign(distance);

        const movementLocked = this.moveLockTimer > 0;
        if (this.blocking || this.attackTimer > 0 || movementLocked || this.dodgeTimer > 0) {
            move = 0;
        }

        if (movementLocked) {
            this.vx *= 0.93;
        } else {
            this.vx = move * moveSpeed;
        }

        if (this.grounded && this.dodgeCooldown <= 0 && absDist < 130 && enemy.pendingSkill && Math.random() < CPU_PROFILE.dodgeChance) {
            this.dodgeTimer = 0.22;
            this.dodgePerfectTimer = 0.1;
            this.dodgeCooldown = 0.85;
            this.vx = -this.facing * 560;
        }

        if (this.grounded && absDist < 140 && Math.random() < 0.007 && this.attackTimer <= 0) {
            this.vy = -760;
            this.grounded = false;
        }

        this.x += this.vx * dt;
        this.x = clamp(this.x, 10, canvas.width - this.w - 10);
    }

    handleBlock(dt) {
        if (this.isAI) {
            const threatNear = this.aiEnemy && Math.abs((this.aiEnemy.x + this.aiEnemy.w * 0.5) - (this.x + this.w * 0.5)) < 120;
            const threatened = this.aiEnemy && (this.aiEnemy.pendingSkill || this.aiEnemy.attackTimer > 0);
            this.blocking = this.grounded && this.attackTimer <= 0 && this.stamina > 0 && this.dodgeTimer <= 0 && threatNear && threatened && Math.random() < CPU_PROFILE.blockSense;
        } else {
            this.blocking = input[this.controls.block] && this.grounded && this.attackTimer <= 0 && this.stamina > 0 && this.dodgeTimer <= 0;
        }
        if (this.blocking) {
            this.stamina = Math.max(0, this.stamina - 12 * dt);
        }
        if (this.stamina <= 0.3) {
            this.blocking = false;
        }
    }

    handleSkills(dt, enemy) {
        if (this.moveLockTimer > 0) {
            return;
        }

        if (this.blueCharging) {
            this.updateBlueCharge(dt);
            return;
        }

        if (this.isAI && this.aiTryActions(enemy)) {
            return;
        }

        if (this.redCharging) {
            this.updateRedCharge(dt);
            return;
        }

        if (this.attackTimer > 0) {
            return;
        }

        if (keyPressed(this.itemKey)) {
            this.useKamotoke(enemy);
            return;
        }

        if (!this.isAI && this.basicAttackTimer <= 0) {
            if (this.controls.isP1 && mouseState.left && !prevMouseState.left) {
                this.performBasicPunch(enemy, false);
                return;
            }
            if (!this.controls.isP1 && mouseState.right && !prevMouseState.right) {
                this.performBasicPunch(enemy, false);
                return;
            }
        }

        const kit = [...this.skillData.skills, this.skillData.ult];
        for (let i = 0; i < kit.length; i += 1) {
            const skill = kit[i];
            const key = this.controls.isP1 ? skill.codeP1 : skill.codeP2;
            if (keyPressed(key)) {
                this.tryCast(skill, enemy);
                break;
            }
        }
    }

    canCastSkill(skill) {
        return (this.cooldowns[skill.name] || 0) <= 0 && this.stamina >= skill.stamina && this.cursed >= skill.cursed;
    }

    aiTryActions(enemy) {
        if (this.attackTimer > 0 || this.aiActionTimer > 0) {
            return false;
        }

        if (this.character === 'sukuna' && this.kamotokeCharges > 0 && this.itemUseCooldown <= 0 && Math.random() < 0.018) {
            this.useKamotoke(enemy);
            this.aiActionTimer = 0.35;
            return true;
        }

        const dist = Math.abs((enemy.x + enemy.w * 0.5) - (this.x + this.w * 0.5));

        if (dist < 72 && this.stamina >= 6 && Math.random() < 0.35) {
            this.performBasicPunch(enemy, Math.random() < 0.3);
            this.aiActionTimer = 0.25;
            return true;
        }

        const kit = [...this.skillData.skills, this.skillData.ult];
        for (let i = 0; i < kit.length; i += 1) {
            const s = kit[i];
            if (!this.canCastSkill(s)) continue;

            if (s.name === 'Cleave' && dist > 110) continue;
            if (s.name === 'Fuga' && dist < 120) continue;
            if ((s.name === 'Infinite Void' || s.name === 'Malevolent Shrine') && dist > 240) continue;

            let chance = 0.012;
            if (s.name === 'Cleave' && dist < 95) chance = 0.09;
            if (s.name === 'Dismantle' && dist > 90) chance = 0.06;
            if (s.name === 'Blue' && dist > 90) chance = 0.055;
            if (s.name === 'Fuga' && dist > 120) chance = 0.045;
            if (s.name === 'Infinite Void' || s.name === 'Malevolent Shrine') chance = 0.02;

            if (Math.random() < chance * CPU_PROFILE.skillChanceMult) {
                this.tryCast(s, enemy);
                this.aiActionTimer = 0.45;
                return true;
            }
        }

        return false;
    }

    performBasicPunch(enemy, heavy) {
        const staminaCost = heavy ? 10 : 6;
        if (this.stamina < staminaCost) {
            return;
        }

        this.stamina -= staminaCost;
        this.attackTimer = heavy ? 0.22 : 0.16;
        this.basicAttackTimer = heavy ? 0.32 : 0.22;
        this.pendingSkill = { name: heavy ? 'Heavy Punch' : 'Punch' };

        const range = heavy ? 78 : 58;
        const damage = heavy ? 8.5 : 5;
        const knock = heavy ? 220 : 110;
        const hitbox = {
            x: this.facing === 1 ? this.x + this.w : this.x - range,
            y: this.y + 24,
            w: range,
            h: this.h - 26
        };
        const hurt = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };

        if (rectsOverlap(hitbox, hurt)) {
            applyHit(enemy, this, damage, knock, 'slash');
        }

        this.lastHitText = heavy ? 'Heavy Punch' : 'Punch';
        this.messageLife = 0.26;
    }

    tryCast(skill, enemy) {
        if (this.cooldowns[skill.name] > 0) return;
        if (this.stamina < skill.stamina) return;
        if (this.cursed < skill.cursed) return;

        if (skill.name === 'Red' && this.character === 'gojo') {
            this.beginRedCharge(skill, enemy);
            return;
        }

        if (skill.name === 'Blue' && this.character === 'gojo') {
            this.beginBlueCharge(skill, enemy);
            return;
        }

        this.stamina -= skill.stamina;
        this.cursed -= skill.cursed;
        this.cooldowns[skill.name] = Math.max(skill.cooldown, MIN_SKILL_COOLDOWN);
        this.attackTimer = this.attackWindow;
        this.pendingSkill = skill;
        this.lastHitText = `${skill.name}!`;
        this.messageLife = 0.7;

        this.spawnSkillAction(skill, enemy);
    }

    beginRedCharge(skill, enemy) {
        this.stamina -= skill.stamina;
        this.cursed -= skill.cursed;
        this.cooldowns[skill.name] = Math.max(skill.cooldown, MIN_SKILL_COOLDOWN);
        this.redCharging = true;
        this.redChargeTime = 0;
        this.redSkill = skill;
        this.redTarget = enemy;
        this.redKey = this.controls.isP1 ? skill.codeP1 : skill.codeP2;
        this.pendingSkill = skill;
        this.attackTimer = 5;
        this.lastHitText = 'Charging Red...';
        this.messageLife = 1;
    }

    beginBlueCharge(skill, enemy) {
        this.stamina -= skill.stamina;
        this.cursed -= skill.cursed;
        this.cooldowns[skill.name] = Math.max(skill.cooldown, MIN_SKILL_COOLDOWN);
        this.blueCharging = true;
        this.blueChargeTime = 0;
        this.blueSkill = skill;
        this.blueTarget = enemy;
        this.blueKey = this.controls.isP1 ? skill.codeP1 : skill.codeP2;
        this.pendingSkill = skill;
        this.attackTimer = 5;
        this.lastHitText = 'Charging Blue...';
        this.messageLife = 1;
    }

    updateBlueCharge(dt) {
        const maxCharge = 2.4;
        if (this.isAI) {
            this.blueChargeTime = Math.min(maxCharge, this.blueChargeTime + dt * CPU_PROFILE.redRelease);
            if (this.blueChargeTime >= 1.15 || this.stamina <= 1 || this.cursed <= 1) {
                this.releaseBlueCharge();
            }
            return;
        }

        if (input[this.blueKey]) {
            this.blueChargeTime = Math.min(maxCharge, this.blueChargeTime + dt);
            this.stamina = Math.max(0, this.stamina - (4.2 * dt));
            this.cursed = Math.max(0, this.cursed - (3.1 * dt));
            if (this.stamina <= 1 || this.cursed <= 1) {
                this.releaseBlueCharge();
            }
            return;
        }

        if (keyReleased(this.blueKey) || !input[this.blueKey]) {
            this.releaseBlueCharge();
        }
    }

    releaseBlueCharge() {
        if (!this.blueCharging || !this.blueSkill || !this.blueTarget) {
            return;
        }

        const skill = this.blueSkill;
        const enemy = this.blueTarget;
        const ratio = clamp(this.blueChargeTime / 2.4, 0, 1);
        const handX = this.facing === 1 ? this.x + this.w + 10 : this.x - 10;
        const handY = this.y + 34;

        if (ratio < 0.35) {
            showChant(['Phase: Pull'], 1.0);
            const cx = this.x + this.w * 0.5;
            const cy = this.y + this.h * 0.45;
            const ex = enemy.x + enemy.w * 0.5;
            const ey = enemy.y + enemy.h * 0.5;
            const dx = cx - ex;
            const dy = cy - ey;
            const dist = Math.max(1, Math.hypot(dx, dy));
            enemy.vx += (dx / dist) * 540;
            enemy.vy += (dy / dist) * 360;
            enemy.moveLockTimer = Math.max(enemy.moveLockTimer, 0.85);
            applyHit(enemy, this, skill.damage * 1.2, skill.knock * 0.3, 'energy');
            spawnRing(cx, cy, '#78d7ff', 170, 0.42);
            spawnSparkBurst(cx, cy, '#b0edff', 24, 330, 0.36);
            this.lastHitText = 'Phase: Pull';
            this.messageLife = 0.9;
        } else if (ratio < 0.8) {
            showChant(['Twilight: Shoot'], 1.0);
            projectiles.push(new Projectile({
                type: 'blueVacuum', owner: this, enemy, skill,
                x: handX - 28, y: handY - 28, w: 56, h: 56,
                vx: this.facing * 420, vy: -6, life: 2.05, color: '#61d6ff',
                extra: { radius: 85, captured: false }
            }));
            this.lastHitText = 'Twilight: Shoot';
            this.messageLife = 0.9;
        } else {
            showChant(['Eyes of Wisdom'], 1.1);
            projectiles.push(new Projectile({
                type: 'blueWisdom', owner: this, enemy, skill,
                x: handX - 42, y: handY - 42, w: 84, h: 84,
                vx: 0, vy: 0, life: 2.8, color: '#74deff',
                extra: { radius: 190, tick: 0.14 }
            }));
            this.lastHitText = 'Eyes of Wisdom';
            this.messageLife = 1.0;
        }

        spawnRing(handX, handY, '#8be1ff', 56 + ratio * 90, 0.3);
        this.blueCharging = false;
        this.blueChargeTime = 0;
        this.blueSkill = null;
        this.blueTarget = null;
        this.blueKey = '';
        this.pendingSkill = null;
        this.attackTimer = 0.28;
    }

    useKamotoke(enemy) {
        if (this.character !== 'sukuna' || this.kamotokeCharges <= 0 || this.attackTimer > 0 || this.itemUseCooldown > 0) {
            return;
        }

        this.kamotokeCharges -= 1;
        this.itemUseCooldown = 1.2;
        this.attackTimer = 0.3;
        this.pendingSkill = { name: 'Kamotoke' };
        this.lastHitText = 'Kamotoke!';
        this.messageLife = 0.75;
        showChant(['KAMOTOKE'], 0.7);

        const impactX = enemy.x + enemy.w * 0.5;
        const impactY = enemy.y + enemy.h * 0.45;
        const startX = impactX + (Math.random() * 80 - 40);
        effects.push({ type: 'lightning', x1: startX, y1: 0, x2: impactX, y2: impactY, life: 0.24, age: 0, color: '#d9ecff' });

        scheduleAction(0.14, () => {
            overlayState.flashTimer = Math.max(overlayState.flashTimer, 0.2);
            overlayState.flashColor = '#edf5ff';
            spawnRing(impactX, impactY, '#d7ebff', 118, 0.28);
            spawnSparkBurst(impactX, impactY, '#cde3ff', 24, 300, 0.34);
            enemy.moveLockTimer = Math.max(enemy.moveLockTimer, 0.45);
            applyHit(enemy, this, 20, 620, 'void');
        });

        syncPlayerShopItems();
    }

    updateRedCharge(dt) {
        const maxCharge = 2.6;
        if (this.isAI) {
            this.redChargeTime = Math.min(maxCharge, this.redChargeTime + dt * CPU_PROFILE.redRelease);
            if (this.redChargeTime >= 1.15 || this.stamina <= 1 || this.cursed <= 1) {
                this.releaseRedCharge();
            }
            return;
        }

        if (input[this.redKey]) {
            this.redChargeTime = Math.min(maxCharge, this.redChargeTime + dt);
            this.stamina = Math.max(0, this.stamina - (4.8 * dt));
            this.cursed = Math.max(0, this.cursed - (3.6 * dt));
            if (this.stamina <= 1 || this.cursed <= 1) {
                this.releaseRedCharge();
            }
            return;
        }

        if (keyReleased(this.redKey) || !input[this.redKey]) {
            this.releaseRedCharge();
        }
    }

    releaseRedCharge() {
        if (!this.redCharging || !this.redSkill || !this.redTarget) {
            return;
        }

        const skill = this.redSkill;
        const enemy = this.redTarget;
        const ratio = clamp(this.redChargeTime / 2.6, 0, 1);
        const handX = this.facing === 1 ? this.x + this.w + 10 : this.x - 10;
        const handY = this.y + 26;

        if (ratio < 0.36) {
            showChant(['Phase: Explosion'], 1.0);
            const cx = this.x + this.w * 0.5 + this.facing * 40;
            const cy = this.y + this.h * 0.42;
            spawnRing(cx, cy, '#ff6a84', 150, 0.35);
            spawnSparkBurst(cx, cy, '#ff96a8', 32, 360, 0.44);

            const ex = enemy.x + enemy.w * 0.5;
            const ey = enemy.y + enemy.h * 0.5;
            if (Math.hypot(ex - cx, ey - cy) < 185) {
                applyHit(enemy, this, skill.damage * 1.45, skill.knock * 1.15, 'energy');
            }
            this.lastHitText = 'Phase: Explosion';
            this.messageLife = 1.0;
        } else {
            const maxOutput = ratio >= 0.88;
            const scale = maxOutput ? 2.9 : (1.15 + ratio * 1.25);
            const damageMult = maxOutput ? 4.25 : (1.1 + ratio * 1.45);
            const knockMult = maxOutput ? 2.2 : (1 + ratio * 0.8);

            projectiles.push(new Projectile({
                type: 'redOrb', owner: this, enemy, skill,
                x: handX - 18 * scale,
                y: handY - 18 * scale,
                w: 36 * scale,
                h: 36 * scale,
                vx: this.facing * (560 + ratio * 300),
                vy: -8,
                life: 1.35,
                color: '#ff5b75',
                extra: {
                    charged: true,
                    scale,
                    damageMult,
                    knockMult,
                    maxOutput
                }
            }));

            spawnRing(handX, handY, '#ff5977', 52 + ratio * 100, 0.24);
            spawnSparkBurst(handX, handY, '#ff8ea1', 14 + Math.floor(ratio * 18), 260 + ratio * 220, 0.34);

            if (maxOutput) {
                showChant(['Pillars of Light!'], 1.1);
                this.lastHitText = 'Maximum Output: Red';
                this.messageLife = 1.35;
            } else {
                showChant(['Pramita!'], 0.95);
                this.lastHitText = 'Pramita';
                this.messageLife = 0.9;
            }
        }

        this.redCharging = false;
        this.redChargeTime = 0;
        this.redSkill = null;
        this.redTarget = null;
        this.redKey = '';
        this.pendingSkill = null;
        this.attackTimer = 0.26;
    }

    spawnSkillAction(skill, enemy) {
        const handX = this.facing === 1 ? this.x + this.w + 10 : this.x - 10;
        const handY = this.y + 40;

        if (skill.name === 'Red') {
            projectiles.push(new Projectile({
                type: 'redOrb', owner: this, enemy, skill,
                x: handX - 18, y: handY - 18, w: 36, h: 36,
                vx: this.facing * 520, vy: 0, life: 1.2, color: '#ff5b75'
            }));
            spawnRing(handX, handY, '#ff5977', 52, 0.2);
            return;
        }

        if (skill.name === 'Blue') {
            projectiles.push(new Projectile({
                type: 'blueVacuum', owner: this, enemy, skill,
                x: handX - 26, y: handY - 26, w: 52, h: 52,
                vx: this.facing * 320, vy: -4, life: 1.65, color: '#61d6ff',
                extra: { radius: 70, captured: false }
            }));
            spawnRing(handX, handY, '#7cd9ff', 64, 0.32);
            return;
        }

        if (skill.name === 'Purple') {
            startCinematic('purple', this, enemy, skill, 2.3, firePurpleWave);
            return;
        }

        if (skill.name === 'Dismantle') {
            for (let i = 0; i < 3; i += 1) {
                projectiles.push(new Projectile({
                    type: 'dismantleSlash', owner: this, enemy, skill,
                    x: handX + (this.facing * i * 14) - 14,
                    y: handY - 10 + (i * 12), w: 28, h: 28,
                    vx: this.facing * (560 + i * 120), vy: (i - 1) * 12,
                    life: 0.8, color: '#ffd6dc',
                    extra: { phase: Math.random() * Math.PI * 2 }
                }));
            }
            spawnSparkBurst(handX, handY, '#ffb8c1', 10, 180, 0.2);
            return;
        }

        if (skill.name === 'Fuga') {
            startCinematic('fuga', this, enemy, skill, 1.55, fireFugaArrow);
            return;
        }

        if (skill.name === 'Cleave') {
            const hitbox = {
                x: this.facing === 1 ? this.x + this.w - 2 : this.x - skill.range,
                y: this.y + 14,
                w: skill.range,
                h: this.h - 16
            };
            const hurt = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
            spawnSlashEffect(handX + this.facing * 22, handY - 6, this.facing, '#ffd4dd');
            if (rectsOverlap(hitbox, hurt)) {
                enemy.vy = -360;
                enemy.vx += this.facing * 80;
                applyHit(enemy, this, skill.damage * 0.55, skill.knock * 0.45, 'slash');

                const gutX = enemy.x + enemy.w * 0.5;
                const gutY = enemy.y + enemy.h * 0.5;
                for (let i = 1; i <= 3; i += 1) {
                    scheduleAction(0.09 * i, () => {
                        spawnSlashEffect(gutX + this.facing * (6 * i), gutY - 16 + (i * 8), this.facing, '#ffd7df');
                        applyHit(enemy, this, skill.damage * 0.26, skill.knock * 0.12, 'slash');
                    });
                }
                scheduleAction(0.38, () => {
                    applyHit(enemy, this, skill.damage * 0.48, skill.knock * 0.68, 'slash');
                    enemy.vx += this.facing * 290;
                    enemy.vy = -180;
                    spawnSparkBurst(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.45, '#ffc2cb', 14, 260, 0.26);
                });
            }
            return;
        }

        if (skill.name === 'Infinite Void' || skill.name === 'Malevolent Shrine') {
            queueDomainExpansion(this, enemy, skill);
        }
    }

    regenResources(dt) {
        if (this.attackTimer <= 0 && !this.blocking) {
            this.stamina = Math.min(WORLD.maxStamina, this.stamina + 16 * dt);
        }
        const ceRegen = this.hasGlasses ? 8.6 : 6;
        this.cursed = Math.min(WORLD.maxCursed, this.cursed + ceRegen * dt);
    }

    applyPhysics(dt) {
        this.vy += WORLD.gravity * dt;
        this.y += this.vy * dt;

        if (this.y + this.h >= WORLD.floorY) {
            this.y = WORLD.floorY - this.h;
            this.vy = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }

        this.vx *= 0.88;
    }

    draw() {
        const centerX = this.x + this.w * 0.5;
        const baseY = this.y + this.h;

        let state = 'idle';
        if (!this.grounded) state = 'jump';
        else if (this.blocking) state = 'block';
        else if (this.redCharging) state = 'redCharge';
        else if (this.attackTimer > 0) state = 'cast';
        else if (Math.abs(this.vx) > 20) state = 'run';

        const cycle = this.anim * 8;
        const bob = state === 'idle' ? Math.sin(cycle) * 1.8 : 0;
        const runSwing = state === 'run' ? Math.sin(cycle * 1.5) * 9 : 0;
        const armCast = state === 'cast' ? 18 : (state === 'redCharge' ? 28 : 0);
        const armLift = state === 'redCharge' ? -22 : 0;
        const lean = state === 'block' ? this.facing * -7 : (state === 'run' ? this.facing * 5 : 0);

        const skin = this.hitFlash > 0 ? '#ffffff' : '#f4eadf';
        const body = this.hitFlash > 0 ? '#ffffff' : this.color;

        ctx.save();
        ctx.translate(centerX, baseY);

        ctx.strokeStyle = this.edge;
        ctx.lineWidth = 2.8;
        ctx.fillStyle = body;

        ctx.beginPath();
        ctx.roundRect(-16 + lean, -70 + bob, 32, 46, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(lean, -88 + bob, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#10121e';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.fillStyle = this.hair;
        ctx.beginPath();
        ctx.arc(lean, -96 + bob, 10, Math.PI, Math.PI * 2);
        ctx.fill();

        const frontArmX = this.facing * (14 + armCast) + lean;
        const backArmX = this.facing * (-14) + lean;
        drawLine(backArmX, -54 + bob, backArmX - this.facing * 10, -22 + bob, 6, body);
        drawLine(frontArmX, -56 + bob, frontArmX + this.facing * (state === 'cast' || state === 'redCharge' ? 28 : 8), -24 + bob + armLift, 6, body);

        const legSpread = state === 'run' ? runSwing : 2;
        drawLine(lean - 7, -24 + bob, lean - 10 - legSpread, 8, 7, body);
        drawLine(lean + 7, -24 + bob, lean + 10 + legSpread, 8, 7, body);

        if (this.blocking) {
            ctx.strokeStyle = '#8de9ff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(frontArmX + this.facing * 14, -38 + bob, 16, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (this.pendingSkill || this.redCharging) {
            const pulseX = frontArmX + this.facing * 20;
            const pulseY = -34 + bob + armLift;
            const chargeBoost = this.redCharging ? (this.redChargeTime / 2.6) * 18 : 0;
            const pulseR = 8 + Math.sin(this.anim * 30) * 2 + chargeBoost;
            const grad = ctx.createRadialGradient(pulseX, pulseY, 2, pulseX, pulseY, pulseR + 10);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.4, this.redCharging ? '#ff667b' : this.aura);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, pulseR + 5, 0, Math.PI * 2);
            ctx.fill();

            if (this.redCharging) {
                ctx.strokeStyle = '#ffb7c2';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, pulseR + 16, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();

        if (this.messageLife > 0) {
            ctx.fillStyle = '#f7fbff';
            ctx.font = '20px "Barlow Condensed"';
            ctx.fillText(this.lastHitText, this.x - 4, this.y - 12);
        }
    }
}

function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
        const e = effects[i];
        e.age += dt;
        if (e.age >= e.life) {
            effects.splice(i, 1);
            continue;
        }

        if (e.type === 'spark') {
            e.vy += 420 * dt;
            e.x += e.vx * dt;
            e.y += e.vy * dt;
            e.vx *= 0.96;
        } else if (e.type === 'beam') {
            e.w *= 0.995;
        } else if (e.type === 'lightning') {
            e.x1 += (Math.random() - 0.5) * 20;
            e.x2 += (Math.random() - 0.5) * 10;
        }
    }
}

function drawEffects() {
    for (let i = 0; i < effects.length; i += 1) {
        const e = effects[i];
        const t = e.age / e.life;

        if (e.type === 'spark') {
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * (1 - t * 0.4), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        } else if (e.type === 'ring') {
            ctx.globalAlpha = 1 - t;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.maxR * t, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        } else if (e.type === 'slash') {
            ctx.globalAlpha = 1 - t;
            const len = e.len * (0.35 + t);
            drawLine(
                e.x - (len * 0.5 * e.facing),
                e.y - 12,
                e.x + (len * 0.5 * e.facing),
                e.y + 12,
                4 * (1 - t * 0.3),
                e.color
            );
            ctx.globalAlpha = 1;
        } else if (e.type === 'beam') {
            const alpha = (1 - t) * 0.8;
            ctx.globalAlpha = alpha;
            const grad = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.h);
            grad.addColorStop(0, 'rgba(255, 236, 167, 0.2)');
            grad.addColorStop(0.4, 'rgba(255, 126, 54, 0.85)');
            grad.addColorStop(1, 'rgba(255, 70, 24, 0.22)');
            ctx.fillStyle = grad;
            ctx.fillRect(e.x, e.y, e.w, e.h);
            ctx.strokeStyle = 'rgba(255, 227, 173, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(e.x, e.y + 4, e.w, e.h - 8);
            ctx.globalAlpha = 1;
        } else if (e.type === 'lightning') {
            ctx.globalAlpha = 1 - t;
            ctx.strokeStyle = e.color || '#d9ecff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(e.x1, e.y1);
            const midX = (e.x1 + e.x2) * 0.5 + (Math.random() * 36 - 18);
            const midY = (e.y1 + e.y2) * 0.5;
            ctx.lineTo(midX, midY);
            ctx.lineTo(e.x2, e.y2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
        const p = projectiles[i];
        p.update(dt);
        if (p.dead) {
            projectiles.splice(i, 1);
        }
    }
}

function drawProjectiles() {
    for (let i = 0; i < projectiles.length; i += 1) {
        projectiles[i].draw();
    }
}

const saved = JSON.parse(localStorage.getItem('battleKaisen.selection') || '{}');
const settings = JSON.parse(localStorage.getItem('battleKaisen.settings') || '{}');
const matchMode = ['same-device', 'computer', 'multiplayer'].includes(settings.matchMode)
    ? settings.matchMode
    : 'same-device';
const multiplayerWsUrl = (settings.wsUrl || '').trim();
const isComputerMode = matchMode === 'computer';
const cpuDifficulty = ['easy', 'normal', 'hard'].includes(settings.cpuDifficulty)
    ? settings.cpuDifficulty
    : 'normal';
const CPU_PROFILE = {
    easy: { dodgeChance: 0.04, skillChanceMult: 0.7, clashMashChance: 0.18, redRelease: 0.7, blockSense: 0.65 },
    normal: { dodgeChance: 0.08, skillChanceMult: 1, clashMashChance: 0.3, redRelease: 1.1, blockSense: 1 },
    hard: { dodgeChance: 0.15, skillChanceMult: 1.45, clashMashChance: 0.48, redRelease: 1.8, blockSense: 1.35 }
}[cpuDifficulty];
const p1Char = saved.p1 === 'sukuna' ? 'sukuna' : 'gojo';
const p2Char = saved.p2 === 'gojo' ? 'gojo' : 'sukuna';
const selectedMap = ['blank', 'city', 'field', 'space'].includes(saved.map) ? saved.map : 'blank';
const MAP_LABELS = {
    blank: 'Blank Arena',
    city: 'City Map',
    field: 'Flower Field',
    space: 'Space Map'
};
const shopState = loadShopState();

const player1 = new Fighter({
    name: 'Player 1',
    character: p1Char,
    color: CHARACTER_DATA[p1Char].color,
    edge: CHARACTER_DATA[p1Char].edge,
    aura: CHARACTER_DATA[p1Char].aura,
    hair: CHARACTER_DATA[p1Char].hair,
    x: 180,
    y: 200,
    facing: 1,
    skillData: CHARACTER_DATA[p1Char],
    controls: {
        isP1: true,
        left: 'KeyA',
        right: 'KeyD',
        jump: 'KeyW',
        dodge: 'KeyS',
        block: 'KeyF'
    },
    hasGlasses: !!shopState.p1.glasses,
    kamotokeCharges: shopState.p1.kamotokeCharges || 0
});

const player2 = new Fighter({
    name: isComputerMode ? 'Computer' : 'Player 2',
    character: p2Char,
    color: CHARACTER_DATA[p2Char].color,
    edge: CHARACTER_DATA[p2Char].edge,
    aura: CHARACTER_DATA[p2Char].aura,
    hair: CHARACTER_DATA[p2Char].hair,
    x: 860,
    y: 200,
    facing: -1,
    isAI: isComputerMode,
    skillData: CHARACTER_DATA[p2Char],
    controls: {
        isP1: false,
        left: 'ArrowLeft',
        right: 'ArrowRight',
        jump: 'ArrowUp',
        dodge: 'ArrowDown',
        block: 'ShiftRight'
    },
    hasGlasses: !!shopState.p2.glasses,
    kamotokeCharges: shopState.p2.kamotokeCharges || 0
});

const roundInfoEl = document.getElementById('roundInfo');
const modeInfoEl = document.getElementById('modeInfo');
const mapInfoEl = document.getElementById('mapInfo');
const p1InfoEl = document.getElementById('p1Info');
const p2InfoEl = document.getElementById('p2Info');
const resetBtn = document.getElementById('resetBtn');
const shopPointsEl = document.getElementById('shopPoints');
const shopStatusEl = document.getElementById('shopStatus');
const matchOverlayEl = document.getElementById('matchOverlay');
const matchTitleEl = document.getElementById('matchTitle');
const matchStatusEl = document.getElementById('matchStatus');

const multiplayerState = {
    enabled: matchMode === 'multiplayer',
    supported: typeof WebSocket !== 'undefined',
    searching: false,
    matched: matchMode !== 'multiplayer',
    role: 'local',
    clientId: `client-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    peerId: '',
    roomId: '',
    socket: null,
    connected: false,
    wsUrl: multiplayerWsUrl,
    seekInterval: null,
    remoteInput: {
        p1: { keys: {}, mouse: { left: false, right: false, x: canvas.width * 0.5, y: canvas.height * 0.5 } },
        p2: { keys: {}, mouse: { left: false, right: false, x: canvas.width * 0.5, y: canvas.height * 0.5 } }
    }
};

function showMatchOverlay(title, status) {
    if (!matchOverlayEl) return;
    matchOverlayEl.style.display = 'block';
    if (matchTitleEl) matchTitleEl.textContent = title;
    if (matchStatusEl) matchStatusEl.textContent = status;
}

function hideMatchOverlay() {
    if (!matchOverlayEl) return;
    matchOverlayEl.style.display = 'none';
}

function getCodesForFighter(fighter) {
    const codes = [
        fighter.controls.left,
        fighter.controls.right,
        fighter.controls.jump,
        fighter.controls.dodge,
        fighter.controls.block,
        fighter.itemKey
    ];
    const kit = [...fighter.skillData.skills, fighter.skillData.ult];
    for (let i = 0; i < kit.length; i += 1) {
        const s = kit[i];
        codes.push(fighter.controls.isP1 ? s.codeP1 : s.codeP2);
    }
    return codes;
}

function buildLocalInputSnapshot(side) {
    const fighter = side === 'p1' ? player1 : player2;
    const keys = {};
    const codes = getCodesForFighter(fighter);
    for (let i = 0; i < codes.length; i += 1) {
        keys[codes[i]] = !!input[codes[i]];
    }
    return {
        keys,
        mouse: {
            left: !!physicalMouseState.left,
            right: !!physicalMouseState.right,
            x: mousePos.x,
            y: mousePos.y
        }
    };
}

function applyRemoteSnapshotToSide(side) {
    const fighter = side === 'p1' ? player1 : player2;
    const snapshot = multiplayerState.remoteInput[side];
    if (!snapshot) return;

    const codes = getCodesForFighter(fighter);
    for (let i = 0; i < codes.length; i += 1) {
        const code = codes[i];
        input[code] = !!(snapshot.keys && snapshot.keys[code]);
    }

    fighter.netMouseX = Number.isFinite(snapshot.mouse && snapshot.mouse.x) ? snapshot.mouse.x : fighter.netMouseX;
    fighter.netMouseY = Number.isFinite(snapshot.mouse && snapshot.mouse.y) ? snapshot.mouse.y : fighter.netMouseY;
}

function sendNetMessage(payload) {
    if (!multiplayerState.socket || multiplayerState.socket.readyState !== WebSocket.OPEN) return;
    multiplayerState.socket.send(JSON.stringify(payload));
}

function finalizeMultiplayerMatch(role, peerId, roomId) {
    multiplayerState.role = role;
    multiplayerState.peerId = peerId;
    multiplayerState.roomId = roomId;
    multiplayerState.matched = true;
    multiplayerState.searching = false;
    if (multiplayerState.seekInterval) {
        clearInterval(multiplayerState.seekInterval);
        multiplayerState.seekInterval = null;
    }
    const side = role.toUpperCase();
    showMatchOverlay('Match Found', `Connected. You control ${side}. Starting...`);
    setTimeout(() => {
        hideMatchOverlay();
    }, 800);
    resetRound();
}

function handleNetMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'matched') {
        finalizeMultiplayerMatch(msg.role === 'p2' ? 'p2' : 'p1', msg.peerId || '', msg.roomId || '');
        return;
    }

    if (msg.type === 'input' && multiplayerState.matched && msg.roomId === multiplayerState.roomId) {
        if (msg.side === 'p1' || msg.side === 'p2') {
            multiplayerState.remoteInput[msg.side] = {
                keys: msg.keys || {},
                mouse: msg.mouse || { left: false, right: false, x: canvas.width * 0.5, y: canvas.height * 0.5 }
            };
        }
        return;
    }

    if (msg.type === 'peer-left') {
        multiplayerState.matched = false;
        multiplayerState.searching = true;
        showMatchOverlay('Opponent Left', 'Searching for a new opponent...');
        sendNetMessage({ type: 'joinQueue', clientId: multiplayerState.clientId, map: selectedMap, p1: p1Char, p2: p2Char });
    }
}

function startMultiplayerMatchmaking() {
    if (matchMode !== 'multiplayer') {
        return;
    }

    if (!multiplayerState.supported) {
        showMatchOverlay('Multiplayer Unavailable', 'WebSocket is not supported in this browser.');
        return;
    }

    if (!multiplayerState.wsUrl) {
        showMatchOverlay('Multiplayer Setup Required', 'Set a WebSocket URL in Options before starting Multiplayer.');
        return;
    }

    showMatchOverlay('Matchmaking', 'Connecting to global server...');

    try {
        multiplayerState.socket = new WebSocket(multiplayerState.wsUrl);
    } catch (error) {
        showMatchOverlay('Connection Failed', 'Invalid WebSocket URL. Check Options and try again.');
        return;
    }

    multiplayerState.socket.addEventListener('open', () => {
        multiplayerState.connected = true;
        multiplayerState.searching = true;
        multiplayerState.matched = false;
        showMatchOverlay('Matchmaking', 'Searching for another player globally...');
        sendNetMessage({ type: 'joinQueue', clientId: multiplayerState.clientId, map: selectedMap, p1: p1Char, p2: p2Char });
    });

    multiplayerState.socket.addEventListener('message', (event) => {
        let msg = null;
        try {
            msg = JSON.parse(event.data);
        } catch (error) {
            return;
        }
        handleNetMessage(msg);
    });

    multiplayerState.socket.addEventListener('close', () => {
        multiplayerState.connected = false;
        multiplayerState.matched = false;
        multiplayerState.searching = false;
        if (multiplayerState.seekInterval) {
            clearInterval(multiplayerState.seekInterval);
            multiplayerState.seekInterval = null;
        }
        if (matchMode === 'multiplayer') {
            showMatchOverlay('Disconnected', 'Lost connection to matchmaking server.');
        }
    });

    multiplayerState.socket.addEventListener('error', () => {
        showMatchOverlay('Connection Error', 'Could not connect to matchmaking server.');
    });
}

function syncMultiplayerInputs() {
    if (!multiplayerState.enabled || !multiplayerState.matched || !multiplayerState.connected) {
        mouseState.left = physicalMouseState.left;
        mouseState.right = physicalMouseState.right;
        return;
    }

    const localSide = multiplayerState.role === 'p2' ? 'p2' : 'p1';
    const remoteSide = localSide === 'p1' ? 'p2' : 'p1';

    applyRemoteSnapshotToSide(remoteSide);
    const localSnapshot = buildLocalInputSnapshot(localSide);

    sendNetMessage({
        type: 'input',
        from: multiplayerState.clientId,
        roomId: multiplayerState.roomId,
        side: localSide,
        keys: localSnapshot.keys,
        mouse: localSnapshot.mouse
    });

    if (localSide === 'p1') {
        mouseState.left = !!localSnapshot.mouse.left;
        mouseState.right = !!(multiplayerState.remoteInput.p2.mouse && multiplayerState.remoteInput.p2.mouse.right);
        player1.netMouseX = localSnapshot.mouse.x;
        player1.netMouseY = localSnapshot.mouse.y;
    } else {
        mouseState.right = !!localSnapshot.mouse.right;
        mouseState.left = !!(multiplayerState.remoteInput.p1.mouse && multiplayerState.remoteInput.p1.mouse.left);
        player2.netMouseX = localSnapshot.mouse.x;
        player2.netMouseY = localSnapshot.mouse.y;
    }
}

function syncPlayerShopItems() {
    shopState.p1.kamotokeCharges = player1.kamotokeCharges;
    shopState.p2.kamotokeCharges = player2.kamotokeCharges;
    shopState.p1.glasses = player1.hasGlasses;
    shopState.p2.glasses = player2.hasGlasses;
    saveShopState(shopState);
    updateShopUi();
}

function updateShopUi(message = '') {
    if (shopPointsEl) {
        shopPointsEl.textContent = `P1 Points: ${shopState.p1Points} | P2 Points: ${shopState.p2Points}`;
    }
    if (shopStatusEl && message) {
        shopStatusEl.textContent = message;
    }
}

function setupShopButtons() {
    const buyGlassesP1 = document.getElementById('buyGlassesP1');
    const buyGlassesP2 = document.getElementById('buyGlassesP2');
    const buyKamotokeP1 = document.getElementById('buyKamotokeP1');
    const buyKamotokeP2 = document.getElementById('buyKamotokeP2');

    function buyGlasses(player, side) {
        const pointsKey = side === 'p1' ? 'p1Points' : 'p2Points';
        if (shopState[pointsKey] < ITEM_COSTS.glasses) {
            updateShopUi('Not enough points for Gojo\'s Glasses.');
            return;
        }
        if (player.hasGlasses) {
            updateShopUi(`${player.name} already owns Gojo\'s Glasses.`);
            return;
        }
        shopState[pointsKey] -= ITEM_COSTS.glasses;
        player.hasGlasses = true;
        syncPlayerShopItems();
        updateShopUi(`${player.name} bought Gojo\'s Glasses.`);
    }

    function buyKamotoke(player, side) {
        const pointsKey = side === 'p1' ? 'p1Points' : 'p2Points';
        if (shopState[pointsKey] < ITEM_COSTS.kamotoke) {
            updateShopUi('Not enough points for Kamotoke.');
            return;
        }
        if (player.character !== 'sukuna') {
            updateShopUi('Kamotoke can only be bought by Sukuna.');
            return;
        }
        shopState[pointsKey] -= ITEM_COSTS.kamotoke;
        player.kamotokeCharges += 1;
        syncPlayerShopItems();
        updateShopUi(`${player.name} bought Kamotoke (+1 charge).`);
    }

    if (buyGlassesP1) buyGlassesP1.addEventListener('click', () => buyGlasses(player1, 'p1'));
    if (buyGlassesP2) buyGlassesP2.addEventListener('click', () => buyGlasses(player2, 'p2'));
    if (buyKamotokeP1) buyKamotokeP1.addEventListener('click', () => buyKamotoke(player1, 'p1'));
    if (buyKamotokeP2) buyKamotokeP2.addEventListener('click', () => buyKamotoke(player2, 'p2'));
    updateShopUi('Win rounds to earn points, then buy power ups.');
}

let roundTimer = WORLD.roundTime;
let roundOver = false;
let winner = '';
let lastTime = 0;
const domainState = {
    timer: 0,
    owner: null,
    color: '#c9b3ff',
    name: '',
    type: '',
    victim: null,
    slashTick: 0
};
const cinematic = {
    active: false,
    type: '',
    timer: 0,
    duration: 0,
    caster: null,
    enemy: null,
    skill: null,
    finished: null
};
const domainQueue = { p1: null, p2: null, window: 0.55 };
const clashState = {
    active: false,
    timer: 0,
    duration: 3.8,
    p1Score: 0,
    p2Score: 0,
    p1Caster: null,
    p2Caster: null,
    p1Skill: null,
    p2Skill: null,
    winnerText: ''
};

function startCinematic(type, caster, enemy, skill, duration, onFinish) {
    cinematic.active = true;
    cinematic.type = type;
    cinematic.timer = 0;
    cinematic.duration = duration;
    cinematic.caster = caster;
    cinematic.enemy = enemy;
    cinematic.skill = skill;
    cinematic.finished = onFinish;
    caster.attackTimer = Math.max(caster.attackTimer, duration + 0.2);
}

function firePurpleWave(caster, enemy, skill) {
    projectiles.push(new Projectile({
        type: 'purpleWave', owner: caster, enemy, skill,
        x: caster.facing === 1 ? caster.x + caster.w - 8 : caster.x - 98,
        y: caster.y + 8, w: 92, h: 92,
        vx: caster.facing * 520, vy: -24, life: 1.35, color: '#9d7cff'
    }));
    spawnRing(caster.x + caster.w * 0.5 + caster.facing * 30, caster.y + 40, '#a895ff', 86, 0.38);
}

function fireFugaArrow(caster, enemy, skill) {
    const handX = caster.facing === 1 ? caster.x + caster.w + 10 : caster.x - 10;
    const handY = caster.y + 40;
    projectiles.push(new Projectile({
        type: 'fugaArrow', owner: caster, enemy, skill,
        x: handX - 24, y: handY - 10, w: 62, h: 20,
        vx: caster.facing * 780, vy: 0, life: 0.96, color: '#ff9642',
        extra: { beam: true }
    }));
    spawnSparkBurst(handX, handY, '#ffc66e', 20, 300, 0.34);
}

function triggerDomain(caster, enemy, skill, duration = DOMAIN_DURATION) {
    const hitbox = {
        x: caster.x + (caster.facing === 1 ? 40 : -skill.range),
        y: caster.y - 14,
        w: skill.range,
        h: caster.h + 32
    };
    const hurt = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
    const domainColor = skill.name === 'Infinite Void' ? '#c9b3ff' : '#ff8fa0';

    domainState.timer = duration;
    domainState.owner = caster;
    domainState.color = domainColor;
    domainState.name = skill.name;
    domainState.type = skill.name === 'Infinite Void' ? 'void' : 'shrine';
    domainState.victim = enemy;
    domainState.slashTick = 0.15;

    spawnRing(caster.x + caster.w * 0.5, caster.y + caster.h * 0.5, domainColor, 200, 0.55);
    spawnSparkBurst(caster.x + caster.w * 0.5, caster.y + caster.h * 0.5, domainColor, 28, 340, 0.5);

    if (rectsOverlap(hitbox, hurt)) {
        applyHit(enemy, caster, skill.damage, skill.knock, 'void');
    }
}

function queueDomainExpansion(caster, enemy, skill) {
    const side = caster.controls.isP1 ? 'p1' : 'p2';
    const otherSide = side === 'p1' ? 'p2' : 'p1';
    const queued = { caster, enemy, skill, timer: domainQueue.window };

    if (domainQueue[otherSide]) {
        const other = domainQueue[otherSide];
        startDomainClash(queued, other);
        domainQueue.p1 = null;
        domainQueue.p2 = null;
        return;
    }

    domainQueue[side] = queued;
    caster.lastHitText = 'Domain queued...';
    caster.messageLife = 0.35;
}

function startDomainClash(a, b) {
    clashState.active = true;
    clashState.timer = 0;
    clashState.p1Score = 0;
    clashState.p2Score = 0;
    clashState.winnerText = '';

    const first = a.caster.controls.isP1 ? a : b;
    const second = a.caster.controls.isP1 ? b : a;
    clashState.p1Caster = first.caster;
    clashState.p2Caster = second.caster;
    clashState.p1Skill = first.skill;
    clashState.p2Skill = second.skill;

    clashState.p1Caster.attackTimer = Math.max(clashState.p1Caster.attackTimer, clashState.duration + 0.2);
    clashState.p2Caster.attackTimer = Math.max(clashState.p2Caster.attackTimer, clashState.duration + 0.2);
}

function updateDomainQueue(dt) {
    if (clashState.active || cinematic.active) {
        return;
    }

    ['p1', 'p2'].forEach((side) => {
        const entry = domainQueue[side];
        if (!entry) return;
        entry.timer -= dt;
        if (entry.timer <= 0) {
            domainQueue[side] = null;
            startCinematic('domain', entry.caster, entry.enemy, entry.skill, 1.9, triggerDomain);
        }
    });
}

function updateDomainClash(dt) {
    if (!clashState.active) {
        return;
    }

    clashState.timer += dt;
    if (keyPressed('KeyG')) clashState.p1Score += 1;
    if (isComputerMode) {
        if (Math.random() < CPU_PROFILE.clashMashChance) clashState.p2Score += 1;
    } else {
        if (keyPressed('KeyK')) clashState.p2Score += 1;
    }

    if (clashState.timer >= clashState.duration) {
        clashState.active = false;
        const p1Wins = clashState.p1Score > clashState.p2Score;
        const p2Wins = clashState.p2Score > clashState.p1Score;

        if (p1Wins) {
            clashState.winnerText = 'Player 1 Wins The Clash';
            showChant([clashState.winnerText], 1.25);
            startCinematic('domain', clashState.p1Caster, clashState.p2Caster, clashState.p1Skill, 1.55, (c, e, s) => {
                triggerDomain(c, e, s, DOMAIN_CLASH_WIN_DURATION);
            });
        } else if (p2Wins) {
            clashState.winnerText = 'Player 2 Wins The Clash';
            showChant([clashState.winnerText], 1.25);
            startCinematic('domain', clashState.p2Caster, clashState.p1Caster, clashState.p2Skill, 1.55, (c, e, s) => {
                triggerDomain(c, e, s, DOMAIN_CLASH_WIN_DURATION);
            });
        } else {
            clashState.winnerText = 'Clash Draw';
            showChant([clashState.winnerText], 1.0);
            overlayState.flashTimer = 0.2;
            overlayState.flashColor = '#e6ecff';
        }
    }
}

function drawDomainClashOverlay() {
    if (!clashState.active) {
        return;
    }

    const p = clamp(clashState.timer / clashState.duration, 0, 1);
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, canvas.width, 0);
    bg.addColorStop(0, '#2a090d');
    bg.addColorStop(0.5, '#0a0b16');
    bg.addColorStop(1, '#0a1f33');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 16; i += 1) {
        const x = (i / 15) * canvas.width;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,95,95,0.18)' : 'rgba(118,202,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(x - 130, 0);
        ctx.lineTo(x + 130, canvas.height);
        ctx.stroke();
    }

    drawModelAt(canvas.width * 0.28, canvas.height * 0.78, 2.8, clashState.p1Caster, 'cast', 1, clashState.timer);
    drawModelAt(canvas.width * 0.72, canvas.height * 0.78, 2.8, clashState.p2Caster, 'cast', -1, clashState.timer);

    ctx.fillStyle = '#f8f9ff';
    ctx.font = '64px "Bebas Neue"';
    ctx.fillText('DOMAIN CLASH', canvas.width * 0.5 - 175, 86);
    ctx.font = '44px "Bebas Neue"';
    ctx.fillText('VS', canvas.width * 0.5 - 20, 144);

    const total = Math.max(1, clashState.p1Score + clashState.p2Score);
    const p1Ratio = clashState.p1Score / total;
    const p2Ratio = clashState.p2Score / total;
    ctx.fillStyle = '#ff808a';
    ctx.fillRect(110, 174, 380 * p1Ratio, 16);
    ctx.fillStyle = '#7ccfff';
    ctx.fillRect(canvas.width - 490 + (380 * (1 - p2Ratio)), 174, 380 * p2Ratio, 16);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(110, 174, 380, 16);
    ctx.strokeRect(canvas.width - 490, 174, 380, 16);

    const tugCenter = canvas.width * 0.5;
    const tugOffset = (p1Ratio - p2Ratio) * 220;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tugCenter - 240, 232);
    ctx.lineTo(tugCenter + 240, 232);
    ctx.stroke();
    ctx.fillStyle = '#f6f7ff';
    ctx.beginPath();
    ctx.arc(tugCenter + tugOffset, 232, 10, 0, Math.PI * 2);
    ctx.fill();

    const coreSize = 30 + Math.sin(clashState.timer * 18) * 5;
    const coreGrad = ctx.createRadialGradient(tugCenter, 300, 6, tugCenter, 300, coreSize + 28);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.45, '#c79fff');
    coreGrad.addColorStop(1, 'rgba(132,118,255,0.04)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(tugCenter, 300, coreSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff1f4';
    ctx.font = '28px "Bebas Neue"';
    ctx.fillText(`P1 MASH: ${clashState.p1Score}`, 110, 210);
    ctx.fillStyle = '#e4f8ff';
    ctx.fillText(`P2 MASH: ${clashState.p2Score}`, canvas.width - 320, 210);

    ctx.fillStyle = '#f0f2ff';
    ctx.font = '30px "Bebas Neue"';
    const clashHint = isComputerMode ? 'P1 SPAM G  |  P2 AUTO MASH' : 'P1 SPAM G  |  P2 SPAM K';
    ctx.fillText(clashHint, canvas.width * 0.5 - ctx.measureText(clashHint).width * 0.5, canvas.height - 38);

    const topAlpha = 1 - p;
    ctx.globalAlpha = topAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, 8);
    ctx.globalAlpha = 1;

    ctx.restore();
}

function applyDomainEffects(dt) {
    if (domainState.timer <= 0 || !domainState.owner || !domainState.victim) {
        return;
    }

    if (domainState.type === 'void') {
        domainState.victim.moveLockTimer = Math.max(domainState.victim.moveLockTimer, 0.12);
        domainState.victim.vx *= 0.6;
        domainState.victim.vy *= 0.7;
        if (Math.random() < 0.24) {
            spawnRing(domainState.victim.x + domainState.victim.w * 0.5, domainState.victim.y + domainState.victim.h * 0.5, '#b58fff', 36, 0.2);
        }
    }

    if (domainState.type === 'shrine') {
        domainState.slashTick -= dt;
        if (domainState.slashTick <= 0) {
            domainState.slashTick = 0.16;
            applyHit(domainState.victim, domainState.owner, 1.6, 45, 'slash');
            spawnSlashEffect(
                domainState.victim.x + domainState.victim.w * (0.2 + Math.random() * 0.6),
                domainState.victim.y + domainState.victim.h * (0.2 + Math.random() * 0.6),
                Math.random() > 0.5 ? 1 : -1,
                '#ffd5dd'
            );
            spawnSparkBurst(domainState.victim.x + domainState.victim.w * 0.5, domainState.victim.y + domainState.victim.h * 0.4, '#ff8ca1', 5, 180, 0.18);
        }
    }
}

function updateCinematic(dt) {
    if (!cinematic.active) {
        return;
    }

    cinematic.timer += dt;
    if (cinematic.timer >= cinematic.duration) {
        const done = cinematic.finished;
        const caster = cinematic.caster;
        const enemy = cinematic.enemy;
        const skill = cinematic.skill;
        cinematic.active = false;
        cinematic.type = '';
        cinematic.finished = null;
        if (typeof done === 'function') {
            done(caster, enemy, skill);
        }
    }
}

function drawDomainBackdrop() {
    if (domainState.timer <= 0) {
        return;
    }

    const t = domainState.timer;
    const alpha = clamp(0.15 + (t / 4.2) * 0.35, 0.15, 0.5);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.44;

    if (domainState.type === 'void') {
        const cloud = ctx.createRadialGradient(cx, cy, 40, cx, cy, 520);
        cloud.addColorStop(0, 'rgba(22, 13, 40, 0.2)');
        cloud.addColorStop(0.5, 'rgba(81, 41, 122, 0.45)');
        cloud.addColorStop(1, 'rgba(29, 17, 60, 0.7)');
        ctx.fillStyle = cloud;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 180; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const r = 120 + Math.random() * 240;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            const s = 1 + Math.random() * 3;
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = Math.random() > 0.7 ? '#efe7ff' : '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, s, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#f5eeff';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, 154 + Math.sin(t * 7) * 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#d1b48b';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 126 + Math.cos(t * 5) * 6, -0.7, 2.2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = '#030305';
        ctx.beginPath();
        ctx.arc(cx, cy, 76, 0, Math.PI * 2);
        ctx.fill();

        const iris = ctx.createRadialGradient(cx, cy, 8, cx, cy, 88);
        iris.addColorStop(0, 'rgba(105, 212, 255, 0.95)');
        iris.addColorStop(0.45, 'rgba(105, 212, 255, 0.32)');
        iris.addColorStop(1, 'rgba(105, 212, 255, 0)');
        ctx.fillStyle = iris;
        ctx.beginPath();
        ctx.arc(cx, cy, 92, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.strokeStyle = domainState.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i += 1) {
            ctx.globalAlpha = 0.18 + (i * 0.1);
            ctx.beginPath();
            ctx.arc(cx, cy, 120 + i * 70 + Math.sin((4.2 - t) * 4 + i) * 8, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#f1f4ff';
    ctx.font = '24px "Bebas Neue"';
    ctx.fillText(`Domain: ${domainState.name}`, canvas.width * 0.5 - 88, 68);

    if (domainState.type === 'shrine') {
        const sx = canvas.width * 0.5;
        const sy = WORLD.floorY - 6;

        const bloodSky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bloodSky.addColorStop(0, 'rgba(110, 6, 10, 0.55)');
        bloodSky.addColorStop(1, 'rgba(23, 0, 4, 0.2)');
        ctx.fillStyle = bloodSky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 9; i += 1) {
            const dir = i < 4 ? -1 : 1;
            const n = i < 4 ? i + 1 : i - 3;
            const rx = sx + dir * (100 + n * 72);
            const ry = sy - 130 - n * 10;
            ctx.strokeStyle = 'rgba(248, 226, 216, 0.55)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(rx, sy + 12);
            ctx.quadraticCurveTo(rx + dir * (22 + n * 7), ry, rx + dir * 90, ry - 150);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(45, 10, 12, 0.95)';
        ctx.fillRect(sx - 100, sy - 120, 200, 120);
        ctx.strokeStyle = '#ff9aa0';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 100, sy - 120, 200, 120);

        ctx.fillStyle = 'rgba(69, 12, 14, 0.95)';
        ctx.fillRect(sx - 138, sy - 146, 276, 22);
        ctx.fillRect(sx - 34, sy - 178, 68, 54);
        ctx.strokeStyle = '#ffd2d9';
        ctx.strokeRect(sx - 138, sy - 146, 276, 22);
        ctx.strokeRect(sx - 34, sy - 178, 68, 54);

        ctx.fillStyle = '#1e0406';
        ctx.beginPath();
        ctx.arc(sx, sy - 62, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffb1b8';
        ctx.lineWidth = 2;
        ctx.stroke();

        for (let i = 0; i < 10; i += 1) {
            const tx = sx - 44 + i * 9;
            ctx.strokeStyle = '#ffd7de';
            ctx.beginPath();
            ctx.moveTo(tx, sy - 84);
            ctx.lineTo(tx, sy - 72);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tx, sy - 50);
            ctx.lineTo(tx, sy - 38);
            ctx.stroke();
        }

        const fog = ctx.createLinearGradient(0, sy + 8, 0, canvas.height);
        fog.addColorStop(0, 'rgba(68, 16, 26, 0.45)');
        fog.addColorStop(1, 'rgba(64, 42, 90, 0.38)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, sy + 8, canvas.width, canvas.height - (sy + 8));

        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#a992ff';
        ctx.fillRect(sx - 120, sy + 52, 240, 12);
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

function drawCinematicOverlay() {
    if (!cinematic.active) {
        return;
    }

    const t = cinematic.timer;
    const progress = t / cinematic.duration;
    const caster = cinematic.caster;
    const enemy = cinematic.enemy;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.76)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (cinematic.type === 'purple') {
        const centerX = canvas.width * 0.5;
        const centerY = canvas.height * 0.68;
        drawModelAt(centerX, centerY, 2.3, caster, 'cast', caster.facing, t);

        const orbY = canvas.height * 0.35;
        const blueX = centerX - 130 + Math.sin(t * 3) * 8;
        const redX = centerX + 130 + Math.cos(t * 3) * 8;
        const combine = clamp((progress - 0.45) / 0.35, 0, 1);
        const currentBlueX = blueX + (centerX - blueX) * combine;
        const currentRedX = redX + (centerX - redX) * combine;

        if (progress < 0.6) {
            const bGrad = ctx.createRadialGradient(currentBlueX, orbY, 2, currentBlueX, orbY, 48);
            bGrad.addColorStop(0, '#e9fbff');
            bGrad.addColorStop(0.45, '#57cdff');
            bGrad.addColorStop(1, 'rgba(80,200,255,0)');
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.arc(currentBlueX, orbY, 36, 0, Math.PI * 2);
            ctx.fill();

            const rGrad = ctx.createRadialGradient(currentRedX, orbY, 2, currentRedX, orbY, 48);
            rGrad.addColorStop(0, '#ffe6ea');
            rGrad.addColorStop(0.45, '#ff5f7b');
            rGrad.addColorStop(1, 'rgba(255,80,110,0)');
            ctx.fillStyle = rGrad;
            ctx.beginPath();
            ctx.arc(currentRedX, orbY, 36, 0, Math.PI * 2);
            ctx.fill();
        }

        if (progress >= 0.58) {
            const pSize = 46 + Math.sin(t * 14) * 4 + (progress - 0.58) * 70;
            const pGrad = ctx.createRadialGradient(centerX, orbY, 5, centerX, orbY, pSize + 20);
            pGrad.addColorStop(0, '#f3e7ff');
            pGrad.addColorStop(0.4, '#b48cff');
            pGrad.addColorStop(1, 'rgba(148, 98, 255, 0)');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(centerX, orbY, pSize, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#f8f2ff';
        ctx.font = '58px "Bebas Neue"';
        ctx.fillText('HOLLOW TECHNIQUE: PURPLE', canvas.width * 0.5 - 245, 96);
        ctx.font = '24px "Barlow Condensed"';
        ctx.fillText('Blue and Red are merged into annihilation.', canvas.width * 0.5 - 155, 128);
    }

    if (cinematic.type === 'domain') {
        const flash = Math.sin(t * 30) > 0.25 ? 1 : 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.08 * flash})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawModelAt(canvas.width * 0.5, canvas.height * 0.76, 3, caster, 'cast', 1, t);

        const barW = 560;
        const barX = canvas.width * 0.5 - barW * 0.5;
        const barY = 62;
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fillRect(barX, barY, barW, 76);
        ctx.strokeStyle = caster.aura;
        ctx.lineWidth = 3;
        ctx.strokeRect(barX, barY, barW, 76);
        ctx.fillStyle = '#f8f3ff';
        ctx.font = '24px "Bebas Neue"';
        ctx.fillText('DOMAIN EXPANSION', barX + 22, barY + 30);
        ctx.font = '44px "Bebas Neue"';
        ctx.fillText(cinematic.skill.name.toUpperCase(), barX + 22, barY + 66);

        const meter = clamp(progress, 0, 1);
        ctx.fillStyle = caster.aura;
        ctx.fillRect(barX, barY + 76, barW * meter, 8);

        drawModelAt(canvas.width * 0.85, canvas.height * 0.82, 1.5, enemy, 'block', -1, t);
    }

    if (cinematic.type === 'fuga') {
        const cx = canvas.width * 0.5;
        const cy = canvas.height * 0.74;
        drawModelAt(cx, cy, 2.8, caster, 'cast', caster.facing, t);

        const progressLine = cinematic.timer / cinematic.duration;
        const arrowCharge = clamp(progressLine * 1.2, 0, 1);
        const ax = cx + caster.facing * 100;
        const ay = canvas.height * 0.36;
        ctx.fillStyle = 'rgba(255, 150, 66, 0.20)';
        ctx.beginPath();
        ctx.moveTo(ax + 130, ay);
        ctx.lineTo(ax - 65, ay - 46 * arrowCharge);
        ctx.lineTo(ax - 65, ay + 46 * arrowCharge);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffd094';
        ctx.lineWidth = 3;
        ctx.stroke();

        const phrase = progressLine < 0.65 ? 'Open...' : 'FUGA';
        ctx.fillStyle = '#ffe9cc';
        ctx.font = progressLine < 0.65 ? '44px "Bebas Neue"' : '76px "Bebas Neue"';
        ctx.fillText(phrase, canvas.width * 0.5 - ctx.measureText(phrase).width * 0.5, 96);

        ctx.fillStyle = '#ffbe7a';
        ctx.fillRect(canvas.width * 0.22, 112, canvas.width * 0.56 * arrowCharge, 8);
        ctx.strokeStyle = '#ffd7a8';
        ctx.strokeRect(canvas.width * 0.22, 112, canvas.width * 0.56, 8);
    }

    ctx.restore();
}

function drawGlobalOverlay(dt) {
    if (overlayState.flashTimer > 0) {
        overlayState.flashTimer = Math.max(0, overlayState.flashTimer - dt);
        const alpha = clamp(overlayState.flashTimer / 0.45, 0, 1);
        ctx.save();
        ctx.fillStyle = overlayState.flashColor;
        ctx.globalAlpha = alpha;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    if (overlayState.chantTimer > 0) {
        overlayState.chantTimer = Math.max(0, overlayState.chantTimer - dt);
        const duration = overlayState.chantDuration || 1;
        const elapsed = duration - overlayState.chantTimer;
        let line = '';
        if (overlayState.chantLines.length <= 1) {
            line = overlayState.chantLines[0] || '';
        } else {
            const seg = duration / overlayState.chantLines.length;
            const idx = clamp(Math.floor(elapsed / seg), 0, overlayState.chantLines.length - 1);
            line = overlayState.chantLines[idx] || '';
        }

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(canvas.width * 0.22, canvas.height * 0.8, canvas.width * 0.56, 72);
        ctx.strokeStyle = '#ffdce2';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width * 0.22, canvas.height * 0.8, canvas.width * 0.56, 72);
        ctx.fillStyle = '#fff2f5';
        ctx.font = '42px "Bebas Neue"';
        ctx.fillText(line, canvas.width * 0.5 - ctx.measureText(line).width * 0.5, canvas.height * 0.85);
        ctx.restore();
    }
}

function drawArena() {
    const floorTop = WORLD.floorY;

    if (domainState.timer > 0) {
        const darkness = clamp(0.55 + (domainState.timer / 4.2) * 0.25, 0.55, 0.85);
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, `rgba(5,5,10,${darkness.toFixed(3)})`);
        sky.addColorStop(1, '#010103');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += 60) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, floorTop);
            ctx.stroke();
        }
        ctx.fillStyle = '#0a0a0d';
        ctx.fillRect(0, floorTop, canvas.width, canvas.height - floorTop);
        return;
    }

    if (selectedMap === 'city') {
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, '#0e1635');
        sky.addColorStop(1, '#050912');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 22; i += 1) {
            const bx = i * 56;
            const bw = 38 + ((i % 3) * 8);
            const bh = 70 + ((i * 19) % 210);
            ctx.fillStyle = i % 2 ? 'rgba(16, 28, 66, 0.95)' : 'rgba(12, 20, 50, 0.95)';
            ctx.fillRect(bx, floorTop - bh, bw, bh);
            ctx.fillStyle = 'rgba(114, 202, 255, 0.28)';
            for (let w = 0; w < 3; w += 1) {
                ctx.fillRect(bx + 6 + w * 10, floorTop - bh + 12, 4, 4);
            }
        }

        ctx.fillStyle = '#1f263f';
        ctx.fillRect(0, floorTop, canvas.width, canvas.height - floorTop);
    } else if (selectedMap === 'field') {
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, '#7dc6ff');
        sky.addColorStop(1, '#c7ecff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#9fda76';
        ctx.fillRect(0, floorTop - 22, canvas.width, 22);
        ctx.fillStyle = '#6ab451';
        ctx.fillRect(0, floorTop, canvas.width, canvas.height - floorTop);

        for (let i = 0; i < 120; i += 1) {
            const fx = (i * 97) % canvas.width;
            const fy = floorTop - (i % 3) * 6 - 8;
            ctx.fillStyle = i % 2 ? '#ffd4f1' : '#ffe98a';
            ctx.beginPath();
            ctx.arc(fx, fy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (selectedMap === 'space') {
        const sky = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.35, 40, canvas.width * 0.5, canvas.height * 0.35, 620);
        sky.addColorStop(0, '#1a2b5d');
        sky.addColorStop(0.45, '#110d30');
        sky.addColorStop(1, '#04040b');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 170; i += 1) {
            const sx = (i * 53) % canvas.width;
            const sy = (i * 89) % floorTop;
            const sr = (i % 5 === 0) ? 2 : 1;
            ctx.fillStyle = i % 7 === 0 ? '#bcd0ff' : '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#1e1745';
        ctx.fillRect(0, floorTop, canvas.width, canvas.height - floorTop);
    } else {
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, '#122859');
        sky.addColorStop(1, '#0a1025');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += 48) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, floorTop);
            ctx.stroke();
        }

        for (let y = 0; y <= floorTop; y += 48) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        ctx.fillStyle = '#1d2e5c';
        ctx.fillRect(0, floorTop, canvas.width, canvas.height - floorTop);
    }
}

function drawHud() {
    drawPlayerHud(player1, 20, 14, false);
    drawPlayerHud(player2, canvas.width - 360, 14, true);

    ctx.fillStyle = '#f7fbff';
    ctx.font = '34px "Bebas Neue"';
    ctx.fillText(Math.ceil(roundTimer).toString(), canvas.width / 2 - 14, 44);

    if (roundOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f7fbff';
        ctx.font = '58px "Bebas Neue"';
        ctx.fillText(winner, canvas.width / 2 - 180, canvas.height / 2 - 10);
        ctx.font = '30px "Barlow Condensed"';
        ctx.fillText('Press Rematch or Back to Menu', canvas.width / 2 - 170, canvas.height / 2 + 26);
    }
}

function drawPlayerHud(player, x, y, rightAlign) {
    const barW = 320;
    const panelH = 108;

    ctx.fillStyle = 'rgba(6, 8, 20, 0.88)';
    ctx.fillRect(x, y, barW, panelH);

    const hp = player.health / WORLD.maxHealth;
    const st = player.stamina / WORLD.maxStamina;
    const ce = player.cursed / WORLD.maxCursed;

    ctx.fillStyle = '#fc5f70';
    ctx.fillRect(x + 8, y + 24, (barW - 16) * hp, 12);

    ctx.fillStyle = '#29d2ff';
    ctx.fillRect(x + 8, y + 44, (barW - 16) * st, 10);

    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + 8, y + 60, (barW - 16) * ce, 10);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 8, y + 24, barW - 16, 12);
    ctx.strokeRect(x + 8, y + 44, barW - 16, 10);
    ctx.strokeRect(x + 8, y + 60, barW - 16, 10);

    ctx.fillStyle = '#f7fbff';
    ctx.font = '24px "Bebas Neue"';
    const label = `${player.name} - ${CHARACTER_DATA[player.character].name}`;
    const textX = rightAlign ? x + barW - 10 - ctx.measureText(label).width : x + 8;
    ctx.fillText(label, textX, y + 18);

    ctx.font = '14px "Barlow Condensed"';
    ctx.fillStyle = '#d8def4';
    const values = `HP ${player.health.toFixed(0)} | ST ${player.stamina.toFixed(0)} | CE ${player.cursed.toFixed(0)} | KMT ${player.kamotokeCharges}`;
    const valuesX = rightAlign ? x + barW - 10 - ctx.measureText(values).width : x + 8;
    ctx.fillText(values, valuesX, y + 84);

    if (player.hasGlasses) {
        const enemy = player === player1 ? player2 : player1;
        const cdList = [...enemy.skillData.skills, enemy.skillData.ult]
            .map((s) => `${s.name}:${(enemy.cooldowns[s.name] || 0).toFixed(1)}s`)
            .join('  ');
        ctx.fillStyle = '#9ed9ff';
        ctx.font = '12px "Barlow Condensed"';
        const cdX = rightAlign ? x + barW - 10 - ctx.measureText(cdList).width : x + 8;
        ctx.fillText(cdList, cdX, y + 98);
    }
}

function updateOverlayText() {
    roundInfoEl.textContent = roundOver ? winner : `Time: ${Math.ceil(roundTimer)}`;
    if (modeInfoEl) {
        let label = 'Same Device';
        if (matchMode === 'computer') {
            label = `Computer (${cpuDifficulty[0].toUpperCase()}${cpuDifficulty.slice(1)})`;
        } else if (matchMode === 'multiplayer') {
            if (!multiplayerState.supported) {
                label = 'Multiplayer (WebSocket Unsupported)';
            } else if (!multiplayerState.wsUrl) {
                label = 'Multiplayer (Set WebSocket URL)';
            } else if (!multiplayerState.matched) {
                label = 'Multiplayer (Matchmaking...)';
            } else {
                label = `Multiplayer (${multiplayerState.role === 'p2' ? 'You: P2' : 'You: P1'})`;
            }
        }
        modeInfoEl.textContent = `Mode: ${label}`;
    }
    if (mapInfoEl) {
        mapInfoEl.textContent = `Map: ${MAP_LABELS[selectedMap] || 'Blank Arena'}`;
    }
    p1InfoEl.textContent = `P1 ${CHARACTER_DATA[player1.character].name}: ${player1.skillData.skills[0].key}=${player1.skillData.skills[0].name}, ${player1.skillData.skills[1].key}=${player1.skillData.skills[1].name}, ${player1.skillData.skills[2].key}=${player1.skillData.skills[2].name}, ${player1.skillData.ult.key}=${player1.skillData.ult.name}, T=Kamotoke`;
    p2InfoEl.textContent = `P2 ${CHARACTER_DATA[player2.character].name}: ${player2.skillData.skills[0].codeP2.replace('Key', '')}=${player2.skillData.skills[0].name}, ${player2.skillData.skills[1].codeP2.replace('Key', '')}=${player2.skillData.skills[1].name}, ${player2.skillData.skills[2].codeP2.replace('Key', '')}=${player2.skillData.skills[2].name}, ${player2.skillData.ult.codeP2.replace('Key', '')}=${player2.skillData.ult.name}, L=Kamotoke`;
}

let roundRewardGranted = false;

function resolveRound() {
    let shouldAward = false;
    if (player1.health <= 0 && player2.health <= 0) {
        winner = 'Draw';
        roundOver = true;
    } else if (player1.health <= 0) {
        winner = 'Player 2 Wins';
        roundOver = true;
        shouldAward = true;
    } else if (player2.health <= 0) {
        winner = 'Player 1 Wins';
        roundOver = true;
        shouldAward = true;
    } else if (roundTimer <= 0) {
        if (player1.health === player2.health) {
            winner = 'Draw';
        } else {
            winner = player1.health > player2.health ? 'Player 1 Wins' : 'Player 2 Wins';
            shouldAward = true;
        }
        roundOver = true;
    }

    if (roundOver && shouldAward && !roundRewardGranted) {
        roundRewardGranted = true;
        if (winner === 'Player 1 Wins') {
            shopState.p1Points += SHOP_WIN_POINTS;
            updateShopUi(`Player 1 earned ${SHOP_WIN_POINTS} points.`);
        } else if (winner === 'Player 2 Wins') {
            shopState.p2Points += SHOP_WIN_POINTS;
            updateShopUi(`Player 2 earned ${SHOP_WIN_POINTS} points.`);
        }
        saveShopState(shopState);
        updateShopUi();
    }
}

function gameLoop(time) {
    if (!lastTime) lastTime = time;
    const dt = (multiplayerState.enabled && multiplayerState.matched)
        ? (1 / 60)
        : Math.min(0.033, (time - lastTime) / 1000);
    lastTime = time;

    if (multiplayerState.enabled && !multiplayerState.matched) {
        drawArena();
        drawDomainBackdrop();
        drawEffects();
        drawProjectiles();
        player1.draw();
        player2.draw();
        drawCinematicOverlay();
        drawDomainClashOverlay();
        drawHud();
        drawGlobalOverlay(dt);
        updateOverlayText();

        Object.keys(input).forEach((code) => {
            prevInput[code] = !!input[code];
        });
        prevMouseState.left = mouseState.left;
        prevMouseState.right = mouseState.right;
        requestAnimationFrame(gameLoop);
        return;
    }

    syncMultiplayerInputs();

    if (!roundOver && !cinematic.active && !clashState.active) {
        roundTimer = Math.max(0, roundTimer - dt);
    }

    updateDomainQueue(dt);

    if (domainState.timer > 0 && !cinematic.active && !clashState.active) {
        domainState.timer = Math.max(0, domainState.timer - dt);
        applyDomainEffects(dt);
    }

    if (clashState.active) {
        updateDomainClash(dt);
    } else if (cinematic.active) {
        updateCinematic(dt);
    } else {
        player1.update(dt, player2, roundOver);
        player2.update(dt, player1, roundOver);
        updateProjectiles(dt);
        updateEffects(dt);
    }
    updateTimedActions(dt);
    resolveRound();

    drawArena();
    drawDomainBackdrop();
    drawEffects();
    drawProjectiles();
    player1.draw();
    player2.draw();
    drawCinematicOverlay();
    drawDomainClashOverlay();
    drawHud();
    drawGlobalOverlay(dt);
    updateOverlayText();

    Object.keys(input).forEach((code) => {
        prevInput[code] = !!input[code];
    });
    prevMouseState.left = mouseState.left;
    prevMouseState.right = mouseState.right;

    requestAnimationFrame(gameLoop);
}

function resetRound() {
    player1.x = 180;
    player1.y = 200;
    player1.vx = 0;
    player1.vy = 0;
    player1.health = WORLD.maxHealth;
    player1.stamina = WORLD.maxStamina;
    player1.cursed = 25;
    player1.cooldowns = {};
    player1.attackTimer = 0;
    player1.dodgeTimer = 0;
    player1.dodgePerfectTimer = 0;
    player1.dodgeCooldown = 0;
    player1.basicAttackTimer = 0;
    player1.redCharging = false;
    player1.itemUseCooldown = 0;

    player2.x = 860;
    player2.y = 200;
    player2.vx = 0;
    player2.vy = 0;
    player2.health = WORLD.maxHealth;
    player2.stamina = WORLD.maxStamina;
    player2.cursed = 25;
    player2.cooldowns = {};
    player2.attackTimer = 0;
    player2.dodgeTimer = 0;
    player2.dodgePerfectTimer = 0;
    player2.dodgeCooldown = 0;
    player2.basicAttackTimer = 0;
    player2.redCharging = false;
    player2.itemUseCooldown = 0;

    projectiles.length = 0;
    effects.length = 0;
    timedActions.length = 0;
    cinematic.active = false;
    cinematic.type = '';
    cinematic.finished = null;
    domainQueue.p1 = null;
    domainQueue.p2 = null;
    clashState.active = false;
    clashState.timer = 0;
    clashState.p1Score = 0;
    clashState.p2Score = 0;
    clashState.winnerText = '';
    domainState.timer = 0;
    domainState.owner = null;
    domainState.name = '';
    domainState.type = '';
    domainState.victim = null;
    domainState.slashTick = 0;
    overlayState.flashTimer = 0;
    overlayState.chantTimer = 0;
    roundTimer = WORLD.roundTime;
    roundOver = false;
    roundRewardGranted = false;
    winner = '';
}

resetBtn.addEventListener('click', resetRound);

document.getElementById('menuBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

updateOverlayText();
setupShopButtons();
updateShopUi();
startMultiplayerMatchmaking();

window.addEventListener('beforeunload', () => {
    if (multiplayerState.seekInterval) {
        clearInterval(multiplayerState.seekInterval);
    }
    if (multiplayerState.socket && multiplayerState.socket.readyState === WebSocket.OPEN) {
        sendNetMessage({ type: 'leaveRoom', clientId: multiplayerState.clientId, roomId: multiplayerState.roomId });
    }
    if (multiplayerState.socket) {
        multiplayerState.socket.close();
    }
});
requestAnimationFrame(gameLoop);
