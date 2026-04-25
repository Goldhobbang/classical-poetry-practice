import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  startAfter
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
const savePoemBtn = document.getElementById("savePoemBtn");
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
// Pagination controls
const poemsPager = document.getElementById("poemsPager");
const poemsPrevBtn = document.getElementById("poemsPrevBtn");
const poemsNextBtn = document.getElementById("poemsNextBtn");
const poemsPageInfo = document.getElementById("poemsPageInfo");
const poemsPageSize = document.getElementById("poemsPageSize");
const toast = document.getElementById("toast");

const state = {
  poemsCache: [],
  selectedPoem: null,
  practiceLines: [],
  currentIndex: 0,
  answers: [],
  // pagination
  page: 1,
  pageSize: 10,
  // server-side pagination caches and cursors
  pages: {}, // page number -> items array
  pageCursors: {}, // page number -> lastVisible doc snapshot for that page
  pageHasMore: {}, // page number -> boolean indicating if there may be more pages after this one
  searchKeyword: "",
  isFetchingPoems: false
};

// debounce helper
function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

let toastTimer = null;
let isSubmitting = false;

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function updateProgress() {
  const total = state.practiceLines.length;
  const done = Math.min(state.currentIndex, total);
  progressText.textContent = `${done} / ${total}`;
  progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
}

function setSubmittingState(value) {
  isSubmitting = value;
  savePoemBtn.disabled = value;
  startPracticeBtn.disabled = value;
  answerInput.disabled = value;
  nextLineBtn.disabled = value;
  answerInput.classList.toggle("is-loading", value);
}

function renderPractice() {
  updateProgress();
  const total = state.practiceLines.length;
  if (!total) {
    previousLines.textContent = "아직 완료된 문장이 없습니다.";
    currentLine.textContent = "문장 추가 또는 원문 목록에서 연습할 글을 선택하세요.";
    nextLines.textContent = "다음 문장이 없습니다.";
    answerInput.value = "";
    return;
  }

  if (state.currentIndex >= total) {
    previousLines.textContent = state.practiceLines
      .map((line, idx) => `${idx + 1}. ${line}\n→ ${state.answers[idx] || "(미입력)"}`)
      .join("\n\n");
    currentLine.textContent = "연습이 완료되었습니다.";
    nextLines.textContent = "모든 문장 입력 완료";
    answerInput.value = "";
    resultOutput.value = state.answers.join("\n");
    location.hash = "#/result";
    return;
  }

  previousLines.textContent =
    state.practiceLines
      .slice(0, state.currentIndex)
      .map((line, idx) => `${idx + 1}. ${line}\n→ ${state.answers[idx] || "(미입력)"}`)
      .join("\n\n") || "아직 완료된 문장이 없습니다.";

  currentLine.textContent = state.practiceLines[state.currentIndex];

  nextLines.textContent =
    state.practiceLines
      .slice(state.currentIndex + 1)
      .map((line, idx) => `${state.currentIndex + idx + 2}. ${line}`)
      .join("\n") || "다음 문장이 없습니다.";

  answerInput.value = state.answers[state.currentIndex] || "";
  if (!isSubmitting) {
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
  if (!trimmed) {
    return trimmed;
  }
  // 성능 최적화: 대량 prefix 조회 대신, 후보 제목을 limit(1)로 존재 여부만 확인합니다.
  // 보통 1~2회 쿼리에서 종료되어 add 속도가 훨씬 안정적입니다.
  let candidate = trimmed;
  let suffix = 0;
  while (suffix < 500) {
    const existsQuery = query(translationsRef, where("taskTitle", "==", candidate), limit(1));
    const snapshot = await getDocs(existsQuery);
    if (snapshot.empty) {
      return candidate;
    }
    suffix += 1;
    candidate = `${trimmed}(${suffix})`;
  }
  return `${trimmed}(${Date.now()})`;
}

async function addPoemToDb(poem) {
  const taskTitle = await resolveUniqueTaskTitle(poem.taskTitle);
  const docRef = await addDoc(translationsRef, {
    authorName: poem.authorName,
    taskTitle,
    originalText: poem.originalText,
    translatedText: "",
    createdAt: serverTimestamp()
  });
  return {
    id: docRef.id,
    authorName: poem.authorName,
    taskTitle,
    originalText: poem.originalText
  };
}

function startPracticeWithPoem(poem) {
  const lines = normalizeLines(poem.originalText);
  if (!lines.length) {
    showToast("연습할 문장이 없습니다.");
    return;
  }

  state.selectedPoem = {
    authorName: poem.authorName,
    taskTitle: poem.taskTitle,
    originalText: poem.originalText
  };
  state.practiceLines = lines;
  state.currentIndex = 0;
  state.answers = Array.from({ length: lines.length }, () => "");
  renderPractice();
  location.hash = "#/practice";
}

function saveCurrentSentence() {
  if (!state.practiceLines.length || state.currentIndex >= state.practiceLines.length || isSubmitting) {
    return;
  }

  state.answers[state.currentIndex] = answerInput.value.trim();
  state.currentIndex += 1;
  renderPractice();
}

function renderRecentTitles(items) {
  if (!items.length) {
    recentPoemsList.textContent = "아직 등록된 원문이 없습니다.";
    return;
  }
  const fragment = document.createDocumentFragment();
  const seen = new Set();
  let count = 0;
  items.forEach((data) => {
    const key = `${data.taskTitle}::${data.authorName}`;
    if (!seen.has(key) && count < 5) {
      seen.add(key);
      count += 1;
      const article = document.createElement("article");
      article.className = "list-item";
      article.innerHTML = `<p class="item-title">${escapeHtml(data.taskTitle || "(제목 없음)")}</p>`;
      fragment.appendChild(article);
    }
  });
  recentPoemsList.innerHTML = "";
  recentPoemsList.appendChild(fragment);
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
  const html = items
    .map((item) => {
      return `<article class="poem-card">
        <div class="poem-head">
          <div>
            <p class="item-title">${escapeHtml(item.taskTitle || "(제목 없음)")}</p>
            <p class="item-meta">${escapeHtml(item.authorName || "익명")}</p>
          </div>
          <div class="row">
            <button type="button" class="btn-soft js-toggle-detail">상세 보기</button>
            <button type="button" class="btn-primary js-start-practice">이 글로 연습하기</button>
          </div>
        </div>
        <div class="poem-detail" hidden>
          <p class="item-content">${escapeHtml(item.originalText || "(원문 없음)")}</p>
        </div>
      </article>`;
    })
    .join("");
  poemsList.innerHTML = html;
}

// updatePager: if totalItems is provided, show exact pages; otherwise show current page and enable/disable next based on hasMore
function updatePager(totalItems, hasMore = undefined) {
  const pageSize = state.pageSize;
  if (typeof totalItems === "number") {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (state.page > totalPages) state.page = totalPages;
    if (poemsPageInfo) {
      poemsPageInfo.textContent = `${state.page} / ${totalPages}`;
    }
    if (poemsPrevBtn) poemsPrevBtn.disabled = state.page <= 1;
    if (poemsNextBtn) poemsNextBtn.disabled = state.page >= totalPages;
  } else {
    // unknown total count: show page only; disable next if we know there's no more
    if (poemsPageInfo) {
      poemsPageInfo.textContent = hasMore === false ? `${state.page}` : `${state.page}`;
    }
    if (poemsPrevBtn) poemsPrevBtn.disabled = state.page <= 1;
    if (poemsNextBtn) {
      if (typeof hasMore === "boolean") poemsNextBtn.disabled = !hasMore;
      else poemsNextBtn.disabled = false; // unknown
    }
  }
}

function renderPoemsList() {
  // Determine pageSize from selector
  const pageSize = Number(poemsPageSize?.value || state.pageSize) || state.pageSize;
  state.pageSize = pageSize;

  // If server-paginated pages exist for current page, use them
  const pageItems = state.pages[state.page] || [];

  if (!pageItems || pageItems.length === 0) {
    // If we have no cached pages and no global cache, show empty message
    poemsList.textContent = "등록된 원문이 없습니다.";
    if (poemsPager) poemsPager.style.display = "none";
    updatePager(0, false);
    return;
  }

  // If a client-side filter (search within page) is needed, apply it
  let itemsToRender = pageItems;
  if (state.searchKeyword) {
    const kw = state.searchKeyword.toLowerCase();
    itemsToRender = pageItems.filter((item) => {
      const title = (item.taskTitle || "").toLowerCase();
      const author = (item.authorName || "").toLowerCase();
      const text = (item.originalText || "").toLowerCase();
      return title.includes(kw) || author.includes(kw) || text.includes(kw);
    });
  }

  // Sorting on the client for items on this page (if user changed sort)
  const sorted = getSortedPoems(itemsToRender);
  renderPoemsCards(sorted);

  // Show pager: use hasMore heuristic (true if this page returned full pageSize)
  const hasMore = !!state.pageHasMore[state.page];
  if (poemsPager) poemsPager.style.display = "flex";
  updatePager(undefined, hasMore);
}

async function fetchRecentTitles() {
  recentPoemsList.textContent = "최근 등록 목록을 불러오는 중...";
  const q = query(translationsRef, orderBy("createdAt", "desc"), limit(30));
  try {
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((docSnap) => docSnap.data());
    renderRecentTitles(items);
  } catch (_error) {
    recentPoemsList.textContent = "최근 등록 목록을 불러오지 못했습니다.";
  }
}

// Server-side paginated fetch. Call with fetchPoems(page = 1)
async function fetchPoems(page = 1) {
  if (state.isFetchingPoems) return;
  state.isFetchingPoems = true;
  poemsList.textContent = "원문 목록을 불러오는 중...";
  const pageSize = Number(poemsPageSize?.value || state.pageSize) || state.pageSize;

  try {
    // If we already cached this page, just render it
    if (state.pages[page]) {
      state.page = page;
      renderPoemsList();
      state.isFetchingPoems = false;
      return;
    }

    // Build base query depending on whether there's a search keyword
    const keyword = state.searchKeyword;
    let q;
    // Determine sorting field/direction from UI
    const sortVal = poemsSort?.value || "latest";
    let sortField = "createdAt";
    let sortDir = "desc";
    if (sortVal === "title") {
      sortField = "taskTitle";
      sortDir = "asc";
    } else if (sortVal === "author") {
      sortField = "authorName";
      sortDir = "asc";
    }

    if (keyword) {
      // Try taskTitle prefix search server-side (simple query). Note: orders by taskTitle.
      const start = keyword;
      const end = keyword + "";
      if (page === 1) {
        q = query(
          translationsRef,
          orderBy("taskTitle", "asc"),
          where("taskTitle", ">=", start),
          where("taskTitle", "<=", end),
          limit(pageSize)
        );
      } else {
        const prevCursor = state.pageCursors[page - 1];
        if (!prevCursor) {
          await fetchPoems(1);
          state.isFetchingPoems = false;
          return await fetchPoems(page);
        }
        q = query(
          translationsRef,
          orderBy("taskTitle", "asc"),
          where("taskTitle", ">=", start),
          where("taskTitle", "<=", end),
          startAfter(prevCursor),
          limit(pageSize)
        );
      }
    } else {
      // Default: page-by-page using startAfter cursors with chosen sort
      if (page === 1) {
        q = query(translationsRef, orderBy(sortField, sortDir), limit(pageSize));
      } else {
        const prevCursor = state.pageCursors[page - 1];
        if (!prevCursor) {
          // Defensive: if we don't have previous cursor, fetch page 1 first
          await fetchPoems(1);
          state.isFetchingPoems = false;
          return await fetchPoems(page);
        }
        q = query(translationsRef, orderBy(sortField, sortDir), startAfter(prevCursor), limit(pageSize));
      }
    }

    const snapshot = await getDocs(q);
    if (!snapshot || !snapshot.docs) {
      poemsList.textContent = "원문 목록을 불러오지 못했습니다.";
      state.isFetchingPoems = false;
      return;
    }

    // Map documents to data and de-duplicate within this page (same title+text)
    const grouped = new Map();
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const key = `${data.taskTitle}::${data.originalText}`;
      if (!grouped.has(key)) {
        grouped.set(key, data);
      }
    });
    const items = [...grouped.values()];

    // Cache page items and cursor
    state.pages[page] = items;
    const last = snapshot.docs[snapshot.docs.length - 1];
    // If number of docs returned < pageSize, there is no next page
    state.pageHasMore[page] = snapshot.docs.length === pageSize;
    if (last) state.pageCursors[page] = last;

    state.page = page;
    renderPoemsList();

  } catch (error) {
    console.error("fetchPoems error", error);
    poemsList.textContent = "원문 목록을 불러오지 못했습니다.";
  } finally {
    state.isFetchingPoems = false;
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

  if (route === "add") {
    void fetchRecentTitles();
  }
  if (route === "poems") {
    void fetchPoems();
  }
}

savePoemBtn.addEventListener("click", async () => {
  const authorName = authorNameInput.value.trim();
  const taskTitle = taskTitleInput.value.trim();
  const sourceText = sourceTextInput.value.trim();

  if (!authorName) {
    showToast("작성자 이름을 입력해주세요.");
    return;
  }
  if (!taskTitle) {
    showToast("작업 제목을 입력해주세요.");
    return;
  }
  if (!sourceText) {
    showToast("원문을 입력해주세요.");
    return;
  }

  setSubmittingState(true);
  try {
    const createdPoem = await addPoemToDb({
      authorName,
      taskTitle,
      originalText: sourceText
    });
    // 저장 직후 로컬 상태를 먼저 확정하고 라우팅하여 레이스 컨디션을 방지합니다.
    taskTitleInput.value = createdPoem.taskTitle;
    startPracticeWithPoem(createdPoem);
    showToast("글 저장 후 연습을 시작합니다.");
    // 목록 갱신은 백그라운드로 처리하여 라우팅 지연을 줄입니다.
    void fetchRecentTitles();
  } catch (_error) {
    showToast("글 저장에 실패했습니다. Firebase 설정을 확인해주세요.");
  } finally {
    setSubmittingState(false);
  }
});

startPracticeBtn.addEventListener("click", () => {
  const authorName = authorNameInput.value.trim();
  const taskTitle = taskTitleInput.value.trim();
  const sourceText = sourceTextInput.value.trim();
  if (!authorName || !taskTitle || !sourceText) {
    showToast("이름, 제목, 원문을 모두 입력해주세요.");
    return;
  }
  startPracticeWithPoem({
    authorName,
    taskTitle,
    originalText: sourceText
  });
});

goPoemsBtn.addEventListener("click", () => {
  location.hash = "#/poems";
});

nextLineBtn.addEventListener("click", () => {
  saveCurrentSentence();
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveCurrentSentence();
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
  state.page = 1;
  // when sort changes, we should clear cached pages and re-fetch
  state.pages = {};
  state.pageCursors = {};
  state.pageHasMore = {};
  void fetchPoems(1);
});

// Debounced search: reset pages and perform server-side prefix search on title when possible
const debouncedSearch = debounce((ev) => {
  const v = (ev.target.value || "").trim();
  state.searchKeyword = v;
  state.pages = {};
  state.pageCursors = {};
  state.pageHasMore = {};
  void fetchPoems(1);
}, 250);
poemsSearch.addEventListener("input", debouncedSearch);

poemsSearchResetBtn.addEventListener("click", () => {
  poemsSearch.value = "";
  poemsSort.value = "latest";
  state.searchKeyword = "";
  state.page = 1;
  state.pages = {};
  state.pageCursors = {};
  state.pageHasMore = {};
  void fetchPoems(1);
});

// Pager events (if elements exist)
if (poemsPrevBtn) {
  poemsPrevBtn.addEventListener("click", async () => {
    if (state.page > 1) {
      const targetPage = state.page - 1;
      if (state.pages[targetPage]) {
        state.page = targetPage;
        renderPoemsList();
      } else {
        // fetch previous page if not cached (shouldn't normally happen)
        await fetchPoems(targetPage);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}
if (poemsNextBtn) {
  poemsNextBtn.addEventListener("click", async () => {
    const targetPage = state.page + 1;
    if (state.pages[targetPage]) {
      state.page = targetPage;
      renderPoemsList();
    } else {
      // fetch next page (will use cursor from previous page)
      await fetchPoems(targetPage);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
if (poemsPageSize) {
  poemsPageSize.addEventListener("change", () => {
    state.page = 1;
    state.pages = {};
    state.pageCursors = {};
    state.pageHasMore = {};
    void fetchPoems(1);
  });
}

poemsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const card = target.closest(".poem-card");
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const detail = card.querySelector(".poem-detail");
  if (!(detail instanceof HTMLElement)) {
    return;
  }

  if (target.classList.contains("js-toggle-detail")) {
    const isHidden = detail.hasAttribute("hidden");
    if (isHidden) {
      detail.removeAttribute("hidden");
      target.textContent = "닫기";
    } else {
      detail.setAttribute("hidden", "true");
      target.textContent = "상세 보기";
    }
    return;
  }

  if (target.classList.contains("js-start-practice")) {
    const title = card.querySelector(".item-title")?.textContent || "";
    const author = card.querySelector(".item-meta")?.textContent || "";
    const text = card.querySelector(".item-content")?.textContent || "";
    startPracticeWithPoem({
      taskTitle: title,
      authorName: author,
      originalText: text
    });
  }
});

async function testFirebaseConnection() {
  try {
    const q = query(translationsRef, limit(1));
    await getDocs(q);
    console.info("[Firebase] 연결 성공");
    showToast("Firebase 연결 성공");
  } catch (error) {
    console.error("[Firebase] 연결 실패", error);
    showToast("Firebase 연결 실패");
  }
}

window.addEventListener("hashchange", renderRoute);

renderPractice();
if (!location.hash) {
  location.hash = "#/add";
} else {
  renderRoute();
}
void testFirebaseConnection();
