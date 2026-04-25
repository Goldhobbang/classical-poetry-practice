const STORAGE_KEY = "korean-practicer-poems";

const tabButtons = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

const poemNameInput = document.getElementById("poemName");
const poemTextInput = document.getElementById("poemText");
const savePoemBtn = document.getElementById("savePoemBtn");
const startPracticeBtn = document.getElementById("startPracticeBtn");
const savedList = document.getElementById("savedList");
const loadPoemBtn = document.getElementById("loadPoemBtn");
const deletePoemBtn = document.getElementById("deletePoemBtn");

const sourceLine = document.getElementById("sourceLine");
const typingStage = document.getElementById("typingStage");
const previousLines = document.getElementById("previousLines");
const nextLines = document.getElementById("nextLines");
const answerInput = document.getElementById("answerInput");
const nextLineBtn = document.getElementById("nextLineBtn");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");

const resultOutput = document.getElementById("resultOutput");
const copyResultBtn = document.getElementById("copyResultBtn");

const toast = document.getElementById("toast");
const confirmModal = document.getElementById("confirmModal");
const modalMessage = document.getElementById("modalMessage");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const confirmModalBtn = document.getElementById("confirmModalBtn");

let currentLines = [];
let currentIndex = 0;
let answers = [];
let toastTimer = null;
let onConfirmAction = null;

function loadPoemsMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_error) {
    return {};
  }
}

function savePoemsMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function switchTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === tabId);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function openConfirm(message, onConfirm) {
  modalMessage.textContent = message;
  onConfirmAction = onConfirm;
  confirmModal.classList.add("show");
  confirmModal.setAttribute("aria-hidden", "false");
}

function closeConfirm() {
  confirmModal.classList.remove("show");
  confirmModal.setAttribute("aria-hidden", "true");
  onConfirmAction = null;
}

function refreshSavedList() {
  const poemsMap = loadPoemsMap();
  const names = Object.keys(poemsMap).sort((a, b) => a.localeCompare(b, "ko"));

  savedList.innerHTML = "";
  if (!names.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "저장된 작품 없음";
    savedList.appendChild(option);
    return;
  }

  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    savedList.appendChild(option);
  });
}

function getNormalizedLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function animateSentenceChange() {
  typingStage.classList.remove("animate");
  // Reflow to restart CSS animation.
  void typingStage.offsetWidth;
  typingStage.classList.add("animate");
}

function updateProgressBar(total) {
  if (!total) {
    progressFill.style.width = "0%";
    return;
  }

  const completed = Math.min(currentIndex, total);
  const ratio = (completed / total) * 100;
  progressFill.style.width = `${ratio}%`;
  progressFill.style.filter = `saturate(${0.9 + ratio / 200})`;
}

function updatePracticeUI() {
  const total = currentLines.length;
  progressText.textContent = `${Math.min(currentIndex, total)} / ${total}`;
  updateProgressBar(total);

  if (!total) {
    sourceLine.textContent = "연습을 시작하면 여기에 현재 줄이 표시됩니다.";
    previousLines.textContent = "아직 완료된 줄이 없습니다.";
    nextLines.textContent = "대기 중인 줄이 없습니다.";
    answerInput.value = "";
    progressText.textContent = "0 / 0";
    return;
  }

  if (currentIndex >= total) {
    sourceLine.textContent = "입력이 완료되었습니다.";
    previousLines.textContent = currentLines
      .map((line, idx) => `${idx + 1}. ${line}\n→ ${answers[idx] || "(미입력)"}`)
      .join("\n\n");
    nextLines.textContent = "모든 줄 입력 완료";
    answerInput.value = "";
    progressText.textContent = `${total} / ${total}`;
    updateProgressBar(total);
    return;
  }

  const done = currentLines
    .slice(0, currentIndex)
    .map((line, idx) => `${idx + 1}. ${line}\n→ ${answers[idx] || "(미입력)"}`)
    .join("\n\n");
  const waiting = currentLines
    .slice(currentIndex + 1)
    .map((line, idx) => `${currentIndex + idx + 2}. ${line}`)
    .join("\n");

  previousLines.textContent = done || "아직 완료된 줄이 없습니다.";
  nextLines.textContent = waiting || "다음 줄이 마지막입니다.";
  sourceLine.textContent = currentLines[currentIndex];
  answerInput.value = answers[currentIndex] ?? "";
  animateSentenceChange();
  answerInput.focus();
}

function showResultIfFinished() {
  if (!currentLines.length || currentIndex < currentLines.length) {
    return;
  }

  const merged = answers.join("\n");
  resultOutput.value = merged;
  switchTab("resultTab");
  showToast("모든 줄 입력이 완료되었습니다.");
}

function startPracticeFromText(text) {
  const lines = getNormalizedLines(text);
  if (!lines.length) {
    showToast("연습할 줄이 없습니다. 텍스트를 확인해주세요.");
    return;
  }

  currentLines = lines;
  currentIndex = 0;
  answers = Array.from({ length: lines.length }, () => "");
  resultOutput.value = "";
  updatePracticeUI();
  switchTab("practiceTab");
  showToast("연습을 시작합니다.");
}

function saveCurrentLineAndMoveNext() {
  if (!currentLines.length || currentIndex >= currentLines.length) {
    showToast("먼저 연습할 작품을 시작해주세요.");
    return;
  }

  answers[currentIndex] = answerInput.value.trim();
  currentIndex += 1;
  updatePracticeUI();
  showResultIfFinished();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

savePoemBtn.addEventListener("click", () => {
  const name = poemNameInput.value.trim();
  const text = poemTextInput.value.trim();

  if (!name) {
    showToast("작품 이름을 입력해주세요.");
    return;
  }
  if (!text) {
    showToast("작품 전문을 입력해주세요.");
    return;
  }

  const map = loadPoemsMap();
  map[name] = text;
  savePoemsMap(map);
  refreshSavedList();
  savedList.value = name;
  showToast(`"${name}" 작품이 저장되었습니다.`);
});

loadPoemBtn.addEventListener("click", () => {
  const selected = savedList.value;
  const map = loadPoemsMap();
  if (!selected || !map[selected]) {
    showToast("불러올 작품을 선택해주세요.");
    return;
  }
  poemNameInput.value = selected;
  poemTextInput.value = map[selected];
  showToast(`"${selected}" 작품을 불러왔습니다.`);
});

deletePoemBtn.addEventListener("click", () => {
  const selected = savedList.value;
  const map = loadPoemsMap();
  if (!selected || !map[selected]) {
    showToast("삭제할 작품이 없습니다.");
    return;
  }

  openConfirm(`"${selected}" 작품을 삭제할까요?`, () => {
    delete map[selected];
    savePoemsMap(map);
    refreshSavedList();
    showToast(`"${selected}" 작품을 삭제했습니다.`);
  });
});

startPracticeBtn.addEventListener("click", () => {
  startPracticeFromText(poemTextInput.value);
});

nextLineBtn.addEventListener("click", saveCurrentLineAndMoveNext);

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveCurrentLineAndMoveNext();
  }
});

copyResultBtn.addEventListener("click", async () => {
  const text = resultOutput.value;
  if (!text) {
    showToast("복사할 결과가 없습니다.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("결과를 복사했습니다.");
  } catch (_error) {
    showToast("복사 실패: 직접 선택 후 복사해주세요.");
  }
});

cancelModalBtn.addEventListener("click", closeConfirm);
confirmModalBtn.addEventListener("click", () => {
  if (onConfirmAction) {
    onConfirmAction();
  }
  closeConfirm();
});

confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closeConfirm();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && confirmModal.classList.contains("show")) {
    closeConfirm();
  }
});

refreshSavedList();
updatePracticeUI();
switchTab("libraryTab");
