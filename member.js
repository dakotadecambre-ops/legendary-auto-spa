const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const MEMBER_TOKEN_KEY = "legendary-auto-spa.memberToken";
const MEMBER_PROFILE_KEY = "legendary-auto-spa.memberProfile";

const memberAuthForm = document.querySelector("#memberAuthForm");
const memberPhone = document.querySelector("#memberPhone");
const memberPassword = document.querySelector("#memberPassword");
const memberStatus = document.querySelector("#memberStatus");

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function memberApi(path, options = {}) {
  const result = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.error || "Request failed");
  return data;
}

function saveMemberSession(data) {
  localStorage.setItem(MEMBER_TOKEN_KEY, data.token || "");
  localStorage.setItem(MEMBER_SESSION_KEY, data.member?.phone || "");
  localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(data.member || {}));
}

memberAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const phone = normalizePhone(memberPhone.value);
  if (phone.length < 10 || memberPassword.value.length < 6) {
    memberStatus.textContent = "Enter a valid phone number and password.";
    return;
  }

  memberStatus.textContent = "Signing in...";
  try {
    const data = await memberApi("member-login", {
      method: "POST",
      body: JSON.stringify({ phone, password: memberPassword.value })
    });
    saveMemberSession(data);
    memberPassword.value = "";
    memberStatus.textContent = "Opening your member portal...";
    window.location.href = "member-portal.html";
  } catch (error) {
    memberStatus.textContent = error.message;
  }
});
