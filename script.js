// ---------------------------
// 画像アセットのプリロード
// ---------------------------
const backgroundImage = new Image();
backgroundImage.src = "assets/background.jpg";  // JPG版

const titleImage = new Image();
titleImage.src = "assets/title.jpg";  // JPG版

// 各レベルの球画像（レベル1～10）
const ballAssets = {};
for (let i = 1; i <= 10; i++) {
  ballAssets[i] = new Image();
  ballAssets[i].src = `assets/suica_${i}.jpg`;  // JPG版
}

// ---------------------------
// グローバル変数／定数定義
// ---------------------------
const ballSizes = [15, 22, 28, 32, 40, 50, 60, 72, 86, 100];
const scoreTable = [1, 2, 3, 6, 10, 15, 21, 28, 36, 45];

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const Engine = Matter.Engine,
      World  = Matter.World,
      Bodies = Matter.Bodies,
      Body   = Matter.Body,
      Events = Matter.Events;

const fallDelayThreshold = 3000; // 3秒

// ---------------------------
// オーディオ管理（後で実装するのでプレースホルダ）
// ---------------------------
/*
const audioTitle = new Audio("assets/suica_bgm_title.mp3");
audioTitle.loop = true;
const audioGame = new Audio("assets/suica_bgm_game.mp3");
audioGame.loop = true;
const audioGameOver = new Audio("assets/suica_bgm_gameover.mp3");
const audioPop = new Audio("assets/suica_pop.mp3");
*/
  
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
    level = Math.floor(Math.random() * 5) + 1;
  }
  const margin = 50;
  const spawnX = Math.random() * (canvas.width - 2 * margin) + margin;
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
// タイトル画面モジュール
// ---------------------------
const TitleScreen = {
  init() {
    Game.score = 0;
    // (音声は後で実装)
    this.draw();
    // イベントハンドラをバインドしてから登録
    this.onStart = this.onStart.bind(this);
    canvas.addEventListener("click", this.onStart);
    canvas.addEventListener("touchstart", this.onStart);
  },
  onStart(e) {
    canvas.removeEventListener("click", this.onStart);
    canvas.removeEventListener("touchstart", this.onStart);
    // (音声停止処理は後で実装)
    Game.changeScreen(GameScreen);
  },
  draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (titleImage.complete) {
      const imgWidth = titleImage.width;
      const imgHeight = titleImage.height;
      const x = (canvas.width - imgWidth) / 2;
      const y = (canvas.height - imgHeight) / 2;
      ctx.drawImage(titleImage, x, y);
    } else {
      ctx.fillStyle = "#4A90E2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Suica Game", canvas.width / 2, canvas.height / 2);
      ctx.font = "24px sans-serif";
      ctx.fillText("Tap to Start", canvas.width / 2, canvas.height / 2 + 50);
    }
  },
  cleanup() {}
};

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
  
  init() {
    Game.score = 0;
    this.balls = [];
    this.currentBall = null;
    this.nextBall = null;
    // (音声は後で実装)
    
    this.engine = Engine.create();
    this.world = this.engine.world;
    this.engine.world.gravity.y = 1;
    
    const thickness = 50;
    const ground = Bodies.rectangle(canvas.width / 2, canvas.height + thickness/2, canvas.width, thickness, { isStatic: true });
    const leftWall = Bodies.rectangle(-thickness/2, canvas.height/2, thickness, canvas.height, { isStatic: true });
    const rightWall = Bodies.rectangle(canvas.width + thickness/2, canvas.height/2, thickness, canvas.height, { isStatic: true });
    World.add(this.world, [ground, leftWall, rightWall]);
    
    // イベントリスナー用メソッドをバインド
    this.onDragStart = this.onDragStart.bind(this);
    this.onDragMove = this.onDragMove.bind(this);
    this.onDragEnd = this.onDragEnd.bind(this);
    this.onGameOverClick = this.onGameOverClick.bind(this);
    
    // 現在操作する球と次に落とす球の生成（ランダムでレベル1～5）
    this.currentBall = createBall();
    World.add(this.world, this.currentBall);
    this.balls.push(this.currentBall);
    this.nextBall = createBall();
    
    Events.on(this.engine, "collisionStart", (event) => {
      this.handleCollision(event);
    });
    
    canvas.addEventListener("mousedown", this.onDragStart);
    canvas.addEventListener("touchstart", this.onDragStart);
    canvas.addEventListener("mousemove", this.onDragMove);
    canvas.addEventListener("touchmove", this.onDragMove);
    canvas.addEventListener("mouseup", this.onDragEnd);
    canvas.addEventListener("touchend", this.onDragEnd);
    
    this.specialButton = document.getElementById("specialButton");
    this.specialButton.addEventListener("click", () => { this.activateSpecialMove(); });
    
    setTimeout(() => {
      if (!this.isDragging && this.currentBall && this.currentBall.isStatic) {
        this.releaseCurrentBall();
      }
    }, 2000);
    
    this.runnerId = requestAnimationFrame(() => this.gameLoop());
  },
  cleanup() {
    canvas.removeEventListener("mousedown", this.onDragStart);
    canvas.removeEventListener("touchstart", this.onDragStart);
    canvas.removeEventListener("mousemove", this.onDragMove);
    canvas.removeEventListener("touchmove", this.onDragMove);
    canvas.removeEventListener("mouseup", this.onDragEnd);
    canvas.removeEventListener("touchend", this.onDragEnd);
    cancelAnimationFrame(this.runnerId);
    World.clear(this.world);
    Engine.clear(this.engine);
    // (音声は後で実装)
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
        // (音声は後で実装)
        let mergeScore = scoreTable[bodyA.ballLevel - 1] * 2;
        Game.score += mergeScore;
        const newX = (bodyA.position.x + bodyB.position.x) / 2;
        const newY = (bodyA.position.y + bodyB.position.y) / 2;
        World.remove(this.world, bodyA);
        World.remove(this.world, bodyB);
        this.balls = this.balls.filter(b => (b !== bodyA && b !== bodyB));
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
    
    // 背景描画：背景画像を全画面に描画
    if (backgroundImage.complete) {
      ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // ゲームオーバーラインの描画（画面上部150px）
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.gameOverLine);
    ctx.lineTo(canvas.width, this.gameOverLine);
    ctx.stroke();
    
    // 各球の描画：画像を円形にクリッピングして表示
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
    }
    
    // スコア表示（画面左上）
    ctx.fillStyle = "#000";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Score: " + Game.score, 20, 30);
    ctx.fillText("High Score: " + Game.score, 20, 60);
    
    // ゲームオーバーチェック：
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
    
    // 必殺技ボタンの表示
    if (Game.score >= this.nextSpecialThreshold) {
      this.specialButton.style.display = "block";
    } else {
      this.specialButton.style.display = "none";
    }
    
    // 次に落ちる球（プレビュー）の描画：スコア表示の横に配置（例：(220,30)）
    if (this.nextBall) {
      ctx.save();
      ctx.translate(220, 30);
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
      ctx.fillText("Next", 220, 15);
    }
    
    this.runnerId = requestAnimationFrame(() => this.gameLoop());
  },
  activateSpecialMove() {
    console.log("必殺技発動！");
    for (let level = 1; level < 10; level++) {
      let group = this.balls.filter(ball => ball.ballLevel === level);
      let pairs = Math.floor(group.length / 2);
      for (let i = 0; i < pairs; i++) {
        let ball1 = group[0];
        let ball2 = group[1];
        let pairScore = scoreTable[level - 1] * 2;
        Game.score += pairScore;
        World.remove(this.world, ball1);
        World.remove(this.world, ball2);
        this.balls = this.balls.filter(b => b !== ball1 && b !== ball2);
        let newX = (ball1.position.x + ball2.position.x) / 2;
        let newY = (ball1.position.y + ball2.position.y) / 2;
        let newLevel = level + 1;
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
  },
  endGame() {
    // (音声は後で実装)
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "32px sans-serif";
    ctx.fillText("Score: " + Game.score, canvas.width / 2, canvas.height / 2 + 10);
    
    // (音声は後で実装)
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