const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const MEMBER_TOKEN_KEY = "legendary-auto-spa.memberToken";
const MEMBER_PROFILE_KEY = "legendary-auto-spa.memberProfile";

const createMemberForm = document.querySelector("#createMemberForm");
const createMemberStatus = document.querySelector("#createMemberStatus");
const enableMemberNotificationsButton = document.querySelector("#enableMemberNotificationsButton");
const memberNotificationStatus = document.querySelector("#memberNotificationStatus");
const notificationCards = [...document.querySelectorAll("input[name='notificationPreference']")].map((input) => input.closest(".payment-card"));
const notificationPreferenceInputs = [...document.querySelectorAll("input[name='notificationPreference']")];

let publicConfigPromise = null;
let serviceWorkerReadyPromise = null;
let memberPushSubscription = null;

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function getNotificationPreference() {
  return document.querySelector("input[name='notificationPreference']:checked")?.value || "sms";
}

function notificationRequiresPush() {
  return getNotificationPreference() === "push";
}

function notificationWantsPush() {
  const preference = getNotificationPreference();
  return preference === "push" || preference === "both";
}

function notificationWantsSms() {
  const preference = getNotificationPreference();
  return preference === "sms" || preference === "both";
}

function pushSupported() {
  return Boolean(
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
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

function updateNotificationSelection() {
  const preference = getNotificationPreference();
  notificationCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("selected", input.checked);
  });

  if (!pushSupported()) {
    if (notificationRequiresPush()) {
      memberNotificationStatus.textContent = "Push notifications are not supported in this browser. Choose SMS or use a supported device.";
    } else {
      memberNotificationStatus.textContent = "SMS-only updates selected.";
    }
    return;
  }

  if (notificationRequiresPush() && !memberPushSubscription) {
    memberNotificationStatus.textContent = "Push-only accounts need notifications enabled on this device before the account can be created.";
  } else if (notificationWantsPush() && memberPushSubscription) {
    memberNotificationStatus.textContent = "Push notifications are ready on this device.";
  } else if (notificationWantsPush()) {
    memberNotificationStatus.textContent = "Push notifications are available. Enable them on this device if you want app alerts.";
  } else {
    memberNotificationStatus.textContent = "SMS-only updates selected.";
  }
}

async function loadPublicConfig() {
  if (!publicConfigPromise) {
    publicConfigPromise = fetch("/.netlify/functions/public-config")
      .then((result) => (result.ok ? result.json() : {}))
      .catch(() => ({}));
  }
  return publicConfigPromise;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function serviceWorkerReady() {
  if (!serviceWorkerReadyPromise) {
    serviceWorkerReadyPromise = navigator.serviceWorker.register("service-worker.js")
      .then(() => navigator.serviceWorker.ready);
  }
  return serviceWorkerReadyPromise;
}

async function hydrateExistingPushSubscription() {
  if (!pushSupported()) return null;
  try {
    const registration = await serviceWorkerReady();
    const subscription = await registration.pushManager.getSubscription();
    memberPushSubscription = subscription ? subscription.toJSON() : null;
    updateNotificationSelection();
    return memberPushSubscription;
  } catch {
    return null;
  }
}

async function ensureMemberPushSubscription({ interactive = false } = {}) {
  if (!pushSupported()) {
    memberNotificationStatus.textContent = "Push notifications are not supported in this browser.";
    return null;
  }

  const config = await loadPublicConfig();
  if (!config.push_enabled || !config.push_public_key) {
    memberNotificationStatus.textContent = "Push notifications are not configured yet on the live backend.";
    return null;
  }

  const registration = await serviceWorkerReady();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    memberPushSubscription = existing.toJSON();
    updateNotificationSelection();
    return memberPushSubscription;
  }

  if (Notification.permission === "denied") {
    memberNotificationStatus.textContent = "Notifications are blocked in this browser. Re-enable them in browser settings to use push updates.";
    return null;
  }

  if (interactive && Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      memberNotificationStatus.textContent = "Push notifications were not enabled on this device.";
      updateNotificationSelection();
      return null;
    }
  }

  if (Notification.permission !== "granted") {
    updateNotificationSelection();
    return null;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.push_public_key)
  });
  memberPushSubscription = subscription.toJSON();
  memberNotificationStatus.textContent = "Push notifications are enabled on this device.";
  updateNotificationSelection();
  return memberPushSubscription;
}

async function ensureNotificationPreferenceReady({ interactive = false } = {}) {
  if (!notificationWantsPush()) {
    updateNotificationSelection();
    return true;
  }

  const subscription = await ensureMemberPushSubscription({ interactive });
  if (!notificationRequiresPush()) return true;

  if (!subscription) {
    memberNotificationStatus.textContent = "Push-only accounts need notifications enabled before they can be created.";
    return false;
  }
  return true;
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
  if (!(await ensureNotificationPreferenceReady({ interactive: notificationWantsPush() }))) {
    createMemberStatus.textContent = "Enable push notifications on this device or switch to SMS before creating the account.";
    return;
  }
  const notificationPreference = getNotificationPreference();

  createMemberStatus.textContent = "Creating your member account...";
  try {
    const data = await memberApi("member-create-account", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") || "").trim(),
        phone,
        password,
        notificationPreference,
        smsOptIn: notificationWantsSms(),
        pushEnabled: Boolean(memberPushSubscription) && notificationWantsPush(),
        pushSubscription: memberPushSubscription,
        pushUserAgent: navigator.userAgent || "",
        pushDeviceLabel: navigator.platform || "Customer device",
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

notificationPreferenceInputs.forEach((input) => {
  input.addEventListener("change", async () => {
    updateNotificationSelection();
    if (notificationWantsPush()) {
      await ensureNotificationPreferenceReady({ interactive: input.value === "push" });
    }
  });
});

enableMemberNotificationsButton?.addEventListener("click", async () => {
  await ensureMemberPushSubscription({ interactive: true });
});

window.addEventListener("load", () => {
  if (pushSupported()) {
    serviceWorkerReady().then(hydrateExistingPushSubscription).catch(() => {});
  }
  updateNotificationSelection();
});
