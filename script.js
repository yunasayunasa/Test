// ---------------------------
// キャンバスの内部解像度設定（デバイスピクセル比対応）
// ---------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;
canvas.width = window.innerWidth * dpr;
canvas.height = window.innerHeight * dpr;
canvas.style.width = window.innerWidth + "px";
canvas.style.height = window.innerHeight + "px";
ctx.scale(dpr, dpr);
ctx.imageSmoothingEnabled = true;

// 表示サイズ（CSSサイズ）
const cw = window.innerWidth;
const ch = window.innerHeight;

// ---------------------------
// 画像アセットのプリロード
// ---------------------------
const backgroundImage = new Image();
backgroundImage.src = "assets/background.jpg"; // 背景画像

const titleImage = new Image();
titleImage.src = "assets/title.jpg"; // タイトル画面用画像

// 各レベルのボール画像（レベル1～10）
const ballAssets = {};
for (let i = 1; i <= 10; i++) {
  ballAssets[i] = new Image();
  ballAssets[i].src = `assets/suicaball_${i}.png`; // 例：suicaball_1.png ～ suicaball_10.png
}

// 必殺技用カットイン画像（レベルに対応：suica_変数.jpg）
const specialCutInAssets = {};
for (let i = 1; i <= 10; i++) {
  specialCutInAssets[i] = new Image();
  specialCutInAssets[i].src = `assets/suica_${i}.jpg`; // 例：suica_1.jpg ～ suica_10.jpg
}

// ---------------------------
// サウンドアセットのプリロード（拡張子を m4a に変更）
// ---------------------------
const titleCallSound = new Audio("assets/titlecall.m4a"); // タイトルコール音
const tapSound = new Audio("assets/tapSE.m4a");            // タップ音（SE)

const gameBGM = new Audio("assets/gameBGM.m4a");           // ゲーム中BGM
gameBGM.loop = true;

const ballMergeSound = new Audio("assets/ballMergeSE.mp3");  // 通常の「ポコン」SE

const specialAvailableSound = new Audio("assets/specialAvailableSE.m4a"); // 必殺技使用可能通知のSE

const gameOverSound = new Audio("assets/gameOverBGM.m4a");   // ゲームオーバー時の音楽

// 必殺技カットイン用ボイス（レベルに対応：cutInVoice_変数.m4a）
const cutInVoiceAssets = {};
for (let i = 1; i <= 10; i++) {
  cutInVoiceAssets[i] = new Audio(`assets/cutInVoice_${i}.m4a`);
}

// ★ レベルアップ時の音声アセット（レベルに対応：levelUpSound_変数.m4a）
const levelUpSoundAssets = {};
for (let i = 1; i <= 10; i++) {
  levelUpSoundAssets[i] = new Audio(`assets/levelUpSound_${i}.m4a`);
}

// ---------------------------
// グローバル変数／定数定義
// ---------------------------
const ballSizes = [15, 22, 28, 32, 40, 50, 60, 72, 86, 100];
const scoreTable = [1, 2, 3, 6, 10, 15, 21, 28, 36, 45];

const Engine = Matter.Engine,
      World  = Matter.World,
      Bodies = Matter.Bodies,
      Body   = Matter.Body,
      Events = Matter.Events;

const fallDelayThreshold = 3000; // 3秒

// ---------------------------
// ゲームモード選択
// ---------------------------
let gameMode = "basic"; // "basic" または "scoreAttack"

// ---------------------------
// グローバルフラグ：カットイン演出重複防止用
// ---------------------------
let cutInRunning = false;

// ボール合体SEの連打防止用
let lastBallMergeTime = 0;
const ballMergeDelay = 500; // 500ms間隔

// ---------------------------
// 必殺技ボタンのクリックハンドラ（グローバル関数）
// ---------------------------
let lastSpecialTrigger = 0;
const specialTriggerThreshold = 100; // 100ms以内なら無視

function specialButtonClickHandler(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const now = Date.now();
  if (now - lastSpecialTrigger < specialTriggerThreshold) return;
  lastSpecialTrigger = now;
  
  const btn = document.getElementById("specialButton");
  if (btn.disabled) return;
  btn.disabled = true;
  // ランダムで1～10のレベルを選択
  const level = Math.floor(Math.random() * 10) + 1;
  playCutInEffect(level, () => {
    GameScreen.activateSpecialMove();
    btn.disabled = false;
  });
}

// ---------------------------
// ゲーム全体の管理オブジェクト
// ---------------------------
const Game = {
  score: 0,
  highScores: [],
  currentScreen: null,
  changeScreen(newScreen) {
    if (this.currentScreen && this.currentScreen.cleanup) {
      this.currentScreen.cleanup();
    }
    this.currentScreen = newScreen;
    this.currentScreen.init();
  },
  handleError(err) {
    alert("エラーが発生しました: " + err);
  }
};

// ---------------------------
// 共通：ボール生成関数
// ---------------------------
function createBall(level) {
  if (level === undefined) {
    level = Math.floor(Math.random() * 5) + 1; // レベル1～5の中からランダム
  }
  const margin = 50;
  const spawnX = Math.random() * (cw - 2 * margin) + margin;
  const spawnY = 100; // 常にゲームオーバーライン（150px）より上
  const ball = Bodies.circle(spawnX, spawnY, ballSizes[level - 1], {
    restitution: 0.5,
    friction: 0.1,
    label: "ball",
    ballLevel: level,
    isStatic: true
  });
  ball.render = { angleOffset: Math.random() * Math.PI * 2 };
  ball.spawnY = spawnY;
  ball.canMerge = true;
  return ball;
}

// ---------------------------
// カットイン演出
// ---------------------------
function playCutInEffect(level, callback) {
  if (cutInRunning) return;
  cutInRunning = true;
  const asset = specialCutInAssets[Math.min(level, 10)];
  const cutInDiv = document.createElement("div");
  cutInDiv.style.position = "absolute";
  cutInDiv.style.top = "0";
  cutInDiv.style.left = "0";
  cutInDiv.style.width = "100vw";
  cutInDiv.style.height = "100vh";
  cutInDiv.style.backgroundImage = `url(${asset.src})`;
  cutInDiv.style.backgroundSize = "100% auto";
  cutInDiv.style.backgroundPosition = "center center";
  cutInDiv.style.backgroundRepeat = "no-repeat";
  cutInDiv.style.opacity = "0";
  cutInDiv.style.transition = "opacity 0.5s";
  document.body.appendChild(cutInDiv);
  
  const voice = cutInVoiceAssets[Math.min(level, 10)];
  if (voice) {
    voice.play();
  }
  
  setTimeout(() => {
    cutInDiv.style.opacity = "1";
    setTimeout(() => {
      cutInDiv.style.opacity = "0";
      setTimeout(() => {
        document.body.removeChild(cutInDiv);
        cutInRunning = false;
        if (callback) callback();
      }, 500);
    }, 1000);
  }, 0);
}

// ---------------------------
// タイトル画面モジュール
// ---------------------------
const TitleScreen = {
  init() {
    Game.score = 0;
    // タイトル画像読み込み完了時に描画
    if (titleImage.complete) {
      this.draw();
    } else {
      titleImage.onload = () => { this.draw(); };
    }
    // モード選択ボタン表示
    document.getElementById("modeSelection").style.display = "block";
    // イベントリスナー登録
    document.getElementById("basicModeButton").addEventListener("pointerup", () => {
      gameMode = "basic";
      // モード選択ボタンを非表示にする
      document.getElementById("modeSelection").style.display = "none";
      animateGameStart(() => {
        Game.changeScreen(GameScreen);
      });
    });
    document.getElementById("scoreAttackButton").addEventListener("pointerup", () => {
      gameMode = "scoreAttack";
      document.getElementById("modeSelection").style.display = "none";
      animateGameStart(() => {
        Game.changeScreen(GameScreen);
      });
    });
   
     document.getElementById("basicModeButton").addEventListener("pointerup", () => {
  tapSound.play(); // タップ音を再生
  gameMode = "basic";
  document.getElementById("modeSelection").style.display = "none";
  animateGameStart(() => {
    Game.changeScreen(GameScreen);
  });
});

document.getElementById("scoreAttackButton").addEventListener("pointerup", () => {
  tapSound.play(); // タップ音を再生
  gameMode = "scoreAttack";
  document.getElementById("modeSelection").style.display = "none";
  animateGameStart(() => {
    Game.changeScreen(GameScreen);
  });
});


 // タイトル画面でもタップしてもよい場合は、以下の行をコメントアウト
    // this.onStart = this.onStart.bind(this);
    // canvas.addEventListener("pointerdown", this.onStart);
  },
  onStart(e) {
    canvas.removeEventListener("pointerdown", this.onStart);
    titleCallSound.play();
    tapSound.play();
    animateGameStart(() => {
      Game.changeScreen(GameScreen);
    });
  },
  draw() {
    ctx.clearRect(0, 0, cw, ch);
    if (titleImage.complete) {
      const imgWidth = titleImage.width;
      const imgHeight = titleImage.height;
      const scale = Math.min(cw / imgWidth, ch / imgHeight, 1);
      const newWidth = imgWidth * scale;
      const newHeight = imgHeight * scale;
      const x = (cw - newWidth) / 2;
      const y = (ch - newHeight) / 2;
      ctx.drawImage(titleImage, x, y, newWidth, newHeight);
    } else {
      ctx.fillStyle = "#4A90E2";
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("タップしてゲームスタート！", cw / 2, ch - 100);
  },
  cleanup() {}
};

// タイトル画面のテキストアニメーション
function animateGameStart(callback) {
  let blinkCount = 0;
  let visible = true;
  const interval = setInterval(() => {
    TitleScreen.draw();
    ctx.fillStyle = "#fff";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    if (visible) {
      ctx.fillText("ゲームスタート！", cw / 2, ch / 2);
    }
    visible = !visible;
    blinkCount++;
    if (blinkCount >= 6) {
      clearInterval(interval);
      callback();
    }
  }, 300);
}

// ---------------------------
// ゲーム画面モジュール
// ---------------------------
const GameScreen = {
  engine: null,
  world: null,
  runnerId: null,
  balls: [],
  currentBall: null,
  nextBall: null,
  isDragging: false,
  spawnY: 100,
  gameOverLine: 150,
  nextSpecialThreshold: 1000,
  specialButton: null,
  releaseScheduled: false,
  specialNotified: false,
  
  init() {
    Game.score = 0;
    this.balls = [];
    this.currentBall = null;
    this.nextBall = null;
    this.nextSpecialThreshold = 1000;
    this.releaseScheduled = false;
    this.specialNotified = false;
    
    gameBGM.currentTime = 0;
    gameBGM.play();
    // BGMの音量を調整（例: 0.2）
    gameBGM.volume = 1.0;
    
    this.engine = Engine.create();
    this.world = this.engine.world;
    this.engine.world.gravity.y = 1;
    
    const thickness = 50;
    const groundOffset = 20;
    const ground = Bodies.rectangle(cw / 2, ch - thickness / 2 + groundOffset, cw, thickness, { isStatic: true });
    const leftWall = Bodies.rectangle(-thickness / 2, ch / 2, thickness, ch, { isStatic: true });
    const rightWall = Bodies.rectangle(cw + thickness / 2, ch / 2, thickness, ch, { isStatic: true });
    World.add(this.world, [ground, leftWall, rightWall]);
    
    this.onDragStart = this.onDragStart.bind(this);
    this.onDragMove = this.onDragMove.bind(this);
    this.onDragEnd = this.onDragEnd.bind(this);
    this.onGameOverClick = this.onGameOverClick.bind(this);
    
    this.currentBall = createBall();
    World.add(this.world, this.currentBall);
    this.balls.push(this.currentBall);
    this.nextBall = createBall();
    
    Events.on(this.engine, "collisionStart", (event) => {
      this.handleCollision(event);
    });
    
    canvas.addEventListener("pointerdown", this.onDragStart);
    canvas.addEventListener("pointermove", this.onDragMove);
    canvas.addEventListener("pointerup", this.onDragEnd);
    
    this.specialButton = document.getElementById("specialButton");
    this.specialButton.removeEventListener("pointerup", specialButtonClickHandler);
    this.specialButton.addEventListener("pointerup", specialButtonClickHandler);
    
    setTimeout(() => {
      if (!this.isDragging && this.currentBall && this.currentBall.isStatic) {
        this.releaseCurrentBall();
      }
    }, 2000);
    
    this.runnerId = requestAnimationFrame(() => this.gameLoop());
  },
  
  cleanup() {
    canvas.removeEventListener("pointerdown", this.onDragStart);
    canvas.removeEventListener("pointermove", this.onDragMove);
    canvas.removeEventListener("pointerup", this.onDragEnd);
    
    const btn = document.getElementById("specialButton");
    btn.removeEventListener("pointerup", specialButtonClickHandler);
    
    cancelAnimationFrame(this.runnerId);
    World.clear(this.world);
    Engine.clear(this.engine);
    this.balls = [];
    this.currentBall = null;
    this.nextBall = null;
  },
  
  onDragStart(e) {
    e.preventDefault();
    if (!this.currentBall || !this.currentBall.isStatic) return;
    this.isDragging = true;
    let pos = this.getPointerPosition(e);
    Body.setPosition(this.currentBall, { x: pos.x, y: this.spawnY });
  },
  
  onDragMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    let pos = this.getPointerPosition(e);
    if (this.currentBall) {
      Body.setPosition(this.currentBall, { x: pos.x, y: this.spawnY });
    }
  },
  
  onDragEnd(e) {
    e.preventDefault();
    this.isDragging = false;
    setTimeout(() => { this.releaseCurrentBall(); }, 150);
  },
  
  getPointerPosition(e) {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX, y: clientY };
  },
  
  releaseCurrentBall() {
    if (this.currentBall) {
      Body.setStatic(this.currentBall, false);
      this.currentBall.fallStart = Date.now();
    }
    if (this.releaseScheduled) return;
    this.releaseScheduled = true;
    setTimeout(() => {
      this.currentBall = this.nextBall;
      World.add(this.world, this.currentBall);
      this.balls.push(this.currentBall);
      this.nextBall = createBall();
      this.releaseScheduled = false;
    }, 500);
  },
  
  handleCollision(event) {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
      let bodyA = pairs[i].bodyA;
      let bodyB = pairs[i].bodyB;
      if (bodyA.label === "ball" && bodyB.label === "ball" &&
          bodyA.ballLevel && bodyB.ballLevel &&
          bodyA.ballLevel === bodyB.ballLevel) {
        if (bodyA.isMerging || bodyB.isMerging) continue;
        bodyA.isMerging = bodyB.isMerging = true;
        if (Date.now() - lastBallMergeTime >= ballMergeDelay) {
          // 通常は「ポコン」SEを流すが、40%の確率でレベルアップボイスを流す
          if (Math.random() < 0.4) {
            const levelForSound = Math.min(bodyA.ballLevel + 1, 10);
            levelUpSoundAssets[levelForSound].play();
          } else {
            ballMergeSound.play();
          }
          lastBallMergeTime = Date.now();
        }
        let mergeScore = scoreTable[bodyA.ballLevel - 1] * 2;
        Game.score += mergeScore;
        const newX = (bodyA.position.x + bodyB.position.x) / 2;
        const newY = (bodyA.position.y + bodyB.position.y) / 2;
        World.remove(this.world, bodyA);
        World.remove(this.world, bodyB);
        this.balls = this.balls.filter(b => b !== bodyA && b !== bodyB);
        if (bodyA.ballLevel < 10) {
          const newBall = Bodies.circle(newX, newY, ballSizes[bodyA.ballLevel], {
            restitution: 0.5,
            friction: 0.1,
            label: "ball",
            ballLevel: bodyA.ballLevel + 1,
          });
          newBall.render = { angleOffset: Math.random() * Math.PI * 2 };
          this.balls.push(newBall);
          World.add(this.world, newBall);
        }
      }
    }
  },
  
  gameLoop() {
    Engine.update(this.engine, 1000 / 60);
    
    if (backgroundImage.complete) {
      ctx.drawImage(backgroundImage, 0, 0, cw, ch);
    } else {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, cw, ch);
    }
    
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.gameOverLine);
    ctx.lineTo(cw, this.gameOverLine);
    ctx.stroke();
    
    const colors = ["#FFC0CB", "#FF8C00", "#FFD700", "#ADFF2F", "#40E0D0", "#1E90FF", "#9370DB", "#FF69B4", "#00FA9A", "#00CED1"];
    for (let ball of this.balls) {
      ctx.save();
      ctx.translate(ball.position.x, ball.position.y);
      ctx.rotate(ball.angle + (ball.render.angleOffset || 0));
      ctx.beginPath();
      ctx.arc(0, 0, ball.circleRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      const level = ball.ballLevel || 1;
      const asset = ballAssets[Math.min(level, 10)];
      if (asset.complete) {
        ctx.drawImage(asset, -ball.circleRadius, -ball.circleRadius, ball.circleRadius * 2, ball.circleRadius * 2);
      } else {
        ctx.fillStyle = colors[level - 1];
        ctx.fillRect(-ball.circleRadius, -ball.circleRadius, ball.circleRadius * 2, ball.circleRadius * 2);
      }
      ctx.restore();
      
      ctx.save();
      ctx.translate(ball.position.x, ball.position.y);
      ctx.rotate(ball.angle + (ball.render.angleOffset || 0));
      ctx.beginPath();
      ctx.arc(0, 0, ball.circleRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "black";
      ctx.stroke();
      ctx.restore();
    }
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Score: " + Game.score, 20, 30);
    ctx.fillText("High Score: " + Game.score, 20, 60);
    
    // もし基本モードならクリア条件（3000点）をチェック
    if (gameMode === "basic" && Game.score >= 3000) {
      this.clearGame();
      return;
    }
    
    const now = Date.now();
    for (let ball of this.balls) {
      if (ball === this.currentBall) continue;
      if (ball.fallStart && (now - ball.fallStart > fallDelayThreshold)) {
        if (ball.position.y - ball.circleRadius < this.gameOverLine) {
          this.endGame();
          return;
        }
      }
    }
    
    if (Game.score >= this.nextSpecialThreshold) {
      this.specialButton.style.display = "block";
      if (!this.specialNotified) {
        specialAvailableSound.play();
        this.specialNotified = true;
      }
    } else {
      this.specialButton.style.display = "none";
      this.specialNotified = false;
    }
    
    if (this.nextBall) {
      ctx.save();
      ctx.translate(300, 30);
      const level = this.nextBall.ballLevel;
      if (ballAssets[Math.min(level, 10)].complete) {
        ctx.drawImage(ballAssets[Math.min(level, 10)], -ballSizes[level - 1], -ballSizes[level - 1], ballSizes[level - 1] * 2, ballSizes[level - 1] * 2);
      } else {
        ctx.fillStyle = "#ccc";
        ctx.beginPath();
        ctx.arc(0, 0, ballSizes[level - 1], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = "#000";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Next", 300, 15);
    }
    
    this.runnerId = requestAnimationFrame(() => this.gameLoop());
  },
  
  activateSpecialMove() {
    console.log("必殺技発動！");
    // specialButtonClickHandler で既にカットインは再生済みなので、
    // ここでは必殺技の処理のみを実行する
    for (let lvl = 1; lvl < 10; lvl++) {
      let group = this.balls.filter(ball => ball.ballLevel === lvl);
      let pairs = Math.floor(group.length / 2);
      for (let i = 0; i < pairs; i++) {
        let ball1 = group[0];
        let ball2 = group[1];
        let pairScore = scoreTable[lvl - 1] * 2;
        Game.score += pairScore;
        World.remove(this.world, ball1);
        World.remove(this.world, ball2);
        this.balls = this.balls.filter(b => b !== ball1 && b !== ball2);
        let newX = (ball1.position.x + ball2.position.x) / 2;
        let newY = (ball1.position.y + ball2.position.y) / 2;
        let newLevel = lvl + 1;
        const newBall = Bodies.circle(newX, newY, ballSizes[newLevel - 1], {
          restitution: 0.5,
          friction: 0.1,
          label: "ball",
          ballLevel: newLevel
        });
        newBall.render = { angleOffset: Math.random() * Math.PI * 2 };
        this.balls.push(newBall);
        World.add(this.world, newBall);
        group.shift();
        group.shift();
      }
    }
    this.nextSpecialThreshold += 1000;
    this.specialButton.style.display = "none";
    this.specialNotified = false;
  },
  
  clearGame() {
    // 基本モードならスコア3000点でクリア
    gameBGM.pause();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#fff";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Clear!", cw / 2, ch / 2 - 30);
    ctx.font = "32px sans-serif";
    ctx.fillText("Score: " + Game.score, cw / 2, ch / 2 + 10);
    setTimeout(() => {
      Game.changeScreen(TitleScreen);
    }, 3000);
  },
  
  endGame() {
    gameBGM.pause();
    gameOverSound.currentTime = 0;
    gameOverSound.play();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#fff";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", cw / 2, ch / 2 - 30);
    ctx.font = "32px sans-serif";
    ctx.fillText("Score: " + Game.score, cw / 2, ch / 2 + 10);
    setTimeout(() => {
      canvas.addEventListener("click", this.onGameOverClick);
      canvas.addEventListener("touchstart", this.onGameOverClick);
    }, 1500);
  },
  
  onGameOverClick() {
    canvas.removeEventListener("click", this.onGameOverClick);
    canvas.removeEventListener("touchstart", this.onGameOverClick);
    Game.changeScreen(TitleScreen);
  }
};

// ---------------------------
// ゲームオーバー画面モジュール（今回は GameScreen 内で処理済み）
// ---------------------------
const GameOverScreen = {
  init() {},
  cleanup() {}
};

// ---------------------------
// エントリポイント
// ---------------------------
window.addEventListener("DOMContentLoaded", () => {
  try {
    Game.changeScreen(TitleScreen);
  } catch (err) {
    Game.handleError(err);
  }
});