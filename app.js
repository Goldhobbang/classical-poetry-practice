import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 🚨 중요: 여기에 Firebase 콘솔에서 복사한 본인의 설정값을 입력하세요.
// apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId 값을 모두 본인 프로젝트 값으로 채워주세요.
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const translationsRef = collection(db, "translations");

const routePages = {
  add: document.getElementById("addPage"),
  practice: document.getElementById("practicePage"),
  result: document.getElementById("resultPage"),
  poems: document.getElementById("poemsPage")
};

const navLinks = document.querySelectorAll(".nav-link");

const authorNameInput = document.getElementById("authorName");
const taskTitleInput = document.getElementById("taskTitle");
const sourceTextInput = document.getElementById("sourceText");
const startPracticeBtn = document.getElementById("startPracticeBtn");
const goPoemsBtn = document.getElementById("goPoemsBtn");
const recentPoemsList = document.getElementById("recentPoemsList");

const previousLines = document.getElementById("previousLines");
const currentLine = document.getElementById("currentLine");
const nextLines = document.getElementById("nextLines");
const answerInput = document.getElementById("answerInput");
const nextLineBtn = document.getElementById("nextLineBtn");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const resultOutput = document.getElementById("resultOutput");
const copyResultBtn = document.getElementById("copyResultBtn");
const poemsList = document.getElementById("poemsList");
const poemsSort = document.getElementById("poemsSort");
const poemsSearch = document.getElementById("poemsSearch");
const poemsSearchResetBtn = document.getElementById("poemsSearchResetBtn");
const toast = document.getElementById("toast");

let toastTimer = null;
let unsubscribeRecent = null;
let unsubscribePoems = null;
let isSaving = false;

let currentSourceText = "";
let currentAuthorName = "";
let baseTaskTitle = "";
let resolvedTaskTitle = "";
let practiceLines = [];
let currentIndex = 0;
let answers = [];
let poemsItems = [];

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

function normalizeLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function updateProgress() {
  const total = practiceLines.length;
  const done = Math.min(currentIndex, total);
  progressText.textContent = `${done} / ${total}`;
  progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
}

function setSavingState(value) {
  isSaving = value;
  answerInput.disabled = value;
  nextLineBtn.disabled = value;
  answerInput.classList.toggle("is-loading", value);
}

function renderPractice() {
  updateProgress();
  const total = practiceLines.length;
  if (!total) {
    previousLines.textContent = "아직 완료된 문장이 없습니다.";
    currentLine.textContent = "문장 추가 페이지에서 연습을 시작하세요.";
    nextLines.textContent = "다음 문장이 없습니다.";
    answerInput.value = "";
    return;
  }

  if (currentIndex >= total) {
    previousLines.textContent = practiceLines
      .map((line, idx) => `${idx + 1}. ${line}\n→ ${answers[idx] || "(미입력)"}`)
      .join("\n\n");
    currentLine.textContent = "연습이 완료되었습니다.";
    nextLines.textContent = "모든 문장 입력 완료";
    answerInput.value = "";
    resultOutput.value = answers.join("\n");
    location.hash = "#/result";
    return;
  }

  previousLines.textContent =
    practiceLines
      .slice(0, currentIndex)
      .map((line, idx) => `${idx + 1}. ${line}\n→ ${answers[idx] || "(미입력)"}`)
      .join("\n\n") || "아직 완료된 문장이 없습니다.";

  currentLine.textContent = practiceLines[currentIndex];

  nextLines.textContent =
    practiceLines
      .slice(currentIndex + 1)
      .map((line, idx) => `${currentIndex + idx + 2}. ${line}`)
      .join("\n") || "다음 문장이 없습니다.";

  answerInput.value = answers[currentIndex] || "";
  if (!isSaving) {
    answerInput.focus();
  }
}

function parseTitle(baseTitle) {
  const match = baseTitle.match(/^(.*)\((\d+)\)$/);
  if (!match) {
    return { root: baseTitle, index: 0 };
  }
  return {
    root: match[1].trim(),
    index: Number(match[2])
  };
}

async function resolveUniqueTaskTitle(title) {
  const trimmed = title.trim();
  const prefixQuery = query(
    translationsRef,
    where("taskTitle", ">=", trimmed),
    where("taskTitle", "<=", `${trimmed}\uf8ff`)
  );
  const snapshot = await getDocs(prefixQuery);
  if (!snapshot.docs.length) {
    return trimmed;
  }

  const usedTitles = new Set(snapshot.docs.map((docSnap) => docSnap.data().taskTitle).filter(Boolean));
  if (!usedTitles.has(trimmed)) {
    return trimmed;
  }

  let maxIndex = 0;
  usedTitles.forEach((existing) => {
    const { root, index } = parseTitle(existing);
    if (root === trimmed && index > maxIndex) {
      maxIndex = index;
    }
  });
  return `${trimmed}(${maxIndex + 1})`;
}

async function saveCurrentSentence() {
  if (!practiceLines.length || currentIndex >= practiceLines.length || isSaving) {
    return;
  }

  answers[currentIndex] = answerInput.value.trim();
  setSavingState(true);
  try {
    await addDoc(translationsRef, {
      authorName: currentAuthorName,
      taskTitle: resolvedTaskTitle,
      originalText: currentSourceText,
      translatedText: answers[currentIndex],
      createdAt: serverTimestamp()
    });
    currentIndex += 1;
    renderPractice();
    if (currentIndex >= practiceLines.length) {
      showToast("모든 풀이가 저장되었습니다.");
    } else {
      showToast("DB에 성공적으로 저장되었습니다!");
    }
  } catch (_error) {
    showToast("DB 저장에 실패했습니다. Firebase 설정을 확인해주세요.");
  } finally {
    setSavingState(false);
  }
}

function renderRecentList(snapshot) {
  if (!snapshot.docs.length) {
    recentPoemsList.textContent = "아직 등록된 원문이 없습니다.";
    return;
  }
  const uniqueItems = [];
  const seen = new Set();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const key = `${data.taskTitle}::${data.originalText}`;
    if (!seen.has(key) && uniqueItems.length < 5) {
      seen.add(key);
      uniqueItems.push(data);
    }
  });

  recentPoemsList.innerHTML = uniqueItems
    .map((item) => {
      return `<article class="list-item">
        <p class="item-title">${item.taskTitle || "(제목 없음)"} · ${item.authorName || "익명"}</p>
        <p class="item-content">${(item.originalText || "").slice(0, 150)}${(item.originalText || "").length > 150 ? "..." : ""}</p>
      </article>`;
    })
    .join("");
}

function getCreatedAtMillis(item) {
  const ts = item.createdAt;
  if (!ts) {
    return 0;
  }
  if (typeof ts.toMillis === "function") {
    return ts.toMillis();
  }
  if (typeof ts.seconds === "number") {
    return ts.seconds * 1000;
  }
  return 0;
}

function getSortedPoems(items) {
  const sortType = poemsSort.value;
  const sorted = [...items];
  if (sortType === "title") {
    sorted.sort((a, b) => (a.taskTitle || "").localeCompare(b.taskTitle || "", "ko"));
    return sorted;
  }
  if (sortType === "author") {
    sorted.sort((a, b) => (a.authorName || "").localeCompare(b.authorName || "", "ko"));
    return sorted;
  }
  sorted.sort((a, b) => getCreatedAtMillis(b) - getCreatedAtMillis(a));
  return sorted;
}

function filterPoems(items) {
  const keyword = poemsSearch.value.trim().toLowerCase();
  if (!keyword) {
    return items;
  }
  return items.filter((item) => {
    const title = (item.taskTitle || "").toLowerCase();
    const author = (item.authorName || "").toLowerCase();
    const text = (item.originalText || "").toLowerCase();
    return title.includes(keyword) || author.includes(keyword) || text.includes(keyword);
  });
}

function renderPoemsCards(items) {
  if (!items.length) {
    poemsList.textContent = "조건에 맞는 원문이 없습니다.";
    return;
  }
  poemsList.innerHTML = items
    .map((item) => {
      return `<article class="poem-card">
        <p class="item-title">${item.taskTitle || "(제목 없음)"}</p>
        <p class="item-meta">${item.authorName || "익명"}</p>
        <p class="item-content">${item.originalText || "(원문 없음)"}</p>
      </article>`;
    })
    .join("");
}

function renderPoemsList() {
  if (!poemsItems.length) {
    poemsList.textContent = "등록된 원문이 없습니다.";
    return;
  }
  const filtered = filterPoems(poemsItems);
  const sorted = getSortedPoems(filtered);
  renderPoemsCards(sorted);
}

function subscribeAddPage() {
  if (unsubscribeRecent) {
    return;
  }
  const q = query(translationsRef, orderBy("createdAt", "desc"), limit(30));
  unsubscribeRecent = onSnapshot(
    q,
    (snapshot) => renderRecentList(snapshot),
    () => {
      recentPoemsList.textContent = "최근 등록 목록을 불러오지 못했습니다.";
    }
  );
}

function subscribePoemsPage() {
  if (unsubscribePoems) {
    return;
  }
  const q = query(translationsRef, orderBy("createdAt", "desc"));
  unsubscribePoems = onSnapshot(
    q,
    (snapshot) => {
      const grouped = new Map();
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const key = `${data.taskTitle}::${data.originalText}`;
        if (!grouped.has(key)) {
          grouped.set(key, data);
        }
      });
      poemsItems = [...grouped.values()];
      renderPoemsList();
    },
    () => {
      poemsList.textContent = "원문 목록을 불러오지 못했습니다.";
    }
  );
}

function teardownPageSubscriptions(route) {
  if (route !== "add" && unsubscribeRecent) {
    unsubscribeRecent();
    unsubscribeRecent = null;
  }
  if (route !== "poems" && unsubscribePoems) {
    unsubscribePoems();
    unsubscribePoems = null;
  }
}

function getCurrentRoute() {
  const raw = (location.hash || "#/add").replace("#/", "");
  return routePages[raw] ? raw : "add";
}

function renderRoute() {
  const route = getCurrentRoute();
  Object.entries(routePages).forEach(([key, node]) => {
    node.classList.toggle("is-active", key === route);
  });
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#/${route}`;
    link.classList.toggle("is-active", isActive);
  });
  teardownPageSubscriptions(route);
  if (route === "add") {
    subscribeAddPage();
  }
  if (route === "poems") {
    subscribePoemsPage();
  }
}

startPracticeBtn.addEventListener("click", async () => {
  const authorName = authorNameInput.value.trim();
  const taskTitle = taskTitleInput.value.trim();
  const sourceText = sourceTextInput.value.trim();
  const lines = normalizeLines(sourceText);

  if (!authorName) {
    showToast("작성자 이름을 입력해주세요.");
    return;
  }
  if (!taskTitle) {
    showToast("작업 제목을 입력해주세요.");
    return;
  }
  if (!lines.length) {
    showToast("원문을 입력해주세요.");
    return;
  }

  try {
    resolvedTaskTitle = await resolveUniqueTaskTitle(taskTitle);
  } catch (_error) {
    showToast("제목 중복 확인 중 오류가 발생했습니다.");
    return;
  }

  currentAuthorName = authorName;
  baseTaskTitle = taskTitle;
  currentSourceText = sourceText;
  practiceLines = lines;
  currentIndex = 0;
  answers = Array.from({ length: lines.length }, () => "");
  if (resolvedTaskTitle !== baseTaskTitle) {
    taskTitleInput.value = resolvedTaskTitle;
    showToast(`중복 제목 감지: "${resolvedTaskTitle}"로 저장됩니다.`);
  } else {
    showToast("연습을 시작합니다.");
  }
  renderPractice();
  location.hash = "#/practice";
});

goPoemsBtn.addEventListener("click", () => {
  location.hash = "#/poems";
});

nextLineBtn.addEventListener("click", () => {
  void saveCurrentSentence();
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void saveCurrentSentence();
  }
});

copyResultBtn.addEventListener("click", async () => {
  if (!resultOutput.value.trim()) {
    showToast("복사할 내용이 없습니다.");
    return;
  }
  try {
    await navigator.clipboard.writeText(resultOutput.value);
    showToast("결과를 복사했습니다.");
  } catch (_error) {
    showToast("복사에 실패했습니다.");
  }
});

poemsSort.addEventListener("change", () => {
  renderPoemsList();
});

poemsSearch.addEventListener("input", () => {
  renderPoemsList();
});

poemsSearchResetBtn.addEventListener("click", () => {
  poemsSearch.value = "";
  poemsSort.value = "latest";
  renderPoemsList();
});

window.addEventListener("hashchange", renderRoute);

renderPractice();
if (!location.hash) {
  location.hash = "#/add";
} else {
  renderRoute();
}
