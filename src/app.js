import { hasSupabaseConfig } from "./config.js";
import { mountLandingPreview } from "./game/preview.js";

const landing = document.querySelector("#landing");
const auth = document.querySelector("#auth");
const startButton = document.querySelector("#start-button");
const loginButton = document.querySelector("#login-button");
const authBack = document.querySelector("#auth-back");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const authStatus = document.querySelector("#auth-status");
const passwordInput = document.querySelector("#password");

let authMode = "signup";

mountLandingPreview();

function showLanding() {
  auth.hidden = true;
  landing.hidden = false;
}

function showAuth(mode) {
  authMode = mode;
  landing.hidden = true;
  auth.hidden = false;
  syncAuthCopy();

  // Never pretend that an account was created locally.
  if (!hasSupabaseConfig) {
    authStatus.textContent = "계정 서버 연결이 완료되면 이 화면에서 실제 가입·로그인이 진행됩니다.";
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

startButton.addEventListener("click", () => showAuth("signup"));
loginButton.addEventListener("click", () => showAuth("login"));
authBack.addEventListener("click", showLanding);
authSwitch.addEventListener("click", () => {
  authMode = authMode === "signup" ? "login" : "signup";
  syncAuthCopy();
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!hasSupabaseConfig) {
    authStatus.textContent = "서버가 아직 연결되지 않아 계정을 만들지 않았습니다.";
    return;
  }

  // Real Supabase auth is intentionally implemented only after project credentials are connected.
  // There is no local fake-login fallback.
});
