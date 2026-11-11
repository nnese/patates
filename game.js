import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const canvas = document.getElementById("c");
const el = {
  money: document.getElementById("money"),
  peelPct: document.getElementById("peel-pct"),
  damage: document.getElementById("damage"),
  quality: document.getElementById("quality"),
  combo: document.getElementById("combo"),
  prompt: document.getElementById("prompt"),
  toast: document.getElementById("toast"),
  crosshair: document.getElementById("crosshair"),
  knifeCursor: document.getElementById("knife-cursor"),
  peelBarWrap: document.getElementById("peel-bar-wrap"),
  peelFill: document.getElementById("peel-fill"),
  peelType: document.getElementById("peel-type"),
  startScreen: document.getElementById("start-screen"),
  manual: document.getElementById("manual"),
  menu: document.getElementById("menu"),
  btnStart: document.getElementById("btn-start"),
  btnManual: document.getElementById("btn-manual"),
  btnMenu: document.getElementById("btn-menu"),
  manualClose: document.getElementById("manual-close"),
  menuClose: document.getElementById("menu-close"),
  btnResume: document.getElementById("btn-resume"),
  btnMenuStart: document.getElementById("btn-menu-start"),
  btnMenuSettings: document.getElementById("btn-menu-settings"),
  btnQuit: document.getElementById("btn-quit"),
  btnOpenManual: document.getElementById("btn-open-manual"),
  btnStartSettings: document.getElementById("btn-start-settings"),
  settingsPanel: document.getElementById("settings-panel"),
  menuSaveStatus: document.getElementById("menu-save-status"),
  startSaveInfo: document.getElementById("start-save-info"),
  sensSlider: document.getElementById("sens-slider"),
  sensValue: document.getElementById("sens-value"),
  shop: document.getElementById("shop"),
  shopList: document.getElementById("shop-list"),
  shopMoney: document.getElementById("shop-money"),
  shopClose: document.getElementById("shop-close"),
  shopTabs: document.getElementById("shop-tabs"),
  shopBalanceLabel: document.getElementById("shop-balance-label"),
  shopAdminBanner: document.getElementById("shop-admin-banner"),
  adminHud: document.getElementById("admin-hud"),
  btnStartAdmin: document.getElementById("btn-start-admin"),
  btnAdminToggle: document.getElementById("btn-admin-toggle"),
};

let shopTab = "tools"; // tools | features | auto
/** @type {"normal" | "admin"} */
let playMode = "normal";

function isAdmin() {
  return playMode === "admin";
}

const SETTINGS = {
  sensitivity: Number(localStorage.getItem("patates_sens") || "1") || 1,
};

const STATE = {
  money: 0,
  combo: 1,
  comboTimer: 0,
  held: [],
  tablePotato: null,
  knifeOut: false,
  knifeHeat: 0,
  toastTimer: 0,
  peelCursor: { u: 0.5, v: 0.5 },
  knifeAim: { x: 0, y: 0.05 },
  knifeAnim: 0,
  levels: {}, // upgradeId -> 0..3
  equipped: "starter",
  dogFood: 2, // starting packs
  lastFedAt: Date.now(),
};

const DOG_FOOD_PRICE = 0.85;
const DOG_HUNGER_MS = 30 * 60 * 1000; // 30 minutes

// twin peaks in open yard (left/back) — clear of water channel on +X
const PILE_CENTERS = [
  new THREE.Vector3(-4.35, 0, 11.1),
  new THREE.Vector3(-1.55, 0, 11.1),
];
const PILE_CENTER = new THREE.Vector3(-2.95, 0, 11.1);
const PILE_TARGET_COUNT = 840; // 2× denser twin mountains
let mountainLayout = [];
const pileGeoPool = {}; // typeId -> Geometry[]
const pileMatPool = {}; // typeId -> Material
// Workbench: peel pad is 5× area (√5 on each side). Surroundings spaced to match.
const PEEL_AREA_SCALE = Math.sqrt(5);
const LAYOUT = {
  peelW: 1.7 * PEEL_AREA_SCALE, // ~3.80
  peelD: 1.35 * PEEL_AREA_SCALE, // ~3.02
  peelX: 0.15,
  peelZ: 0.05,
  leftW: 2.15,
  leftD: 2.55,
  leftX: -3.25,
  leftZ: 0.05,
  crateW: 1.35,
  crateD: 1.55,
  crateX: 3.45,
  crateZ: 0.05,
  waterX: 5.35,
  shopX: -10.2,
  shopZ: 2.2,
  tableY: 0.88,
  topY: 1.02,
};
const SHOP_POS = new THREE.Vector3(LAYOUT.shopX, 1.0, LAYOUT.shopZ);
const BASE_PAY = 0.2;
const BASE_CARRY = 3;

function peelBounds() {
  const hw = LAYOUT.peelW * 0.5;
  const hd = LAYOUT.peelD * 0.5;
  return {
    minX: LAYOUT.peelX - hw,
    maxX: LAYOUT.peelX + hw,
    minZ: LAYOUT.peelZ - hd,
    maxZ: LAYOUT.peelZ + hd,
  };
}

function benchSpan() {
  const leftEdge = LAYOUT.leftX - LAYOUT.leftW * 0.5;
  const peelRight = LAYOUT.peelX + LAYOUT.peelW * 0.5;
  const w = peelRight - leftEdge + 0.2;
  const x = leftEdge + w * 0.5;
  const d = Math.max(LAYOUT.leftD, LAYOUT.peelD) + 0.2;
  return { w, d, x, z: LAYOUT.peelZ };
}

// starter knife: weak & slow (free, always available)
const STARTER_TOOL = {
  id: "starter",
  name: "Eski Mutfak Bıçağı",
  radius: 1,
  speed: 0.45,
  damage: 1.15,
};

// 3 knives + 1 peeler (best/most expensive). Each upgradeable to Lv3.
const TOOLS = [
  {
    id: "knife_work",
    name: "İş Bıçağı",
    blurb: "Başlangıç üstü günlük bıçak",
    levels: [
      { price: 1.4, radius: 1.4, speed: 0.75, damage: 0.95 },
      { price: 2.2, radius: 1.8, speed: 0.95, damage: 0.8 },
      { price: 3.4, radius: 2.2, speed: 1.15, damage: 0.65 },
    ],
  },
  {
    id: "knife_chef",
    name: "Şef Bıçağı",
    blurb: "Daha geniş ve akıcı soyma",
    levels: [
      { price: 3.8, radius: 2.4, speed: 1.25, damage: 0.7 },
      { price: 5.5, radius: 2.9, speed: 1.5, damage: 0.55 },
      { price: 8.0, radius: 3.4, speed: 1.8, damage: 0.4 },
    ],
  },
  {
    id: "knife_master",
    name: "Usta Bıçağı",
    blurb: "Profesyonel manuel bıçak",
    levels: [
      { price: 7.5, radius: 3.5, speed: 1.9, damage: 0.45 },
      { price: 11.0, radius: 4.0, speed: 2.2, damage: 0.32 },
      { price: 15.5, radius: 4.5, speed: 2.55, damage: 0.22 },
    ],
  },
  {
    id: "peeler",
    name: "Profesyonel Soyacak",
    blurb: "En iyi manuel alet — en pahalı",
    levels: [
      { price: 12.0, radius: 4.8, speed: 2.7, damage: 0.2 },
      { price: 18.0, radius: 5.4, speed: 3.2, damage: 0.12 },
      { price: 26.0, radius: 6.0, speed: 3.8, damage: 0.08 },
    ],
  },
];

// other features: each up to 3 levels
const FEATURES = [
  {
    id: "carry",
    name: "Taşıma Kapasitesi",
    blurb: "Aynı anda daha çok patates taşı",
    levels: [
      { price: 1.2, value: 4, label: "4 patates" },
      { price: 2.6, value: 5, label: "5 patates" },
      { price: 4.5, value: 6, label: "6 patates" },
    ],
  },
  {
    id: "speed",
    name: "Yürüme Hızı",
    blurb: "Daha hızlı yürü / koş",
    levels: [
      { price: 1.5, value: 1.25, label: "+25%" },
      { price: 3.0, value: 1.45, label: "+45%" },
      { price: 5.0, value: 1.7, label: "+70%" },
    ],
  },
  {
    id: "pay",
    name: "Satış Anlaşması",
    blurb: "Patates başı daha çok para",
    levels: [
      { price: 3.5, value: 0.28, label: "$0.28 / patates" },
      { price: 7.0, value: 0.36, label: "$0.36 / patates" },
      { price: 12.0, value: 0.5, label: "$0.50 / patates" },
    ],
  },
  {
    id: "grabBonus",
    name: "Patates Mıknatısı",
    blurb: "Dağdan ekstra alma",
    levels: [
      { price: 2.5, value: 1, label: "+1 ekstra" },
      { price: 4.5, value: 2, label: "+2 ekstra" },
      { price: 7.0, value: 3, label: "+3 ekstra" },
    ],
  },
  {
    id: "restock",
    name: "Tedarik Hattı",
    blurb: "Dağ daha hızlı dolsun",
    levels: [
      { price: 2.0, value: 0.7, label: "Hızlı" },
      { price: 3.8, value: 0.5, label: "Çok hızlı" },
      { price: 6.0, value: 0.32, label: "Anında neredeyse" },
    ],
  },
  {
    id: "comboMax",
    name: "Combo Ustası",
    blurb: "Daha yüksek combo tavanı",
    levels: [
      { price: 2.8, value: 6, label: "x6" },
      { price: 4.5, value: 7, label: "x7" },
      { price: 7.0, value: 8, label: "x8" },
    ],
  },
  {
    id: "tipTrain",
    name: "Patates Uç Soyma Eğitimi",
    blurb: "Sol raftan masaya alınca zor uçlar otomatik soyulur",
    cat: "features",
    levels: [
      { price: 2.4, value: 1, label: "İnce uç bandı" },
      { price: 4.2, value: 2, label: "Geniş uç bandı" },
      { price: 6.8, value: 3, label: "Uç + omuz" },
    ],
  },
  {
    id: "autoPeel",
    name: "Otomatik Soyma Makinesi",
    blurb: "Masadaki patatesi otomatik soyar",
    cat: "auto",
    levels: [
      { price: 6.0, value: 0.35, label: "Yavaş" },
      { price: 11.0, value: 0.8, label: "Orta" },
      { price: 18.0, value: 1.4, label: "Hızlı" },
    ],
  },
  {
    id: "puppy",
    name: "Yavru İşçi Köpek",
    blurb: "Zaten işte! Dağdan alır, soyar, kanala atar · yükseltince hızlanır",
    cat: "auto",
    levels: [
      { price: 5.0, value: 1.25, label: "Hızlı yavru" },
      { price: 12.0, value: 1.55, label: "Çok hızlı" },
      { price: 20.0, value: 2.0, label: "Süper çalışkan" },
    ],
  },
];

const FEATURE_CAT = {
  carry: "features",
  speed: "features",
  pay: "features",
  grabBonus: "features",
  restock: "features",
  comboMax: "features",
  tipTrain: "features",
  autoPeel: "auto",
  puppy: "auto",
};

function getLevel(id) {
  return Math.max(0, Math.min(3, STATE.levels[id] || 0));
}

function setLevel(id, lv) {
  STATE.levels[id] = Math.max(0, Math.min(3, lv));
}

function getFeatureValue(id, fallback) {
  const lv = getLevel(id);
  if (lv <= 0) return fallback;
  const feat = FEATURES.find((f) => f.id === id);
  return feat?.levels[lv - 1]?.value ?? fallback;
}

function getEquippedToolStats() {
  if (STATE.equipped === "starter" || !STATE.equipped) return STARTER_TOOL;
  const tool = TOOLS.find((t) => t.id === STATE.equipped);
  const lv = getLevel(STATE.equipped);
  if (!tool || lv <= 0) return STARTER_TOOL;
  const L = tool.levels[lv - 1];
  return {
    id: tool.id,
    name: tool.name,
    radius: L.radius,
    speed: L.speed,
    damage: L.damage,
    level: lv,
  };
}

function getMaxCarry() {
  return getFeatureValue("carry", BASE_CARRY);
}
function getSpeedMult() {
  return getFeatureValue("speed", 1);
}
function getPeelRadius() {
  return getEquippedToolStats().radius;
}
function getPeelSpeed() {
  return getEquippedToolStats().speed;
}
function getDamageMult() {
  return getEquippedToolStats().damage;
}
function getPayRate() {
  return getFeatureValue("pay", BASE_PAY);
}
function getGrabBonus() {
  return getFeatureValue("grabBonus", 0);
}
function getRestockFactor() {
  return getFeatureValue("restock", 1);
}
function getComboMax() {
  return getFeatureValue("comboMax", 5);
}
function getAutoPeelRate() {
  // admin: only peels automatically if you explicitly select Auto Soyucu in the shop
  if (isAdmin() && getLevel("autoPeel") <= 0) return 0;
  return getFeatureValue("autoPeel", 0);
}

const SAVE_KEY = "patates_save_v1";
let saveDirty = false;
let lastAutoSave = 0;
let gameStarted = false;

function ownedItemCount() {
  return Object.values(STATE.levels).filter((n) => Number(n) > 0).length;
}

function formatSaveTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "—";
  }
}

function updateSaveLabels(savedAt = Date.now()) {
  const money = formatMoney(STATE.money);
  const items = ownedItemCount();
  const when = formatSaveTime(savedAt);
  if (el.menuSaveStatus) {
    el.menuSaveStatus.textContent = isAdmin()
      ? `ADMIN TEST · sandbox (normal kayıt kilitli) · ${when}`
      : `Kayıt: ${money} · ${items} yükseltme · ${when}`;
  }
  if (el.startSaveInfo) {
    if (isAdmin()) {
      el.startSaveInfo.textContent = "Admin test modu — normal para/ilerleme etkilenmez";
    } else {
      el.startSaveInfo.textContent =
        STATE.money > 0 || items > 0
          ? `Kayıtlı ilerleme: ${money} · ${items} item`
          : "Yeni oyun — ilerleme otomatik kaydolur";
    }
  }
  syncAdminUi();
}

function syncAdminUi() {
  document.body.classList.toggle("admin-mode", isAdmin());
  if (el.adminHud) el.adminHud.classList.toggle("hidden", !isAdmin());
  if (el.btnAdminToggle) {
    el.btnAdminToggle.textContent = isAdmin() ? "Normal Moda Dön" : "Admin Test Modu";
  }
  if (el.shopAdminBanner) el.shopAdminBanner.classList.toggle("hidden", !isAdmin());
  if (el.shopBalanceLabel) el.shopBalanceLabel.textContent = isAdmin() ? "Test bakiyesi" : "Bakiye";
}

function applyAdminSandbox() {
  STATE.money = 9999.99;
  STATE.combo = 1;
  STATE.comboTimer = 0;
  STATE.levels = {};
  // tools unlocked for equip testing — auto peel / tip train / puppy OFF until selected
  for (const t of TOOLS) STATE.levels[t.id] = 3;
  for (const f of FEATURES) {
    const manualOnly = f.id === "autoPeel" || f.id === "puppy" || f.id === "tipTrain";
    STATE.levels[f.id] = manualOnly ? 0 : 3;
  }
  STATE.equipped = "starter";
  STATE.dogFood = 99;
  STATE.lastFedAt = Date.now() + DOG_HUNGER_MS * 100; // far future; hunger also gated by isAdmin
  if (typeof PUPPY !== "undefined" && PUPPY) {
    if (PUPPY.potato) {
      const p = puppyDropPotatoWorld();
      if (p) {
        p.position.set(LAYOUT.peelX, 0.2, LAYOUT.peelZ + 1.2);
        if (!interactables.includes(p)) interactables.push(p);
      }
    }
    PUPPY.state = "nap";
    PUPPY.timer = 1e9;
    PUPPY.barkTimer = 0;
    if (PUPPY.mesh) {
      PUPPY.mesh.position.copy(PUPPY.napPos);
      PUPPY.mesh.position.y = 0.08;
    }
  }
  refreshEquippedToolMesh();
  updateHud();
  saveDirty = false;
}

function enterAdminMode({ resume = false } = {}) {
  if (playMode === "normal") {
    // lock in normal progress before sandbox mutates STATE
    try {
      const payload = {
        money: STATE.money,
        levels: { ...(STATE.levels || {}) },
        equipped: STATE.equipped || "starter",
        sensitivity: SETTINGS.sensitivity,
        dogFood: STATE.dogFood | 0,
        lastFedAt: STATE.lastFedAt || Date.now(),
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      localStorage.setItem("patates_money", String(STATE.money));
      localStorage.setItem("patates_levels_v2", JSON.stringify(STATE.levels || {}));
      localStorage.setItem("patates_equipped", STATE.equipped || "starter");
    } catch {
      /* ignore */
    }
  }
  const already = playMode === "admin";
  playMode = "admin";
  applyAdminSandbox();
  syncAdminUi();
  updateSaveLabels(Date.now());
  if (!already) toast("Admin test · normal kayıt korunuyor");
  if (resume) resumeGame();
}

function enterNormalMode({ resume = false } = {}) {
  const wasAdmin = playMode === "admin";
  playMode = "normal";
  loadProgress();
  refreshEquippedToolMesh();
  if (typeof PUPPY !== "undefined" && PUPPY) {
    PUPPY.state = "toPile";
    PUPPY.barkTimer = 0;
  }
  syncAdminUi();
  updateHud();
  updateSaveLabels(Date.now());
  if (wasAdmin) toast("Normal moda dönüldü · kayıtlı ilerleme yüklendi");
  if (resume) resumeGame();
}

function saveProgress(silent = true) {
  // Admin sandbox must never write money / levels / dog state into the real save.
  if (isAdmin()) {
    try {
      localStorage.setItem("patates_sens", String(SETTINGS.sensitivity));
    } catch {
      /* ignore */
    }
    saveDirty = false;
    lastAutoSave = performance.now();
    updateSaveLabels(Date.now());
    if (!silent) toast("Admin modunda ilerleme kaydedilmez");
    return;
  }
  const payload = {
    money: STATE.money,
    levels: STATE.levels || {},
    equipped: STATE.equipped || "starter",
    sensitivity: SETTINGS.sensitivity,
    dogFood: STATE.dogFood | 0,
    lastFedAt: STATE.lastFedAt || Date.now(),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    // legacy keys (eski sürüm uyumu)
    localStorage.setItem("patates_money", String(STATE.money));
    localStorage.setItem("patates_levels_v2", JSON.stringify(STATE.levels || {}));
    localStorage.setItem("patates_equipped", STATE.equipped || "starter");
    localStorage.setItem("patates_sens", String(SETTINGS.sensitivity));
    saveDirty = false;
    lastAutoSave = performance.now();
    updateSaveLabels(payload.savedAt);
    if (!silent) toast("Oyun kaydedildi");
  } catch {
    if (!silent) toast("Kayıt başarısız", true);
  }
}

function loadProgress() {
  let loaded = false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        const m = Number(data.money);
        if (Number.isFinite(m) && m >= 0) STATE.money = m;
        if (data.levels && typeof data.levels === "object") STATE.levels = data.levels;
        if (typeof data.equipped === "string") STATE.equipped = data.equipped;
        if (Number.isFinite(Number(data.sensitivity))) {
          applySensitivity(Number(data.sensitivity));
        }
        if (Number.isFinite(Number(data.dogFood))) STATE.dogFood = Math.max(0, data.dogFood | 0);
        if (Number.isFinite(Number(data.lastFedAt))) STATE.lastFedAt = Number(data.lastFedAt);
        loaded = true;
        updateSaveLabels(data.savedAt || Date.now());
      }
    }
  } catch {
    /* fall through to legacy */
  }

  if (!loaded) {
    const m = Number(localStorage.getItem("patates_money"));
    if (Number.isFinite(m) && m >= 0) STATE.money = m;
    try {
      const obj = JSON.parse(localStorage.getItem("patates_levels_v2") || "{}");
      if (obj && typeof obj === "object") STATE.levels = obj;
    } catch {
      STATE.levels = {};
    }
    STATE.equipped = localStorage.getItem("patates_equipped") || "starter";
    updateSaveLabels(Date.now());
  }

  if (STATE.equipped !== "starter" && getLevel(STATE.equipped) <= 0) STATE.equipped = "starter";
  if (!Number.isFinite(STATE.lastFedAt)) STATE.lastFedAt = Date.now();
  if (!Number.isFinite(STATE.dogFood)) STATE.dogFood = 2;
  saveDirty = false;
}

function markProgressDirty() {
  saveDirty = true;
}

function heldCount() {
  return STATE.held.length;
}
function isHolding() {
  return STATE.held.length > 0;
}
function primaryHeld() {
  return STATE.held[0] || null;
}

let peelDragging = false;
let lastPeelTime = 0;

const KEYS = {};
const PLAYER = {
  speed: 4.2,
  sprint: 6.8,
  eye: 1.65,
  radius: 0.35,
  jumpSpeed: 6.8,
  gravity: 22,
};

const PLATFORMS = []; // {minx,maxx,minz,maxz,y}
let playerVy = 0;
let playerOnGround = true;

const GRID = 12; // 12x12 peel cells = 144
const CELL_COUNT = GRID * GRID;

const POTATO_TYPES = {
  russet: {
    id: "russet",
    name: "Russet",
    weight: 34,
    tough: 1,
    // uzun, hafif düzensiz tarla patatesi
    shape: { len: 1.55, rad: 0.78, taper: 0.18, knobs: 0.12, waist: 0.08 },
    skin: ["#8b5a2b", "#a67c52", "#6b4423", "#5a3a1f", "#7a4e28"],
    flesh: ["#f3e6c4", "#ebe0b0", "#f7efd2"],
    eyes: "#3a2818",
  },
  red: {
    id: "red",
    name: "Kırmızı",
    weight: 22,
    tough: 0.95,
    // yuvarlak, dolgun
    shape: { len: 1.05, rad: 1.0, taper: 0.05, knobs: 0.06, waist: 0.02 },
    skin: ["#a33a3a", "#c04e48", "#7a2e2e", "#d4685a", "#8f3030"],
    flesh: ["#f5edd8", "#efe4c8", "#fff6e4"],
    eyes: "#4a2020",
  },
  yukon: {
    id: "yukon",
    name: "Yukon Gold",
    weight: 20,
    tough: 0.9,
    // orta oval, altın kabuk
    shape: { len: 1.22, rad: 0.9, taper: 0.1, knobs: 0.07, waist: 0.05 },
    skin: ["#c9a54a", "#b8923e", "#d4b45c", "#a67c2e", "#e0c46a"],
    flesh: ["#f6e7a0", "#f0d978", "#ffe9a8"],
    eyes: "#6a5020",
  },
  sweet: {
    id: "sweet",
    name: "Tatlı Patates",
    weight: 16,
    tough: 1.25,
    // uzun iğsi / bakla biçimi
    shape: { len: 1.85, rad: 0.58, taper: 0.42, knobs: 0.05, waist: 0.12 },
    skin: ["#c45a28", "#a84620", "#8a3a18", "#d46832", "#b35022"],
    flesh: ["#f0a050", "#e8923a", "#f7b56a"],
    eyes: "#5a2810",
  },
  purple: {
    id: "purple",
    name: "Mor Patates",
    weight: 8,
    tough: 1.1,
    // tombul oval, yumru
    shape: { len: 1.12, rad: 0.98, taper: 0.08, knobs: 0.14, waist: 0.04 },
    skin: ["#5a3a6e", "#4a2e5c", "#6e4a82", "#3a2448", "#7a58a0"],
    flesh: ["#c9a8d8", "#b890cc", "#dfc4ec"],
    eyes: "#2a1830",
  },
};

const LEFT_SLOTS = [];
const CRATE_SLOTS = [];
const PILE_SPOTS = [];
let leftOccupied = [];
let crateOccupied = [];
let pileMeshes = [];
let interactables = [];
let floatingPotatoes = []; // water channel floaters
const worldColliders = [];
const placeSurfaces = []; // table / trays for look-to-place
let waterMesh = null;
let waterDropZone = null;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2(0, 0);
let promptAccum = 0;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a0b8);
scene.fog = new THREE.Fog(0x9bb0c4, 18, 55);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 80);
camera.position.set(0, PLAYER.eye, 4.5);
camera.rotation.order = "YXZ";
camera.rotation.y = Math.PI;

function isLargeDisplay() {
  return innerWidth * innerHeight > 1920 * 1080 || innerWidth >= 2560;
}

function idealPixelRatio() {
  // keep GPU load low on large screens so mouse look stays snappy
  const area = Math.max(1, innerWidth * innerHeight);
  const dprCap = area > 3_500_000 ? 1 : Math.min(devicePixelRatio || 1, isLargeDisplay() ? 1.15 : 1.5);
  const maxPixels = area > 3_500_000 ? 1_150_000 : area > 2_200_000 ? 1_450_000 : 2_000_000;
  const target = Math.min(dprCap, Math.sqrt(maxPixels / area));
  return Math.max(0.55, Math.min(dprCap, target));
}

function getLookSpeed() {
  // PointerLock multiplies movementX/Y by pointerSpeed * 0.002
  let s = SETTINGS.sensitivity;
  if (innerWidth >= 3440) s *= 1.2;
  else if (innerWidth >= 2560) s *= 1.12;
  else if (innerWidth >= 1920) s *= 1.05;
  return s;
}

const useAA = !isLargeDisplay();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: useAA,
  powerPreference: "high-performance",
  stencil: false,
  depth: true,
});
renderer.setPixelRatio(idealPixelRatio());
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = !isLargeDisplay();
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.info.autoReset = true;

const controls = new PointerLockControls(camera, document.body);
applySensitivity(SETTINGS.sensitivity);

let lookRenderPending = false;
let lastComboDrawn = "";
let sunLight = null;

function scheduleLookRender() {
  // extra frame on mouse move so look doesn't wait for a slow game tick
  if (lookRenderPending || document.hidden) return;
  lookRenderPending = true;
  requestAnimationFrame(() => {
    lookRenderPending = false;
    if (!controls.isLocked || document.hidden) return;
    renderer.render(scene, camera);
  });
}

function applyDisplayQuality() {
  const large = isLargeDisplay();
  renderer.setPixelRatio(idealPixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = !large;
  if (sunLight) sunLight.castShadow = !large;
  applySensitivity(SETTINGS.sensitivity);
}

function applySensitivity(v) {
  SETTINGS.sensitivity = Math.max(0.2, Math.min(3, v));
  controls.pointerSpeed = getLookSpeed();
  localStorage.setItem("patates_sens", String(SETTINGS.sensitivity));
  if (el.sensSlider) el.sensSlider.value = String(SETTINGS.sensitivity);
  if (el.sensValue) el.sensValue.textContent = SETTINGS.sensitivity.toFixed(2);
  saveDirty = true;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pickWeighted(types) {
  const list = Object.values(types);
  const total = list.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of list) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return list[0];
}

function toast(msg, bad = false) {
  el.toast.textContent = msg;
  el.toast.classList.toggle("bad", bad);
  el.toast.classList.add("show");
  STATE.toastTimer = 2.2;
}

function qualityLabel(damage, peel) {
  if (peel < 1) return "—";
  if (damage < 0.08) return "Mükemmel";
  if (damage < 0.2) return "İyi";
  if (damage < 0.35) return "Orta";
  return "Hasarlı";
}

function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

function payout() {
  return getPayRate();
}

/* ---------- helpers ---------- */
function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.05,
    ...opts,
  });
}

function addFloor(w, d, x, z, color, y = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.12, d),
    makeMat(color, { roughness: 0.95 })
  );
  mesh.position.set(x, y - 0.06, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addBox(w, h, d, x, y, z, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    makeMat(color, opts)
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeWorldLabel(text, x, y, z) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "rgba(18,14,10,0.55)";
  ctx.fillRect(20, 30, 472, 68);
  ctx.strokeStyle = "rgba(232,184,74,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 30, 472, 68);
  ctx.fillStyle = "#f3e6d4";
  ctx.font = "bold 36px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r},${g},${bl})`;
}

/* ---------- procedural potato textures ---------- */
function createSkinCanvas(type, size = 256) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const base = type.skin[0];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const scale = size / 256;
  const mottles = Math.max(80, Math.floor(900 * scale * scale));
  for (let i = 0; i < mottles; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = rand(0.6, 3.2) * scale;
    ctx.fillStyle = pick(type.skin);
    ctx.globalAlpha = rand(0.15, 0.55);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const streaks = Math.max(4, Math.floor(12 * scale));
  for (let i = 0; i < streaks; i++) {
    ctx.strokeStyle = `rgba(40,25,12,${rand(0.08, 0.22)})`;
    ctx.lineWidth = rand(1, 2.5) * scale;
    ctx.beginPath();
    ctx.moveTo(rand(0, size), rand(0, size));
    ctx.quadraticCurveTo(rand(0, size), rand(0, size), rand(0, size), rand(0, size));
    ctx.stroke();
  }

  const eyes = Math.max(3, Math.floor(8 * scale));
  const margin = Math.max(4, size * 0.06);
  for (let i = 0; i < eyes; i++) {
    const x = rand(margin, size - margin);
    const y = rand(margin, size - margin);
    ctx.fillStyle = type.eyes;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(x, y, rand(1.5, 4) * scale, rand(1, 2) * scale, rand(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return c;
}

function createFleshCanvas(type, size = 256) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = type.flesh[0];
  ctx.fillRect(0, 0, size, size);
  const n = Math.max(40, Math.floor(350 * (size / 256) * (size / 256)));
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = pick(type.flesh);
    ctx.globalAlpha = rand(0.12, 0.4);
    ctx.beginPath();
    ctx.arc(x, y, rand(1, 4) * (size / 256), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function makePeelGrid() {
  return new Array(CELL_COUNT).fill(false);
}

function peelProgress(potato) {
  const n = potato.userData.cells.filter(Boolean).length;
  return n / CELL_COUNT;
}

function cellIndexFromUV(u, v) {
  const x = Math.min(GRID - 1, Math.max(0, (u * GRID) | 0));
  const y = Math.min(GRID - 1, Math.max(0, ((1 - v) * GRID) | 0));
  return y * GRID + x;
}

function paintPeeledCell(potato, idx) {
  const { peelCtx, fleshCanvas, texSize, peelTex } = potato.userData;
  const size = texSize;
  const cell = size / GRID;
  const x = (idx % GRID) * cell;
  const y = ((idx / GRID) | 0) * cell;
  // simple chunk peel — whole cell becomes flesh at once
  peelCtx.drawImage(fleshCanvas, x, y, cell, cell, x, y, cell, cell);
  peelTex.needsUpdate = true;
}

function updatePotatoVisual(potato) {
  const p = peelProgress(potato);
  potato.userData.peel = p;
  const mat = potato.userData.mesh.material;
  // slight wetness as more flesh shows
  mat.roughness = 0.92 - p * 0.25;
  if (potato.userData.damage > 0.12) {
    mat.emissive = new THREE.Color(0x3a1008);
    mat.emissiveIntensity = potato.userData.damage * 0.15;
  }
}

/* ---------- potato factory ---------- */
function createPotatoGeometry(type, segW = 24, segH = 18) {
  const s = type.shape;
  const geo = new THREE.SphereGeometry(0.17, segW, segH);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seed = rand(0, 1000);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ny = THREE.MathUtils.clamp(v.y / 0.17, -1, 1);
    const tip = Math.pow(Math.abs(ny), 1.15);
    let radial = s.rad * (1 - s.taper * tip * tip);
    radial *= 1 - s.waist * Math.cos(ny * Math.PI);
    v.y *= s.len;
    v.x *= radial;
    v.z *= radial * (0.92 + s.knobs * 0.4);

    const n1 = Math.sin(v.x * 9 + seed) * Math.cos(v.z * 8 + seed * 0.3);
    const n2 = Math.sin(v.y * 7 + v.x * 5 + seed * 0.7);
    const bump = 1 + s.knobs * (0.55 * n1 + 0.35 * n2);
    v.x *= bump;
    v.z *= bump * (1 + s.knobs * 0.15 * Math.sin(v.y * 11 + seed));
    v.z *= 0.9;

    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function getPileGeometry(type) {
  if (!pileGeoPool[type.id]) {
    pileGeoPool[type.id] = [0, 1, 2].map(() => createPotatoGeometry(type, 12, 9));
  }
  const pool = pileGeoPool[type.id];
  return pool[(Math.random() * pool.length) | 0];
}

function getPileMaterial(type) {
  if (!pileMatPool[type.id]) {
    const c = createSkinCanvas(type, 96);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    pileMatPool[type.id] = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.94,
      metalness: 0.02,
    });
  }
  return pileMatPool[type.id];
}

function createPilePotato() {
  const type = pickWeighted(POTATO_TYPES);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(getPileGeometry(type), getPileMaterial(type));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.rotation.z = Math.PI / 2;
  group.add(mesh);
  group.userData = {
    kind: "potato",
    type,
    peel: 0,
    damage: 0,
    cells: null,
    mesh,
    peelCtx: null,
    fleshCanvas: null,
    skinCanvas: null,
    peelTex: null,
    texSize: 0,
    peeling: false,
    finished: false,
    pile: true,
    lite: true,
    playable: false,
    slotIndex: -1,
    side: null,
    spinVel: 0,
    floating: false,
  };
  return group;
}

function createPotato(peeledLook = false, forcedType = null) {
  const type = forcedType || pickWeighted(POTATO_TYPES);
  const group = new THREE.Group();

  const geo = createPotatoGeometry(type, 22, 16);
  const skinCanvas = createSkinCanvas(type, 256);
  const fleshCanvas = createFleshCanvas(type, 256);
  const peelCanvas = document.createElement("canvas");
  peelCanvas.width = skinCanvas.width;
  peelCanvas.height = skinCanvas.height;
  const peelCtx = peelCanvas.getContext("2d");
  peelCtx.drawImage(skinCanvas, 0, 0);

  const peelTex = new THREE.CanvasTexture(peelCanvas);
  peelTex.colorSpace = THREE.SRGBColorSpace;
  peelTex.anisotropy = 2;

  const mat = new THREE.MeshStandardMaterial({
    map: peelTex,
    roughness: 0.92,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.z = Math.PI / 2;
  group.add(mesh);

  const budCount = type.id === "sweet" ? 1 : type.id === "purple" ? 3 : 2;
  for (let i = 0; i < budCount; i++) {
    const bump = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 6, 5),
      new THREE.MeshStandardMaterial({ map: peelTex, roughness: 0.95 })
    );
    const along = rand(-0.14 * type.shape.len, 0.14 * type.shape.len);
    bump.position.set(along, rand(-0.05, 0.05), rand(-0.06, 0.06));
    bump.scale.set(rand(0.7, 1.2), rand(0.5, 0.9), rand(0.7, 1.2));
    bump.castShadow = false;
    group.add(bump);
  }

  const cells = makePeelGrid();
  if (peeledLook) {
    for (let i = 0; i < CELL_COUNT; i++) {
      cells[i] = true;
      paintPeeledCell(
        { userData: { peelCtx, fleshCanvas, texSize: peelCanvas.width, peelTex, type } },
        i
      );
    }
  }

  group.userData = {
    kind: "potato",
    type,
    peel: peeledLook ? 1 : 0,
    damage: 0,
    cells,
    mesh,
    peelCtx,
    fleshCanvas,
    skinCanvas,
    peelTex,
    texSize: peelCanvas.width,
    peeling: false,
    finished: peeledLook,
    pile: false,
    lite: false,
    playable: true,
    slotIndex: -1,
    side: null,
    spinVel: 0,
    floating: false,
  };

  updatePotatoVisual(group);
  return group;
}

function ensurePlayablePotato(potato) {
  if (!potato?.userData?.lite) return potato;
  const full = createPotato(false, potato.userData.type);
  full.position.copy(potato.position);
  full.rotation.copy(potato.rotation);
  full.scale.setScalar(1);
  full.userData.home = potato.userData.home?.clone?.() || null;
  if (potato.parent) potato.parent.add(full);
  else scene.add(full);
  potato.removeFromParent();
  return full;
}

/* ---------- world ---------- */
function buildWorld() {
  const hemi = new THREE.HemisphereLight(0xdde7f2, 0x4a3a28, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 1.15);
  sun.position.set(8, 14, 6);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(isLargeDisplay() ? 512 : 1024, isLargeDisplay() ? 512 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);
  sunLight = sun;

  const lamp = new THREE.PointLight(0xffc98a, 1.4, 12, 1.5);
  lamp.position.set(0, 3.2, 0.2);
  lamp.castShadow = true;
  scene.add(lamp);

  addFloor(48, 48, 0, 0, 0x5c7348, 0);
  addFloor(18, 14, 0.4, 0.2, 0x6e5438, 0.01);

  // wider shed so 5× peel pad + side stations fit
  const wallMat = 0x8a6a48;
  addBox(18.4, 3.2, 0.2, 0.2, 0, -5.2, wallMat);
  addBox(0.2, 3.2, 11.2, -9.0, 0, 0.2, wallMat);
  addBox(0.2, 3.2, 11.2, 9.4, 0, 0.2, wallMat);
  addBox(18.8, 0.15, 11.6, 0.2, 3.2, 0.2, 0x4a3a2c);
  addBox(1.4, 2.4, 0.15, -3.4, 0, 5.6, 0x3d2b1c);
  addBox(1.4, 2.4, 0.15, 4.2, 0, 5.6, 0x3d2b1c);
  addBox(10.8, 0.35, 0.15, 0.4, 2.4, 5.6, 0x3d2b1c);

  const bench = benchSpan();
  const tableTop = addBox(bench.w, 0.14, bench.d, bench.x, LAYOUT.tableY, bench.z, 0xa67c52, {
    roughness: 0.7,
  });
  tableTop.userData.kind = "table";
  placeSurfaces.push(tableTop);

  // legs under left tray + peel pad
  const legXs = [
    LAYOUT.leftX - LAYOUT.leftW * 0.38,
    LAYOUT.leftX + LAYOUT.leftW * 0.38,
    LAYOUT.peelX - LAYOUT.peelW * 0.35,
    LAYOUT.peelX + LAYOUT.peelW * 0.35,
  ];
  const legZs = [LAYOUT.peelZ - bench.d * 0.38, LAYOUT.peelZ + bench.d * 0.38];
  for (const lx of legXs) {
    for (const lz of legZs) addBox(0.14, LAYOUT.tableY, 0.14, lx, 0, lz, 0x5a3d24);
  }

  const leftZone = addBox(
    LAYOUT.leftW,
    0.02,
    LAYOUT.leftD,
    LAYOUT.leftX,
    LAYOUT.topY,
    LAYOUT.leftZ,
    0x7a5230
  );
  leftZone.userData.kind = "leftTray";
  placeSurfaces.push(leftZone);

  const midZone = addBox(
    LAYOUT.peelW,
    0.02,
    LAYOUT.peelD,
    LAYOUT.peelX,
    LAYOUT.topY,
    LAYOUT.peelZ,
    0x8b5a2b
  );
  midZone.userData.kind = "peelPad";
  placeSurfaces.push(midZone);

  // waiting slots — 3×2 grid on left tray
  for (let i = 0; i < 6; i++) {
    const slot = new THREE.Object3D();
    const col = i % 3;
    const row = (i / 3) | 0;
    slot.position.set(
      LAYOUT.leftX - 0.7 + col * 0.7,
      LAYOUT.topY + 0.1,
      LAYOUT.leftZ - 0.7 + row * 0.9
    );
    scene.add(slot);
    LEFT_SLOTS.push(slot);
    leftOccupied.push(null);
  }

  const padR = Math.min(LAYOUT.peelW, LAYOUT.peelD) * 0.22;
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(padR, padR, 0.025, 28),
    makeMat(0x6e4424, { roughness: 0.9 })
  );
  pad.position.set(LAYOUT.peelX, LAYOUT.topY + 0.03, LAYOUT.peelZ);
  pad.userData.kind = "peelPad";
  scene.add(pad);
  placeSurfaces.push(pad);
  addBox(0.45, 0.08, 0.28, LAYOUT.peelX + LAYOUT.peelW * 0.32, LAYOUT.topY + 0.02, LAYOUT.peelZ - LAYOUT.peelD * 0.38, 0x2c241c);

  buildPeeledCrate();
  buildWaterChannel();

  // path stones toward left-yard mountains (clear of dog bed)
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    addBox(
      0.55,
      0.04,
      0.4,
      -1.2 - t * 2.0 + (i % 2 === 0 ? -0.25 : 0.25),
      0.02,
      5.0 + i * 0.85,
      0x7a7a6a
    );
  }

  const pileLight = new THREE.PointLight(0xffe2a8, 1.75, 30, 1.15);
  pileLight.position.set(-2.9, 7.6, 10.8);
  scene.add(pileLight);
  const pileFillL = new THREE.PointLight(0xd4a574, 0.9, 15, 1.5);
  pileFillL.position.set(-4.4, 3.1, 11.6);
  scene.add(pileFillL);
  const pileFillR = new THREE.PointLight(0xd4a574, 0.9, 15, 1.5);
  pileFillR.position.set(-1.5, 3.1, 11.6);
  scene.add(pileFillR);

  buildShopBooth();

  scene.add(makeWorldLabel("PATATES DAĞLARI · AL", -2.95, 7.2, 11.1));
  scene.add(makeWorldLabel("DÜKKAN · E", LAYOUT.shopX, 2.7, LAYOUT.shopZ));
  scene.add(makeWorldLabel("SOL · BEKLEYEN", LAYOUT.leftX, 1.7, LAYOUT.leftZ));
  scene.add(makeWorldLabel("SOYMA · GENİŞ", LAYOUT.peelX, 1.7, LAYOUT.peelZ));
  scene.add(makeWorldLabel("SOYULMUŞ KASA · AL", LAYOUT.crateX, 1.85, LAYOUT.crateZ));
  scene.add(makeWorldLabel("SU KANALI · AT", LAYOUT.waterX, 1.45, 0.9));

  for (let i = -8; i <= 8; i++) addBox(0.08, 1.1, 0.08, i * 1.5, 0, 14, 0x4a3a28);
  addBox(24, 0.08, 0.08, 0, 1.0, 14, 0x4a3a28);

  buildPotatoMountain();

  // jumpable table + crate tops
  const b = peelBounds();
  const leftMinX = LAYOUT.leftX - LAYOUT.leftW * 0.5;
  const peelMaxX = b.maxX;
  const tableMinZ = Math.min(LAYOUT.leftZ - LAYOUT.leftD * 0.5, b.minZ) - 0.05;
  const tableMaxZ = Math.max(LAYOUT.leftZ + LAYOUT.leftD * 0.5, b.maxZ) + 0.05;
  PLATFORMS.push({
    minx: leftMinX,
    maxx: peelMaxX,
    minz: tableMinZ,
    maxz: tableMaxZ,
    y: LAYOUT.topY,
  });
  PLATFORMS.push({
    minx: LAYOUT.crateX - LAYOUT.crateW * 0.5,
    maxx: LAYOUT.crateX + LAYOUT.crateW * 0.5,
    minz: LAYOUT.crateZ - LAYOUT.crateD * 0.5,
    maxz: LAYOUT.crateZ + LAYOUT.crateD * 0.5,
    y: LAYOUT.topY,
  });

  worldColliders.push(
    { min: new THREE.Vector3(-9.2, 0, -5.4), max: new THREE.Vector3(9.6, 3, -5.0) },
    { min: new THREE.Vector3(-9.2, 0, -5.3), max: new THREE.Vector3(-8.8, 3, 5.8) },
    { min: new THREE.Vector3(9.2, 0, -5.3), max: new THREE.Vector3(9.6, 3, 5.8) },
    // table footprint
    {
      min: new THREE.Vector3(leftMinX, 0, tableMinZ),
      max: new THREE.Vector3(peelMaxX, LAYOUT.topY, tableMaxZ),
    },
    {
      min: new THREE.Vector3(LAYOUT.crateX - LAYOUT.crateW * 0.5, 0, LAYOUT.crateZ - LAYOUT.crateD * 0.5),
      max: new THREE.Vector3(LAYOUT.crateX + LAYOUT.crateW * 0.5, LAYOUT.topY, LAYOUT.crateZ + LAYOUT.crateD * 0.5),
    },
    // water channel
    {
      min: new THREE.Vector3(LAYOUT.waterX - 0.65, 0, 1.1),
      max: new THREE.Vector3(LAYOUT.waterX + 0.65, 0.75, 10.7),
    },
    { min: new THREE.Vector3(-5.5, 0, 9.5), max: new THREE.Vector3(-3.1, 4.4, 12.7) },
    { min: new THREE.Vector3(-2.7, 0, 9.5), max: new THREE.Vector3(-0.3, 4.4, 12.7) }
  );
}

function buildShopBooth() {
  const sx = LAYOUT.shopX;
  const sz = LAYOUT.shopZ;
  addBox(3.2, 2.6, 2.6, sx, 0, sz, 0x6b4a2e);
  addBox(3.4, 0.12, 2.8, sx, 2.6, sz, 0x3d2b1c);
  addBox(1.4, 2.0, 0.12, sx, 0, sz + 1.25, 0x2c1c12);
  addBox(2.4, 0.12, 0.7, sx, 1.0, sz - 1.0, 0xa67c52);
  addBox(2.4, 1.0, 0.12, sx, 0, sz - 0.7, 0x5a3a1e);
  addBox(3.5, 0.06, 1.0, sx, 2.35, sz - 1.3, 0xc45c3e);
  const lamp = new THREE.PointLight(0xffd090, 1.1, 8, 1.6);
  lamp.position.set(sx, 2.3, sz - 0.8);
  scene.add(lamp);

  worldColliders.push({
    min: new THREE.Vector3(sx - 1.7, 0, sz - 0.65),
    max: new THREE.Vector3(sx + 1.7, 2.6, sz + 1.35),
  });
}

function buildPeeledCrate() {
  // free-standing crate to the right of the wide peel pad (gap kept clear)
  const cx = LAYOUT.crateX;
  const cz = LAYOUT.crateZ;
  const wood = 0x8b5a2b;
  const dark = 0x5a3a1e;
  const hw = LAYOUT.crateW * 0.5;
  const hd = LAYOUT.crateD * 0.5;
  addBox(0.1, LAYOUT.tableY, 0.1, cx - hw + 0.12, 0, cz - hd + 0.12, 0x5a3d24);
  addBox(0.1, LAYOUT.tableY, 0.1, cx + hw - 0.12, 0, cz - hd + 0.12, 0x5a3d24);
  addBox(0.1, LAYOUT.tableY, 0.1, cx - hw + 0.12, 0, cz + hd - 0.12, 0x5a3d24);
  addBox(0.1, LAYOUT.tableY, 0.1, cx + hw - 0.12, 0, cz + hd - 0.12, 0x5a3d24);
  addBox(LAYOUT.crateW, 0.08, LAYOUT.crateD, cx, LAYOUT.tableY, cz, wood, { roughness: 0.88 });
  addBox(LAYOUT.crateW, 0.38, 0.07, cx, 0.96, cz - hd, dark, { roughness: 0.9 });
  addBox(LAYOUT.crateW, 0.38, 0.07, cx, 0.96, cz + hd, dark, { roughness: 0.9 });
  addBox(0.07, 0.38, LAYOUT.crateD, cx - hw, 0.96, cz, dark, { roughness: 0.9 });
  addBox(0.07, 0.38, LAYOUT.crateD, cx + hw, 0.96, cz, dark, { roughness: 0.9 });
  addBox(LAYOUT.crateW - 0.15, 0.03, LAYOUT.crateD - 0.15, cx, 0.96, cz, 0x6e4423);

  for (let i = 0; i < 12; i++) {
    const slot = new THREE.Object3D();
    const col = i % 3;
    const row = ((i / 3) | 0) % 2;
    const layer = (i / 6) | 0;
    slot.position.set(
      cx - 0.38 + col * 0.38,
      1.08 + layer * 0.15,
      cz - 0.35 + row * 0.42 + (layer ? 0.06 : 0)
    );
    scene.add(slot);
    CRATE_SLOTS.push(slot);
    crateOccupied.push(null);
  }
}

function freeCrateSlot() {
  return crateOccupied.findIndex((x) => !x);
}

function cratePotatoes() {
  return crateOccupied.filter(Boolean);
}

function placeInCrate(potato) {
  scene.attach(potato);
  potato.scale.setScalar(1);
  potato.userData.finished = true;
  potato.userData.floatingPeel = false;
  potato.userData.peeling = false;
  potato.userData.pile = false;
  potato.userData.crate = true;
  potato.userData.side = "crate";

  let idx = freeCrateSlot();
  if (idx < 0) {
    const old = crateOccupied[0];
    if (old) {
      scene.remove(old);
      const ii = interactables.indexOf(old);
      if (ii >= 0) interactables.splice(ii, 1);
      crateOccupied[0] = null;
    }
    idx = 0;
  }

  const slot = CRATE_SLOTS[idx];
  potato.position.copy(slot.position);
  potato.rotation.set(rand(-0.3, 0.3), rand(0, Math.PI * 2), rand(-0.25, 0.25));
  potato.userData.slotIndex = idx;
  crateOccupied[idx] = potato;

  if (!interactables.includes(potato)) interactables.push(potato);
}

function deliverPeeledPotato(potato) {
  // auto into crate — money comes when thrown into water
  const hi = STATE.held.indexOf(potato);
  if (hi >= 0) {
    STATE.held.splice(hi, 1);
    STATE.held.forEach((hp, i) => hp.position.copy(handOffset(i)));
  }
  if (STATE.tablePotato === potato) STATE.tablePotato = null;
  detachFromSlot(potato);
  placeInCrate(potato);
  updateHud();
}

function buildWaterChannel() {
  // trough past the crate with a clear gap from the peel pad
  const troughMat = 0x4a5560;
  const wx = LAYOUT.waterX;
  addBox(1.15, 0.12, 11.4, wx, 0.35, 5.0, troughMat, { roughness: 0.55, metalness: 0.35 });
  addBox(0.08, 0.28, 11.4, wx - 0.55, 0.42, 5.0, 0x3a4450, { metalness: 0.4 });
  addBox(0.08, 0.28, 11.4, wx + 0.55, 0.42, 5.0, 0x3a4450, { metalness: 0.4 });
  addBox(1.15, 0.08, 1.2, wx, 0.55, 0.75, 0x3d4a55, { metalness: 0.45 });

  waterMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.06, 11.0),
    new THREE.MeshStandardMaterial({
      color: 0x3a9ccc,
      transparent: true,
      opacity: 0.72,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x0a3048,
      emissiveIntensity: 0.15,
    })
  );
  waterMesh.position.set(wx, 0.62, 5.1);
  waterMesh.receiveShadow = true;
  waterMesh.userData.kind = "water";
  scene.add(waterMesh);

  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 10.8),
    new THREE.MeshStandardMaterial({
      color: 0x8fd4ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
  );
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(wx, 0.66, 5.1);
  shimmer.userData.kind = "water";
  scene.add(shimmer);
  waterMesh.userData.shimmer = shimmer;

  waterDropZone = new THREE.Object3D();
  waterDropZone.position.set(wx, 0.72, 0.75);
  scene.add(waterDropZone);

  addBox(1.3, 0.9, 0.2, wx, 0.2, 10.7, 0x2a323a);
}

function buildOneMountainPositions(cx, cz, total, seed = 0) {
  // denser overlapping stack (2× potato count)
  const out = [];
  const layerH = 0.132;
  const peakH = 6.5;
  const layers = Math.ceil(peakH / layerH);
  const baseR = 2.15;
  const golden = 2.399963229728653;

  const weights = [];
  let wSum = 0;
  for (let L = 0; L < layers; L++) {
    const t = L / Math.max(1, layers - 1);
    const r = Math.max(0.2, baseR * (1 - t));
    const w = Math.max(0.45, r * r);
    weights.push(w);
    wSum += w;
  }

  let assigned = 0;
  for (let L = 0; L < layers; L++) {
    const leftLayers = layers - L;
    const remaining = total - assigned;
    let n = Math.round((total * weights[L]) / wSum);
    n = Math.max(1, Math.round(n * 1.05));
    n = Math.min(n, Math.max(1, remaining - (leftLayers - 1)));
    if (L === layers - 1) n = remaining;

    const t = L / Math.max(1, layers - 1);
    const rMax = Math.max(0.18, baseR * (1 - t));

    for (let i = 0; i < n; i++) {
      const a = i * golden + L * 0.48 + seed;
      const u = (i + 0.28) / Math.max(1, n);
      const rr = rMax * Math.pow(u, 0.5);
      const x = cx + Math.cos(a) * rr + rand(-0.015, 0.015);
      const z = cz + Math.sin(a) * rr * 0.94 + rand(-0.015, 0.015);
      const y = 0.12 + L * layerH + rand(-0.012, 0.018);
      out.push(new THREE.Vector3(x, y, z));
      assigned++;
    }
  }
  return out;
}

function buildMountainPositions(total) {
  // twin mountains side by side
  const half = Math.floor(total / 2);
  const left = buildOneMountainPositions(PILE_CENTERS[0].x, PILE_CENTERS[0].z, half, 0.2);
  const right = buildOneMountainPositions(PILE_CENTERS[1].x, PILE_CENTERS[1].z, total - half, 1.7);
  return left.concat(right);
}

function nearestPileCenter(x, z) {
  let best = PILE_CENTERS[0];
  let bestD = Infinity;
  for (const c of PILE_CENTERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function restockPileSpot() {
  const center = PILE_CENTERS[(Math.random() * PILE_CENTERS.length) | 0];
  const a = Math.random() * Math.PI * 2;
  const u = Math.random();
  const r = 2.0 * Math.pow(1 - u, 0.55);
  const x = center.x + Math.cos(a) * r;
  const z = center.z + Math.sin(a) * r * 0.94;
  const y = 0.12 + u * 6.2 + rand(0, 0.04);
  return new THREE.Vector3(x, y, z);
}

function spawnPilePotato(at = null) {
  const p = createPilePotato();
  const pos = at || restockPileSpot();
  p.position.copy(pos);
  p.rotation.set(rand(-0.8, 0.8), rand(0, Math.PI * 2), rand(-0.9, 0.9));
  const h = Math.max(0, Math.min(1, pos.y / 6.4));
  // bigger + overlapping look
  p.scale.setScalar(rand(1.45, 1.75) * (1.05 - h * 0.1));
  p.userData.pile = true;
  p.userData.home = pos.clone();
  if ((pileMeshes.length % 28) === 0 && p.userData.mesh) {
    p.userData.mesh.castShadow = true;
  }
  scene.add(p);
  pileMeshes.push(p);
  interactables.push(p);
  PILE_SPOTS.push(pos.clone());
  return p;
}

function buildPotatoMountain() {
  mountainLayout = buildMountainPositions(PILE_TARGET_COUNT);
  for (let i = 0; i < mountainLayout.length; i++) {
    spawnPilePotato(mountainLayout[i]);
  }
}

/* ---------- held + knife ---------- */
const holdAnchor = new THREE.Object3D();
camera.add(holdAnchor);
holdAnchor.position.set(0.28, -0.22, -0.45);

const FLOAT_POS = new THREE.Vector3(LAYOUT.peelX, 1.48, LAYOUT.peelZ);

let knifeMesh = null;

function markHudMesh(mesh) {
  mesh.renderOrder = 999;
  if (mesh.material) {
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
  }
}

function addHud(g, mesh) {
  markHudMesh(mesh);
  g.add(mesh);
  return mesh;
}

function buildStarterKnifeMesh() {
  const g = new THREE.Group();
  const wood = makeMat(0x3a2818, { roughness: 0.92 });
  const steel = makeMat(0x8a9096, { roughness: 0.45, metalness: 0.55 });
  const tip = addHud(g, new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 4), steel));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.015, -0.3);
  tip.name = "knifeTip";
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.24), steel)).position.set(0, 0.015, -0.15);
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.03), makeMat(0x6a7076, { metalness: 0.4 }))).position.set(
    0,
    0.008,
    0.0
  );
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.048, 0.14), wood)).position.set(0.005, -0.005, 0.1);
  g.userData.toolPose = { rot: [-0.32, 0.22, 0.38], scale: 1.55 };
  return g;
}

function buildWorkKnifeMesh() {
  const g = new THREE.Group();
  const grip = makeMat(0x1a1a1a, { roughness: 0.85 });
  const steel = makeMat(0xc8d0d8, { roughness: 0.22, metalness: 0.88 });
  const tip = addHud(g, new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.07, 5), steel));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.02, -0.36);
  tip.name = "knifeTip";
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.01, 0.3), steel)).position.set(0, 0.02, -0.18);
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.038, 0.032), makeMat(0x9aa3ad, { metalness: 0.8 }))).position.set(
    0,
    0.012,
    0.01
  );
  const handle = addHud(g, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.15, 10), grip));
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0, 0.11);
  g.userData.toolPose = { rot: [-0.34, 0.2, 0.32], scale: 1.65 };
  return g;
}

function buildChefKnifeMesh() {
  const g = new THREE.Group();
  const wood = makeMat(0x6b3a1e, { roughness: 0.65 });
  const steel = makeMat(0xe8eef4, { roughness: 0.14, metalness: 0.95 });
  const tip = addHud(g, new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 6), steel));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.028, -0.44);
  tip.name = "knifeTip";
  // broad chef blade
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.38), steel)).position.set(0, 0.025, -0.22);
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.34), makeMat(0xffffff, { metalness: 1 }))).position.set(
    0.02,
    0.03,
    -0.2
  );
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.04), makeMat(0xb0b8c0, { metalness: 0.85 }))).position.set(
    0,
    0.015,
    0.02
  );
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.17), wood)).position.set(0.01, -0.005, 0.13);
  // rivets
  for (const z of [0.08, 0.14]) {
    const riv = addHud(g, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.052, 8), makeMat(0xd0d4d8, { metalness: 0.9 })));
    riv.rotation.z = Math.PI / 2;
    riv.position.set(0, 0.01, z);
  }
  g.userData.toolPose = { rot: [-0.38, 0.28, 0.42], scale: 1.75 };
  return g;
}

function buildMasterKnifeMesh() {
  const g = new THREE.Group();
  const ebony = makeMat(0x14110f, { roughness: 0.4 });
  const steel = makeMat(0xf2f6fa, { roughness: 0.08, metalness: 1 });
  const brass = makeMat(0xc4a35a, { roughness: 0.35, metalness: 0.85 });
  const tip = addHud(g, new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.1, 7), steel));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.03, -0.48);
  tip.name = "knifeTip";
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.011, 0.42), steel)).position.set(0, 0.028, -0.24);
  // fuller groove
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.28), makeMat(0xa8b0b8, { metalness: 0.7 }))).position.set(
    0,
    0.035,
    -0.22
  );
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.05, 0.042), brass)).position.set(0, 0.018, 0.03);
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.062, 0.18), ebony)).position.set(0.008, -0.002, 0.14);
  addHud(g, new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), brass)).position.set(0, 0.01, 0.22);
  g.userData.toolPose = { rot: [-0.4, 0.3, 0.45], scale: 1.85 };
  return g;
}

function buildPeelerMesh() {
  // real Y-peeler: handle back, U arms forward, swivel blade at tip
  const g = new THREE.Group();
  const plastic = makeMat(0x2f6f4e, { roughness: 0.55 });
  const steel = makeMat(0xdde3ea, { roughness: 0.18, metalness: 0.92 });
  const dark = makeMat(0x3a3f44, { roughness: 0.4, metalness: 0.6 });

  const handle = addHud(g, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.16, 12), plastic));
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0, 0.1);

  const neck = addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.05), plastic));
  neck.position.set(0, 0, 0.01);

  // Y arms
  const armL = addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.16), dark));
  armL.position.set(-0.045, 0.01, -0.12);
  armL.rotation.y = 0.18;
  const armR = addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.16), dark));
  armR.position.set(0.045, 0.01, -0.12);
  armR.rotation.y = -0.18;

  // cross bar + blade
  const bar = addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.012), dark));
  bar.position.set(0, 0.01, -0.22);
  const blade = addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.006, 0.02), steel));
  blade.position.set(0, 0.018, -0.22);
  blade.name = "knifeTip";

  // blade slot look
  addHud(g, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.002, 0.004), makeMat(0x111111))).position.set(0, 0.02, -0.22);

  g.userData.toolPose = { rot: [-0.55, 0.05, 0.15], scale: 1.9, isPeeler: true };
  return g;
}

function buildToolMesh(id) {
  if (id === "knife_work") return buildWorkKnifeMesh();
  if (id === "knife_chef") return buildChefKnifeMesh();
  if (id === "knife_master") return buildMasterKnifeMesh();
  if (id === "peeler") return buildPeelerMesh();
  return buildStarterKnifeMesh();
}

const KNIFE_CURSOR_SVG = {
  starter: `<svg viewBox="0 0 100 240" width="78" height="176"><path d="M50 10 L64 55 L36 55 Z" fill="#8a9096"/><path d="M38 54 L62 54 L58 145 L42 145 Z" fill="#8a9096"/><rect x="36" y="145" width="28" height="10" fill="#6a7076"/><rect x="40" y="154" width="20" height="62" rx="5" fill="#3a2818"/></svg>`,
  knife_work: `<svg viewBox="0 0 100 240" width="78" height="176"><path d="M50 6 L66 52 L34 52 Z" fill="#c8d0d8"/><path d="M36 50 L64 50 L60 148 L40 148 Z" fill="#c8d0d8"/><rect x="34" y="147" width="32" height="12" fill="#9aa3ad"/><rect x="42" y="158" width="16" height="68" rx="8" fill="#1a1a1a"/></svg>`,
  knife_chef: `<svg viewBox="0 0 100 240" width="82" height="180"><path d="M52 4 L72 58 L28 58 Z" fill="#e8eef4"/><path d="M30 56 L70 56 L64 152 L36 152 Z" fill="#e8eef4"/><path d="M70 56 L78 70 L64 152 L70 152 Z" fill="#98a2ac"/><rect x="32" y="150" width="36" height="12" fill="#b0b8c0"/><rect x="38" y="160" width="24" height="66" rx="5" fill="#6b3a1e"/><circle cx="50" cy="175" r="3" fill="#d0d4d8"/><circle cx="50" cy="195" r="3" fill="#d0d4d8"/></svg>`,
  knife_master: `<svg viewBox="0 0 100 240" width="82" height="184"><path d="M50 2 L70 54 L30 54 Z" fill="#f2f6fa"/><path d="M34 52 L66 52 L62 150 L38 150 Z" fill="#f2f6fa"/><rect x="44" y="70" width="12" height="60" fill="#a8b0b8" opacity="0.5"/><rect x="30" y="148" width="40" height="14" fill="#c4a35a"/><rect x="38" y="160" width="24" height="70" rx="4" fill="#14110f"/><circle cx="50" cy="225" r="6" fill="none" stroke="#c4a35a" stroke-width="3"/></svg>`,
  peeler: `<svg viewBox="0 0 120 220" width="86" height="160"><rect x="52" y="120" width="16" height="85" rx="7" fill="#2f6f4e"/><path d="M45 118 L75 118 L82 95 L38 95 Z" fill="#2f6f4e"/><path d="M38 95 L28 40 L36 36 L48 88 Z" fill="#3a3f44"/><path d="M82 95 L92 40 L84 36 L72 88 Z" fill="#3a3f44"/><rect x="28" y="28" width="64" height="12" rx="3" fill="#3a3f44"/><rect x="34" y="24" width="52" height="8" rx="2" fill="#dde3ea"/><rect x="40" y="26" width="40" height="2" fill="#111"/></svg>`,
};

function updateKnifeCursorArt(id) {
  if (!el.knifeCursor) return;
  const key = KNIFE_CURSOR_SVG[id] ? id : "starter";
  el.knifeCursor.innerHTML = `${KNIFE_CURSOR_SVG[key]}<div id="knife-tip-dot"></div>`;
  el.knifeCursor.classList.toggle("peeler", id === "peeler");
}

function refreshEquippedToolMesh() {
  const id = STATE.equipped || "starter";
  const wasOn = STATE.knifeOut;
  if (knifeMesh) {
    camera.remove(knifeMesh);
    knifeMesh.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
    });
  }
  knifeMesh = buildToolMesh(id);
  const pose = knifeMesh.userData.toolPose || { rot: [-0.35, 0.25, 0.4], scale: 1.7 };
  knifeMesh.position.set(0.2, -0.18, -0.42);
  knifeMesh.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
  knifeMesh.scale.setScalar(pose.scale);
  knifeMesh.visible = !!wasOn;
  camera.add(knifeMesh);
  updateKnifeCursorArt(id);
}

refreshEquippedToolMesh();

function floatPotatoForPeel(potato) {
  // keep in world space, clearly visible hovering above the table
  scene.attach(potato);
  potato.position.copy(FLOAT_POS);
  potato.rotation.set(0.2, 0.45, 0.08);
  potato.scale.setScalar(1.35); // a bit larger while peeling so it's obvious
  potato.userData.spinVel = 0;
  potato.userData.floatingPeel = true;
  potato.visible = true;
  potato.traverse((c) => {
    if (c.isMesh) {
      c.visible = true;
      c.frustumCulled = false;
    }
  });
}

function restPotatoOnTable(potato) {
  if (!potato) return;
  scene.attach(potato);
  potato.position.set(LAYOUT.peelX, LAYOUT.topY + 0.12, LAYOUT.peelZ);
  potato.rotation.set(0.15, 0.35, 0.08);
  potato.scale.setScalar(1);
  potato.userData.floatingPeel = false;
}

function updateKnifeCursorPos() {
  if (!STATE.knifeOut) return;
  const x = (STATE.knifeAim.x * 0.5 + 0.5) * innerWidth;
  const y = (-STATE.knifeAim.y * 0.5 + 0.5) * innerHeight;
  // tip of SVG sits on aim point
  el.knifeCursor.style.left = `${x}px`;
  el.knifeCursor.style.top = `${y}px`;
  el.knifeCursor.style.marginLeft = "-28px";
  el.knifeCursor.style.marginTop = "-10px";
}

function setKnife(on) {
  STATE.knifeOut = on;
  knifeMesh.visible = on;
  el.crosshair.classList.toggle("hidden", on);
  el.knifeCursor.classList.toggle("hidden", !on);
  el.knifeCursor.classList.remove("cutting");
  if (!on) {
    controls.pointerSpeed = getLookSpeed();
    peelDragging = false;
    if (STATE.tablePotato && !STATE.tablePotato.userData.finished) {
      restPotatoOnTable(STATE.tablePotato);
    }
  } else if (STATE.tablePotato) {
    STATE.knifeAim.x = 0;
    STATE.knifeAim.y = 0.05;
    floatPotatoForPeel(STATE.tablePotato);
    updateKnifeCursorPos();
    knifeMesh.position.set(0.12, -0.1, -0.36);
    // gently face the table so floating potato is in view
    const pos = controls.getObject().position;
    const toPad = new THREE.Vector3(FLOAT_POS.x - pos.x, 0, FLOAT_POS.z - pos.z);
    if (toPad.lengthSq() > 0.01) {
      const yaw = Math.atan2(-toPad.x, -toPad.z);
      camera.rotation.y = yaw;
      camera.rotation.x = -0.18;
    }
    const tool = getEquippedToolStats();
    toast(`${tool.name} · WASD çevir · Sol tık soy`);
    if (el.peelType) {
      el.peelType.textContent = `${STATE.tablePotato.userData.type.name} · ${tool.name}${
        tool.level ? ` Lv${tool.level}` : ""
      }`;
    }
  }
}

function animateKnife(dt, peeling) {
  if (!STATE.knifeOut || !knifeMesh) return;
  const ax = STATE.knifeAim.x;
  const ay = STATE.knifeAim.y;
  const pose = knifeMesh.userData.toolPose || { rot: [-0.4, 0.2, 0.35] };
  const basePos = new THREE.Vector3(0.1 + ax * 0.22, -0.12 + ay * 0.2, -0.36);
  knifeMesh.position.lerp(basePos, 1 - Math.exp(-dt * 12));
  if (pose.isPeeler) {
    knifeMesh.rotation.set(pose.rot[0] - ay * 0.25, pose.rot[1] + ax * 0.2, pose.rot[2]);
  } else {
    knifeMesh.rotation.set(pose.rot[0] - ay * 0.35, pose.rot[1] + ax * 0.4, pose.rot[2]);
  }
  el.knifeCursor.classList.toggle("cutting", peeling);
}

function applyTipTraining(potato) {
  const rows = getFeatureValue("tipTrain", 0) | 0;
  if (!rows || !potato?.userData?.cells) return 0;
  let n = 0;
  for (let dy = 0; dy < rows; dy++) {
    for (const y of [dy, GRID - 1 - dy]) {
      for (let x = 0; x < GRID; x++) {
        const idx = y * GRID + x;
        if (!potato.userData.cells[idx]) {
          peelCell(potato, idx);
          n++;
        }
      }
    }
  }
  if (n) updatePotatoVisual(potato);
  return n;
}

/* ---------- interactions ---------- */
function freeLeftSlot() {
  return leftOccupied.findIndex((x) => !x);
}

function attachToSlot(potato, side, index) {
  const slot = LEFT_SLOTS[index];
  scene.attach(potato);
  potato.position.copy(slot.position);
  potato.rotation.set(rand(-0.2, 0.2), rand(0, Math.PI * 2), rand(-0.15, 0.15));
  potato.userData.slotIndex = index;
  potato.userData.side = side;
  potato.userData.pile = false;
  leftOccupied[index] = potato;
  if (!interactables.includes(potato)) interactables.push(potato);
}

function detachFromSlot(potato) {
  const idx = potato.userData.slotIndex;
  if (potato.userData.side === "left" && idx >= 0) leftOccupied[idx] = null;
  if (potato.userData.side === "crate" && idx >= 0) crateOccupied[idx] = null;
  potato.userData.slotIndex = -1;
  potato.userData.side = null;
}

function handOffset(index) {
  const col = index % 3;
  const row = (index / 3) | 0;
  return new THREE.Vector3(
    -0.1 + col * 0.12,
    row * 0.1,
    -row * 0.05
  );
}

function attachToHands(potato, index) {
  holdAnchor.attach(potato);
  potato.position.copy(handOffset(index));
  potato.rotation.set(0.25 + index * 0.15, 0.35 + index * 0.4, index * 0.1);
  potato.userData.pile = false;
  potato.userData.crate = false;
  STATE.held.push(potato);
}

function takeFromPile(potato) {
  let p = potato;
  if (potato.userData.lite) {
    const idxPile = pileMeshes.indexOf(potato);
    const idxInt = interactables.indexOf(potato);
    p = ensurePlayablePotato(potato);
    if (idxPile >= 0) pileMeshes[idxPile] = p;
    if (idxInt >= 0) interactables[idxInt] = p;
  }
  p.userData.pile = false;
  const i = pileMeshes.indexOf(p);
  if (i >= 0) pileMeshes.splice(i, 1);
  const ii = interactables.indexOf(p);
  if (ii >= 0) interactables.splice(ii, 1);
  scheduleRestock();
  return p;
}

function takeFromCrate(potato) {
  detachFromSlot(potato);
  potato.userData.crate = false;
  const ii = interactables.indexOf(potato);
  if (ii >= 0) interactables.splice(ii, 1);
}

function holdPotato(potato) {
  if (potato.userData.floating) return;

  // from the mountain: scoop up to carry limit
  if (potato.userData.pile) {
    if (isHolding()) {
      toast("Önce elindekileri koy / bırak", true);
      return;
    }
    const ordered = pileMeshes
      .slice()
      .sort((a, b) => a.position.distanceTo(potato.position) - b.position.distanceTo(potato.position));
    const takeN = Math.min(ordered.length, getMaxCarry() + getGrabBonus());
    const take = ordered.slice(0, takeN);
    take.forEach((p, idx) => {
      const playable = takeFromPile(p);
      attachToHands(playable, idx);
    });
    setKnife(false);
    toast(`${take.length} patates alındı`);
    return;
  }

  // from peeled crate: same scoop rule, then throw into water
  if (potato.userData.crate || (potato.userData.finished && potato.userData.side === "crate")) {
    if (isHolding()) {
      toast("Önce elindekileri suya at / bırak", true);
      return;
    }
    const ordered = cratePotatoes()
      .slice()
      .sort((a, b) => a.position.distanceTo(potato.position) - b.position.distanceTo(potato.position));
    const takeN = Math.min(ordered.length, getMaxCarry() + getGrabBonus());
    const take = ordered.slice(0, takeN);
    take.forEach((p, idx) => {
      takeFromCrate(p);
      attachToHands(p, idx);
    });
    setKnife(false);
    toast(`${take.length} soyulmuş · suya at`);
    return;
  }

  if (isHolding()) {
    toast("Ellerin dolu", true);
    return;
  }

  if (potato === STATE.tablePotato) {
    if (STATE.knifeOut) {
      STATE.knifeOut = false;
      knifeMesh.visible = false;
      el.crosshair.classList.remove("hidden");
      el.knifeCursor.classList.add("hidden");
      controls.pointerSpeed = getLookSpeed();
      peelDragging = false;
    }
    scene.attach(potato);
    potato.userData.floatingPeel = false;
    STATE.tablePotato = null;
    el.peelBarWrap.classList.add("hidden");
  }
  detachFromSlot(potato);
  const ii = interactables.indexOf(potato);
  if (ii >= 0) interactables.splice(ii, 1);
  attachToHands(potato, 0);
  setKnife(false);
  toast(`${potato.userData.type.name} alındı`);
}

function dropHeld() {
  if (!isHolding()) return;
  camera.getWorldDirection(tmpV);
  const list = STATE.held.splice(0, STATE.held.length);
  list.forEach((p, i) => {
    scene.attach(p);
    p.position.copy(camera.position).addScaledVector(tmpV, 0.7 + i * 0.15);
    p.position.x += (i - 1) * 0.18;
    p.position.y = 0.2;
    p.rotation.set(rand(0, 1), rand(0, 2), rand(0, 1));
    if (!interactables.includes(p)) interactables.push(p);
  });
  toast(`${list.length} patates bırakıldı`);
}

function placeHeldOnLeft() {
  if (!isHolding()) return false;
  if (primaryHeld().userData.finished) {
    toast("Hazır patatesi su kanalına at", true);
    return false;
  }
  let placed = 0;
  while (isHolding()) {
    const idx = freeLeftSlot();
    if (idx < 0) break;
    const p = STATE.held.shift();
    scene.attach(p);
    attachToSlot(p, "left", idx);
    // re-pack remaining in hands
    STATE.held.forEach((hp, i) => hp.position.copy(handOffset(i)));
    placed++;
  }
  if (!placed) {
    toast("Sol raf dolu", true);
    return false;
  }
  toast(`${placed} patates sol rafa kondu`);
  return true;
}

function placeHeldOnTable(hitPoint = null) {
  if (!isHolding()) return false;
  const p = primaryHeld();
  if (p.userData.finished) {
    toast("Bu patates hazır — su kanalına at", true);
    return false;
  }
  if (STATE.tablePotato) {
    toast("Masada zaten patates var", true);
    return false;
  }
  STATE.held.shift();
  STATE.held.forEach((hp, i) => hp.position.copy(handOffset(i)));
  scene.attach(p);
  // drop where player is looking (clamped to peel zone)
  const b = peelBounds();
  const px = hitPoint
    ? THREE.MathUtils.clamp(hitPoint.x, b.minX + 0.15, b.maxX - 0.15)
    : LAYOUT.peelX;
  const pz = hitPoint
    ? THREE.MathUtils.clamp(hitPoint.z, b.minZ + 0.15, b.maxZ - 0.15)
    : LAYOUT.peelZ;
  p.position.set(px, LAYOUT.topY + 0.12, pz);
  p.rotation.set(0.15, 0.35, 0.08);
  STATE.tablePotato = p;
  p.userData.peeling = true;
  const tips = applyTipTraining(p);
  el.peelBarWrap.classList.remove("hidden");
  if (el.peelType) el.peelType.textContent = `${p.userData.type.name} — Q ile havaya al`;
  updateHudForTable();
  const tipMsg = tips ? " · uçlar hazır" : "";
  toast(
    `${p.userData.type.name} masada — Q: havada soy${tipMsg}${heldCount() ? ` · elde ${heldCount()} kaldı` : ""}`
  );
  return true;
}

function finishPotato(potato) {
  const peel = peelProgress(potato);
  const dmg = potato.userData.damage;

  if (dmg < 0.12) {
    STATE.combo = Math.min(getComboMax(), STATE.combo + 0.25);
    STATE.comboTimer = 12;
  } else if (dmg > 0.3) {
    STATE.combo = 1;
    STATE.comboTimer = 0;
  }

  potato.userData.finished = true;
  potato.userData.peeling = false;
  potato.userData.spinVel = 0;
  potato.userData.floatingPeel = false;
  updatePotatoVisual(potato);

  STATE.tablePotato = null;
  el.peelBarWrap.classList.add("hidden");
  STATE.knifeOut = false;
  knifeMesh.visible = false;
  el.crosshair.classList.remove("hidden");
  el.knifeCursor.classList.add("hidden");
  controls.pointerSpeed = getLookSpeed();
  peelDragging = false;

  const q = qualityLabel(dmg, peel);
  const name = potato.userData.type.name;
  deliverPeeledPotato(potato);
  toast(`${name} soyuldu (${q}) · kasaya gitti`);
  saveProgress();

  const leftover = STATE.held.filter((p) => p.userData.finished);
  for (const p of leftover) deliverPeeledPotato(p);
}

function throwIntoWater(potato, silent = false) {
  if (!potato?.userData.finished || potato.userData.floating) return 0;

  const hi = STATE.held.indexOf(potato);
  if (hi >= 0) STATE.held.splice(hi, 1);
  STATE.held.forEach((hp, i) => hp.position.copy(handOffset(i)));

  scene.attach(potato);
  potato.userData.floating = true;
  potato.userData.pile = false;
  potato.userData.crate = false;
  detachFromSlot(potato);

  const start = waterDropZone.position.clone();
  potato.position.copy(start);
  potato.position.y += 0.15 + Math.random() * 0.08;
  potato.position.x += (Math.random() - 0.5) * 0.2;
  potato.rotation.set(rand(0, 1), rand(0, 2), rand(0, 1));

  const pay = payout();
  STATE.money += pay;
  if (!silent) {
    toast(`+${formatMoney(pay)} · kanalda akıyor`);
    updateHud();
    saveProgress();
  }

  floatingPotatoes.push({
    mesh: potato,
    t: Math.random() * 0.15,
    spin: new THREE.Vector3(rand(-1, 1), rand(1, 2.5), rand(-1, 1)),
  });

  const ii = interactables.indexOf(potato);
  if (ii >= 0) interactables.splice(ii, 1);
  return pay;
}

function throwHeldIntoWater() {
  const list = STATE.held.filter((p) => p.userData.finished);
  if (!list.length) return false;
  let total = 0;
  for (const p of list.slice()) total += throwIntoWater(p, true);
  toast(`+${formatMoney(total)} · ${list.length} patates kanala`);
  updateHud();
  saveProgress();
  return true;
}

function nearWater() {
  const p = camera.position;
  return Math.hypot(p.x - 2.9, p.z - 0.55) < 2.6;
}

function updateFloatingPotatoes(dt) {
  for (let i = floatingPotatoes.length - 1; i >= 0; i--) {
    const f = floatingPotatoes[i];
    f.t += dt;
    const p = f.mesh;
    // ride the channel from drop zone toward +z outlet
    const u = Math.min(1, f.t / 4.2);
    p.position.x = 2.9 + Math.sin(f.t * 2.2) * 0.08;
    p.position.y = 0.72 + Math.sin(f.t * 5) * 0.03 - u * 0.12;
    p.position.z = 0.55 + u * 9.8;
    p.rotation.x += f.spin.x * dt;
    p.rotation.y += f.spin.y * dt;
    p.rotation.z += f.spin.z * dt;
    // fade near outlet
    if (u > 0.82) {
      const fade = 1 - (u - 0.82) / 0.18;
      p.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material.transparent = true;
          c.material.opacity = Math.max(0, fade);
        }
      });
    }
    if (u >= 1) {
      scene.remove(p);
      floatingPotatoes.splice(i, 1);
    }
  }
  if (waterMesh?.userData.shimmer) {
    waterMesh.userData.shimmer.position.z = 4.9 + Math.sin(performance.now() * 0.0015) * 0.05;
    waterMesh.material.opacity = 0.68 + Math.sin(performance.now() * 0.002) * 0.04;
  }
}

function restockPile() {
  if (pileMeshes.length >= PILE_TARGET_COUNT) return;
  const need = Math.min(8, PILE_TARGET_COUNT - pileMeshes.length);
  for (let i = 0; i < need; i++) spawnPilePotato();
}

function scheduleRestock() {
  const factor = getRestockFactor();
  const delay = (1200 + Math.random() * 1800) * factor;
  setTimeout(restockPile, delay);
}

function resolveSurfaceKind(obj) {
  let o = obj;
  while (o) {
    if (o.userData?.kind === "peelPad" || o.userData?.kind === "table") return "peelPad";
    if (o.userData?.kind === "leftTray") return "leftTray";
    o = o.parent;
  }
  return null;
}

function getLookTarget() {
  raycaster.setFromCamera(mouseNDC, camera);

  // table / tray surfaces first — reliable look-to-place
  if (placeSurfaces.length) {
    const surfHits = raycaster.intersectObjects(placeSurfaces, false);
    if (surfHits.length && surfHits[0].distance < 4.5) {
      const kind = resolveSurfaceKind(surfHits[0].object);
      if (kind === "peelPad") {
        return { type: "peelPad", dist: surfHits[0].distance, point: surfHits[0].point.clone() };
      }
      if (kind === "leftTray") {
        return { type: "leftTray", dist: surfHits[0].distance, point: surfHits[0].point.clone() };
      }
    }
  }

  // skip pile meshes in raycast (proximity below) — big FPS win
  const objs = [];
  for (const p of interactables) {
    if (STATE.held.includes(p) || p.userData.pile) continue;
    if (p.userData.mesh) objs.push(p.userData.mesh);
    else {
      p.traverse((c) => {
        if (c.isMesh) objs.push(c);
      });
    }
  }
  const hits = raycaster.intersectObjects(objs, false);
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData?.kind) o = o.parent;
    if (o?.userData?.kind === "potato") return { type: "potato", obj: o, dist: hits[0].distance };
  }

  camera.getWorldDirection(tmpV);
  tmpV2.copy(camera.position).addScaledVector(tmpV, 2.2);

  // fallback aim volumes (look direction, not player proximity)
  if (
    Math.abs(tmpV2.x - LAYOUT.leftX) < LAYOUT.leftW * 0.55 &&
    Math.abs(tmpV2.z - LAYOUT.leftZ) < LAYOUT.leftD * 0.55 &&
    Math.abs(tmpV2.y - 1.1) < 0.95
  ) {
    return { type: "leftTray", dist: camera.position.distanceTo(tmpV2), point: tmpV2.clone() };
  }
  {
    const b = peelBounds();
    if (
      tmpV2.x >= b.minX - 0.15 &&
      tmpV2.x <= b.maxX + 0.15 &&
      tmpV2.z >= b.minZ - 0.15 &&
      tmpV2.z <= b.maxZ + 0.15 &&
      Math.abs(tmpV2.y - 1.1) < 1.05
    ) {
      return { type: "peelPad", dist: camera.position.distanceTo(tmpV2), point: tmpV2.clone() };
    }
  }
  // dog bowl / bed corner
  if (PUPPY.bowlPos && Math.hypot(tmpV2.x - PUPPY.bowlPos.x, tmpV2.z - PUPPY.bowlPos.z) < 0.85 && tmpV2.y < 1.4) {
    return { type: "dogBowl", dist: camera.position.distanceTo(PUPPY.bowlPos) };
  }
  if (PUPPY.napPos && Math.hypot(tmpV2.x - PUPPY.napPos.x, tmpV2.z - PUPPY.napPos.z) < 0.95 && tmpV2.y < 1.4) {
    return { type: "dogBowl", dist: camera.position.distanceTo(PUPPY.napPos) };
  }
  // shop booth (left)
  if (Math.abs(tmpV2.x - SHOP_POS.x) < 2.2 && Math.abs(tmpV2.z - SHOP_POS.z) < 2.2 && tmpV2.y < 2.8) {
    return { type: "shop", dist: camera.position.distanceTo(SHOP_POS) };
  }
  // peeled crate — easy scoop
  if (
    Math.hypot(tmpV2.x - LAYOUT.crateX, tmpV2.z - LAYOUT.crateZ) < Math.max(LAYOUT.crateW, LAYOUT.crateD) * 0.7 &&
    Math.abs(tmpV2.y - 1.2) < 1.0
  ) {
    const list = cratePotatoes();
    let best = null;
    let bestD = 999;
    for (const p of list) {
      const d = camera.position.distanceTo(p.position);
      if (d < bestD && d < 4.2) {
        bestD = d;
        best = p;
      }
    }
    if (best) return { type: "potato", obj: best, dist: bestD, fromCrate: true };
  }
  // water drop zone / channel (after crate, toward +z)
  if (
    Math.abs(tmpV2.x - LAYOUT.waterX) < 0.95 &&
    tmpV2.z > 0.15 &&
    tmpV2.z < 3.2 &&
    Math.abs(tmpV2.y - 0.75) < 1.1
  ) {
    return { type: "water", dist: camera.position.distanceTo(tmpV2) };
  }
  {
    const nearPeak = PILE_CENTERS.some(
      (c) => Math.hypot(tmpV2.x - c.x, tmpV2.z - c.z) < 3.6
    );
    if (nearPeak && tmpV2.y < 8.2) {
      let best = null;
      let bestD = 999;
      for (const p of pileMeshes) {
        const d = camera.position.distanceTo(p.position);
        if (d < bestD && d < 10) {
          bestD = d;
          best = p;
        }
      }
      if (best) return { type: "potato", obj: best, dist: bestD, fromPile: true };
    }
  }
  return null;
}

function nearShop() {
  return camera.position.distanceTo(SHOP_POS) < 3.8;
}

function nearDogBowl() {
  if (!PUPPY.bowlPos) return false;
  const pos = controls.getObject().position;
  return Math.hypot(pos.x - PUPPY.bowlPos.x, pos.z - PUPPY.bowlPos.z) < 2.2;
}

function interact() {
  const t = getLookTarget();

  // shop opens even while holding (drop off shopping)
  if ((t?.type === "shop" || nearShop()) && !STATE.knifeOut) {
    openShop();
    return;
  }

  // feed dog at bowl / bed (even while hungry bark)
  if ((t?.type === "dogBowl" || nearDogBowl()) && !STATE.knifeOut && !isHolding()) {
    feedDog();
    return;
  }

  if (isHolding()) {
    const finishedHeld = STATE.held.filter((p) => p.userData.finished);
    if (finishedHeld.length) {
      if (t?.type === "water" || nearWater()) {
        throwHeldIntoWater();
        return;
      }
      toast("Suya bakıp E ile at", true);
      return;
    }
    // look decides: peel pad / table before left tray
    if (t?.type === "peelPad") {
      placeHeldOnTable(t.point || null);
      return;
    }
    if (t?.type === "leftTray") {
      placeHeldOnLeft();
      return;
    }
    toast("Soyma alanına veya sol rafa bakıp E", true);
    return;
  }
  if (t?.type === "potato") {
    holdPotato(t.obj);
    return;
  }
  if (t?.type === "leftTray") {
    for (let i = 0; i < leftOccupied.length; i++) {
      if (leftOccupied[i]) {
        holdPotato(leftOccupied[i]);
        return;
      }
    }
  }
  toast("Dağ / kasa / masa / dükkan (E)", true);
}

/* ---------- peeling ---------- */
const tipNDC = new THREE.Vector2(0, 0.05);

function getKnifeTipUV() {
  const potato = STATE.tablePotato;
  if (!potato?.userData?.mesh) return null;
  tipNDC.set(STATE.knifeAim.x, STATE.knifeAim.y);
  raycaster.setFromCamera(tipNDC, camera);
  const hits = raycaster.intersectObject(potato.userData.mesh, false);
  if (!hits.length) return null;
  const hit = hits[0];
  // potato hovers above table — allow normal reach distance
  if (hit.distance > 4.0) return null;
  if (!hit.uv) return { u: 0.5, v: 0.5, hit };
  return { u: hit.uv.x, v: hit.uv.y, hit };
}

function peelCell(potato, idx) {
  const cells = potato.userData.cells;
  if (idx < 0 || idx >= CELL_COUNT) return;
  if (cells[idx]) return;
  cells[idx] = true;
  paintPeeledCell(potato, idx);
}

function peelAtTip() {
  const potato = STATE.tablePotato;
  if (!potato || !STATE.knifeOut) return false;

  // weaker tools peel slower (cooldown); upgrades peel faster
  const now = performance.now();
  const interval = 220 / Math.max(0.25, getPeelSpeed());
  if (now - lastPeelTime < interval) return false;

  const tip = getKnifeTipUV();
  if (!tip) return false;
  lastPeelTime = now;

  const { u, v } = tip;
  STATE.peelCursor.u = u;
  STATE.peelCursor.v = v;

  const cx = Math.min(GRID - 1, Math.max(0, (u * GRID) | 0));
  const cy = Math.min(GRID - 1, Math.max(0, ((1 - v) * GRID) | 0));
  const radius = getPeelRadius();
  const rMax = Math.ceil(radius);
  for (let dy = -rMax; dy <= rMax; dy++) {
    for (let dx = -rMax; dx <= rMax; dx++) {
      if (dx * dx + dy * dy > radius * radius + 0.35) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= GRID || y < 0 || y >= GRID) continue;
      peelCell(potato, y * GRID + x);
    }
  }

  potato.userData.damage = Math.min(0.35, potato.userData.damage + 0.0012 * getDamageMult());
  updatePotatoVisual(potato);
  updateHudForTable();

  if (peelProgress(potato) >= 1) finishPotato(potato);
  return true;
}

function rotatePotatoWithWASD(dt) {
  const potato = STATE.tablePotato;
  if (!potato || !STATE.knifeOut) return;
  // unlimited full turns on both axes — keep spinning as long as you hold
  const turn = 2.8 * dt;
  if (KEYS.KeyA) potato.rotation.y += turn;
  if (KEYS.KeyD) potato.rotation.y -= turn;
  if (KEYS.KeyW) potato.rotation.x -= turn;
  if (KEYS.KeyS) potato.rotation.x += turn;
  // no clamp: continuous 360° loops up/down and left/right
}

function updateHudForTable() {
  const p = STATE.tablePotato;
  if (!p) {
    el.peelPct.textContent = "—";
    el.damage.textContent = "—";
    el.quality.textContent = "—";
    el.peelFill.style.width = "0%";
    return;
  }
  const peel = peelProgress(p);
  el.peelPct.textContent = `${Math.floor(peel * 100)}%`;
  el.damage.textContent = `${Math.floor(p.userData.damage * 100)}%`;
  el.quality.textContent = qualityLabel(p.userData.damage, peel);
  el.peelFill.style.width = `${Math.min(100, peel * 100)}%`;
}

function updateHud() {
  el.money.textContent = isAdmin() ? `${formatMoney(STATE.money)}` : formatMoney(STATE.money);
  el.combo.textContent = `x${STATE.combo.toFixed(2)}`;
  syncAdminUi();
  updateHudForTable();
}

function updatePrompt() {
  if (!el.menu.classList.contains("hidden") || !el.manual.classList.contains("hidden")) {
    el.prompt.classList.remove("show");
    return;
  }
  const t = getLookTarget();
  let msg = "";
  if (isHolding()) {
    const n = heldCount();
    const finished = STATE.held.some((p) => p.userData.finished);
    if (finished) {
      msg =
        t?.type === "water" || nearWater()
          ? `E / Sol Tık — suya at (+para · ${n})`
          : `${n} soyulmuş elde · suya bakıp E`;
    } else if (t?.type === "peelPad") msg = `E / Sol Tık — baktığın yere koy (${n} elde)`;
    else if (t?.type === "leftTray") msg = `E / Sol Tık — sol rafa koy (${n})`;
    else msg = `${n} patates elde · soyma / sol rafa bak · F bırak`;
  } else if (t?.type === "potato") {
    const name = t.obj.userData.type.name;
    if (t.obj.userData.pile) msg = "E / Sol Tık — dağdan patates al";
    else if (t.obj.userData.crate || t.obj.userData.side === "crate")
      msg = "E / Sol Tık — kasadan soyulmuş al · suya at";
    else if (t.obj.userData.side === "left") msg = `E / Sol Tık — ${name} al`;
    else if (t.obj === STATE.tablePotato) msg = STATE.knifeOut ? "WASD çevir · Sol tık bıçakla soy" : "Q — patatesi havaya al / bıçak";
    else msg = `E / Sol Tık — ${name} tut`;
  } else if (
    STATE.tablePotato &&
    (STATE.knifeOut ||
      camera.position.distanceTo(new THREE.Vector3(LAYOUT.peelX, 1.2, LAYOUT.peelZ)) < 3.4)
  ) {
    msg = STATE.knifeOut ? "WASD: sınırsız çevir · Sol tık: hızlı soy" : "Q — patatesi havaya al ve soy";
  } else if (t?.type === "dogBowl" || nearDogBowl()) {
    if (isAdmin()) {
      msg = "Admin · köpek hiç acıkmaz · minder / mama kabı";
    } else if (isDogHungry() || PUPPY.state === "hungry" || PUPPY.state === "toBowl" || PUPPY.state === "eating") {
      msg =
        (STATE.dogFood | 0) > 0
          ? `E — mama ver (stok ${STATE.dogFood})`
          : "Mama yok · dükkandan köpek maması al";
    } else {
      const mins = dogHungerMinutesLeft();
      msg = `Köpek tok · ~${Math.ceil(mins)} dk sonra acıkır · mama ${STATE.dogFood | 0}`;
    }
  } else if (t?.type === "shop" || nearShop()) {
    msg = "E — dükkana gir (yükseltme satın al)";
  } else if (t?.type === "water") {
    msg = "Soyulmuş patatesi buraya at";
  } else if (t?.type === "leftTray") {
    msg = "E — sol raftan patates al";
  }

  el.prompt.textContent = msg;
  el.prompt.classList.toggle("show", !!msg);
  el.crosshair.classList.toggle("hot", !!msg);
}

/* ---------- movement ---------- */
function getGroundHeight(x, z) {
  let h = 0;
  for (const p of PLATFORMS) {
    if (x >= p.minx && x <= p.maxx && z >= p.minz && z <= p.maxz) h = Math.max(h, p.y);
  }
  return h;
}

function tryMove(dx, dz) {
  const pos = controls.getObject().position;
  const feetY = pos.y - PLAYER.eye;
  const next = pos.clone();
  next.x += dx;
  next.z += dz;
  next.x = Math.max(-14, Math.min(12, next.x));
  next.z = Math.max(-3.2, Math.min(16, next.z));
  if (!collides(next.x, pos.z, feetY)) pos.x = next.x;
  if (!collides(pos.x, next.z, feetY)) pos.z = next.z;
}

function collides(x, z, feetY = 0) {
  const r = PLAYER.radius;
  for (const c of worldColliders) {
    // jump / stand over low obstacles once feet clear the top
    if (feetY + 0.12 >= c.max.y) continue;
    if (x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return true;
  }
  return false;
}

function updatePlayerVertical(dt) {
  const pos = controls.getObject().position;
  if (KEYS.Space && playerOnGround && controls.isLocked && !anyOverlayOpen() && !STATE.knifeOut) {
    playerVy = PLAYER.jumpSpeed;
    playerOnGround = false;
  }

  playerVy -= PLAYER.gravity * dt;
  let feet = pos.y - PLAYER.eye + playerVy * dt;
  const ground = getGroundHeight(pos.x, pos.z);

  // step-up onto nearby platforms while rising / close above
  let landY = ground;
  if (playerVy <= 0) {
    for (const p of PLATFORMS) {
      const over =
        pos.x >= p.minx - 0.05 &&
        pos.x <= p.maxx + 0.05 &&
        pos.z >= p.minz - 0.05 &&
        pos.z <= p.maxz + 0.05;
      if (!over) continue;
      if (feet <= p.y + 0.18 && feet >= p.y - 0.35) landY = Math.max(landY, p.y);
    }
  }

  if (feet <= landY) {
    feet = landY;
    playerVy = 0;
    playerOnGround = true;
  } else {
    playerOnGround = false;
  }
  pos.y = feet + PLAYER.eye;
}

/* ---------- shop ---------- */
function openShop() {
  el.shop.classList.remove("hidden");
  el.menu.classList.add("hidden");
  el.manual.classList.add("hidden");
  if (controls.isLocked) controls.unlock();
  renderShop();
}

function closeShop() {
  el.shop.classList.add("hidden");
}

function featureCategory(feat) {
  return feat.cat || FEATURE_CAT[feat.id] || "features";
}

function setShopTab(tab) {
  shopTab = tab;
  if (el.shopTabs) {
    el.shopTabs.querySelectorAll(".shop-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
  }
  renderShop();
}

function adminSelectLevel(id, lv, { equip = false } = {}) {
  setLevel(id, lv);
  if (equip && lv > 0) STATE.equipped = id;
  if (equip && lv <= 0) STATE.equipped = "starter";
  if (id === "puppy" && PUPPY?.mesh) {
    PUPPY.mesh.visible = true;
    if (lv > 0) {
      PUPPY.state = "toPile";
      PUPPY.timer = 0;
      PUPPY.mesh.rotation.x = 0;
    } else {
      PUPPY.state = "nap";
      PUPPY.timer = 1e9;
    }
  }
  refreshEquippedToolMesh();
  updateHud();
  renderShop();
  const name =
    TOOLS.find((t) => t.id === id)?.name || FEATURES.find((f) => f.id === id)?.name || id;
  toast(`ADMIN · ${name} → Lv${lv}${equip ? " (takıldı)" : ""}`);
}

function renderAdminLevelButtons(id, currentLv, { equipOnPick = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "shop-level-row";
  for (let lv = 0; lv <= 3; lv++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = lv === 0 ? "Kapalı" : `Lv${lv}`;
    if (currentLv === lv) btn.classList.add("active-lv");
    btn.addEventListener("click", () => adminSelectLevel(id, lv, { equip: equipOnPick }));
    wrap.appendChild(btn);
  }
  return wrap;
}

function renderShopFeatureRow(feat) {
  const lv = getLevel(feat.id);
  const next = lv < 3 ? feat.levels[lv] : null;
  const cur = lv > 0 ? feat.levels[lv - 1] : null;
  const canBuy = next && STATE.money >= next.price - 1e-9;
  const row = document.createElement("div");
  row.className = `shop-item${lv > 0 ? " owned" : ""}`;
  if (isAdmin()) {
    row.innerHTML = `
      <div>
        <h3>${feat.name}</h3>
        <p>${feat.blurb} · ${cur ? `Şu an: ${cur.label} (Lv${lv}/3)` : "Kapalı"}</p>
      </div>`;
    const side = document.createElement("div");
    side.innerHTML = `<div class="price">Ücretsiz seç</div>`;
    side.appendChild(renderAdminLevelButtons(feat.id, lv));
    row.appendChild(side);
  } else {
    row.innerHTML = `
      <div>
        <h3>${feat.name}</h3>
        <p>${feat.blurb} · ${cur ? `Şu an: ${cur.label} (Lv${lv}/3)` : "Lv0/3"}</p>
      </div>
      <div>
        <div class="price">${next ? `${next.label} · ${formatMoney(next.price)}` : "MAX"}</div>
        <button type="button" ${!next || !canBuy ? "disabled" : ""}>${
          !next ? "Maksimum" : canBuy ? (lv === 0 ? "Satın al" : `Yükselt Lv${lv + 1}`) : "Yetersiz"
        }</button>
      </div>`;
    const btn = row.querySelector("button");
    if (next && canBuy) btn.addEventListener("click", () => buyFeatureLevel(feat.id));
  }
  el.shopList.appendChild(row);
}

function renderShop() {
  el.shopMoney.textContent = isAdmin() ? `ADMIN · ${formatMoney(STATE.money)}` : formatMoney(STATE.money);
  syncAdminUi();
  el.shopList.innerHTML = "";

  if (isAdmin()) {
    const tip = document.createElement("div");
    tip.className = "shop-item owned";
    tip.innerHTML = `
      <div>
        <h3>Sandbox kontrolleri</h3>
        <p>Otomatik soyma ve köpek işi varsayılan kapalı · dükkandan seçerek aç</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button type="button" class="admin-max">Araç + özellik Lv3</button>
        <button type="button" class="admin-auto">Otomasyonu da aç</button>
        <button type="button" class="admin-reset">Hepsini kapat</button>
      </div>`;
    tip.querySelector(".admin-max").addEventListener("click", () => {
      applyAdminSandbox();
      renderShop();
      toast("ADMIN · alet/özellik Lv3 · auto+köpek kapalı");
    });
    tip.querySelector(".admin-auto").addEventListener("click", () => {
      for (const t of TOOLS) STATE.levels[t.id] = 3;
      for (const f of FEATURES) STATE.levels[f.id] = 3;
      STATE.dogFood = 99;
      if (PUPPY) {
        PUPPY.state = "toPile";
        PUPPY.timer = 0;
      }
      refreshEquippedToolMesh();
      updateHud();
      renderShop();
      toast("ADMIN · otomasyon + köpek açık");
    });
    tip.querySelector(".admin-reset").addEventListener("click", () => {
      STATE.levels = {};
      STATE.equipped = "starter";
      if (PUPPY) {
        PUPPY.state = "nap";
        PUPPY.timer = 1e9;
      }
      refreshEquippedToolMesh();
      updateHud();
      renderShop();
      toast("ADMIN · tüm yükseltmeler kapalı");
    });
    el.shopList.appendChild(tip);
  }

  if (shopTab === "tools") {
    const eq = getEquippedToolStats();
    const equipBar = document.createElement("div");
    equipBar.className = "shop-item owned";
    equipBar.innerHTML = `
      <div>
        <h3>Aktif alet: ${eq.name}${eq.level ? ` · Lv${eq.level}` : ""}</h3>
        <p>Alan ${eq.radius.toFixed(1)} · Hız x${eq.speed.toFixed(2)} · Hasar x${eq.damage.toFixed(2)}</p>
      </div>
      <div>
        <div class="price">${isAdmin() ? "Ücretsiz tak" : "Başlangıç bıçağı zayıf"}</div>
        <button type="button" data-equip="starter">${STATE.equipped === "starter" ? "Kullanımda" : "Tak"}</button>
      </div>`;
    const starterBtn = equipBar.querySelector("button");
    starterBtn.disabled = STATE.equipped === "starter";
    starterBtn.addEventListener("click", () => {
      STATE.equipped = "starter";
      refreshEquippedToolMesh();
      saveProgress();
      renderShop();
      toast("Eski mutfak bıçağı takıldı");
    });
    el.shopList.appendChild(equipBar);

    const toolsTitle = document.createElement("div");
    toolsTitle.className = "shop-item";
    toolsTitle.innerHTML = `<div><h3>Manuel Aletler</h3><p>${
      isAdmin() ? "Lv seç + otomatik tak" : "3 bıçak + 1 soyacak · her biri Lv1–Lv3"
    }</p></div>`;
    el.shopList.appendChild(toolsTitle);

    for (const tool of TOOLS) {
      const lv = getLevel(tool.id);
      const next = lv < 3 ? tool.levels[lv] : null;
      const cur = lv > 0 ? tool.levels[lv - 1] : null;
      const canBuy = next && STATE.money >= next.price - 1e-9;
      const equipped = STATE.equipped === tool.id;
      const row = document.createElement("div");
      row.className = `shop-item${lv > 0 ? " owned" : ""}`;
      const stats = cur
        ? `Lv${lv}/3 · Alan ${cur.radius} · Hız x${cur.speed} · Hasar x${cur.damage}`
        : `Lv0/3 · Henüz yok · ${tool.blurb}`;

      if (isAdmin()) {
        row.innerHTML = `
          <div>
            <h3>${tool.name}${equipped ? " · takılı" : ""}</h3>
            <p>${stats}</p>
          </div>`;
        const side = document.createElement("div");
        side.innerHTML = `<div class="price">Seviye seç</div>`;
        side.appendChild(renderAdminLevelButtons(tool.id, lv, { equipOnPick: true }));
        row.appendChild(side);
      } else {
        row.innerHTML = `
          <div>
            <h3>${tool.name}</h3>
            <p>${stats}</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
            <div class="price">${next ? `Sonraki: ${formatMoney(next.price)}` : "MAX"}</div>
            <button type="button" class="buy" ${!next || !canBuy ? "disabled" : ""}>${
              !next ? "Maksimum" : canBuy ? (lv === 0 ? "Satın al Lv1" : `Yükselt Lv${lv + 1}`) : "Yetersiz"
            }</button>
            <button type="button" class="equip" ${lv <= 0 ? "disabled" : ""}>${equipped ? "Kullanımda" : "Tak"}</button>
          </div>`;
        const buyBtn = row.querySelector(".buy");
        const equipBtn = row.querySelector(".equip");
        if (next && canBuy) buyBtn.addEventListener("click", () => buyToolLevel(tool.id));
        if (lv > 0) {
          equipBtn.disabled = equipped;
          equipBtn.addEventListener("click", () => {
            STATE.equipped = tool.id;
            refreshEquippedToolMesh();
            saveProgress();
            renderShop();
            toast(`${tool.name} takıldı`);
          });
        }
      }
      el.shopList.appendChild(row);
    }
    return;
  }

  if (shopTab === "features") {
    const title = document.createElement("div");
    title.className = "shop-item";
    title.innerHTML = `<div><h3>Oyuncu Özellikleri</h3><p>${
      isAdmin() ? "Ücretsiz seviye seç" : "Kapasite, hız, satış ve eğitim"
    }</p></div>`;
    el.shopList.appendChild(title);
    for (const feat of FEATURES) {
      if (featureCategory(feat) !== "features") continue;
      renderShopFeatureRow(feat);
    }
    return;
  }

  // auto
  const autoTitle = document.createElement("div");
  autoTitle.className = "shop-item";
  autoTitle.innerHTML = `<div><h3>Otomasyon</h3><p>Makine · Yavru köpek zaten sahada (yükseltince hızlanır)</p></div>`;
  el.shopList.appendChild(autoTitle);

  const foodRow = document.createElement("div");
  foodRow.className = "shop-item owned";
  const canFood = isAdmin() || STATE.money >= DOG_FOOD_PRICE - 1e-9;
  const hungryHint = isAdmin()
    ? " · acıkma kapalı"
    : isDogHungry()
      ? " · ACİKTI!"
      : ` · ~${Math.ceil(dogHungerMinutesLeft())} dk tok`;
  foodRow.innerHTML = `
    <div>
      <h3>Köpek Maması</h3>
      <p>${
        isAdmin()
          ? `Test stoku · köpek acıkmaz · stok: <strong>${STATE.dogFood | 0}</strong>`
          : `Yarım saatte bir acıkır · havlar · kabından besle · stok: <strong>${STATE.dogFood | 0}</strong>${hungryHint}`
      }</p>
    </div>
    <div>
      <div class="price">${isAdmin() ? "Ücretsiz" : `${formatMoney(DOG_FOOD_PRICE)} / paket`}</div>
      <button type="button" class="buy1" ${!canFood ? "disabled" : ""}>${isAdmin() ? "+1 mama" : "1 paket al"}</button>
      <button type="button" class="buy3" ${
        isAdmin() || STATE.money >= DOG_FOOD_PRICE * 3 - 1e-9 ? "" : "disabled"
      } style="margin-top:6px">${isAdmin() ? "+3 mama" : "3 paket"}</button>
    </div>`;
  foodRow.querySelector(".buy1").addEventListener("click", () => buyDogFood(1));
  foodRow.querySelector(".buy3").addEventListener("click", () => buyDogFood(3));
  el.shopList.appendChild(foodRow);

  for (const feat of FEATURES) {
    if (featureCategory(feat) !== "auto") continue;
    renderShopFeatureRow(feat);
  }
}

function buyToolLevel(id) {
  if (isAdmin()) {
    adminSelectLevel(id, Math.min(3, getLevel(id) + 1 || 3), { equip: true });
    return;
  }
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return;
  const lv = getLevel(id);
  if (lv >= 3) return;
  const next = tool.levels[lv];
  if (STATE.money < next.price) {
    toast("Bütçe yetersiz", true);
    return;
  }
  STATE.money = Math.round((STATE.money - next.price) * 100) / 100;
  setLevel(id, lv + 1);
  STATE.equipped = id;
  refreshEquippedToolMesh();
  saveProgress();
  updateHud();
  renderShop();
  toast(`${tool.name} Lv${lv + 1} alındı`);
}

function buyFeatureLevel(id) {
  if (isAdmin()) {
    adminSelectLevel(id, Math.min(3, getLevel(id) + 1 || 3));
    return;
  }
  const feat = FEATURES.find((f) => f.id === id);
  if (!feat) return;
  const lv = getLevel(id);
  if (lv >= 3) return;
  const next = feat.levels[lv];
  if (STATE.money < next.price) {
    toast("Bütçe yetersiz", true);
    return;
  }
  STATE.money = Math.round((STATE.money - next.price) * 100) / 100;
  setLevel(id, lv + 1);
  if (id === "puppy") {
    PUPPY.state = PUPPY.state === "nap" ? "nap" : "toPile";
    if (PUPPY.mesh) PUPPY.mesh.visible = true;
  }
  saveProgress();
  updateHud();
  renderShop();
  toast(`${feat.name} Lv${lv + 1}`);
}

/* ---------- menus ---------- */
function anyOverlayOpen() {
  return (
    !el.menu.classList.contains("hidden") ||
    !el.manual.classList.contains("hidden") ||
    !el.startScreen.classList.contains("hidden") ||
    !el.shop.classList.contains("hidden")
  );
}

function toggleMenu(force) {
  const show = force === undefined ? el.menu.classList.contains("hidden") : force;
  el.menu.classList.toggle("hidden", !show);
  if (show) {
    el.manual.classList.add("hidden");
    el.shop.classList.add("hidden");
    saveProgress(true);
    updateSaveLabels(Date.now());
    if (controls.isLocked) controls.unlock();
  }
}

function toggleManual(force) {
  const show = force === undefined ? el.manual.classList.contains("hidden") : force;
  el.manual.classList.toggle("hidden", !show);
  if (show) {
    el.menu.classList.add("hidden");
    el.shop.classList.add("hidden");
    if (controls.isLocked) controls.unlock();
  }
}

function toggleSettingsPanel(force) {
  if (!el.settingsPanel) return;
  const show =
    force === undefined ? el.settingsPanel.classList.contains("hidden") : force;
  el.settingsPanel.classList.toggle("hidden", !show);
  if (show) {
    el.menu.classList.remove("hidden");
    el.manual.classList.add("hidden");
    el.shop.classList.add("hidden");
    el.startScreen.classList.add("hidden");
    if (controls.isLocked) controls.unlock();
  }
}

function resumeGame() {
  saveProgress(true);
  gameStarted = true;
  el.menu.classList.add("hidden");
  el.manual.classList.add("hidden");
  el.shop.classList.add("hidden");
  el.startScreen.classList.add("hidden");
  if (el.settingsPanel) el.settingsPanel.classList.add("hidden");
  controls.lock();
}

function goToStartScreen() {
  saveProgress(true);
  gameStarted = false;
  el.menu.classList.add("hidden");
  el.manual.classList.add("hidden");
  el.shop.classList.add("hidden");
  if (el.settingsPanel) el.settingsPanel.classList.add("hidden");
  el.startScreen.classList.remove("hidden");
  if (controls.isLocked) controls.unlock();
  updateSaveLabels(Date.now());
}

function quitToTitle() {
  saveProgress(false);
  setKnife(false);
  goToStartScreen();
}

/* ---------- input ---------- */
window.addEventListener("keydown", (e) => {
  KEYS[e.code] = true;
  if (e.code === "Space" && controls.isLocked) e.preventDefault();
  if (e.code === "KeyH" || e.key === "?") toggleManual();
  if (e.code === "KeyM") toggleMenu();
  if (e.code === "Escape") {
    if (!el.shop.classList.contains("hidden")) closeShop();
    else if (!el.manual.classList.contains("hidden")) toggleManual(false);
    else toggleMenu();
    return;
  }
  if (anyOverlayOpen() && e.code !== "KeyH" && e.code !== "KeyM") return;

  if (e.code === "KeyE") interact();
  if (e.code === "KeyF") dropHeld();
  if (e.code === "KeyQ") {
    if (STATE.tablePotato && !isHolding()) setKnife(!STATE.knifeOut);
    else if (!STATE.tablePotato) toast("Önce masaya patates koy", true);
  }
  if (e.code === "KeyR" && STATE.tablePotato) {
    STATE.tablePotato.rotation.y += Math.PI / 4;
    toast("Patates döndürüldü");
  }
});

window.addEventListener("keyup", (e) => {
  KEYS[e.code] = false;
});

document.addEventListener("mousedown", (e) => {
  if (!controls.isLocked) return;
  if (e.button === 0) {
    if (STATE.knifeOut && STATE.tablePotato) {
      peelDragging = true;
      // mouse moves the knife tip (not camera look)
      controls.pointerSpeed = 0;
      peelAtTip();
    } else {
      interact();
    }
  }
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    peelDragging = false;
    if (!STATE.knifeOut) controls.pointerSpeed = getLookSpeed();
    else controls.pointerSpeed = getLookSpeed(); // look free again when not cutting
  }
});

document.addEventListener("mousemove", (e) => {
  if (!controls.isLocked || !peelDragging || !STATE.knifeOut || !STATE.tablePotato) return;
  // left-drag moves knife tip freely over the floating potato
  STATE.knifeAim.x = THREE.MathUtils.clamp(STATE.knifeAim.x + e.movementX * 0.0032, -0.62, 0.62);
  STATE.knifeAim.y = THREE.MathUtils.clamp(STATE.knifeAim.y - e.movementY * 0.0032, -0.42, 0.5);
  updateKnifeCursorPos();
  peelAtTip();
});

el.btnStart.addEventListener("click", () => enterNormalMode({ resume: true }));
if (el.btnStartAdmin) {
  el.btnStartAdmin.addEventListener("click", () => enterAdminMode({ resume: true }));
}
if (el.btnAdminToggle) {
  el.btnAdminToggle.addEventListener("click", () => {
    if (isAdmin()) enterNormalMode({ resume: false });
    else enterAdminMode({ resume: false });
  });
}
if (el.btnStartSettings) {
  el.btnStartSettings.addEventListener("click", () => {
    el.startScreen.classList.add("hidden");
    toggleMenu(true);
    toggleSettingsPanel(true);
  });
}
el.btnManual.addEventListener("click", () => toggleManual(true));
el.btnMenu.addEventListener("click", () => toggleMenu(true));
el.manualClose.addEventListener("click", () => toggleManual(false));
el.menuClose.addEventListener("click", () => {
  if (gameStarted) resumeGame();
  else goToStartScreen();
});
el.btnResume.addEventListener("click", () => resumeGame());
if (el.btnMenuStart) {
  el.btnMenuStart.addEventListener("click", () => {
    if (gameStarted) goToStartScreen();
    else resumeGame();
  });
}
if (el.btnMenuSettings) el.btnMenuSettings.addEventListener("click", () => toggleSettingsPanel(true));
if (el.btnQuit) el.btnQuit.addEventListener("click", () => quitToTitle());
el.btnOpenManual.addEventListener("click", () => {
  toggleMenu(false);
  toggleManual(true);
});
el.shopClose.addEventListener("click", () => closeShop());
el.shop.addEventListener("click", (e) => {
  if (e.target === el.shop) closeShop();
});
if (el.shopTabs) {
  el.shopTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".shop-tab");
    if (!btn?.dataset?.tab) return;
    setShopTab(btn.dataset.tab);
  });
}

window.addEventListener("beforeunload", () => {
  saveProgress(true);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveProgress(true);
});
setInterval(() => {
  if (saveDirty || performance.now() - lastAutoSave > 12000) saveProgress(true);
}, 4000);

el.sensSlider.addEventListener("input", () => {
  applySensitivity(Number(el.sensSlider.value));
  saveProgress(true);
});
applySensitivity(SETTINGS.sensitivity);

controls.addEventListener("lock", () => {
  el.startScreen.classList.add("hidden");
  el.menu.classList.add("hidden");
  el.manual.classList.add("hidden");
  el.shop.classList.add("hidden");
});

controls.addEventListener("unlock", () => {
  peelDragging = false;
  controls.pointerSpeed = getLookSpeed();
  if (
    el.menu.classList.contains("hidden") &&
    el.manual.classList.contains("hidden") &&
    el.shop.classList.contains("hidden") &&
    el.startScreen.classList.contains("hidden")
  ) {
    el.prompt.textContent = "Tıkla — kilitle · Esc menü · E dükkan";
    el.prompt.classList.add("show");
  }
});

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyDisplayQuality();
});

document.addEventListener(
  "mousemove",
  () => {
    if (!controls.isLocked || anyOverlayOpen()) return;
    // during peel-drag look is disabled; skip extra render cost
    if (STATE.knifeOut && peelDragging) return;
    scheduleLookRender();
  },
  { passive: true }
);

canvas.addEventListener("click", () => {
  if (
    !controls.isLocked &&
    el.menu.classList.contains("hidden") &&
    el.manual.classList.contains("hidden") &&
    el.shop.classList.contains("hidden")
  ) {
    controls.lock();
  }
});

/* ---------- loop ---------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (controls.isLocked && !anyOverlayOpen()) {
    if (STATE.knifeOut && STATE.tablePotato) {
      // during peel mode WASD rotates the floating potato
      rotatePotatoWithWASD(dt);
    } else {
      const sprint = KEYS.ShiftLeft || KEYS.ShiftRight;
      const speed = (sprint ? PLAYER.sprint : PLAYER.speed) * getSpeedMult() * dt;
      let forward = 0;
      let side = 0;
      if (KEYS.KeyW) forward += 1;
      if (KEYS.KeyS) forward -= 1;
      if (KEYS.KeyA) side -= 1;
      if (KEYS.KeyD) side += 1;
      if (forward || side) {
        const len = Math.hypot(forward, side) || 1;
        forward /= len;
        side /= len;
        const dir = new THREE.Vector3();
        controls.getDirection(dir);
        dir.y = 0;
        dir.normalize();
        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        tryMove(dir.x * forward * speed + right.x * side * speed, dir.z * forward * speed + right.z * side * speed);
      }
    }
    updatePlayerVertical(dt);
  }

  STATE.knifeHeat = Math.max(0, STATE.knifeHeat - dt * 0.25);
  animateKnife(dt, peelDragging && STATE.knifeOut && !!STATE.tablePotato);
  updateFloatingPotatoes(dt);
  updateAutoPeeler(dt);
  updatePuppy(dt);

  if (STATE.comboTimer > 0) {
    STATE.comboTimer -= dt;
    if (STATE.comboTimer <= 0) {
      STATE.combo = Math.max(1, STATE.combo - 0.25);
      if (STATE.combo > 1) STATE.comboTimer = 8;
    }
  }

  if (STATE.toastTimer > 0) {
    STATE.toastTimer -= dt;
    if (STATE.toastTimer <= 0) el.toast.classList.remove("show");
  }

  for (const hp of STATE.held) hp.rotation.y += dt * 0.55;

  promptAccum += dt;
  if (promptAccum >= 0.12) {
    promptAccum = 0;
    updatePrompt();
  }
  const comboStr = `x${STATE.combo.toFixed(2)}`;
  if (comboStr !== lastComboDrawn) {
    lastComboDrawn = comboStr;
    el.combo.textContent = comboStr;
  }
  if (!document.hidden) renderer.render(scene, camera);
}

function updateAutoPeeler(dt) {
  const rate = getAutoPeelRate();
  if (!rate || !STATE.tablePotato || STATE.tablePotato.userData.finished) return;
  const potato = STATE.tablePotato;
  // peel random unpeeled cells over time
  const cells = potato.userData.cells;
  const unpeeled = [];
  for (let i = 0; i < CELL_COUNT; i++) if (!cells[i]) unpeeled.push(i);
  if (!unpeeled.length) {
    finishPotato(potato);
    return;
  }
  const n = Math.max(1, Math.floor(rate * 18 * dt));
  for (let k = 0; k < n && unpeeled.length; k++) {
    const pick = (Math.random() * unpeeled.length) | 0;
    const idx = unpeeled.splice(pick, 1)[0];
    peelCell(potato, idx);
  }
  updatePotatoVisual(potato);
  updateHudForTable();
  if (peelProgress(potato) >= 1) finishPotato(potato);
}

/* ---------- puppy worker ---------- */
const PUPPY = {
  mesh: null,
  bed: null,
  bowl: null,
  state: "idle",
  timer: 0,
  barkTimer: 0,
  peeledInShift: 0,
  potato: null,
  bob: 0,
  napPos: new THREE.Vector3(-4.6, 0, 3.85),
  bowlPos: new THREE.Vector3(-3.7, 0, 3.85),
  peelPos: new THREE.Vector3(LAYOUT.peelX - LAYOUT.peelW * 0.35, 0, LAYOUT.peelZ + LAYOUT.peelD * 0.55 + 0.35),
  waterPos: new THREE.Vector3(LAYOUT.waterX, 0, 0.75),
  label: null,
  resumeAfterFeed: "toPile",
};

function isDogHungry() {
  if (isAdmin()) return false;
  return Date.now() - (STATE.lastFedAt || 0) >= DOG_HUNGER_MS;
}

function dogHungerMinutesLeft() {
  const left = DOG_HUNGER_MS - (Date.now() - (STATE.lastFedAt || 0));
  return Math.max(0, left / 60000);
}

function barkDog() {
  toast("🐕 Hav hav! · Köpek acıktı — mama kabına bak", true);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(420, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* audio optional */
  }
}

function buyDogFood(count = 1) {
  const n = Math.max(1, count | 0);
  if (isAdmin()) {
    STATE.dogFood = (STATE.dogFood | 0) + n;
    updateHud();
    renderShop();
    toast(`ADMIN · mama +${n} · stok ${STATE.dogFood}`);
    return true;
  }
  const cost = Math.round(DOG_FOOD_PRICE * n * 100) / 100;
  if (STATE.money < cost) {
    toast("Mama için bütçe yetersiz", true);
    return false;
  }
  STATE.money = Math.round((STATE.money - cost) * 100) / 100;
  STATE.dogFood = (STATE.dogFood | 0) + n;
  saveProgress();
  updateHud();
  renderShop();
  toast(`Köpek maması x${n} · stok ${STATE.dogFood}`);
  return true;
}

function feedDog() {
  if (isAdmin()) {
    toast("Admin · köpek acıkmaz");
    return false;
  }
  if ((STATE.dogFood | 0) <= 0) {
    toast("Mama yok — dükkandan al", true);
    return false;
  }
  if (!isDogHungry() && PUPPY.state !== "hungry" && PUPPY.state !== "toBowl") {
    toast("Köpek şimdilik tok", true);
    return false;
  }
  STATE.dogFood -= 1;
  STATE.lastFedAt = Date.now();
  // drop work potato if any
  if (PUPPY.potato) {
    const p = puppyDropPotatoWorld();
    if (p) {
      p.position.set(PUPPY.bowlPos.x, 0.2, PUPPY.bowlPos.z + 0.4);
      if (!interactables.includes(p)) interactables.push(p);
    }
  }
  PUPPY.state = "eating";
  PUPPY.timer = 3.2;
  saveProgress();
  toast(`Mama verildi · kalan ${STATE.dogFood}`);
  return true;
}

function buildDogCorner() {
  const bedX = PUPPY.napPos.x;
  const bedZ = PUPPY.napPos.z;
  // soft oval bed / minder
  const bed = new THREE.Group();
  const cushion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.45, 0.08, 20),
    makeMat(0x6b4a8a, { roughness: 0.95 })
  );
  cushion.position.y = 0.04;
  bed.add(cushion);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.07, 8, 20),
    makeMat(0x4a3266, { roughness: 0.9 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.08;
  bed.add(rim);
  const pillow = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    makeMat(0x8a6aaa, { roughness: 0.92 })
  );
  pillow.scale.set(1.3, 0.55, 1);
  pillow.position.set(0, 0.12, -0.18);
  bed.add(pillow);
  bed.position.set(bedX, 0, bedZ);
  bed.userData.kind = "dogBed";
  scene.add(bed);
  PUPPY.bed = bed;

  // food bowl
  const bowl = new THREE.Group();
  const bowlMat = makeMat(0xb0b6bc, { roughness: 0.35, metalness: 0.55 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.06, 16), bowlMat);
  base.position.y = 0.03;
  bowl.add(base);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.15, 0.08, 16, 1, true),
    bowlMat
  );
  wall.position.y = 0.08;
  bowl.add(wall);
  const food = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12),
    makeMat(0x8a5a28, { roughness: 1 })
  );
  food.position.y = 0.06;
  food.name = "foodPile";
  food.visible = false;
  bowl.add(food);
  bowl.position.copy(PUPPY.bowlPos);
  bowl.userData.kind = "dogBowl";
  scene.add(bowl);
  PUPPY.bowl = bowl;

  scene.add(makeWorldLabel("MİNDER · MAMA", bedX + 0.4, 0.95, bedZ));
}

function buildPuppy() {
  buildDogCorner();

  const g = new THREE.Group();
  const fur = makeMat(0xb07a45, { roughness: 0.9 });
  const dark = makeMat(0x5a3a22, { roughness: 0.85 });
  const nose = makeMat(0x1a1410, { roughness: 0.6 });
  const cream = makeMat(0xe8d2b0, { roughness: 0.88 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), fur);
  body.scale.set(1.15, 0.85, 1.35);
  body.position.set(0, 0.22, 0);
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), cream);
  belly.scale.set(0.9, 0.7, 1.1);
  belly.position.set(0, 0.16, 0.02);
  g.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), fur);
  head.position.set(0, 0.34, 0.2);
  g.add(head);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), cream);
  snout.scale.set(0.9, 0.75, 1.2);
  snout.position.set(0, 0.3, 0.3);
  g.add(snout);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), nose);
  noseTip.position.set(0, 0.3, 0.36);
  g.add(noseTip);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), dark);
    ear.position.set(sx * 0.09, 0.44, 0.16);
    ear.rotation.z = sx * 0.35;
    ear.rotation.x = 0.2;
    g.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), nose);
    eye.position.set(sx * 0.045, 0.36, 0.3);
    g.add(eye);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.16, 8), fur);
    leg.position.set(sx * 0.08, 0.08, 0.06);
    leg.name = sx < 0 ? "legL" : "legR";
    g.add(leg);

    const backLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.16, 8), fur);
    backLeg.position.set(sx * 0.08, 0.08, -0.1);
    backLeg.name = sx < 0 ? "legBL" : "legBR";
    g.add(backLeg);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.012, 0.14, 6), fur);
  tail.position.set(0, 0.26, -0.22);
  tail.rotation.x = 0.9;
  tail.name = "tail";
  g.add(tail);

  g.scale.setScalar(1.45);
  g.position.copy(PUPPY.napPos);
  g.position.y = 0.06;
  g.visible = true;
  scene.add(g);
  PUPPY.mesh = g;
  PUPPY.label = makeWorldLabel("YAVRU İŞÇİ KÖPEK", PUPPY.napPos.x, 1.25, PUPPY.napPos.z);
  scene.add(PUPPY.label);
}

function puppySpeed() {
  // always works; shop upgrades only speed
  const boost = getLevel("puppy") > 0 ? getFeatureValue("puppy", 1) : 1;
  return 1.65 * boost;
}

function puppyFace(dx, dz) {
  if (!PUPPY.mesh || (dx === 0 && dz === 0)) return;
  PUPPY.mesh.rotation.y = Math.atan2(dx, dz);
}

function puppyWalkToward(target, dt, speed) {
  const m = PUPPY.mesh;
  const dx = target.x - m.position.x;
  const dz = target.z - m.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.12) {
    m.position.x = target.x;
    m.position.z = target.z;
    return true;
  }
  const step = Math.min(dist, speed * dt);
  m.position.x += (dx / dist) * step;
  m.position.z += (dz / dist) * step;
  puppyFace(dx, dz);
  PUPPY.bob += dt * 10;
  const legs = ["legL", "legR", "legBL", "legBR"].map((n) => m.getObjectByName(n));
  legs.forEach((leg, i) => {
    if (leg) leg.rotation.x = Math.sin(PUPPY.bob + i) * 0.45;
  });
  const tail = m.getObjectByName("tail");
  if (tail) tail.rotation.z = Math.sin(PUPPY.bob * 1.4) * 0.5;
  m.position.y = Math.abs(Math.sin(PUPPY.bob * 0.5)) * 0.02;
  return false;
}

function puppyAttachPotato(p) {
  PUPPY.potato = p;
  PUPPY.mesh.attach(p);
  p.position.set(0.12, 0.28, 0.22);
  p.scale.setScalar(0.75);
  p.rotation.set(0.4, 0.6, 0.2);
}

function puppyDropPotatoWorld() {
  const p = PUPPY.potato;
  if (!p) return null;
  scene.attach(p);
  p.scale.setScalar(1);
  PUPPY.potato = null;
  return p;
}

function puppyPickPotato() {
  if (!pileMeshes.length) {
    spawnPilePotato();
  }
  if (!pileMeshes.length) return false;
  // nearest to puppy
  let best = pileMeshes[0];
  let bestD = Infinity;
  for (const p of pileMeshes) {
    const d = PUPPY.mesh.position.distanceTo(p.position);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  const playable = takeFromPile(best);
  puppyAttachPotato(playable);
  return true;
}

function setBowlFoodVisible(on) {
  const food = PUPPY.bowl?.getObjectByName("foodPile");
  if (food) food.visible = !!on;
}

function updatePuppy(dt) {
  if (!PUPPY.mesh) return;
  PUPPY.mesh.visible = true;

  // admin: puppy stays on bed until you explicitly select Köpek Lv in shop (manual testing)
  if (isAdmin() && getLevel("puppy") <= 0) {
    if (PUPPY.potato) {
      const p = puppyDropPotatoWorld();
      if (p) {
        p.position.set(PUPPY.mesh.position.x, 0.2, PUPPY.mesh.position.z + 0.35);
        if (!interactables.includes(p)) interactables.push(p);
      }
    }
    PUPPY.state = "nap";
    PUPPY.timer = 1e9;
    PUPPY.mesh.position.copy(PUPPY.napPos);
    PUPPY.mesh.position.y = 0.08;
    PUPPY.mesh.rotation.x = 0.15;
    return;
  }

  const spd = puppySpeed();

  // hunger interrupts work — bark every ~8s until fed
  if (isDogHungry() && PUPPY.state !== "eating" && PUPPY.state !== "toBowl" && PUPPY.state !== "hungry") {
    PUPPY.resumeAfterFeed =
      PUPPY.state === "nap" || PUPPY.state === "toNap" ? "toPile" : PUPPY.state === "idle" ? "toPile" : PUPPY.state;
    if (PUPPY.potato) {
      const p = puppyDropPotatoWorld();
      if (p) {
        p.position.set(PUPPY.mesh.position.x, 0.2, PUPPY.mesh.position.z + 0.35);
        if (!interactables.includes(p)) interactables.push(p);
      }
    }
    PUPPY.state = "toBowl";
  }

  if (isDogHungry() && (PUPPY.state === "hungry" || PUPPY.state === "toBowl")) {
    PUPPY.barkTimer -= dt;
    if (PUPPY.barkTimer <= 0) {
      barkDog();
      PUPPY.barkTimer = 8;
    }
  }

  if (PUPPY.state === "idle") {
    PUPPY.state = "toPile";
  }

  if (PUPPY.state === "toBowl") {
    if (puppyWalkToward(PUPPY.bowlPos, dt, spd * 0.9)) {
      PUPPY.state = "hungry";
      PUPPY.mesh.position.y = 0.02;
      puppyFace(PUPPY.bowlPos.x - PUPPY.mesh.position.x + 0.01, 0.2);
    }
    return;
  }

  if (PUPPY.state === "hungry") {
    PUPPY.mesh.position.y = 0.02;
    const tail = PUPPY.mesh.getObjectByName("tail");
    if (tail) tail.rotation.z = Math.sin(performance.now() * 0.012) * 0.55;
    return;
  }

  if (PUPPY.state === "eating") {
    setBowlFoodVisible(true);
    puppyWalkToward(PUPPY.bowlPos, dt, spd);
    PUPPY.timer -= dt;
    PUPPY.bob += dt * 12;
    PUPPY.mesh.position.y = 0.04;
    const headBob = Math.sin(PUPPY.bob) * 0.08;
    PUPPY.mesh.rotation.x = headBob;
    if (PUPPY.timer <= 0) {
      PUPPY.mesh.rotation.x = 0;
      setBowlFoodVisible(false);
      PUPPY.state = "toNap";
      toast("Köpek doydu · mindere gidiyor");
    }
    return;
  }

  if (PUPPY.state === "nap") {
    PUPPY.timer -= dt;
    PUPPY.mesh.position.copy(PUPPY.napPos);
    PUPPY.mesh.position.y = 0.08;
    PUPPY.mesh.rotation.x = 0.15;
    const tail = PUPPY.mesh.getObjectByName("tail");
    if (tail) tail.rotation.z = Math.sin(performance.now() * 0.003) * 0.15;
    if (PUPPY.timer <= 0) {
      PUPPY.mesh.rotation.x = 0;
      PUPPY.peeledInShift = 0;
      PUPPY.state = "toPile";
      toast("Yavru köpek uykudan kalktı");
    }
    return;
  }

  if (PUPPY.state === "toPile") {
    const center = PILE_CENTERS[0];
    const target = new THREE.Vector3(center.x, 0, center.z - 2.2);
    if (puppyWalkToward(target, dt, spd)) {
      if (puppyPickPotato()) PUPPY.state = "toPeel";
      else PUPPY.timer = 0.8;
    }
    return;
  }

  if (PUPPY.state === "toPeel") {
    if (puppyWalkToward(PUPPY.peelPos, dt, spd * 0.95)) {
      PUPPY.state = "peeling";
      PUPPY.timer = 0;
      // put potato in front while peeling
      if (PUPPY.potato) {
        scene.attach(PUPPY.potato);
        PUPPY.potato.position.set(PUPPY.peelPos.x + 0.25, 0.2, PUPPY.peelPos.z);
        PUPPY.potato.scale.setScalar(1);
      }
    }
    return;
  }

  if (PUPPY.state === "peeling") {
    const p = PUPPY.potato;
    if (!p) {
      PUPPY.state = "toPile";
      return;
    }
    PUPPY.timer += dt;
    const rate = 28 * getFeatureValue("puppy", 1);
    const cells = p.userData.cells;
    const unpeeled = [];
    for (let i = 0; i < CELL_COUNT; i++) if (!cells[i]) unpeeled.push(i);
    const n = Math.max(1, Math.floor(rate * dt));
    for (let k = 0; k < n && unpeeled.length; k++) {
      const pick = (Math.random() * unpeeled.length) | 0;
      peelCell(p, unpeeled.splice(pick, 1)[0]);
    }
    updatePotatoVisual(p);
    p.rotation.y += dt * 2.2;
    // paw bob
    PUPPY.bob += dt * 14;
    const legL = PUPPY.mesh.getObjectByName("legL");
    if (legL) legL.rotation.x = -0.4 + Math.sin(PUPPY.bob) * 0.35;

    if (peelProgress(p) >= 1 || PUPPY.timer > 8) {
      // finish remaining
      for (let i = 0; i < CELL_COUNT; i++) if (!p.userData.cells[i]) peelCell(p, i);
      updatePotatoVisual(p);
      p.userData.finished = true;
      puppyAttachPotato(p);
      PUPPY.state = "toWater";
    }
    return;
  }

  if (PUPPY.state === "toWater") {
    const wp = waterDropZone
      ? new THREE.Vector3(waterDropZone.position.x - 0.55, 0, waterDropZone.position.z)
      : PUPPY.waterPos;
    if (puppyWalkToward(wp, dt, spd)) {
      const p = puppyDropPotatoWorld();
      if (p) {
        p.userData.finished = true;
        const pay = throwIntoWater(p, true);
        STATE.combo = Math.min(getComboMax(), STATE.combo + 0.05);
        toast(`Köpek +${formatMoney(pay)} · kanala attı`);
        updateHud();
        saveProgress();
      }
      PUPPY.peeledInShift += 1;
      if (PUPPY.peeledInShift >= 10) {
        PUPPY.state = "toNap";
      } else {
        PUPPY.state = "toPile";
      }
    }
    return;
  }

  if (PUPPY.state === "toNap") {
    if (puppyWalkToward(PUPPY.napPos, dt, spd * 0.85)) {
      PUPPY.state = "nap";
      PUPPY.timer = 10;
      PUPPY.mesh.rotation.x = 0.15;
      toast("Yavru köpek minderde uyuyor");
    }
  }
}

loadProgress();
refreshEquippedToolMesh();
buildWorld();
buildPuppy();
PUPPY.state = "idle";
syncAdminUi();
PUPPY.peeledInShift = 0;
updateHud();
updateSaveLabels(Date.now());
saveProgress(true);
animate();
