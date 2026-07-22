const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const MEMBER_TOKEN_KEY = "legendary-auto-spa.memberToken";
const MEMBER_PROFILE_KEY = "legendary-auto-spa.memberProfile";

const createMemberForm = document.querySelector("#createMemberForm");
const createMemberStatus = document.querySelector("#createMemberStatus");

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
  if (!data?.token || !data?.member) return;
  localStorage.setItem(MEMBER_TOKEN_KEY, data.token);
  localStorage.setItem(MEMBER_SESSION_KEY, data.member.phone || "");
  localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(data.member));
}

createMemberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createMemberForm);
  const phone = normalizePhone(formData.get("phone"));
  const password = String(formData.get("password") || "");
  if (phone.length < 10 || password.length < 6) {
    createMemberStatus.textContent = "Enter a valid phone number and a password with at least 6 characters.";
    return;
  }

  const vehicle = {
    year: String(formData.get("year") || "").trim(),
    make: String(formData.get("make") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    size: String(formData.get("size") || "").trim(),
    tier: ""
  };
  const address = String(formData.get("address") || "").trim();

  createMemberStatus.textContent = "Creating your member account...";
  try {
    const data = await memberApi("member-create-account", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") || "").trim(),
        phone,
        password,
        vehicles: vehicle.make || vehicle.model ? [vehicle] : [],
        locations: address ? [{ label: "Primary", address }] : []
      })
    });
    saveMemberSession(data);
    createMemberStatus.textContent = "Account created. Opening your member portal...";
    window.setTimeout(() => {
      window.location.href = "member-portal.html";
    }, 700);
  } catch (error) {
    createMemberStatus.textContent = error.message;
  }
});
