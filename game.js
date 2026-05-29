/**
 * Nokia Snake (Snake II) - Retro Game Engine
 * Original Nokia T9 control schemes and monochrome buzzer sound.
 */

// Canvas & Context Setup
const canvas = document.getElementById('lcdCanvas');
const ctx = canvas.getContext('2d');

// UI Button DOMs
const btnOpt = document.getElementById('btn-opt');
const btnBack = document.getElementById('btn-back');

// 数字按键绑定 (0-9 以及 *, #)
const numKeys = {};
for (let i = 0; i <= 9; i++) {
    numKeys[i] = document.getElementById('key-' + i);
}
numKeys['star'] = document.getElementById('key-star');
numKeys['hash'] = document.getElementById('key-hash');

// 游戏状态
const STATES = {
    MENU: 'MENU',
    LEVEL_SELECT: 'LEVEL_SELECT',
    PLAYING: 'PLAYING',
    GAMEOVER: 'GAMEOVER',
    PAUSED: 'PAUSED'
};
let gameState = STATES.MENU;

// 游戏网格常数
const GRID = {
    cols: 24,           // 列数
    rows: 15,           // 行数
    size: 7,            // 每个格子的像素大小
    offsetX: 16,        // 居中偏移 X (200 - 24*7 = 32, offset = 16)
    offsetY: 28,        // 留出上方状态栏的偏移 Y (150 - 15*7 = 45, offset = 28)
};

// 贪吃蛇运动状态
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let foodBlink = true;
let blinkTimer = 0;

let score = 0;
let highScore = 0;
try {
    highScore = localStorage.getItem('nokia_snake_high_score') || 0;
} catch (e) {
    console.warn("localStorage read failed at startup:", e);
}
let speedLevel = 5; // 速度档位：1-9 档
let moveTimer = 0;

// Web Audio API 蜂鸣音效
let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
        console.warn("Web Audio API not supported:", e);
    }
}

// 模拟 8-bit 蜂鸣器方波声
function playBeep(frequency, duration, volume = 0.05) {
    if (!audioCtx) return;
    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(err => console.warn("AudioContext resume failed:", err));
        }
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        // 使用方波 (Square Wave) 复刻旧蜂鸣器特有的沙哑感
        osc.type = 'square';
        osc.frequency.value = frequency;
        
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        // 音量瞬时切断，无包络渐变，模仿低端扬声器
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration + 0.02);
    } catch (e) {
        console.warn("Web Audio API playBeep failed:", e);
    }
}

// 经典的音效合集
const SFX = {
    // 转向：清脆的短滴声
    turn: () => playBeep(987.77, 0.02, 0.03), // B5
    
    // 吃食：快速的双音上升鸣叫
    eat: () => {
        playBeep(1318.51, 0.05, 0.04); // E6
        setTimeout(() => playBeep(1975.53, 0.08, 0.04), 50); // B6
    },
    
    // 撞击死亡：连续滑落的低音
    die: () => {
        playBeep(330, 0.15, 0.06);
        setTimeout(() => playBeep(220, 0.15, 0.06), 120);
        setTimeout(() => playBeep(147, 0.25, 0.06), 240);
    },
    
    // 诺基亚标志性开机铃声片段 (迷你方波复刻版)
    startup: () => {
        const notes = [
            { f: 1318.51, d: 0.1 }, // E6
            { f: 1174.66, d: 0.1 }, // D6
            { f: 740.00,  d: 0.2 }, // F#5
            { f: 830.60,  d: 0.2 }, // G#5
            { f: 1174.66, d: 0.1 }, // D6
            { f: 987.77,  d: 0.1 }, // B5
            { f: 587.33,  d: 0.2 }, // D5
            { f: 659.25,  d: 0.2 }, // E5
            { f: 987.77,  d: 0.1 }, // B5
            { f: 880.00,  d: 0.1 }, // A5
            { f: 554.37,  d: 0.2 }, // C#5
            { f: 659.25,  d: 0.3 }  // E5
        ];
        notes.forEach((note, index) => {
            setTimeout(() => {
                playBeep(note.f, note.d, 0.03);
            }, index * 140);
        });
    }
};

// ==========================================
// 输入绑定与手机物理按键监听
// ==========================================

function handleDirection(dir) {
    if (gameState !== STATES.PLAYING) return;
    
    // 防止180度折回碰撞自己
    if (dir === 'UP' && direction.y !== 1) {
        nextDirection = { x: 0, y: -1 };
        SFX.turn();
    }
    if (dir === 'DOWN' && direction.y !== -1) {
        nextDirection = { x: 0, y: 1 };
        SFX.turn();
    }
    if (dir === 'LEFT' && direction.x !== 1) {
        nextDirection = { x: -1, y: 0 };
        SFX.turn();
    }
    if (dir === 'RIGHT' && direction.x !== -1) {
        nextDirection = { x: 1, y: 0 };
        SFX.turn();
    }
}

// 键盘按键捕获
window.addEventListener('keydown', (e) => {
    // 避开系统默认滚动
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
    
    initAudio();
    
    switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
            handleDirection('UP');
            break;
        case 'ArrowDown':
        case 'KeyS':
            handleDirection('DOWN');
            break;
        case 'ArrowLeft':
        case 'KeyA':
            if (gameState === STATES.PLAYING) {
                handleDirection('LEFT');
            } else {
                handleOptionButton();
            }
            break;
        case 'ArrowRight':
        case 'KeyD':
            if (gameState === STATES.PLAYING) {
                handleDirection('RIGHT');
            } else {
                handleBackButton();
            }
            break;
        case 'Enter':
        case 'Space':
            handleOptionButton();
            break;
        case 'Escape':
        case 'Backspace':
            handleBackButton();
            break;
    }
});

// 数字按键方向绑定
numKeys[2].addEventListener('click', () => handleDirection('UP'));
numKeys[8].addEventListener('click', () => handleDirection('DOWN'));
numKeys[4].addEventListener('click', () => handleDirection('LEFT'));
numKeys[6].addEventListener('click', () => handleDirection('RIGHT'));

// 中间5号键暂停/选项确认
numKeys[5].addEventListener('click', handleOptionButton);

// 数字按键在选关时设定速度档位
for (let i = 1; i <= 9; i++) {
    numKeys[i].addEventListener('click', () => {
        if (gameState === STATES.LEVEL_SELECT) {
            speedLevel = i;
            SFX.turn();
        }
    });
}

// 物理选项与返回键绑定
btnOpt.addEventListener('click', handleOptionButton);
btnBack.addEventListener('click', handleBackButton);

function handleOptionButton() {
    initAudio();
    if (gameState === STATES.MENU) {
        gameState = STATES.LEVEL_SELECT;
        SFX.turn();
    } else if (gameState === STATES.LEVEL_SELECT) {
        initGame();
        gameState = STATES.PLAYING;
        SFX.turn();
    } else if (gameState === STATES.PLAYING) {
        gameState = STATES.PAUSED;
        SFX.turn();
    } else if (gameState === STATES.PAUSED) {
        gameState = STATES.PLAYING;
        SFX.turn();
    } else if (gameState === STATES.GAMEOVER) {
        gameState = STATES.LEVEL_SELECT;
        SFX.turn();
    }
}

function handleBackButton() {
    initAudio();
    if (gameState === STATES.LEVEL_SELECT) {
        gameState = STATES.MENU;
        SFX.turn();
    } else if (gameState === STATES.PLAYING || gameState === STATES.PAUSED) {
        gameState = STATES.MENU;
        SFX.turn();
    } else if (gameState === STATES.GAMEOVER) {
        gameState = STATES.MENU;
        SFX.turn();
    }
}

// 档位选择时的方向键逻辑 (在菜单或速度选择中，用方向键增减档速)
function checkMenuNavigation(e) {
    if (gameState === STATES.LEVEL_SELECT) {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
            speedLevel = Math.min(9, speedLevel + 1);
            SFX.turn();
        }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            speedLevel = Math.max(1, speedLevel - 1);
            SFX.turn();
        }
    }
}
window.addEventListener('keydown', checkMenuNavigation);

// 数字键盘可在选关时通过方向数字增减档速
numKeys[2].addEventListener('click', () => {
    if (gameState === STATES.LEVEL_SELECT) { speedLevel = Math.min(9, speedLevel + 1); SFX.turn(); }
});
numKeys[6].addEventListener('click', () => {
    if (gameState === STATES.LEVEL_SELECT) { speedLevel = Math.min(9, speedLevel + 1); SFX.turn(); }
});
numKeys[8].addEventListener('click', () => {
    if (gameState === STATES.LEVEL_SELECT) { speedLevel = Math.max(1, speedLevel - 1); SFX.turn(); }
});
numKeys[4].addEventListener('click', () => {
    if (gameState === STATES.LEVEL_SELECT) { speedLevel = Math.max(1, speedLevel - 1); SFX.turn(); }
});

// ==========================================
// 贪吃蛇运动控制与碰撞核心逻辑
// ==========================================

function initGame() {
    snake = [
        { x: 5, y: 7 },
        { x: 4, y: 7 },
        { x: 3, y: 7 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    spawnFood();
}

function spawnFood() {
    // 随机位置且不落在蛇身上
    let valid = false;
    while (!valid) {
        food.x = Math.floor(Math.random() * GRID.cols);
        food.y = Math.floor(Math.random() * GRID.rows);
        
        valid = true;
        for (let segment of snake) {
            if (segment.x === food.x && segment.y === food.y) {
                valid = false;
                break;
            }
        }
    }
}

// 经典诺基亚速度档位对应的帧刷新毫秒间隔
function getTickInterval() {
    const intervals = [
        300, // 1 档
        260, // 2 档
        220, // 3 档
        180, // 4 档
        140, // 5 档
        110, // 6 档
        80,  // 7 档
        60,  // 8 档
        45   // 9 档 (极速挑战)
    ];
    return intervals[speedLevel - 1];
}

// ==========================================
// 游戏绘图渲染层 (单色像素风)
// ==========================================

function clearScreen() {
    ctx.fillStyle = '#8b956d'; // LCD 背景绿
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// 在 LCD 绘制像素级的实心/空心矩形
function drawPixelRect(x, y, w, h, fill = true) {
    ctx.fillStyle = '#2b3b22'; // 像素墨水灰
    if (fill) {
        ctx.fillRect(x, y, w, h);
    } else {
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
}

function drawPixelText(text, x, y, size = '8px') {
    ctx.fillStyle = '#2b3b22';
    // 点阵感字体样式
    ctx.font = `bold ${size} monospace`;
    ctx.fillText(text, x, y);
}

// 主渲染程序
function draw() {
    clearScreen();
    
    // 1. 状态栏 (分界线 & 电量 & 信号 & 得分)
    drawStatusBar();

    if (gameState === STATES.MENU) {
        drawMenu();
    } else if (gameState === STATES.LEVEL_SELECT) {
        drawLevelSelect();
    } else if (gameState === STATES.PLAYING || gameState === STATES.PAUSED) {
        drawGamePlay();
    } else if (gameState === STATES.GAMEOVER) {
        drawGameOver();
    }
}

function drawStatusBar() {
    // 顶部水平实线
    ctx.strokeStyle = '#2b3b22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, 20);
    ctx.lineTo(canvas.width - 4, 20);
    ctx.stroke();

    // 虚拟诺基亚状态图标
    // 左侧信号塔格线
    drawPixelRect(6, 6, 2, 8);
    drawPixelRect(10, 8, 2, 6);
    drawPixelRect(14, 10, 2, 4);
    
    // 右侧电池轮廓
    ctx.strokeStyle = '#2b3b22';
    ctx.strokeRect(canvas.width - 20, 6, 14, 8);
    drawPixelRect(canvas.width - 24, 8, 4, 4); // 电池头
    drawPixelRect(canvas.width - 18, 8, 10, 4); // 电满
    
    // 中间文字
    drawPixelText("SNAKE II", canvas.width / 2 - 24, 13, '9px');
}

function drawMenu() {
    // 主标题
    drawPixelText("SNAKE II", 48, 62, '18px');
    
    // 3310 开机小图标 (蛇头造型)
    drawPixelRect(48, 76, 104, 3);
    
    // 底部“选择”按钮提示 (左侧对应“选择”按钮)
    drawPixelText("选择", 12, 140, '9px');
    drawPixelText("最高分:" + highScore, 96, 140, '8px');
}

function drawLevelSelect() {
    drawPixelText("选择速度 (1-9):", 34, 60, '10px');
    
    // 绘制巨大的数字速度档位
    drawPixelText(`档速: < ${speedLevel} >`, 45, 95, '15px');
    
    // 底部提示 (左侧确认，右侧返回)
    drawPixelText("确认", 12, 140, '9px');
    drawPixelText("返回", canvas.width - 32, 140, '9px');
}

function drawGamePlay() {
    // 2. 绘制赛道物理硬边框 (壁障碰撞判定点)
    ctx.strokeStyle = '#2b3b22';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        GRID.offsetX - 2, 
        GRID.offsetY - 2, 
        GRID.cols * GRID.size + 4, 
        GRID.rows * GRID.size + 4
    );

    // 3. 绘制蛇身
    snake.forEach((segment, index) => {
        const x = GRID.offsetX + segment.x * GRID.size;
        const y = GRID.offsetY + segment.y * GRID.size;
        
        // 蛇头和蛇身用稍有分别的点阵像素绘制，蛇头有一个核心圆点
        if (index === 0) {
            // 蛇头 (带中心黑点)
            drawPixelRect(x, y, GRID.size, GRID.size, true);
            ctx.fillStyle = '#8b956d'; // 中空亮色，模仿像素质感
            ctx.fillRect(x + 2, y + 2, GRID.size - 4, GRID.size - 4);
        } else {
            // 蛇身 (方块，留出1px的绿缝作为节格)
            drawPixelRect(x + 1, y + 1, GRID.size - 2, GRID.size - 2, true);
        }
    });

    // 4. 绘制闪烁的食物 (单点像素)
    if (foodBlink) {
        const x = GRID.offsetX + food.x * GRID.size;
        const y = GRID.offsetY + food.y * GRID.size;
        // 复古十字架形食物像素点
        drawPixelRect(x + 2, y, 3, 7, true);
        drawPixelRect(x, y + 2, 7, 3, true);
    }

    // 5. 显示局内实时分数
    drawPixelText(`得分: ${score}`, 12, 140, '9px');
    
    if (gameState === STATES.PAUSED) {
        // 绘制暂停浮层
        ctx.fillStyle = 'rgba(139, 149, 109, 0.9)';
        ctx.fillRect(35, 60, 130, 40);
        ctx.strokeRect(36, 61, 128, 38);
        drawPixelText("- 暂停中 -", 65, 84, '11px');
    }
}

function drawGameOver() {
    drawPixelText("游戏结束!", 55, 60, '16px');
    drawPixelText("最终得分: " + score, 45, 95, '11px');
    
    // 底部提示 (左侧重玩，右侧返回)
    drawPixelText("重玩", 12, 140, '9px');
    drawPixelText("返回", canvas.width - 32, 140, '9px');
}

// ==========================================
// 游戏主引擎循环与时钟管理
// ==========================================

function update(timestamp) {
    const elapsed = timestamp - moveTimer;
    
    // 更新食物闪烁
    blinkTimer += 16.7; // 约一帧 16.7ms
    if (blinkTimer > 250) {
        foodBlink = !foodBlink;
        blinkTimer = 0;
    }
    
    // 仅在运行态下根据速度档位驱动贪吃蛇运动
    if (gameState === STATES.PLAYING && elapsed > getTickInterval()) {
        moveTimer = timestamp;
        
        // 1. 提交转向
        direction = nextDirection;
        
        // 2. 推进蛇头坐标
        const head = {
            x: snake[0].x + direction.x,
            y: snake[0].y + direction.y
        };
        
        // 3. 碰撞墙壁检测
        if (head.x < 0 || head.x >= GRID.cols || head.y < 0 || head.y >= GRID.rows) {
            handleDeath();
            return;
        }
        
        // 4. 碰撞自己身体检测
        for (let segment of snake) {
            if (head.x === segment.x && head.y === segment.y) {
                handleDeath();
                return;
            }
        }
        
        // 5. 蛇头插入队列
        snake.unshift(head);
        
        // 6. 吃食判定
        if (head.x === food.x && head.y === food.y) {
            score += 10 * speedLevel; // 得分受档位乘积影响
            SFX.eat();
            spawnFood();
        } else {
            // 没有吃食物，队列尾部出队
            snake.pop();
        }
    }
    
    draw();
    requestAnimationFrame(update);
}

function handleDeath() {
    gameState = STATES.GAMEOVER;
    
    try {
        SFX.die();
    } catch (e) {
        console.warn("Failed to play death sound:", e);
    }
    
    try {
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('nokia_snake_high_score', score);
        }
    } catch (e) {
        console.warn("localStorage write failed:", e);
    }
}

// 物理选项与返回键绑定
btnOpt.addEventListener('click', handleOptionButton);
btnBack.addEventListener('click', handleBackButton);

// 点击屏幕也可以交互
canvas.addEventListener('click', () => {
    initAudio();
    if (gameState === STATES.GAMEOVER) {
        gameState = STATES.LEVEL_SELECT;
        SFX.turn();
    } else if (gameState === STATES.MENU) {
        gameState = STATES.LEVEL_SELECT;
        SFX.turn();
    }
});

// 开机自启动与首帧触发
SFX.startup();
draw();
moveTimer = performance.now();
requestAnimationFrame(update);
