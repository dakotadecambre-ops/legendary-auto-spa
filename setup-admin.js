const setupAdminForm = document.querySelector("#setupAdminForm");
const setupKey = document.querySelector("#setupKey");
const setupEmail = document.querySelector("#setupEmail");
const setupPassword = document.querySelector("#setupPassword");
const setupRole = document.querySelector("#setupRole");
const setupStatus = document.querySelector("#setupStatus");
const setupSubmitButton = document.querySelector("#setupSubmitButton");
const setupPreflight = document.querySelector("#setupPreflight");

function renderPreflight(items) {
  setupPreflight.innerHTML = items.map((item) => `
    <article class="health-card ${item.ok ? "ok" : "warn"}">
      <h3>${item.label}</h3>
      <p>${item.message}</p>
      <small>${item.detail}</small>
    </article>
  `).join("");
}

async function checkSetupReadiness() {
  const checks = [];

  try {
    const buildResult = await fetch(`/build-info.json?fresh=${Date.now()}`, { cache: "no-store" });
    const buildInfo = await buildResult.json().catch(() => ({}));
    const ok = buildResult.ok && buildInfo.build_label === "live-backend-admin-setup";
    checks.push({
      ok,
      label: "Current build",
      message: ok ? "This page is from the current backend-ready build." : "This domain is not serving the current backend-ready build.",
      detail: ok ? buildInfo.updated_at || "Build marker found" : "Open /build-info.json?fresh=1. If it is 404, Netlify is deploying old files."
    });
  } catch (error) {
    checks.push({
      ok: false,
      label: "Current build",
      message: "Could not check the build marker.",
      detail: error.message || "build-info.json could not be loaded"
    });
  }

  try {
    const setupResult = await fetch("/.netlify/functions/setup-admin-user", { cache: "no-store" });
    const setupText = await setupResult.clone().text().catch(() => "");
    const isMissing = setupResult.status === 404 || /page not found/i.test(setupText);
    const ok = !isMissing && [400, 401, 405, 503].includes(setupResult.status);
    checks.push({
      ok,
      label: "Setup function",
      message: ok ? "The setup backend is deployed." : "The setup backend is missing from this Netlify deploy.",
      detail: ok ? `HTTP ${setupResult.status}` : "Check GitHub repo root and netlify/functions before trying again."
    });
  } catch (error) {
    checks.push({
      ok: false,
      label: "Setup function",
      message: "Could not reach the setup backend.",
      detail: error.message || "Function request failed"
    });
  }

  renderPreflight(checks);
}

setupAdminForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    setup_key: setupKey.value.trim(),
    email: setupEmail.value.trim(),
    password: setupPassword.value,
    role: setupRole?.value || "admin"
  };

  if (!payload.setup_key || !payload.email || !payload.password) {
    setupStatus.textContent = "Enter the setup key, admin email, and password.";
    return;
  }

  if (payload.password.length < 10) {
    setupStatus.textContent = "Admin password must be at least 10 characters.";
    return;
  }

  setupStatus.textContent = "Creating approved admin login...";
  setupSubmitButton.disabled = true;

  try {
    const result = await fetch("/.netlify/functions/setup-admin-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error ? `${data.error} (${result.status})` : `Could not create initial admin (${result.status})`);

    setupPassword.value = "";
    setupStatus.innerHTML = 'Initial admin login created. <a href="admin.html">Go to admin login</a>.';
  } catch (error) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message || "")) {
      setupStatus.textContent = "Could not reach the setup function. Confirm this site was deployed from GitHub/Netlify build with netlify/functions, then open /.netlify/functions/setup-admin-user on the same domain.";
      return;
    }
    setupStatus.textContent = error.message;
  } finally {
    setupSubmitButton.disabled = false;
  }
});

checkSetupReadiness();
