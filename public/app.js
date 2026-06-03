const socket = io();

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const turnInfoEl = document.getElementById("turnInfo");
const playerInfoEl = document.getElementById("playerInfo");
const roomInput = document.getElementById("room");
const joinBtn = document.getElementById("joinBtn");
const shareBtn = document.getElementById("shareBtn");
const restartBtn = document.getElementById("restartBtn");
const moveModeBtn = document.getElementById("moveMode");
const wallModeBtn = document.getElementById("wallMode");
const rulesBtn = document.getElementById("rulesBtn");
const modalEl = document.getElementById("modal");
const modalIconEl = document.getElementById("modalIcon");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");
const modalOkBtn = document.getElementById("modalOk");
const dontShowWrap = document.getElementById("dontShowWrap");
const dontShowRules = document.getElementById("dontShowRules");

let myColor = null;
let state = null;
let mode = "move";
let announcedWinner = null;
let modalAfterClose = null;

const urlRoom = new URLSearchParams(location.search).get("room");
roomInput.value = urlRoom || randomRoomCode();
history.replaceState(null, "", "?room=" + encodeURIComponent(roomInput.value));

function randomRoomCode(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

function label(color){
  if(color === "blue") return "الأزرق";
  if(color === "red") return "الأحمر";
  return "مشاهد";
}

function setMode(nextMode){
  mode = nextMode;
  moveModeBtn.classList.toggle("active", nextMode === "move");
  wallModeBtn.classList.toggle("active", nextMode === "wall");
  boardEl.classList.toggle("wall-mode", nextMode === "wall");
}

function roomLink(){
  return location.origin + "?room=" + encodeURIComponent(roomInput.value.trim());
}

function showModal({ icon = "!", title, html, showDontShow = false, onClose = null }){
  modalIconEl.textContent = icon;
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = html;
  dontShowWrap.classList.toggle("hidden", !showDontShow);
  dontShowRules.checked = false;
  modalAfterClose = onClose;
  modalEl.classList.remove("hidden");
}

function closeModal(){
  modalEl.classList.add("hidden");
  const afterClose = modalAfterClose;
  modalAfterClose = null;
  if(afterClose) afterClose();
}

function showRules(force = false){
  if(!force && localStorage.getItem("hideRules") === "1") return;

  showModal({
    icon: "؟",
    title: "قوانين اللعبة",
    showDontShow: true,
    html: `
      <ul>
        <li>الأزرق يبدأ من أعلى اليسار وهدفه الوصول إلى الخط الأزرق في الأسفل.</li>
        <li>الأحمر يبدأ من أسفل اليمين وهدفه الوصول إلى الخط الأحمر في الأعلى.</li>
        <li>في دورك اختر تحريك أو حاجز.</li>
        <li>الحاجز يمنع المرور بين مربعين.</li>
        <li>ممنوع وضع حاجز يقطع طريق أي لاعب إلى خط النهاية.</li>
      </ul>
    `,
    onClose: () => {
      if(dontShowRules.checked) localStorage.setItem("hideRules", "1");
    }
  });
}

function showNotice(title, message, icon = "!"){
  showModal({
    icon,
    title,
    html: `<p>${message}</p>`
  });
}

function showWinner(winner){
  if(announcedWinner === winner) return;
  announcedWinner = winner;
  showModal({
    icon: "🏆",
    title: "انتهت اللعبة",
    html: `<p class="winner-text ${winner}">فوز ${label(winner)}</p>`
  });
}

moveModeBtn.onclick = () => setMode("move");
wallModeBtn.onclick = () => setMode("wall");
rulesBtn.onclick = () => showRules(true);
modalOkBtn.onclick = closeModal;

joinBtn.onclick = () => {
  const roomId = roomInput.value.trim() || randomRoomCode();
  roomInput.value = roomId;
  history.replaceState(null, "", "?room=" + encodeURIComponent(roomId));
  socket.emit("join", { roomId, name: "player" });
};

shareBtn.onclick = async () => {
  const link = roomLink();
  if(navigator.share){
    await navigator.share({ title: "لعبة الحواجز", url: link });
    return;
  }

  await navigator.clipboard.writeText(link);
  showNotice("تم نسخ الرابط", "أرسل الرابط للاعب الثاني للدخول إلى نفس اللعبة.", "✓");
};

restartBtn.onclick = () => socket.emit("restart");

socket.on("joined", data => {
  myColor = data.color;
  playerInfoEl.textContent = label(myColor);
});

socket.on("notice", data => {
  showNotice(data.title || "تنبيه", data.message || "تعذر تنفيذ الطلب.", data.type === "warning" ? "!" : "✓");
});

socket.on("state", nextState => {
  state = nextState;
  render();
});

function render(){
  boardEl.innerHTML = "";

  for(let y = 0; y < 9; y++){
    for(let x = 0; x < 9; x++){
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.setAttribute("aria-label", `مربع ${x + 1},${y + 1}`);
      cell.onclick = () => clickCell(x, y);
      boardEl.appendChild(cell);
    }
  }

  addGoalMarkers();

  if(!state) return;

  addWallSlots();
  addPawn(state.board.blue, "blue");
  addPawn(state.board.red, "red");
  state.board.walls.forEach(addWall);
  updateGameInfo();
}

function updateGameInfo(){
  if(state.winner){
    const winnerLabel = label(state.winner);
    turnInfoEl.textContent = "انتهت";
    statusEl.textContent = "الفائز: " + winnerLabel;
    showWinner(state.winner);
    return;
  }

  announcedWinner = null;
  turnInfoEl.textContent = label(state.turn);
  playerInfoEl.textContent = label(myColor);
  statusEl.textContent = state.turn === myColor ? "دورك الآن" : "انتظر دورك";
  statusEl.classList.toggle("your-turn", state.turn === myColor);
}

function addPawn(position, color){
  const cell = [...boardEl.querySelectorAll(".cell")].find(item =>
    Number(item.dataset.x) === position.x && Number(item.dataset.y) === position.y
  );
  if(!cell) return;

  const pawn = document.createElement("div");
  pawn.className = "pawn " + color;
  cell.appendChild(pawn);
}

function addGoalMarkers(){
  const redGoal = document.createElement("div");
  redGoal.className = "goal-line red-goal";
  const blueGoal = document.createElement("div");
  blueGoal.className = "goal-line blue-goal";
  boardEl.appendChild(redGoal);
  boardEl.appendChild(blueGoal);
}

function boardMetrics(){
  const rect = boardEl.getBoundingClientRect();
  const styles = getComputedStyle(boardEl);
  const padding = parseFloat(styles.paddingLeft) || 8;
  const gap = parseFloat(styles.gap) || 5;
  const cellSize = (rect.width - padding * 2 - gap * 8) / 9;
  const wallSize = Math.max(5, Math.min(8, gap + 1));
  return { padding, gap, cellSize, wallSize };
}

function addWallSlots(){
  for(let y = 0; y < 9; y++){
    for(let x = 0; x < 8; x++){
      addWallSlot(x, y, x + 1, y, "vertical");
    }
  }

  for(let y = 0; y < 8; y++){
    for(let x = 0; x < 9; x++){
      addWallSlot(x, y, x, y + 1, "horizontal");
    }
  }
}

function addWallSlot(x1, y1, x2, y2, orientation){
  const { padding, gap, cellSize, wallSize } = boardMetrics();
  const hit = Math.max(30, gap + 20);
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "wall-slot " + orientation;
  slot.setAttribute("aria-label", "إضافة حاجز");
  const preview = document.createElement("span");
  preview.className = "wall-preview " + orientation;

  if(orientation === "vertical"){
    const wallLeft = padding + (x1 + 1) * cellSize + x1 * gap + gap / 2 - wallSize / 2;
    const wallTop = padding + y1 * (cellSize + gap);
    slot.style.left = (wallLeft + wallSize / 2 - hit / 2) + "px";
    slot.style.top = wallTop + "px";
    slot.style.width = hit + "px";
    slot.style.height = cellSize + "px";
    preview.style.left = wallLeft + "px";
    preview.style.top = wallTop + "px";
    preview.style.width = wallSize + "px";
    preview.style.height = cellSize + "px";
  }else{
    const wallLeft = padding + x1 * (cellSize + gap);
    const wallTop = padding + (y1 + 1) * cellSize + y1 * gap + gap / 2 - wallSize / 2;
    slot.style.left = wallLeft + "px";
    slot.style.top = (wallTop + wallSize / 2 - hit / 2) + "px";
    slot.style.width = cellSize + "px";
    slot.style.height = hit + "px";
    preview.style.left = wallLeft + "px";
    preview.style.top = (wallTop) + "px";
    preview.style.width = cellSize + "px";
    preview.style.height = wallSize + "px";
  }

  slot.onclick = event => {
    event.stopPropagation();
    placeWall(x1, y1, x2, y2);
  };

  boardEl.appendChild(slot);
  boardEl.appendChild(preview);
}

function addWall(wall){
  const { padding, gap, cellSize, wallSize } = boardMetrics();
  const x = Math.min(wall.x1, wall.x2);
  const y = Math.min(wall.y1, wall.y2);
  const div = document.createElement("div");
  div.className = "wall " + wall.color;

  if(wall.y1 === wall.y2){
    div.style.left = (padding + (x + 1) * cellSize + x * gap + gap / 2 - wallSize / 2) + "px";
    div.style.top = (padding + y * (cellSize + gap)) + "px";
    div.style.width = wallSize + "px";
    div.style.height = cellSize + "px";
  }else{
    div.style.left = (padding + x * (cellSize + gap)) + "px";
    div.style.top = (padding + (y + 1) * cellSize + y * gap + gap / 2 - wallSize / 2) + "px";
    div.style.width = cellSize + "px";
    div.style.height = wallSize + "px";
  }

  boardEl.appendChild(div);
}

function clickCell(x, y){
  if(!state || state.turn !== myColor) return;
  if(mode === "move") socket.emit("move", { x, y });
}

function placeWall(x1, y1, x2, y2){
  if(!state || state.turn !== myColor || mode !== "wall") return;
  socket.emit("wall", { x1, y1, x2, y2 });
}

showRules(false);
render();

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("/sw.js");
}
