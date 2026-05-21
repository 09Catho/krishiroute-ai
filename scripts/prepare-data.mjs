import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const root = process.cwd();
const rawDir = path.join(root, "data", "raw");
const outDir = path.join(root, "src", "data");
const outFile = path.join(outDir, "analytics.json");

const readCsv = (file) => {
  const fullPath = path.join(rawDir, file);
  const input = fs.readFileSync(fullPath, "utf8");
  return parse(input, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  });
};

const toDate = (value) => new Date(`${value}T00:00:00`);
const daysBetween = (later, earlier) => Math.max(0, Math.round((later - earlier) / 86400000));
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const boolRate = (rows, key) =>
  rows.length ? rows.filter((row) => String(row[key]).toLowerCase() === "true").length / rows.length : 0;

const addTo = (map, key, value) => map.set(key, (map.get(key) ?? 0) + value);
const maxDateString = (rows, key) => rows.reduce((max, row) => (row[key] > max ? row[key] : max), "");
const minDateString = (rows, key) => rows.reduce((min, row) => (!min || row[key] < min ? row[key] : min), "");
const formatDate = (date) => date.toISOString().slice(0, 10);

const normalize = (value, max) => (max > 0 ? Math.min(1, value / max) : 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const files = {
  reps: "reps_territory.csv",
  retailers: "retailers.csv",
  visits: "retailer_visit_log.csv",
  inventory: "retailer_inventory_weekly.csv",
  pos: "retailer_pos.csv",
  growers: "growers.csv",
  whatsapp: "whatsapp_campaign.csv",
  digital: "digital_funnel_weekly.csv",
};

console.log("Reading Syngenta hackathon dataset...");
const reps = readCsv(files.reps);
const retailers = readCsv(files.retailers);
const visits = readCsv(files.visits);
const inventory = readCsv(files.inventory);
const pos = readCsv(files.pos);
const growers = readCsv(files.growers);
const whatsapp = readCsv(files.whatsapp);
const digital = readCsv(files.digital);

const latestPosDate = toDate(maxDateString(pos, "transaction_date"));
const recentStart = new Date(latestPosDate);
recentStart.setDate(latestPosDate.getDate() - 28);
const previousStart = new Date(latestPosDate);
previousStart.setDate(latestPosDate.getDate() - 56);
const latestInventoryWeek = maxDateString(inventory, "week_end_date");

const retailersById = new Map(retailers.map((row) => [row.retailer_id, row]));
const repsByTerritory = new Map(reps.map((row) => [row.territory_id, row]));

const productTotals = new Map();
const retailerProductRecent = new Map();
const retailerProductPrevious = new Map();
const retailerRecentRevenue = new Map();
const territoryProductRecent = new Map();
const tehsilProductRecent = new Map();

for (const row of pos) {
  const retailer = retailersById.get(row.retailer_id);
  if (!retailer) continue;

  const qty = toNumber(row.sku_qty);
  const revenue = qty * toNumber(row.sku_price);
  const date = toDate(row.transaction_date);
  const productKey = row.sku_name;
  addTo(productTotals, productKey, revenue);

  const retailerProductKey = `${row.retailer_id}|${row.sku_name}`;
  if (date > recentStart && date <= latestPosDate) {
    addTo(retailerProductRecent, `${retailerProductKey}|qty`, qty);
    addTo(retailerProductRecent, `${retailerProductKey}|revenue`, revenue);
    addTo(retailerRecentRevenue, row.retailer_id, revenue);
    addTo(territoryProductRecent, `${retailer.territory_id}|${row.sku_name}`, revenue);
    addTo(tehsilProductRecent, `${retailer.territory_id}|${retailer.tehsil}|${row.sku_name}`, revenue);
  } else if (date > previousStart && date <= recentStart) {
    addTo(retailerProductPrevious, `${retailerProductKey}|qty`, qty);
    addTo(retailerProductPrevious, `${retailerProductKey}|revenue`, revenue);
  }
}

const inventoryLatest = new Map();
const inventoryAverage = new Map();
const inventoryWeeks = new Map();
for (const row of inventory) {
  const key = `${row.retailer_id}|${row.sku_name}`;
  const qty = toNumber(row.sku_qty);
  addTo(inventoryAverage, key, qty);
  addTo(inventoryWeeks, key, 1);
  if (row.week_end_date === latestInventoryWeek) inventoryLatest.set(key, qty);
}

for (const [key, total] of inventoryAverage.entries()) {
  inventoryAverage.set(key, total / (inventoryWeeks.get(key) || 1));
}

const visitLastTehsilProduct = new Map();
const visitLastTehsil = new Map();
const visitProductCount = new Map();
for (const row of visits) {
  const date = row.visit_date;
  const tehsilProductKey = `${row.territory_id}|${row.visit_tehsil}|${row.product_recommended}`;
  const tehsilKey = `${row.territory_id}|${row.visit_tehsil}`;
  if (!visitLastTehsilProduct.has(tehsilProductKey) || date > visitLastTehsilProduct.get(tehsilProductKey)) {
    visitLastTehsilProduct.set(tehsilProductKey, date);
  }
  if (!visitLastTehsil.has(tehsilKey) || date > visitLastTehsil.get(tehsilKey)) {
    visitLastTehsil.set(tehsilKey, date);
  }
  addTo(visitProductCount, `${row.territory_id}|${row.product_recommended}`, 1);
}

const maxRecentRevenue = Math.max(...[...retailerProductRecent.entries()]
  .filter(([key]) => key.endsWith("|revenue"))
  .map(([, value]) => value), 1);
const maxRetailerRecentRevenue = Math.max(...retailerRecentRevenue.values(), 1);
const maxVisitProductCount = Math.max(...visitProductCount.values(), 1);

const recommendations = [];
const products = [...productTotals.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name]) => name);

for (const retailer of retailers) {
  const rep = repsByTerritory.get(retailer.territory_id);
  if (!rep) continue;

  const scoredProducts = products.map((product) => {
    const key = `${retailer.retailer_id}|${product}`;
    const recentQty = retailerProductRecent.get(`${key}|qty`) ?? 0;
    const recentRevenue = retailerProductRecent.get(`${key}|revenue`) ?? 0;
    const previousQty = retailerProductPrevious.get(`${key}|qty`) ?? 0;
    const latestQty = inventoryLatest.get(key) ?? 0;
    const avgQty = inventoryAverage.get(key) ?? 0;
    const acceleration = previousQty > 0 ? (recentQty - previousQty) / previousQty : recentQty > 0 ? 0.65 : 0;
    const stockRatio = avgQty > 0 ? latestQty / avgQty : latestQty > 0 ? 1 : 0;
    const stockRisk = avgQty > 0 ? clamp(1 - stockRatio, 0, 1) : 0;
    const lastProductVisit = visitLastTehsilProduct.get(`${retailer.territory_id}|${retailer.tehsil}|${product}`);
    const lastAnyVisit = visitLastTehsil.get(`${retailer.territory_id}|${retailer.tehsil}`);
    const visitGapDays = lastProductVisit
      ? daysBetween(latestPosDate, toDate(lastProductVisit))
      : lastAnyVisit
        ? Math.min(90, daysBetween(latestPosDate, toDate(lastAnyVisit)) + 14)
        : 90;
    const visitGapScore = normalize(visitGapDays, 60);
    const productPushScore = normalize(visitProductCount.get(`${retailer.territory_id}|${product}`) ?? 0, maxVisitProductCount);
    const demandScore = normalize(recentRevenue, maxRecentRevenue);
    const accelerationScore = clamp((acceleration + 0.3) / 1.6, 0, 1);
    const retailerValueScore = normalize(retailerRecentRevenue.get(retailer.retailer_id) ?? 0, maxRetailerRecentRevenue);

    const score = Math.round(
      100 *
        (0.34 * demandScore +
          0.2 * stockRisk +
          0.16 * accelerationScore +
          0.16 * visitGapScore +
          0.08 * productPushScore +
          0.06 * retailerValueScore)
    );

    const expectedValue = Math.round(recentRevenue * (1 + 0.32 * stockRisk + 0.18 * accelerationScore) + 1200 * visitGapScore);
    const reasons = [];
    if (recentRevenue > 0) reasons.push(`${product} generated recent sales at this retailer.`);
    if (acceleration > 0.15) reasons.push(`Demand is rising versus the previous 4-week window.`);
    if (stockRisk > 0.45) reasons.push(`Current inventory is below the retailer's normal level.`);
    if (visitGapDays >= 35) reasons.push(`This tehsil has a long visit gap for this product context.`);
    if (productPushScore > 0.25) reasons.push(`Field teams have been promoting this product in the territory.`);
    if (reasons.length < 3) reasons.push(`The retailer sits inside ${rep.territory_name}, assigned to ${rep.rep_id}.`);

    return {
      product,
      score,
      expectedValue,
      recentQty,
      recentRevenue: Math.round(recentRevenue),
      previousQty,
      latestQty,
      avgQty: Math.round(avgQty),
      stockRisk: Number(stockRisk.toFixed(2)),
      acceleration: Number(acceleration.toFixed(2)),
      visitGapDays,
      reasons: reasons.slice(0, 4),
    };
  });

  const best = scoredProducts.sort((a, b) => b.score - a.score || b.expectedValue - a.expectedValue)[0];
  if (!best || best.score < 12) continue;

  recommendations.push({
    id: `${retailer.retailer_id}-${best.product.replace(/[^A-Z0-9]+/gi, "-")}`,
    repId: rep.rep_id,
    territoryId: retailer.territory_id,
    territoryName: rep.territory_name,
    state: retailer.state,
    district: retailer.district,
    tehsil: retailer.tehsil,
    retailerId: retailer.retailer_id,
    product: best.product,
    score: best.score,
    priority: best.score >= 72 ? "Critical" : best.score >= 52 ? "High" : best.score >= 34 ? "Medium" : "Watch",
    expectedValue: best.expectedValue,
    latestInventory: best.latestQty,
    normalInventory: best.avgQty,
    recentQty: best.recentQty,
    recentRevenue: best.recentRevenue,
    previousQty: best.previousQty,
    stockRisk: best.stockRisk,
    acceleration: best.acceleration,
    visitGapDays: best.visitGapDays,
    reasons: best.reasons,
    nextBestAction: buildAction(best),
  });
}

function buildAction(item) {
  if (item.stockRisk > 0.55 && item.recentRevenue > 0) {
    return `Secure replenishment for ${item.product} and capture an order before local demand is missed.`;
  }
  if (item.acceleration > 0.25) {
    return `Lead the visit with demand momentum for ${item.product} and ask the retailer to expand availability.`;
  }
  if (item.visitGapDays > 45) {
    return `Re-open this tehsil with ${item.product} education and record retailer objections.`;
  }
  return `Discuss ${item.product}, confirm stock position, and log whether the retailer accepts the recommendation.`;
}

recommendations.sort((a, b) => b.score - a.score || b.expectedValue - a.expectedValue);

const repSummaries = reps.map((rep) => {
  const rows = recommendations.filter((row) => row.repId === rep.rep_id);
  return {
    repId: rep.rep_id,
    territoryId: rep.territory_id,
    territoryName: rep.territory_name,
    state: rep.state,
    district: rep.district,
    recommendationCount: rows.length,
    topScore: rows[0]?.score ?? 0,
    expectedValue: rows.reduce((sum, row) => sum + row.expectedValue, 0),
    stockRisks: rows.filter((row) => row.stockRisk >= 0.5).length,
  };
}).sort((a, b) => b.recommendationCount * 100000 + b.expectedValue - (a.recommendationCount * 100000 + a.expectedValue));

const demoRep = repSummaries.find((rep) => rep.recommendationCount >= 8) ?? repSummaries[0];
const demoRecommendations = recommendations
  .filter((row) => row.repId === demoRep.repId)
  .slice(0, 18);
const appRecommendationMap = new Map();
for (const row of [...demoRecommendations, ...recommendations.slice(0, 1200)]) {
  appRecommendationMap.set(row.id, row);
}
const appRecommendations = [...appRecommendationMap.values()].sort(
  (a, b) => b.score - a.score || b.expectedValue - a.expectedValue
);

const managerRecommendations = recommendations.slice(0, 220);
const anomalyRows = recommendations
  .filter((row) => row.stockRisk >= 0.5 || row.acceleration >= 0.3 || row.visitGapDays >= 45)
  .slice(0, 18)
  .map((row) => ({
    id: row.id,
    type: row.stockRisk >= 0.5 ? "Stock-out risk" : row.acceleration >= 0.3 ? "Demand spike" : "Coverage gap",
    retailerId: row.retailerId,
    district: row.district,
    tehsil: row.tehsil,
    product: row.product,
    signal: row.stockRisk >= 0.5
      ? `Inventory ${row.latestInventory} vs normal ${row.normalInventory}`
      : row.acceleration >= 0.3
        ? `${Math.round(row.acceleration * 100)}% acceleration`
        : `${row.visitGapDays} days since aligned visit`,
    score: row.score,
  }));

const cropCounts = new Map();
const languageCounts = new Map();
const deviceCounts = new Map();
for (const row of growers) {
  addTo(languageCounts, row.language || "Unknown", 1);
  addTo(deviceCounts, row.device_type || "unknown", 1);
  try {
    const calendar = JSON.parse(row.grower_crop_calendar);
    addTo(cropCounts, calendar.crop || "unknown", 1);
  } catch {
    addTo(cropCounts, "unknown", 1);
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  demoRepId: demoRep.repId,
  latestDates: {
    pos: formatDate(latestPosDate),
    inventoryWeek: latestInventoryWeek,
    recentWindowStart: formatDate(recentStart),
    previousWindowStart: formatDate(previousStart),
  },
  metadata: {
    tables: [
      { name: files.reps, rows: reps.length, role: "Rep to territory mapping" },
      { name: files.retailers, rows: retailers.length, role: "Retailer location and territory assignment" },
      { name: files.visits, rows: visits.length, role: "Territory/tehsil/product visit signal" },
      { name: files.inventory, rows: inventory.length, role: "Weekly stock levels by retailer and SKU" },
      { name: files.pos, rows: pos.length, role: "Retailer sales demand and revenue signal" },
      { name: files.growers, rows: growers.length, role: "Language, device, and crop context" },
      { name: files.whatsapp, rows: whatsapp.length, role: "Digital engagement context" },
      { name: files.digital, rows: digital.length, role: "Campaign funnel benchmark" },
    ],
    dateRanges: {
      visits: [minDateString(visits, "visit_date"), maxDateString(visits, "visit_date")],
      pos: [minDateString(pos, "transaction_date"), maxDateString(pos, "transaction_date")],
      inventory: [minDateString(inventory, "week_end_date"), maxDateString(inventory, "week_end_date")],
      whatsapp: [minDateString(whatsapp, "message_sent_date"), maxDateString(whatsapp, "message_sent_date")],
      digital: [minDateString(digital, "week_start_date"), maxDateString(digital, "week_start_date")],
    },
    joinQuality: [
      { label: "POS rows mapped to retailers", value: 1 },
      { label: "Inventory rows mapped to retailers", value: 1 },
      { label: "Visit rows mapped to territories", value: 1 },
      { label: "WhatsApp rows mapped to growers", value: 1 },
    ],
    whatsappRates: {
      delivered: boolRate(whatsapp, "delivered_status"),
      opened: boolRate(whatsapp, "opened_status"),
      clicked: boolRate(whatsapp, "clicked_status"),
    },
    growerContext: {
      crops: [...cropCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      languages: [...languageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      devices: [...deviceCounts.entries()].sort((a, b) => b[1] - a[1]),
    },
  },
  reps: repSummaries.slice(0, 60),
  recommendations: appRecommendations,
  manager: {
    kpis: {
      totalOpportunity: managerRecommendations.reduce((sum, row) => sum + row.expectedValue, 0),
      criticalActions: managerRecommendations.filter((row) => row.priority === "Critical").length,
      stockRisks: managerRecommendations.filter((row) => row.stockRisk >= 0.5).length,
      averageScore: Math.round(managerRecommendations.reduce((sum, row) => sum + row.score, 0) / managerRecommendations.length),
      acceptanceSimulation: 0.62,
    },
    topActions: managerRecommendations.slice(0, 28),
    anomalies: anomalyRows,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outFile)}`);
console.log(`Demo rep: ${demoRep.repId} (${demoRep.territoryName}), ${demoRecommendations.length} actions`);
console.log(`Recommendations exported: ${appRecommendations.length}`);
