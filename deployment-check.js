const deployOrigin = document.querySelector("#deployOrigin");
const deploymentChecks = document.querySelector("#deploymentChecks");
const deploymentStatus = document.querySelector("#deploymentStatus");

const checks = [
  { label: "Build info", path: "/build-info.json", type: "static" },
  { label: "Home page", path: "/index.html", type: "static" },
  { label: "Customer app JavaScript", path: "/app.js", type: "static" },
  { label: "Setup page", path: "/setup-admin.html", type: "static" },
  { label: "Setup page JavaScript", path: "/setup-admin.js", type: "static" },
  { label: "Admin dashboard", path: "/admin.html", type: "static" },
  { label: "Admin dashboard JavaScript", path: "/admin.js", type: "static" },
  { label: "Backend deploy marker", path: "/.netlify/functions/deploy-marker", type: "marker" },
  { label: "Public config function", path: "/.netlify/functions/public-config", type: "function" },
  { label: "Customer booking function", path: "/.netlify/functions/create-booking", type: "function" },
  { label: "Admin setup function", path: "/.netlify/functions/setup-admin-user", type: "function" },
  { label: "Admin login function", path: "/.netlify/functions/admin-login", type: "function" },
  { label: "Admin bookings function", path: "/.netlify/functions/admin-bookings", type: "function" },
  { label: "Test notification function", path: "/.netlify/functions/send-test-notification", type: "function" },
  { label: "Backend health function", path: "/.netlify/functions/health", type: "function" },
];

function cacheBust(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}check=${Date.now()}`;
}

async function runCheck(check) {
  try {
    const result = await fetch(cacheBust(check.path), { cache: "no-store" });
    const contentType = result.headers.get("content-type") || "";
    const text = await result.clone().text().catch(() => "");
    const isNetlify404 = result.status === 404 || text.includes("Page not found");

    if (check.type === "static") {
      return {
        ...check,
        ok: result.status === 200 && !isNetlify404,
        detail: `HTTP ${result.status}`,
      };
    }

    if (check.type === "marker") {
      const data = await result.clone().json().catch(() => ({}));
      return {
        ...check,
        ok: result.status === 200 && data.build_label === "live-backend-admin-setup",
        detail: `HTTP ${result.status}${data.build_label ? `, ${data.build_label}` : ""}`,
      };
    }

    const functionLooksPresent =
      !isNetlify404 &&
      (contentType.includes("application/json") || [200, 400, 401, 405, 503].includes(result.status));

    return {
      ...check,
      ok: functionLooksPresent,
      detail: `HTTP ${result.status}${contentType ? `, ${contentType.split(";")[0]}` : ""}`,
    };
  } catch (error) {
    return {
      ...check,
      ok: false,
      detail: error.message || "Fetch failed",
    };
  }
}

function renderCheck(check) {
  const state = check.ok ? "ok" : "warn";
  const title = check.ok ? "Found" : "Missing or blocked";
  return `
    <article class="health-card ${state}">
      <h3>${check.label}</h3>
      <p>${title}</p>
      <small>${check.path} · ${check.detail}</small>
    </article>
  `;
}

async function runDeploymentChecks() {
  deployOrigin.textContent = window.location.origin;
  deploymentChecks.innerHTML = `<p class="empty-state">Running checks...</p>`;
  deploymentStatus.textContent = "";

  const results = await Promise.all(checks.map(runCheck));
  const failed = results.filter((check) => !check.ok);

  deploymentChecks.innerHTML = `<div class="health-grid">${results.map(renderCheck).join("")}</div>`;
  deploymentStatus.textContent = failed.length
    ? `${failed.length} item${failed.length === 1 ? "" : "s"} need attention. If a JavaScript file or function is missing here, Netlify is not deploying the full project folder.`
    : "Deployment looks ready. You can go back to Admin setup and create your login.";
}

runDeploymentChecks();
