// Lazy-load Firebase modules to avoid blocking initial render
let firebaseApp = null;
let db = null;
let translationsRef = null;
let firebaseFns = null;
let firebaseLoaded = false;
let firebaseAuth = null;
let firebaseCurrentUserUid = null;
let firebaseAuthFns = null;

// 🚨 중요: 여기에 Firebase 콘솔에서 복사한 본인의 설정값을 입력하세요.
// apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId 값을 모두 본인 프로젝트 값으로 채워주세요.
// Use external config if provided (loaded from an ignored file at runtime)
const firebaseConfig = (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) ? window.__FIREBASE_CONFIG__ : {
  apiKey: "AIzaSyBaIiI5lY_nSyk4Li1Yvju0fxPElU7mKEo",
  authDomain: "classical-poetry-practicer.firebaseapp.com",
  projectId: "classical-poetry-practicer",
  storageBucket: "classical-poetry-practicer.firebasestorage.app",
  messagingSenderId: "951378049043",
  appId: "1:951378049043:web:b4d487ab0a4e9641a9e7e6",
  measurementId: "G-CBG0P4VVB6"
};

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.warn('[Firebase] No firebaseConfig found on window.__FIREBASE_CONFIG__. Make sure to create config/firebase-config.js and include it before app.js.');
}

// Lazy-load firebase modules when needed to avoid blocking initial render
async function ensureFirebase() {
  if (firebaseLoaded) return;
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const fsModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    firebaseApp = appModule.initializeApp(firebaseConfig);
    db = fsModule.getFirestore(firebaseApp);
    translationsRef = fsModule.collection(db, 'translations');
    firebaseFns = {
      addDoc: fsModule.addDoc,
      getDocs: fsModule.getDocs,
      getDoc: fsModule.getDoc,
      doc: fsModule.doc,
      deleteDoc: fsModule.deleteDoc,
      updateDoc: fsModule.updateDoc,
      collection: fsModule.collection,
      limit: fsModule.limit,
      orderBy: fsModule.orderBy,
      query: fsModule.query,
      serverTimestamp: fsModule.serverTimestamp,
      where: fsModule.where,
      startAfter: fsModule.startAfter
    };
    // Do not load analytics to avoid extra network requests and potential adblock interference

    // Initialize Auth but do NOT sign in anonymously. Admin will sign in via email/password.
    try {
      const authModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
      firebaseAuth = authModule.getAuth(firebaseApp);
      // expose auth functions
      firebaseAuthFns = {
        signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
        signOut: authModule.signOut,
        createUserWithEmailAndPassword: authModule.createUserWithEmailAndPassword
      };
      // if a user is already signed in (unlikely on first load), set uid
      if (firebaseAuth.currentUser) {
        firebaseCurrentUserUid = firebaseAuth.currentUser.uid;
      }
    } catch (err) {
      console.error('[Firebase] Auth load failed', err && err.code, err && err.message, err);
      throw err;
    }

    firebaseLoaded = true;
    console.info('[Firebase] Modules loaded');
  } catch (e) {
    // Log detailed error info and rethrow so callers can react
    console.error('[Firebase] Failed to load modules', e && e.code, e && e.message, e);
    // Provide a standardized Error with code/message if possible
    const err = e instanceof Error ? e : new Error(String(e));
    err.code = e && e.code ? e.code : 'firebase_load_failed';
    err.message = e && e.message ? e.message : String(e);
    throw err;
  }
}

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

// Admin UI elements
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const adminAuthModal = document.getElementById("adminAuthModal");
const adminEmail = document.getElementById("adminEmail");
const adminPass = document.getElementById("adminPass");
const adminLoginSubmit = document.getElementById("adminLoginSubmit");
const adminLoginCancel = document.getElementById("adminLoginCancel");

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
  isFetchingPoems: false,
  // editing state for admin edits
  editingDocId: null
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
let isAdmin = false;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 5000);
}

// Error UI helper: show detailed error box and allow copying
const errorBox = document.getElementById('errorBox');
const errorText = document.getElementById('errorText');
const copyErrorBtn = document.getElementById('copyErrorBtn');
const closeErrorBtn = document.getElementById('closeErrorBtn');

function showErrorBox(text) {
  if (!errorBox || !errorText) return;
  errorText.textContent = text;
  errorBox.removeAttribute('hidden');
}

if (copyErrorBtn) {
  copyErrorBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(errorText.textContent);
      showToast('오류 메시지를 복사했습니다.');
    } catch (e) {
      showToast('클립보드 복사에 실패했습니다.');
    }
  });
}
if (closeErrorBtn) {
  closeErrorBtn.addEventListener('click', () => {
    if (errorBox) errorBox.setAttribute('hidden', 'true');
  });
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
  await ensureFirebase();
  while (suffix < 500) {
    const existsQuery = firebaseFns.query(translationsRef, firebaseFns.where("taskTitle", "==", candidate), firebaseFns.limit(1));
    const snapshot = await firebaseFns.getDocs(existsQuery);
    if (!snapshot || snapshot.empty) {
      return candidate;
    }
    suffix += 1;
    candidate = `${trimmed}(${suffix})`;
  }
  return `${trimmed}(${Date.now()})`;
}

async function addPoemToDb(poem) {
  const taskTitle = await resolveUniqueTaskTitle(poem.taskTitle);
  await ensureFirebase();
  const ownerIdToUse = firebaseCurrentUserUid || poem.ownerId || null;
  const docRef = await firebaseFns.addDoc(translationsRef, {
    authorName: poem.authorName,
    taskTitle,
    originalText: poem.originalText,
    translatedText: "",
    createdAt: firebaseFns.serverTimestamp(),
    ownerId: ownerIdToUse
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
    if (!seen.has(key) && count < 10) {
      seen.add(key);
      count += 1;
      const article = document.createElement("article");
      article.className = "list-item";
      const safeTitle = escapeHtml(data.taskTitle || "(제목 없음)");
      const safeAuthor = escapeHtml(data.authorName || "익명");
      article.innerHTML = `
        <div>
          <p class="item-title">${safeTitle}</p>
          <p class="item-meta">${safeAuthor}</p>
        </div>
        <div class="row" style="margin: 0;">
          <button type="button" class="btn-soft js-load-poem">불러오기</button>
          <button type="button" class="btn-primary js-start-practice">연습</button>
        </div>
      `;
      // attach data in dataset for click handlers
      article.dataset.title = data.taskTitle || "";
      article.dataset.author = data.authorName || "";
      article.dataset.text = data.originalText || "";
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
      // include admin-only buttons but keep them hidden until admin logs in
      return `<article class="poem-card">
        <div class="poem-head">
          <div>
            <p class="item-title">${escapeHtml(item.taskTitle || "(제목 없음)")}</p>
            <p class="item-meta">${escapeHtml(item.authorName || "익명")}</p>
          </div>
          <div class="row" style="margin: 0; flex-wrap: nowrap;">
            <button type="button" class="btn-soft js-toggle-detail">상세</button>
            <button type="button" class="btn-primary js-start-practice">연습</button>
            <button type="button" class="btn-soft js-edit" data-id="${item.id}" style="display:none">수정</button>
            <button type="button" class="btn-clear js-delete" data-id="${item.id}" style="display:none">삭제</button>
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

  // Ensure admin buttons reflect current admin status
  if (isAdmin) {
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'inline-block');
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'inline-block';
  } else {
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'none');
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'none';
  }
}

async function fetchRecentTitles() {
  recentPoemsList.textContent = "최근 등록 목록을 불러오는 중...";
  await ensureFirebase();
  const q = firebaseFns.query(translationsRef, firebaseFns.orderBy("createdAt", "desc"), firebaseFns.limit(30));
  try {
    const snapshot = await firebaseFns.getDocs(q);
    const items = snapshot.docs.map((docSnap) => docSnap.data());
    renderRecentTitles(items);
  } catch (error) {
    console.error('[Firebase] fetchRecentTitles failed', error && error.code, error && error.message, error);
    recentPoemsList.textContent = "최근 등록 목록을 불러오지 못했습니다.";
    showToast(`[Firebase 연결 실패] 원인: ${error?.message || error}`);
    showErrorBox(`${error?.code || ''} ${error?.message || String(error)}`);
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
        q = firebaseFns.query(
          translationsRef,
          firebaseFns.orderBy("taskTitle", "asc"),
          firebaseFns.where("taskTitle", ">=", start),
          firebaseFns.where("taskTitle", "<=", end),
          firebaseFns.limit(pageSize)
        );
      } else {
        const prevCursor = state.pageCursors[page - 1];
        if (!prevCursor) {
          await fetchPoems(1);
          state.isFetchingPoems = false;
          return await fetchPoems(page);
        }
        q = firebaseFns.query(
          translationsRef,
          firebaseFns.orderBy("taskTitle", "asc"),
          firebaseFns.where("taskTitle", ">=", start),
          firebaseFns.where("taskTitle", "<=", end),
          firebaseFns.startAfter(prevCursor),
          firebaseFns.limit(pageSize)
        );
      }
    } else {
      // Default: page-by-page using startAfter cursors with chosen sort
      if (page === 1) {
        q = firebaseFns.query(translationsRef, firebaseFns.orderBy(sortField, sortDir), firebaseFns.limit(pageSize));
      } else {
        const prevCursor = state.pageCursors[page - 1];
        if (!prevCursor) {
          // Defensive: if we don't have previous cursor, fetch page 1 first
          await fetchPoems(1);
          state.isFetchingPoems = false;
          return await fetchPoems(page);
        }
        q = firebaseFns.query(translationsRef, firebaseFns.orderBy(sortField, sortDir), firebaseFns.startAfter(prevCursor), firebaseFns.limit(pageSize));
      }
    }

    const snapshot = await firebaseFns.getDocs(q);
    if (!snapshot || !snapshot.docs) {
      poemsList.textContent = "원문 목록을 불러오지 못했습니다.";
      state.isFetchingPoems = false;
      return;
    }

    // Map documents to data and de-duplicate within this page (same title+text)
    const grouped = new Map();
    snapshot.docs.forEach((docSnap) => {
      const raw = docSnap.data();
      const data = Object.assign({}, raw, { id: docSnap.id });
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
    console.error('fetchPoems error', error && error.code, error && error.message, error);
    poemsList.textContent = "원문 목록을 불러오지 못했습니다.";
    showToast(`[Firebase 연결 실패] 원인: ${error?.message || error}`);
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

  // Restore admin button visibility after route change
  if (isAdmin) {
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'inline-block');
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'inline-block';
  } else {
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'none');
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'none';
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
    // If we're in editing mode (admin editing an existing doc), update instead of create
    if (state.editingDocId) {
      try {
        await ensureFirebase();
        const docRef = firebaseFns.doc(db, 'translations', state.editingDocId);
        await firebaseFns.updateDoc(docRef, {
          authorName,
          taskTitle,
          originalText: sourceText
        });
        showToast('문서가 업데이트되었습니다.');
        // clear editing state
        state.editingDocId = null;
        taskTitleInput.value = taskTitle;
        startPracticeWithPoem({ authorName, taskTitle, originalText: sourceText });
        void fetchRecentTitles();
        return;
      } catch (e) {
        console.error('update failed', e);
        showErrorBox(`${e?.code||''} ${e?.message||String(e)}`);
      } finally {
        setSubmittingState(false);
      }
    }
  try {
    const createdPoem = await addPoemToDb({
      authorName,
      taskTitle,
      originalText: sourceText,
      ownerId: firebaseCurrentUserUid
    });
    // 저장 직후 로컬 상태를 먼저 확정하고 라우팅하여 레이스 컨디션을 방지합니다.
    taskTitleInput.value = createdPoem.taskTitle;
    startPracticeWithPoem(createdPoem);
    showToast("글 저장 후 연습을 시작합니다.");
    // 목록 갱신은 백그라운드로 처리하여 라우팅 지연을 줄입니다.
    void fetchRecentTitles();
  } catch (_error) {
    console.error('addPoem failed', _error && _error.code, _error && _error.message, _error);
    showToast("글 저장에 실패했습니다. 상세 오류를 확인하세요.");
    showErrorBox(`${_error?.code || ''} ${_error?.message || String(_error)}`);
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

// Clear add form (discard draft)
const clearAddBtn = document.getElementById('clearAddBtn');
if (clearAddBtn) {
  clearAddBtn.addEventListener('click', () => {
    authorNameInput.value = '';
    taskTitleInput.value = '';
    sourceTextInput.value = '';
    showToast('작성 중인 내용이 폐기되었습니다.');
  });
}

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

// Handle clicks in poems list (cards)
poemsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const card = target.closest(".poem-card");
  if (!(card instanceof HTMLElement)) return;
  const detail = card.querySelector(".poem-detail");
  if (!(detail instanceof HTMLElement)) return;

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
    startPracticeWithPoem({ taskTitle: title, authorName: author, originalText: text });
    return;
  }

  // Admin: edit
  if (target.classList.contains('js-edit')) {
    if (!isAdmin) { showToast('관리자만 수정할 수 있습니다.'); return; }
    const id = target.dataset.id;
    if (!id) return;
    // load doc data into add form for editing
    (async () => {
      try {
        await ensureFirebase();
        const docRef = firebaseFns.doc(db, 'translations', id);
        const docSnap = await firebaseFns.getDoc(docRef);
        if (!docSnap.exists()) { showToast('문서를 찾을 수 없습니다.'); return; }
        const data = docSnap.data();
        authorNameInput.value = data.authorName || '';
        taskTitleInput.value = data.taskTitle || '';
        sourceTextInput.value = data.originalText || '';
        state.editingDocId = id;
        location.hash = '#/add';
        showToast('편집 모드로 불러왔습니다. 저장하면 기존 문서가 업데이트됩니다.');
      } catch (err) {
        console.error('load doc for edit failed', err);
        showErrorBox(`${err?.code||''} ${err?.message||String(err)}`);
      }
    })();
    return;
  }

  // Admin: delete
  if (target.classList.contains('js-delete')) {
    if (!isAdmin) { showToast('관리자만 삭제할 수 있습니다.'); return; }
    const id = target.dataset.id;
    if (!id) return;
    if (!confirm('정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    (async () => {
      try {
        await ensureFirebase();
        const docRef = firebaseFns.doc(db, 'translations', id);
        await firebaseFns.deleteDoc(docRef);
        // invalidate page caches and refetch current page
        state.pages = {};
        state.pageCursors = {};
        state.pageHasMore = {};
        void fetchPoems(state.page);
        showToast('문서가 삭제되었습니다.');
      } catch (err) {
        console.error('delete failed', err);
        showErrorBox(`${err?.code||''} ${err?.message||String(err)}`);
      }
    })();
    return;
  }
});

// Handle recent list buttons (load + practice)
if (recentPoemsList) {
  recentPoemsList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const recentItem = target.closest('.list-item');
    if (!recentItem) return;
    if (target.classList.contains('js-load-poem')) {
      const title = recentItem.dataset.title || '';
      const author = recentItem.dataset.author || '';
      const text = recentItem.dataset.text || '';
      authorNameInput.value = author;
      taskTitleInput.value = title;
      sourceTextInput.value = text;
      showToast('원문을 불러왔습니다.');
      return;
    }
    if (target.classList.contains('js-start-practice')) {
      const title = recentItem.dataset.title || '';
      const author = recentItem.dataset.author || '';
      const text = recentItem.dataset.text || '';
      startPracticeWithPoem({ taskTitle: title, authorName: author, originalText: text });
      return;
    }
  });
}

async function testFirebaseConnection() {
  try {
    await ensureFirebase();
    const q = firebaseFns.query(translationsRef, firebaseFns.limit(1));
    await firebaseFns.getDocs(q);
    console.info("[Firebase] 연결 성공");
    showToast("Firebase 연결 성공");
  } catch (error) {
    console.error('[Firebase] 연결 실패', error && error.code, error && error.message, error);
    showToast(`[Firebase 연결 실패] 원인: ${error?.message || error}`);
  }
}

window.addEventListener("hashchange", renderRoute);

renderPractice();
if (!location.hash) {
  location.hash = "#/add";
} else {
  renderRoute();
}

// Defer Firebase initialization and data fetch to background so the initial UI shows immediately
(async () => {
  try {
    await ensureFirebase();
    // only fetch data relevant to current route (non-blocking)
    const route = getCurrentRoute();
    if (route === 'add') {
      void fetchRecentTitles();
    }
    if (route === 'poems') {
      void fetchPoems(1);
    }
    void testFirebaseConnection();
  } catch (e) {
    console.error('Firebase modules failed to load:', e && e.code, e && e.message, e);
    showToast(`[Firebase 로드 실패] 원인: ${e?.message || e}`);
  }
})();

// --- Admin auth UI wiring (password-only) ---

// Simple password-only admin authentication
async function adminSignIn(password) {
  try {
    const correctPassword = (typeof window !== 'undefined' && window.__ADMIN_PASSWORD__) ? window.__ADMIN_PASSWORD__ : null;
    if (!correctPassword) {
      showToast('관리자 비밀번호가 설정되지 않았습니다.');
      showErrorBox('window.__ADMIN_PASSWORD__ is not set in config/firebase-config.js');
      return;
    }

    // Simple password check
    if (password !== correctPassword) {
      showToast('비밀번호가 틀렸습니다.');
      return;
    }

    isAdmin = true;
    localStorage.setItem('isAdmin', 'true');
    // reveal admin-only buttons
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'inline-block');
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'inline-block';
    showToast('관리자 로그인 성공');
    if (adminAuthModal) adminAuthModal.setAttribute('hidden', 'true');
  } catch (err) {
    console.error('admin login failed', err);
    showToast('관리자 로그인 실패');
    showErrorBox(`${err?.message || String(err)}`);
  }
}

if (adminLoginBtn) {
  adminLoginBtn.addEventListener('click', () => {
    if (!adminAuthModal) return;
    adminAuthModal.removeAttribute('hidden');
    // Only password is required now. Clear and focus password field.
    if (adminPass) adminPass.value = '';
    if (adminPass) adminPass.focus();
  });
}
if (adminLoginCancel) {
  adminLoginCancel.addEventListener('click', () => {
    if (adminAuthModal) adminAuthModal.setAttribute('hidden', 'true');
  });
}
if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener('click', async () => {
    isAdmin = false;
    localStorage.removeItem('isAdmin');
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'none');
    adminLogoutBtn.style.display = 'none';
    showToast('관리자 로그아웃 완료');
  });
}
if (adminLoginSubmit) {
  adminLoginSubmit.addEventListener('click', async () => {
    const pass = adminPass.value;
    if (!pass) { showToast('비밀번호를 입력하세요.'); return; }
    await adminSignIn(pass);
  });
}

// By default hide admin buttons until admin logs in
// Check localStorage to restore admin status if previously logged in
if (localStorage.getItem('isAdmin') === 'true') {
  isAdmin = true;
  document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'inline-block');
  if (adminLogoutBtn) adminLogoutBtn.style.display = 'inline-block';
} else {
  document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'none');
  if (adminLogoutBtn) adminLogoutBtn.style.display = 'none';
}

// Optional: expose logout control via console for now
window.__adminLogout = async function() {
  if (!firebaseAuth || !firebaseAuthFns) return;
  try {
    await firebaseAuthFns.signOut(firebaseAuth);
    isAdmin = false;
    localStorage.removeItem('isAdmin');
    document.querySelectorAll('.js-edit, .js-delete').forEach((btn) => btn.style.display = 'none');
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'none';
    showToast('관리자 로그아웃 완료');
  } catch(err) {
    console.error('logout failed', err);
  }
};
