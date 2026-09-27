import { hasSupabaseConfig } from "./config.js";
import {
  destroyLandingPreview,
  mountLandingPreview,
} from "./game/preview.js";
import { destroyLiveGame, mountLiveGame } from "./game/game.js";
import {
  assignDealerToTable,
  firstUnassignedDealer,
  openBusiness,
  placeStarterTable,
  recruitBasicDealer,
  tableAtTile,
} from "./game/engine.js";
import {
  getSession,
  onAuthStateChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from "./services/supabase.js";
import {
  ensureGameSave,
  initializePubSave,
  saveGameState,
} from "./services/saveService.js";

const screens = {
  landing: document.querySelector("#landing"),
  auth: document.querySelector("#auth"),
  loading: document.querySelector("#loading"),
  pubSetup: document.querySelector("#pub-setup"),
  game: document.querySelector("#game"),
};

const startButton = document.querySelector("#start-button");
const loginButton = document.querySelector("#login-button");
const authBack = document.querySelector("#auth-back");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const authStatus = document.querySelector("#auth-status");
const passwordInput = document.querySelector("#password");
const emailInput = document.querySelector("#email");

const loadingMessage = document.querySelector("#loading-message");

const pubNameForm = document.querySelector("#pub-name-form");
const pubNameInput = document.querySelector("#pub-name");
const pubNameSubmit = document.querySelector("#pub-name-submit");
const pubNameStatus = document.querySelector("#pub-name-status");

const hudPubName = document.querySelector("#hud-pub-name");
const hudCalendar = document.querySelector("#hud-calendar");
const hudCash = document.querySelector("#hud-cash");
const hudStatus = document.querySelector("#hud-status");
const saveIndicator = document.querySelector("#save-indicator");
const systemMessage = document.querySelector("#system-message");
const floatingMenu = document.querySelector("#floating-menu");
const startBusinessButton = document.querySelector("#start-business");
const sheetBackdrop = document.querySelector("#sheet-backdrop");
const actionSheet = document.querySelector("#action-sheet");
const sheetContent = document.querySelector("#sheet-content");

let authMode = "signup";
let currentUserId = null;
let currentSave = null;
let currentState = null;
let gameController = null;
let autoSaveTimer = null;
let dirty = false;
let saving = false;
let queuedSave = false;
let routingSession = false;

function showOnly(target) {
  Object.values(screens).forEach((screen) => {
    screen.hidden = screen !== target;
  });
}

function showLanding() {
  cleanupGame();
  showOnly(screens.landing);
  mountLandingPreview();
}

function showLoading(message = "세이브를 불러오는 중…") {
  loadingMessage.textContent = message;
  showOnly(screens.loading);
}

function showAuth(mode) {
  cleanupGame();
  authMode = mode;
  showOnly(screens.auth);
  syncAuthCopy();

  if (!hasSupabaseConfig) {
    authStatus.textContent = "계정 서버 연결이 필요합니다.";
    authSubmit.disabled = true;
  } else {
    authStatus.textContent = "";
    authSubmit.disabled = false;
  }
}

function syncAuthCopy() {
  const signup = authMode === "signup";
  authTitle.textContent = signup ? "계정 만들기" : "로그인";
  authSubmit.textContent = signup ? "계정 만들기" : "로그인";
  authSwitch.textContent = signup ? "로그인으로 전환" : "새 계정 만들기";
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
}

function setAuthBusy(busy) {
  authSubmit.disabled = busy || !hasSupabaseConfig;
  authSubmit.textContent = busy
    ? "연결 중…"
    : authMode === "signup"
      ? "계정 만들기"
      : "로그인";
}

function readableAuthError(error) {
  const message = error?.message || "";

  if (/invalid login credentials/i.test(message)) {
    return "이메일 또는 비밀번호를 확인해주세요.";
  }
  if (/user already registered/i.test(message)) {
    return "이미 가입된 이메일입니다. 로그인해주세요.";
  }
  if (/password/i.test(message)) {
    return "비밀번호 조건을 확인해주세요.";
  }

  return "계정 서버와 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function cleanupGame() {
  closeSheet();
  destroyLiveGame();
  gameController = null;
  currentState = null;
  currentSave = null;
  dirty = false;

  if (autoSaveTimer) {
    window.clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

async function enterAuthenticatedState(session) {
  if (!session?.user || routingSession) return;

  routingSession = true;
  currentUserId = session.user.id;
  destroyLandingPreview();
  showLoading();

  try {
    const save = await ensureGameSave(session.user.id);
    currentSave = save;

    if (save.state?.phase === "needs_pub_name") {
      showOnly(screens.pubSetup);
      pubNameInput.focus();
      return;
    }

    launchGame(save.state);
  } catch (error) {
    console.error(error);
    showLoading("세이브를 불러오지 못했습니다. 페이지를 새로고침해주세요.");
  } finally {
    routingSession = false;
  }
}

function updateHUD() {
  if (!currentState) return;

  hudPubName.textContent = currentState.pub?.name || "POKER PUB";
  hudCash.textContent = `${Number(currentState.economy?.cash || 0).toLocaleString("ko-KR")}G`;
  hudCalendar.textContent = `${currentState.calendar?.week || 1}주차 · ${currentState.calendar?.dayName || "월요일"}`;
  const sessions = Number(currentState.business?.todayStats?.sessions || 0);
  hudStatus.textContent = currentState.business?.status === "open"
    ? `영업 중 · ${sessions}세션`
    : "영업 전";
}

function tutorialMessageFor(state) {
  if (!state) return "";

  switch (state.phase) {
    case "tutorial_place_table":
      return "먼저 포커 테이블을 준비해볼까요? 메뉴를 눌러 건설을 선택해보세요.";
    case "tutorial_recruit_dealer":
      return "테이블이 준비됐어요. 메뉴를 눌러 직원에서 딜러를 모집해보세요.";
    case "tutorial_assign_dealer":
      return "모집한 딜러를 방금 만든 테이블에 배치해보세요. 테이블을 탭하세요.";
    case "tutorial_ready_to_open":
      return "영업 준비가 끝났습니다. 영업 시작을 눌러보세요.";
    case "open": {
      const sessions = Number(state.business?.todayStats?.sessions || 0);
      const revenue = Number(state.business?.todayStats?.revenue || 0);

      if (sessions > 0) {
        return `영업 중 · 오늘 ${sessions}세션 · 매출 ${revenue.toLocaleString("ko-KR")}G`;
      }

      return state.guests?.length
        ? "영업 중입니다. 손님들이 실제 포커 세션을 플레이하고 있어요."
        : "1주차 월요일 영업을 시작했습니다. 첫 손님을 기다려보세요.";
    }
    default:
      return "";
  }
}

function refreshTutorialUI() {
  if (!currentState) return;

  systemMessage.textContent = tutorialMessageFor(currentState);
  startBusinessButton.hidden = currentState.phase !== "tutorial_ready_to_open";
}

function launchGame(state) {
  destroyLandingPreview();
  showOnly(screens.game);
  currentState = JSON.parse(JSON.stringify(state));

  updateHUD();
  refreshTutorialUI();

  gameController = mountLiveGame(currentState, {
    onTileTap: handleTileTap,
    onStateChange: handleSceneStateChange,
  });

  autoSaveTimer = window.setInterval(() => {
    if (dirty) flushSave();
  }, 15000);
}

async function replaceState(nextState, immediateSave = true) {
  currentState = JSON.parse(JSON.stringify(nextState));
  gameController?.setState(currentState);
  updateHUD();
  refreshTutorialUI();
  closeSheet();

  dirty = true;
  if (immediateSave) {
    await flushSave();
  }
}

async function flushSave() {
  if (!currentUserId || !currentState) return;

  if (saving) {
    queuedSave = true;
    return;
  }

  saving = true;
  queuedSave = false;
  saveIndicator.textContent = "저장 중…";

  try {
    const stateToSave = gameController?.getState() || currentState;
    currentState = JSON.parse(JSON.stringify(stateToSave));
    currentSave = await saveGameState(currentUserId, currentState, 1);
    dirty = false;
    saveIndicator.textContent = "저장됨";
  } catch (error) {
    console.error(error);
    dirty = true;
    saveIndicator.textContent = "저장 실패";
  } finally {
    saving = false;

    if (queuedSave) {
      queuedSave = false;
      flushSave();
    }
  }
}

function handleSceneStateChange(state, reason, meta = {}) {
  currentState = JSON.parse(JSON.stringify(state));
  updateHUD();
  dirty = true;

  if (reason === "guest_spawned" && currentState.counters?.guest === 1) {
    systemMessage.textContent = "첫 손님이 들어왔습니다. 빈 좌석을 찾아 이동하고 있어요.";
  }

  if (reason === "guest_seated") {
    const firstGuest = currentState.counters?.guest === 1;
    systemMessage.textContent = firstGuest
      ? "첫 손님이 자리에 앉아 실제 포커 세션을 시작했습니다."
      : "손님이 자리에 앉아 포커 세션을 시작했습니다.";
  }

  if (reason === "guest_session_completed") {
    const revenue = Number(meta.revenue || 0);
    const sessions = Number(currentState.business?.todayStats?.sessions || 0);
    systemMessage.textContent = `세션 종료 · +${revenue.toLocaleString("ko-KR")}G · 오늘 ${sessions}세션`;
    void flushSave();
  }

  if (reason === "guest_departed") {
    refreshTutorialUI();
  }
}

async function handleTileTap({ x, y, placementMode }) {
  if (!currentState) return;

  if (placementMode === "table" && currentState.phase === "tutorial_place_table") {
    try {
      const anchorX = x - 3;
      const anchorY = y - 2;
      const next = placeStarterTable(currentState, anchorX, anchorY);
      gameController.setPlacementMode(null);
      await replaceState(next);
      systemMessage.textContent = "테이블을 배치했습니다. 이제 메뉴에서 직원을 열어보세요.";
    } catch (error) {
      if (error?.message === "INVALID_TABLE_POSITION") {
        systemMessage.textContent = "그 위치에는 테이블과 좌석·통로가 모두 들어가지 않아요. 조금 더 안쪽을 탭해보세요.";
        return;
      }
      console.error(error);
    }
    return;
  }

  if (currentState.phase === "tutorial_assign_dealer") {
    const table = tableAtTile(currentState, x, y);
    const dealer = firstUnassignedDealer(currentState);

    if (!table || !dealer) return;

    try {
      const next = assignDealerToTable(currentState, dealer.id, table.id);
      await replaceState(next);
      systemMessage.textContent = "딜러가 배치되었습니다. 이제 영업 시작을 눌러보세요.";
    } catch (error) {
      console.error(error);
    }
  }
}

function closeSheet() {
  if (!actionSheet || !sheetBackdrop) return;
  actionSheet.hidden = true;
  sheetBackdrop.hidden = true;
}

function openSheet() {
  actionSheet.hidden = false;
  sheetBackdrop.hidden = false;
}

function renderMainMenu() {
  const staffDisabled = currentState.phase === "tutorial_place_table";
  const buildDescription = currentState.starter?.tableCredits > 0
    ? "기본 포커 테이블 1개 배치"
    : "현재 배치 가능한 스타터 테이블 없음";

  sheetContent.innerHTML = `
    <div class="sheet-header">
      <h3>매장 메뉴</h3>
      <button class="sheet-close" data-action="close" type="button">×</button>
    </div>
    <div class="sheet-grid">
      <button class="sheet-option" data-action="build" type="button">
        <strong>건설</strong>
        <small>${buildDescription}</small>
      </button>
      <button class="sheet-option" data-action="staff" type="button" ${staffDisabled ? "disabled" : ""}>
        <strong>직원</strong>
        <small>${staffDisabled ? "테이블을 먼저 배치하세요" : "딜러 · 서빙"}</small>
      </button>
    </div>
    <button class="logout-action" data-action="logout" type="button">로그아웃</button>
  `;

  bindSheetActions();
  openSheet();
}

function renderBuildMenu() {
  const credit = currentState.starter?.tableCredits || 0;

  sheetContent.innerHTML = `
    <div class="sheet-header">
      <h3>건설</h3>
      <button class="sheet-close" data-action="close" type="button">×</button>
    </div>
    <div class="staff-card">
      <strong>기본 포커 테이블</strong>
      <p>9명의 손님 좌석과 딜러 1자리로 구성됩니다. 실제 타일 공간을 점유합니다.</p>
      <button class="primary-button" data-action="place-table" type="button" ${credit < 1 ? "disabled" : ""}>
        ${credit > 0 ? "배치하기 · 스타터 1회" : "현재 배치 가능 수량 없음"}
      </button>
    </div>
    <p class="sheet-note">첫 매장에는 최대 4개의 풀 테이블을 둘 수 있습니다. 추가 구매 가격은 경제 밸런스 단계에서 연결합니다.</p>
  `;

  bindSheetActions();
  openSheet();
}

function dealerPanelMarkup() {
  const credit = currentState.starter?.basicRecruitCredits || 0;
  const dealers = currentState.staff?.filter((item) => item.role === "dealer") || [];

  const dealerList = dealers.length
    ? dealers.map((dealer) => `
        <div class="staff-card">
          <strong>${dealer.displayName}</strong>
          <p>${dealer.type === "normal" ? "일반 딜러" : dealer.type} · ${dealer.assignedTableId ? "테이블 배치됨" : "미배치"}</p>
        </div>
      `).join("")
    : "";

  return `
    <div class="staff-card">
      <strong>기본 모집</strong>
      <p>현재 기본 모집에서는 일반 딜러만 모집됩니다.</p>
      <button class="primary-button" data-action="recruit-dealer" type="button" ${credit < 1 ? "disabled" : ""}>
        ${credit > 0 ? "일반 딜러 모집 · 스타터 1회" : "스타터 모집 사용 완료"}
      </button>
    </div>
    ${dealerList}
  `;
}

function renderStaffMenu(tab = "dealer") {
  const dealerActive = tab === "dealer";

  sheetContent.innerHTML = `
    <div class="sheet-header">
      <h3>직원</h3>
      <button class="sheet-close" data-action="close" type="button">×</button>
    </div>
    <div class="sheet-row">
      <button class="staff-tab ${dealerActive ? "is-active" : ""}" data-action="staff-tab-dealer" type="button">딜러</button>
      <button class="staff-tab ${!dealerActive ? "is-active" : ""}" data-action="staff-tab-serving" type="button">서빙</button>
    </div>
    <div class="sheet-section">
      ${dealerActive
        ? dealerPanelMarkup()
        : '<div class="staff-card"><strong>서빙</strong><p>아직 모집 가능한 서빙 직원이 없습니다.</p></div>'}
    </div>
  `;

  bindSheetActions();
  openSheet();
}

function bindSheetActions() {
  sheetContent.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;

      if (action === "close") {
        closeSheet();
        return;
      }

      if (action === "build") {
        renderBuildMenu();
        return;
      }

      if (action === "staff") {
        renderStaffMenu("dealer");
        return;
      }

      if (action === "staff-tab-dealer") {
        renderStaffMenu("dealer");
        return;
      }

      if (action === "staff-tab-serving") {
        renderStaffMenu("serving");
        return;
      }

      if (action === "place-table") {
        closeSheet();
        gameController.setPlacementMode("table");
        systemMessage.textContent = "테이블을 둘 위치의 중심을 탭하세요. 손님 9명과 딜러 1명이 둘러앉을 공간이 필요합니다.";
        return;
      }

      if (action === "recruit-dealer") {
        try {
          const next = recruitBasicDealer(currentState);
          await replaceState(next);
          systemMessage.textContent = "일반 딜러를 모집했습니다. 맵의 테이블을 탭해 딜러를 배치하세요.";
        } catch (error) {
          console.error(error);
        }
        return;
      }

      if (action === "logout") {
        await logout();
      }
    });
  });
}

async function logout() {
  if (dirty) {
    await flushSave();
  }

  await signOut();
  currentUserId = null;
  cleanupGame();
  showLanding();
}

startButton.addEventListener("click", () => showAuth("signup"));
loginButton.addEventListener("click", () => showAuth("login"));
authBack.addEventListener("click", showLanding);

authSwitch.addEventListener("click", () => {
  authMode = authMode === "signup" ? "login" : "signup";
  authStatus.textContent = "";
  syncAuthCopy();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!hasSupabaseConfig) {
    authStatus.textContent = "계정 서버 연결이 필요합니다.";
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setAuthBusy(true);
  authStatus.textContent = "";

  try {
    if (authMode === "signup") {
      const { data, error } = await signUpWithEmail(email, password);
      if (error) throw error;

      if (!data.session) {
        authStatus.textContent = "가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해주세요.";
        return;
      }

      await enterAuthenticatedState(data.session);
      return;
    }

    const { data, error } = await signInWithEmail(email, password);
    if (error) throw error;
    await enterAuthenticatedState(data.session);
  } catch (error) {
    console.error(error);
    authStatus.textContent = readableAuthError(error);
  } finally {
    setAuthBusy(false);
  }
});

pubNameForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = pubNameInput.value.trim();
  pubNameStatus.textContent = "";

  if (name.length < 2 || name.length > 20) {
    pubNameStatus.textContent = "펍 이름은 2~20자로 입력해주세요.";
    return;
  }

  pubNameSubmit.disabled = true;
  pubNameSubmit.textContent = "매장 만드는 중…";

  try {
    currentSave = await initializePubSave(currentUserId, name);
    launchGame(currentSave.state);
  } catch (error) {
    console.error(error);
    pubNameStatus.textContent = "펍을 만들지 못했습니다. 다시 시도해주세요.";
  } finally {
    pubNameSubmit.disabled = false;
    pubNameSubmit.textContent = "이 이름으로 시작";
  }
});

floatingMenu.addEventListener("click", renderMainMenu);
sheetBackdrop.addEventListener("click", closeSheet);

startBusinessButton.addEventListener("click", async () => {
  try {
    const next = openBusiness(currentState);
    await replaceState(next);
    systemMessage.textContent = "튜토리얼 완료 · 1주차 월요일 영업을 시작합니다. 첫 손님을 기다려보세요.";
  } catch (error) {
    console.error(error);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && dirty) {
    flushSave();
  }
});

window.addEventListener("beforeunload", () => {
  if (dirty) flushSave();
});

mountLandingPreview();

if (hasSupabaseConfig) {
  onAuthStateChange((session) => {
    if (session && !currentUserId) {
      enterAuthenticatedState(session);
    } else if (!session && currentUserId) {
      currentUserId = null;
      showLanding();
    }
  });

  getSession()
    .then((session) => {
      if (session) return enterAuthenticatedState(session);
      showLanding();
    })
    .catch((error) => {
      console.error(error);
      showLanding();
    });
} else {
  showLanding();
}
