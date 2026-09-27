import { hasSupabaseConfig } from "./config.js";
import { mountLandingPreview } from "./game/preview.js";
import {
  getSession,
  onAuthStateChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from "./services/supabase.js";
import { ensureGameSave } from "./services/saveService.js";

const landing = document.querySelector("#landing");
const auth = document.querySelector("#auth");
const accountReady = document.querySelector("#account-ready");
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
const accountEmail = document.querySelector("#account-email");
const saveStatus = document.querySelector("#save-status");
const logoutButton = document.querySelector("#logout-button");

let authMode = "signup";
let currentUserId = null;

mountLandingPreview();

function showOnly(target) {
  [landing, auth, accountReady].forEach((screen) => {
    screen.hidden = screen !== target;
  });
}

function showLanding() {
  showOnly(landing);
}

function showAuth(mode) {
  authMode = mode;
  showOnly(auth);
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

async function enterAuthenticatedState(session) {
  if (!session?.user) return;
  if (currentUserId === session.user.id && !accountReady.hidden) return;

  currentUserId = session.user.id;
  showOnly(accountReady);
  accountEmail.textContent = session.user.email || "로그인된 플레이어";
  saveStatus.textContent = "계정 전용 세이브를 확인하고 있습니다…";

  try {
    const save = await ensureGameSave(session.user.id);
    const phase = save?.state?.phase;
    saveStatus.textContent = phase === "needs_pub_name"
      ? "서버 세이브가 준비되었습니다. 다음 단계에서 펍 이름을 정하고 첫 매장을 생성합니다."
      : "서버에서 기존 세이브를 불러왔습니다.";
  } catch (error) {
    console.error(error);
    saveStatus.textContent = "로그인은 성공했지만 세이브 DB 연결을 확인해야 합니다.";
  }
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

logoutButton.addEventListener("click", async () => {
  try {
    await signOut();
  } finally {
    currentUserId = null;
    showLanding();
  }
});

if (hasSupabaseConfig) {
  onAuthStateChange((session) => {
    if (session) {
      enterAuthenticatedState(session);
    } else if (currentUserId) {
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
