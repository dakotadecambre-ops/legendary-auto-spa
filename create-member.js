const MEMBER_ACCOUNTS_KEY = "legendary-auto-spa.memberAccounts";

const createMemberForm = document.querySelector("#createMemberForm");
const createMemberStatus = document.querySelector("#createMemberStatus");

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(MEMBER_ACCOUNTS_KEY, JSON.stringify(accounts));
}

createMemberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(createMemberForm);
  const phone = normalizePhone(formData.get("phone"));
  const password = String(formData.get("password") || "");
  if (phone.length < 10 || password.length < 6) {
    createMemberStatus.textContent = "Enter a valid phone number and a password with at least 6 characters.";
    return;
  }

  const accounts = readAccounts();
  if (accounts[phone]) {
    createMemberStatus.textContent = "That phone already has an account. Go back and sign in.";
    return;
  }

  const vehicle = {
    year: String(formData.get("year") || "").trim(),
    make: String(formData.get("make") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    size: String(formData.get("size") || "").trim(),
    tier: "",
    savedAt: new Date().toISOString()
  };

  const address = String(formData.get("address") || "").trim();
  accounts[phone] = {
    name: String(formData.get("name") || "").trim(),
    phone,
    password,
    vehicles: vehicle.make || vehicle.model ? [vehicle] : [],
    locations: address ? [{ label: "Primary", address, savedAt: new Date().toISOString() }] : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  saveAccounts(accounts);
  createMemberStatus.textContent = "Account created. Sending you to member sign-in...";
  window.setTimeout(() => {
    window.location.href = "member.html";
  }, 800);
});
