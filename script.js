/* ==========================================================================
   NYC Stay Classifier — Application logic
   ========================================================================== */

const API_BASE_URL = "https://predicting-airbnb-room-types-using.onrender.com";

const CLASS_ORDER = ["Entire home/apt", "Private room", "Shared room"];

const FIELD_CONFIG = [
  { name: "neighbourhood_group", type: "select", required: true },
  { name: "neighbourhood", type: "text", required: true },
  { name: "latitude", type: "number", required: true, min: -90, max: 90 },
  { name: "longitude", type: "number", required: true, min: -180, max: 180 },
  { name: "price", type: "number", required: true, gt: 0 },
  { name: "minimum_nights", type: "number", required: true, min: 1, max: 365 },
  { name: "number_of_reviews", type: "number", required: true, min: 0 },
  { name: "reviews_per_month", type: "number", required: true, min: 0 },
  { name: "calculated_host_listings_count", type: "number", required: true, min: 0 },
  { name: "availability_365", type: "number", required: true, min: 0, max: 365 },
];

const SAMPLE_DATA = {
  neighbourhood_group: "Manhattan",
  neighbourhood: "Midtown",
  latitude: 40.75362,
  longitude: -73.98377,
  price: 225,
  minimum_nights: 1,
  number_of_reviews: 45,
  reviews_per_month: 0.38,
  calculated_host_listings_count: 2,
  availability_365: 355,
};

/* ---------------------------------------------------------------------- */
/* DOM refs                                                                */
/* ---------------------------------------------------------------------- */

const form = document.getElementById("predict-form");
const predictBtn = document.getElementById("predictBtn");
const sampleDataBtn = document.getElementById("sampleDataBtn");
const clearFormBtn = document.getElementById("clearFormBtn");

const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const predictionState = document.getElementById("predictionState");

const predictedClassEl = document.getElementById("predictedClass");
const confidenceValueEl = document.getElementById("confidenceValue");
const probListEl = document.getElementById("probList");
const predictionTimestampEl = document.getElementById("predictionTimestamp");
const inputChipsEl = document.getElementById("inputChips");

const availabilityInput = document.getElementById("availability_365");
const availabilityValueEl = document.getElementById("availabilityValue");
const availabilityHintEl = document.getElementById("availabilityHint");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const footerStatusDot = document.getElementById("footerStatusDot");
const footerStatusText = document.getElementById("footerStatusText");

const themeToggle = document.getElementById("themeToggle");
const navBurger = document.getElementById("navBurger");
const navLinksMobile = document.getElementById("navLinksMobile");

const toastContainer = document.getElementById("toastContainer");

let leafletMap = null;
let leafletMarker = null;
let leafletTileLayer = null;

/* ---------------------------------------------------------------------- */
/* Theme                                                                   */
/* ---------------------------------------------------------------------- */

function initTheme() {
  const saved = localStorage.getItem("nyc-classifier-theme");
  const theme = saved || "dark";
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    themeToggle.setAttribute("aria-pressed", "true");
    themeToggle.setAttribute("aria-label", "Switch to dark theme");
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.setAttribute("aria-pressed", "false");
    themeToggle.setAttribute("aria-label", "Switch to light theme");
  }
  localStorage.setItem("nyc-classifier-theme", theme);

  if (leafletMap && leafletTileLayer) {
    leafletMap.removeLayer(leafletTileLayer);
    leafletTileLayer = buildTileLayer().addTo(leafletMap);
  }
}

// Builds the basemap layer for the current theme using Esri's ArcGIS Canvas
// basemaps — free, unlimited, no API key or signup required.
// Docs: https://www.arcgis.com/home/item.html?id=8fc86c40f9c74c62b5ea70a44d20e2d6
function buildTileLayer() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const variant = isLight ? "Light_Gray" : "Dark_Gray";

  const base = L.tileLayer(
    `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${variant}_Base/MapServer/tile/{z}/{y}/{x}`,
    {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, FAO, NOAA, USGS',
      maxZoom: 16,
    }
  );

  const labels = L.tileLayer(
    `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${variant}_Reference/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 16 }
  );

  return L.layerGroup([base, labels]);
}

themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  applyTheme(isLight ? "dark" : "light");
});

/* ---------------------------------------------------------------------- */
/* Mobile nav                                                              */
/* ---------------------------------------------------------------------- */

navBurger.addEventListener("click", () => {
  const isOpen = navLinksMobile.classList.toggle("open");
  navBurger.setAttribute("aria-expanded", String(isOpen));
});

navLinksMobile.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinksMobile.classList.remove("open");
    navBurger.setAttribute("aria-expanded", "false");
  });
});

/* ---------------------------------------------------------------------- */
/* API status                                                              */
/* ---------------------------------------------------------------------- */

async function checkAPIStatus() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE_URL}/`, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      setStatus(true);
    } else {
      setStatus(false);
    }
  } catch (err) {
    console.error("API status check failed:", err);
    setStatus(false);
  }
}

function setStatus(online) {
  statusDot.classList.remove("online", "offline");
  footerStatusDot.classList.remove("online", "offline");

  if (online) {
    statusDot.classList.add("online");
    statusText.textContent = "API Online";
    footerStatusDot.classList.add("online");
    footerStatusText.textContent = "Online";
  } else {
    statusDot.classList.add("offline");
    statusText.textContent = "API Offline";
    footerStatusDot.classList.add("offline");
    footerStatusText.textContent = "Offline";
  }
}

/* ---------------------------------------------------------------------- */
/* Availability slider                                                     */
/* ---------------------------------------------------------------------- */

function updateAvailabilityUI() {
  const val = Number(availabilityInput.value);
  availabilityValueEl.textContent = `${val} days`;

  const pct = (val / 365) * 100;
  availabilityInput.style.setProperty("--slider-pct", `${pct}%`);

  let label;
  if (val < 90) label = "Low availability";
  else if (val < 270) label = "Moderate availability";
  else label = "High availability";
  availabilityHintEl.textContent = label;
}

availabilityInput.addEventListener("input", updateAvailabilityUI);

/* ---------------------------------------------------------------------- */
/* Form data collection & validation                                       */
/* ---------------------------------------------------------------------- */

function collectFormData() {
  const data = {};
  FIELD_CONFIG.forEach(({ name, type }) => {
    const el = document.getElementById(name);
    if (type === "number") {
      data[name] = el.value === "" ? null : Number(el.value);
    } else {
      data[name] = el.value.trim();
    }
  });
  return data;
}

function validateForm(data) {
  let isValid = true;
  const errors = {};

  FIELD_CONFIG.forEach((cfg) => {
    const value = data[cfg.name];
    let message = "";

    if (cfg.type === "text" || cfg.type === "select") {
      if (!value) message = "This field is required.";
    } else if (cfg.type === "number") {
      if (value === null || Number.isNaN(value)) {
        message = "This field is required.";
      } else if (cfg.min !== undefined && value < cfg.min) {
        message = `Minimum value is ${cfg.min}.`;
      } else if (cfg.max !== undefined && value > cfg.max) {
        message = `Maximum value is ${cfg.max}.`;
      } else if (cfg.gt !== undefined && !(value > cfg.gt)) {
        message = `Value must be greater than ${cfg.gt}.`;
      }
    }

    if (message) {
      isValid = false;
      errors[cfg.name] = message;
    }
  });

  renderFieldErrors(errors);
  return isValid;
}

function renderFieldErrors(errors) {
  FIELD_CONFIG.forEach(({ name }) => {
    const el = document.getElementById(name);
    const errorEl = document.getElementById(`err-${name}`);
    const fieldWrap = el.closest(".field");

    if (errors[name]) {
      fieldWrap.classList.add("invalid");
      errorEl.textContent = errors[name];
    } else {
      fieldWrap.classList.remove("invalid");
      errorEl.textContent = "";
    }
  });
}

function clearFieldError(name) {
  const el = document.getElementById(name);
  const errorEl = document.getElementById(`err-${name}`);
  const fieldWrap = el.closest(".field");
  fieldWrap.classList.remove("invalid");
  errorEl.textContent = "";
}

FIELD_CONFIG.forEach(({ name }) => {
  const el = document.getElementById(name);
  const evt = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(evt, () => clearFieldError(name));
});

/* ---------------------------------------------------------------------- */
/* Sample data / clear                                                     */
/* ---------------------------------------------------------------------- */

function loadSampleData() {
  Object.entries(SAMPLE_DATA).forEach(([name, value]) => {
    const el = document.getElementById(name);
    if (!el) return;
    el.value = value;
    clearFieldError(name);
  });
  updateAvailabilityUI();
  showToast("info", "Sample listing data loaded.");
}

function resetForm() {
  form.reset();
  FIELD_CONFIG.forEach(({ name }) => clearFieldError(name));
  availabilityInput.value = 180;
  updateAvailabilityUI();
  showResultState("empty");
  showToast("info", "Form cleared.");
}

sampleDataBtn.addEventListener("click", loadSampleData);
clearFormBtn.addEventListener("click", resetForm);

/* ---------------------------------------------------------------------- */
/* Result state switching                                                  */
/* ---------------------------------------------------------------------- */

function showResultState(state) {
  const states = {
    empty: emptyState,
    loading: loadingState,
    prediction: predictionState,
  };

  Object.entries(states).forEach(([key, el]) => {
    const isActive = key === state;
    el.hidden = !isActive;
    // Belt-and-suspenders: force it with inline style too, so this can
    // never be defeated by a CSS specificity conflict elsewhere.
    el.style.display = isActive ? "" : "none";
  });
}

function setLoadingState(isLoading) {
  predictBtn.disabled = isLoading;
  predictBtn.classList.toggle("is-loading", isLoading);
  predictBtn.querySelector(".btn-label").textContent = isLoading
    ? "Analyzing listing…"
    : "Predict room type";
  if (isLoading) showResultState("loading");
}

/* ---------------------------------------------------------------------- */
/* Prediction request                                                      */
/* ---------------------------------------------------------------------- */

async function predictRoomType(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 422) {
      const body = await response.json().catch(() => null);
      console.error("Validation error:", body);
      throw new AppError("Please check the highlighted fields.", "validation", body);
    }

    if (response.status >= 500) {
      const text = await response.text().catch(() => "");
      console.error("Server error:", text);
      throw new AppError("Prediction service returned an error.", "server");
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("Unexpected response:", response.status, text);
      throw new AppError("Prediction service returned an error.", "unknown");
    }

    const data = await response.json();

    if (!data || typeof data.Predicted_room_type === "undefined" || !Array.isArray(data.Probability)) {
      console.error("Malformed API response:", data);
      throw new AppError("Prediction service returned an unexpected response.", "malformed");
    }

    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof AppError) throw err;
    if (err.name === "AbortError") {
      throw new AppError("The prediction request timed out.", "network");
    }
    console.error("Network error:", err);
    throw new AppError("Unable to reach the prediction server.", "network");
  }
}

class AppError extends Error {
  constructor(message, kind, details) {
    super(message);
    this.kind = kind;
    this.details = details;
  }
}

/* ---------------------------------------------------------------------- */
/* Rendering the prediction                                                */
/* ---------------------------------------------------------------------- */

function renderPrediction(data, submittedData) {
  const predictedClass = data.Predicted_room_type;
  const probabilities = data.Probability;

  predictedClassEl.textContent = predictedClass.toUpperCase();

  const maxIndex = probabilities.indexOf(Math.max(...probabilities));
  const confidencePct = Math.round(probabilities[maxIndex] * 100);
  confidenceValueEl.textContent = `${confidencePct}%`;

  renderProbabilities(probabilities, predictedClass);
  renderInputChips(submittedData);

  const now = new Date();
  predictionTimestampEl.textContent = `Prediction generated ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  // Reveal the panel BEFORE touching the map — Leaflet needs a visible,
  // correctly-sized container to lay out tiles properly on first init.
  showResultState("prediction");

  // Wait one frame so the browser finishes layout after un-hiding, then
  // initialize/update the map against the now-correct container size.
  requestAnimationFrame(() => {
    updateMap(submittedData.latitude, submittedData.longitude);
  });
}

function renderProbabilities(probabilities, predictedClass) {
  probListEl.innerHTML = "";

  CLASS_ORDER.forEach((className, i) => {
    const value = probabilities[i] ?? 0;
    const pct = Math.round(value * 100);
    const isWinner = className === predictedClass;

    const row = document.createElement("div");
    row.className = `prob-row${isWinner ? " is-winner" : ""}`;
    row.setAttribute("role", "listitem");
    row.innerHTML = `
      <div class="prob-row-top">
        <span class="prob-row-name">${className}</span>
        <span class="prob-row-value">${pct}%</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill" style="width:0%" data-target="${pct}"></div>
      </div>
    `;
    probListEl.appendChild(row);
  });

  requestAnimationFrame(() => {
    probListEl.querySelectorAll(".prob-fill").forEach((fillEl) => {
      const target = fillEl.getAttribute("data-target");
      requestAnimationFrame(() => {
        fillEl.style.width = `${target}%`;
      });
    });
  });
}

function renderInputChips(data) {
  const chips = [
    data.neighbourhood_group,
    data.neighbourhood,
    `$${data.price}/night`,
    `${data.minimum_nights} min night${data.minimum_nights === 1 ? "" : "s"}`,
    `${data.number_of_reviews} reviews`,
    `${data.reviews_per_month} reviews/mo`,
    `${data.calculated_host_listings_count} host listings`,
    `${data.availability_365} available days`,
  ];

  inputChipsEl.innerHTML = "";
  chips.forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = label;
    inputChipsEl.appendChild(chip);
  });
}

/* ---------------------------------------------------------------------- */
/* Map                                                                      */
/* ---------------------------------------------------------------------- */

function updateMap(lat, lng) {
  const mapEl = document.getElementById("leafletMap");
  const fallbackEl = document.getElementById("coordFallback");
  const fallbackTextEl = document.getElementById("coordFallbackText");

  try {
    if (typeof L === "undefined") throw new Error("Leaflet not available");

    if (!leafletMap) {
      // Leaflet's default marker icon path detection can fail when loaded
      // via a plain <script> CDN tag, leaving a broken/hollow icon. Point
      // it at the CDN's image files explicitly.
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      leafletMap = L.map(mapEl, {
        zoomControl: false,
        attributionControl: true,
      }).setView([lat, lng], 12);

      leafletTileLayer = buildTileLayer().addTo(leafletMap);
      leafletMarker = L.marker([lat, lng]).addTo(leafletMap);

      // Belt-and-suspenders: force a re-measure in case layout wasn't
      // fully settled the moment the map was created.
      setTimeout(() => leafletMap.invalidateSize(), 50);
    } else {
      leafletMap.setView([lat, lng], 12);
      leafletMarker.setLatLng([lat, lng]);
      leafletMap.invalidateSize();
    }

    mapEl.hidden = false;
    fallbackEl.hidden = true;
  } catch (err) {
    console.error("Map rendering failed, showing coordinate fallback:", err);
    mapEl.hidden = true;
    fallbackEl.hidden = false;
    fallbackTextEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/* ---------------------------------------------------------------------- */
/* Toasts                                                                   */
/* ---------------------------------------------------------------------- */

const TOAST_ICONS = {
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
};

function showToast(type, message) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Dismiss notification">&times;</button>
  `;
  toastContainer.appendChild(toast);

  const remove = () => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector(".toast-close").addEventListener("click", remove);
  setTimeout(remove, 5000);
}

/* ---------------------------------------------------------------------- */
/* Form submit                                                             */
/* ---------------------------------------------------------------------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = collectFormData();

  if (!validateForm(data)) {
    showToast("error", "Please check the highlighted fields.");
    return;
  }

  setLoadingState(true);

  try {
    const result = await predictRoomType(data);
    renderPrediction(result, data);
    showToast("success", "Prediction complete.");
  } catch (err) {
    console.error(err);
    showResultState("empty");
    if (err instanceof AppError) {
      showToast("error", err.message);
    } else {
      showToast("error", "Something went wrong. Please try again.");
    }
  } finally {
    setLoadingState(false);
  }
});

/* ---------------------------------------------------------------------- */
/* Init                                                                     */
/* ---------------------------------------------------------------------- */

function init() {
  initTheme();
  updateAvailabilityUI();
  showResultState("empty");
  checkAPIStatus();
  setInterval(checkAPIStatus, 20000);
}

init();
