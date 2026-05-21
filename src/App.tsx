import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ChevronsLeft,
  ClipboardCheck,
  Database,
  Gauge,
  Layers3,
  MapPinned,
  PackageCheck,
  Radar,
  Route,
  Search,
  SendHorizontal,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import analytics from "./data/analytics.json";
import mlInsights from "./data/ml_insights.json";

type Priority = "Critical" | "High" | "Medium" | "Watch";

type Recommendation = {
  id: string;
  repId: string;
  territoryId: string;
  territoryName: string;
  state: string;
  district: string;
  tehsil: string;
  retailerId: string;
  product: string;
  score: number;
  priority: Priority;
  expectedValue: number;
  latestInventory: number;
  normalInventory: number;
  recentQty: number;
  recentRevenue: number;
  previousQty: number;
  stockRisk: number;
  acceleration: number;
  visitGapDays: number;
  reasons: string[];
  nextBestAction: string;
};

type RepSummary = {
  repId: string;
  territoryName: string;
  state: string;
  district: string;
  recommendationCount: number;
  expectedValue: number;
  stockRisks: number;
};

const data = analytics as unknown as {
  demoRepId: string;
  generatedAt: string;
  latestDates: {
    pos: string;
    inventoryWeek: string;
    recentWindowStart: string;
    previousWindowStart: string;
  };
  metadata: {
    tables: Array<{ name: string; rows: number; role: string }>;
    dateRanges: Record<string, string[]>;
    joinQuality: Array<{ label: string; value: number }>;
    whatsappRates: Record<string, number>;
    growerContext: {
      crops: Array<[string, number]>;
      languages: Array<[string, number]>;
      devices: Array<[string, number]>;
    };
  };
  reps: RepSummary[];
  recommendations: Recommendation[];
  manager: {
    kpis: {
      totalOpportunity: number;
      criticalActions: number;
      stockRisks: number;
      averageScore: number;
      acceptanceSimulation: number;
    };
    topActions: Recommendation[];
    anomalies: Array<{
      id: string;
      type: string;
      retailerId: string;
      district: string;
      tehsil: string;
      product: string;
      signal: string;
      score: number;
    }>;
  };
};

const mlData = mlInsights as unknown as {
  generatedAt: string;
  sourceReposAndMethods: Array<{ name: string; url: string; usedFor: string }>;
  modelCards: Array<{
    id: string;
    name: string;
    algorithm: string;
    target: string;
    trainingRows: number;
    validationRows?: number;
    maeRevenue?: number;
    r2LogRevenue?: number;
    rocAuc?: number | null;
    positiveRate?: number;
    contamination?: number;
    latestWeekThreshold?: number;
  }>;
  featureImportance: Array<{ feature: string; importance: number }>;
  latestWeek: string;
  mlRecommendations: Array<{
    retailerId: string;
    territoryId: string;
    state: string;
    district: string;
    tehsil: string;
    skuId: string;
    product: string;
    weekEndDate: string;
    predictedRevenue: number;
    stockoutProbability: number;
    anomalyScore: number;
    isAnomaly: boolean;
    currentInventory: number;
    currentSalesQty: number;
    rolling4SalesQty: number;
    visitCount: number;
  }>;
};

const priorityOrder: Record<Priority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Watch: 1,
};

const priorityColors: Record<Priority, string> = {
  Critical: "#d9483b",
  High: "#df8a24",
  Medium: "#2f6f96",
  Watch: "#66766b",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const formatPct = (value: number) => `${Math.round(value * 100)}%`;

const navItems = [
  { id: "plan", label: "Rep Plan", icon: Route },
  { id: "manager", label: "Command", icon: BarChart3 },
  { id: "evidence", label: "Evidence", icon: Database },
] as const;

const guideStorageKey = "krishiroute-guide-v2-seen";

export function App() {
  const [view, setView] = useState<(typeof navItems)[number]["id"]>("plan");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedRepId, setSelectedRepId] = useState(data.demoRepId);
  const [query, setQuery] = useState("");
  const [minPriority, setMinPriority] = useState<Priority>("Watch");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem(guideStorageKey) !== "true");

  const repOptions = data.reps.filter((rep) => rep.recommendationCount > 0).slice(0, 40);
  const selectedRep = repOptions.find((rep) => rep.repId === selectedRepId) ?? repOptions[0];

  const filteredPlan = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.recommendations
      .filter((rec) => rec.repId === selectedRep.repId)
      .filter((rec) => priorityOrder[rec.priority] >= priorityOrder[minPriority])
      .filter((rec) =>
        q
          ? [rec.retailerId, rec.product, rec.district, rec.tehsil, rec.priority]
              .join(" ")
              .toLowerCase()
              .includes(q)
          : true,
      )
      .slice(0, 18);
  }, [minPriority, query, selectedRep.repId]);

  const selected = filteredPlan.find((rec) => rec.id === selectedId) ?? filteredPlan[0] ?? data.recommendations[0];
  const selectedMl = mlData.mlRecommendations.find(
    (row) => row.retailerId === selected?.retailerId && row.product === selected?.product,
  );

  const planKpis = useMemo(() => {
    const revenue = filteredPlan.reduce((sum, rec) => sum + rec.expectedValue, 0);
    const critical = filteredPlan.filter((rec) => rec.priority === "Critical").length;
    const avgScore = filteredPlan.length
      ? Math.round(filteredPlan.reduce((sum, rec) => sum + rec.score, 0) / filteredPlan.length)
      : 0;
    return {
      actions: filteredPlan.length,
      revenue,
      critical,
      avgScore,
      stockRisks: filteredPlan.filter((rec) => rec.stockRisk >= 0.5).length,
    };
  }, [filteredPlan]);

  return (
    <main className={clsx("kr-shell", !sidebarOpen && "sidebar-collapsed")}>
      <aside className={clsx("kr-sidebar", !sidebarOpen && "collapsed")}>
        <div className="kr-brand">
          <div className="kr-brand-mark">
            <Sprout size={23} />
          </div>
          {sidebarOpen && (
            <div>
              <strong>KrishiRoute AI</strong>
              <span>Syngenta field cockpit</span>
            </div>
          )}
        </div>

        <nav className="kr-nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={clsx(view === item.id && "active")}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <button className="kr-sidebar-guide" onClick={() => setShowGuide(true)}>
          <Sparkles size={17} />
          {sidebarOpen && <span>Walkthrough</span>}
        </button>

        {sidebarOpen && <div className="kr-sidebar-card">
          <span>Live data window</span>
          <strong>{data.latestDates.recentWindowStart} - {data.latestDates.pos}</strong>
          <small>{data.recommendations.length.toLocaleString("en-IN")} scored recommendations</small>
        </div>}

        <button className="kr-sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle sidebar">
          <ChevronsLeft size={17} />
          {sidebarOpen && <span>Collapse</span>}
        </button>
      </aside>

      <section className="kr-main">
        <TopBar
          view={view}
          query={query}
          setQuery={setQuery}
          selectedRep={selectedRep}
          repOptions={repOptions}
          setSelectedRepId={(repId) => {
            setSelectedRepId(repId);
            setSelectedId(null);
          }}
        />

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="kr-view"
        >
          {view === "plan" && (
            <RepPlan
              selectedRep={selectedRep}
              minPriority={minPriority}
              setMinPriority={setMinPriority}
              planKpis={planKpis}
              recommendations={filteredPlan}
              selectedId={selected?.id}
              setSelectedId={setSelectedId}
              outcomes={outcomes}
            />
          )}
          {view === "manager" && <ManagerView />}
          {view === "evidence" && <EvidenceView />}
        </motion.div>
      </section>

      <aside className="kr-inspector">
        <VisitInspector
          recommendation={selected}
          mlRecommendation={selectedMl}
          dashboardContext={{
            selectedRep,
            planKpis,
            dataWindow: data.latestDates,
            modelSummary: mlData.modelCards.map((card) => ({
              name: plainModelName(card.id),
              purpose: plainModelPurpose(card.id),
              metric: plainModelMetric(card),
            })),
          }}
          outcome={outcomes[selected?.id]}
          setOutcome={(value) => setOutcomes((prev) => ({ ...prev, [selected.id]: value }))}
        />
      </aside>

      <FloatingCopilot
        recommendation={selected}
        mlRecommendation={selectedMl}
        currentView={view}
        dashboardContext={{
          selectedRep,
          planKpis,
          dataWindow: data.latestDates,
          modelSummary: mlData.modelCards.map((card) => ({
            name: plainModelName(card.id),
            purpose: plainModelPurpose(card.id),
            metric: plainModelMetric(card),
          })),
        }}
      />

      {showGuide && (
        <OnboardingGuide
          onClose={() => {
            localStorage.setItem(guideStorageKey, "true");
            setShowGuide(false);
          }}
        />
      )}
    </main>
  );
}

function TopBar(props: {
  view: string;
  query: string;
  setQuery: (query: string) => void;
  selectedRep: RepSummary;
  repOptions: RepSummary[];
  setSelectedRepId: (repId: string) => void;
}) {
  return (
    <header className="kr-topbar">
      <div>
        <span className="kr-eyebrow">Live field intelligence</span>
        <h1>
          {props.view === "plan"
            ? "Route command"
            : props.view === "manager"
                ? "Command dashboard"
                : "Dataset confidence"}
        </h1>
      </div>
      <div className="kr-commandbar">
        <label className="kr-search">
          <Search size={17} />
          <input
            value={props.query}
            onChange={(event) => props.setQuery(event.target.value)}
            placeholder="Search retailer, SKU, tehsil"
          />
        </label>
        <label className="kr-select">
          <span>Rep</span>
          <select value={props.selectedRep.repId} onChange={(event) => props.setSelectedRepId(event.target.value)}>
            {props.repOptions.map((rep) => (
              <option key={rep.repId} value={rep.repId}>
                {rep.repId} - {rep.territoryName}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

function RepPlan(props: {
  selectedRep: RepSummary;
  minPriority: Priority;
  setMinPriority: (priority: Priority) => void;
  planKpis: { actions: number; revenue: number; critical: number; avgScore: number; stockRisks: number };
  recommendations: Recommendation[];
  selectedId?: string;
  setSelectedId: (id: string) => void;
  outcomes: Record<string, string>;
}) {
  const topAction = props.recommendations[0];
  const routeChart = props.recommendations.slice(0, 9).map((rec, index) => ({
    name: `#${index + 1}`,
    score: rec.score,
    value: Math.round(rec.expectedValue / 1000),
    stock: Math.round(rec.stockRisk * 100),
  }));

  return (
    <>
      <section className="kr-command-strip">
        <div>
          <span className="kr-eyebrow">Selected territory</span>
          <h2>{props.selectedRep.territoryName.replace(/_/g, " ")}</h2>
          <p>{props.selectedRep.repId} - {props.selectedRep.district}, {props.selectedRep.state}</p>
        </div>
        {topAction && (
          <div className="kr-command-decision">
            <span>First move</span>
            <strong>{topAction.retailerId} - {topAction.product}</strong>
            <small>{topAction.nextBestAction}</small>
          </div>
        )}
        <div className="kr-command-pulse">
          <Radar size={18} />
          <span>Recomputed from POS, stock and visit history</span>
        </div>
      </section>

      <section className="kr-metrics">
        <MetricTile icon={<ClipboardCheck />} label="Actions" value={props.planKpis.actions.toString()} accent="green" />
        <MetricTile icon={<TrendingUp />} label="Expected value" value={formatCurrency(props.planKpis.revenue)} accent="blue" />
        <MetricTile icon={<AlertTriangle />} label="Critical" value={props.planKpis.critical.toString()} accent="red" />
        <MetricTile icon={<Gauge />} label="Avg urgency" value={props.planKpis.avgScore.toString()} accent="gold" />
      </section>

      <section className="kr-dashboard-grid">
        <Panel className="kr-route-panel" title="Route intensity" meta="Score, value and stock-risk by rank">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={routeChart} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce7d6" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dbe5d6" }} />
              <Bar dataKey="score" radius={[8, 8, 0, 0]} fill="#2d7b34" />
              <Bar dataKey="stock" radius={[8, 8, 0, 0]} fill="#e29b37" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Priority filter" meta="Judging demo controls">
          <div className="kr-segment">
            {(["Watch", "Medium", "High", "Critical"] as Priority[]).map((priority) => (
              <button
                key={priority}
                className={clsx(props.minPriority === priority && "active")}
                onClick={() => props.setMinPriority(priority)}
              >
                {priority}
              </button>
            ))}
          </div>
          <div className="kr-signal-stack">
            <SignalRow label="Stock-out risk" value={props.planKpis.stockRisks} total={Math.max(props.planKpis.actions, 1)} />
            <SignalRow label="Scored actions" value={props.planKpis.actions} total={18} />
            <SignalRow label="Critical share" value={props.planKpis.critical} total={Math.max(props.planKpis.actions, 1)} />
          </div>
        </Panel>
      </section>

      <ActionBoard
        recommendations={props.recommendations}
        selectedId={props.selectedId}
        setSelectedId={props.setSelectedId}
        outcomes={props.outcomes}
      />
    </>
  );
}

function MlModelView() {
  const modelChart = mlData.modelCards.map((card) => ({
    name: card.name.replace("Next-week ", "").replace("Demand and inventory ", ""),
    rows: card.trainingRows,
    score: card.rocAuc ? Math.round(card.rocAuc * 100) : card.r2LogRevenue ? Math.round(Math.max(card.r2LogRevenue, 0) * 100) : Math.round((card.contamination ?? 0) * 1000),
  }));
  const importance = mlData.featureImportance.map((row) => ({
    feature: row.feature.replace(/_/g, " "),
    importance: Number((row.importance * 100).toFixed(2)),
  }));
  const topMl = mlData.mlRecommendations.slice(0, 12);

  return (
    <>
      <section className="kr-hero-board ml">
        <div>
          <span className="kr-eyebrow">Actual trained AI</span>
          <h2>AI that decides what to do next</h2>
          <p>
            The app learns from Syngenta sales, inventory and visit history to predict demand, stockout risk and
            unusual field signals before the rep starts the day.
          </p>
        </div>
        <div className="kr-hero-chip">
          <BrainCircuit size={18} />
          <span>{mlData.mlRecommendations.length} AI-ranked actions</span>
        </div>
      </section>

      <section className="kr-metrics">
        <MetricTile
          icon={<BrainCircuit />}
          label="AI engines"
          value={mlData.modelCards.length.toString()}
          accent="green"
        />
        <MetricTile
          icon={<ShieldCheck />}
          label="Stockout accuracy"
          value={formatPct(mlData.modelCards.find((card) => card.id.includes("stockout"))?.rocAuc ?? 0)}
          accent="blue"
        />
        <MetricTile
          icon={<Target />}
          label="Demand error"
          value={formatCurrency(mlData.modelCards.find((card) => card.id.includes("demand"))?.maeRevenue ?? 0)}
          accent="gold"
        />
        <MetricTile
          icon={<AlertTriangle />}
          label="Latest anomalies"
          value={mlData.mlRecommendations.filter((row) => row.isAnomaly).length.toString()}
          accent="red"
        />
      </section>

      <section className="kr-dashboard-grid wide-left">
        <Panel title="What the AI is learning" meta="Trained from retailer-SKU weekly history">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={modelChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce7d6" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={formatCompact} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dbe5d6" }} />
              <Bar yAxisId="left" dataKey="rows" radius={[8, 8, 0, 0]} fill="#2d7b34" />
              <Bar yAxisId="right" dataKey="score" radius={[8, 8, 0, 0]} fill="#2f6f96" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Signals the AI relies on" meta="Most useful inputs for prediction">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={importance.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dce7d6" />
              <XAxis type="number" hide />
              <YAxis dataKey="feature" type="category" width={120} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dbe5d6" }} />
              <Bar dataKey="importance" radius={[0, 8, 8, 0]} fill="#d99027" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="kr-dashboard-grid">
        <Panel title="Why AI is needed" meta="The field problem changes every week">
          <div className="kr-ai-explain">
            <div>
              <Target size={18} />
              <strong>Too many combinations</strong>
              <small>Every retailer, SKU, territory and week has a different sales and stock pattern.</small>
            </div>
            <div>
              <PackageCheck size={18} />
              <strong>Stockouts are preventable</strong>
              <small>The AI predicts which retailer-product pairs may run out next week.</small>
            </div>
            <div>
              <AlertTriangle size={18} />
              <strong>Unusual signals matter</strong>
              <small>The AI flags demand spikes and inventory behavior that routine planning misses.</small>
            </div>
          </div>
        </Panel>

        <Panel title="AI used in this prototype" meta="Plain-language model cards">
          <div className="kr-model-card-list">
            {mlData.modelCards.map((card) => (
              <div key={card.id} className="kr-model-card">
                <strong>{plainModelName(card.id)}</strong>
                <small>{plainModelPurpose(card.id)}</small>
                <span>{plainModelMetric(card)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="AI-ranked next best actions" meta={`Predictions for week ending ${mlData.latestWeek}`}>
        <div className="kr-ml-table">
          <div className="kr-ml-head">
            <span>Retailer</span>
            <span>Product</span>
            <span>Predicted revenue</span>
            <span>Stockout risk</span>
            <span>Anomaly</span>
          </div>
          {topMl.map((row) => (
            <div className="kr-ml-row" key={`${row.retailerId}-${row.product}`}>
              <span>
                <strong>{row.retailerId}</strong>
                <small>{row.tehsil}, {row.district}</small>
              </span>
              <strong>{row.product}</strong>
              <strong>{formatCurrency(row.predictedRevenue)}</strong>
              <span>{formatPct(row.stockoutProbability)}</span>
              <span className={clsx("kr-anomaly-pill", row.isAnomaly && "active")}>
                {row.isAnomaly ? "Flagged" : "Normal"}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function plainModelName(id: string) {
  if (id.includes("demand")) return "Demand predictor";
  if (id.includes("stockout")) return "Stockout risk predictor";
  return "Opportunity anomaly detector";
}

function plainModelPurpose(id: string) {
  if (id.includes("demand")) return "Predicts next-week sales value for each retailer-product pair.";
  if (id.includes("stockout")) return "Predicts which products may run out at a retailer next week.";
  return "Finds unusual demand or inventory patterns that need field attention.";
}

function plainModelMetric(card: (typeof mlData.modelCards)[number]) {
  if (card.rocAuc) return `${formatPct(card.rocAuc)} validation separation on stockout risk.`;
  if (card.maeRevenue) return `${formatCurrency(card.maeRevenue)} average revenue prediction error.`;
  return `${card.trainingRows.toLocaleString("en-IN")} rows used to learn normal field behavior.`;
}

function ManagerView() {
  const productData = Object.values(
    data.manager.topActions.reduce<Record<string, { name: string; value: number; actions: number }>>((acc, row) => {
      acc[row.product] ??= { name: row.product, value: 0, actions: 0 };
      acc[row.product].value += row.expectedValue;
      acc[row.product].actions += 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const priorityData = Object.values(
    data.manager.topActions.reduce<Record<string, { name: Priority; value: number }>>((acc, row) => {
      acc[row.priority] ??= { name: row.priority, value: 0 };
      acc[row.priority].value += 1;
      return acc;
    }, {}),
  );

  return (
    <>
      <section className="kr-metrics">
        <MetricTile icon={<TrendingUp />} label="Opportunity" value={formatCurrency(data.manager.kpis.totalOpportunity)} accent="green" />
        <MetricTile icon={<AlertTriangle />} label="Critical actions" value={data.manager.kpis.criticalActions.toString()} accent="red" />
        <MetricTile icon={<PackageCheck />} label="Stock risks" value={data.manager.kpis.stockRisks.toString()} accent="gold" />
        <MetricTile icon={<ShieldCheck />} label="Acceptance sim." value={formatPct(data.manager.kpis.acceptanceSimulation)} accent="blue" />
      </section>

      <section className="kr-dashboard-grid wide-left">
        <Panel title="Product opportunity mix" meta="Expected value by SKU">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={productData}>
              <defs>
                <linearGradient id="valueGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#2d7b34" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#2d7b34" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce7d6" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-12} height={54} />
              <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #dbe5d6" }} />
              <Area type="monotone" dataKey="value" stroke="#2d7b34" fill="url(#valueGradient)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Priority mix" meta="Manager action queue">
          <ResponsiveContainer width="100%" height={270}>
            <PieChart>
              <Pie data={priorityData} innerRadius={58} outerRadius={96} paddingAngle={3} dataKey="value">
                {priorityData.map((entry) => (
                  <Cell key={entry.name} fill={priorityColors[entry.name]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="kr-legend">
            {priorityData.map((entry) => (
              <span key={entry.name}>
                <i style={{ background: priorityColors[entry.name] }} />
                {entry.name} {entry.value}
              </span>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Immediate action queue" meta={`${data.manager.anomalies.length} anomalies flagged`}>
        <div className="kr-anomaly-grid">
          {data.manager.anomalies.slice(0, 10).map((item) => (
            <motion.div className="kr-anomaly" key={item.id} whileHover={{ y: -2 }}>
              <span className="kr-anomaly-type">{item.type}</span>
              <strong>{item.product}</strong>
              <small>{item.retailerId} - {item.tehsil}, {item.district}</small>
              <em>{item.signal}</em>
            </motion.div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function EvidenceView() {
  const totalRows = data.metadata.tables.reduce((sum, table) => sum + table.rows, 0);
  return (
    <>
      <section className="kr-hero-board evidence">
        <div>
          <span className="kr-eyebrow">No black box demo</span>
          <h2>{totalRows.toLocaleString("en-IN")} local source rows</h2>
          <p>Every recommendation is backed by the provided CSVs. External weather, pest, NDVI and competitor feeds are marked as future extension points.</p>
        </div>
        <div className="kr-hero-chip">
          <Database size={18} />
          <span>Confidential local dataset</span>
        </div>
      </section>

      <section className="kr-dashboard-grid">
        <Panel title="Dataset tables" meta="Role in scoring">
          <div className="kr-table-stack">
            {data.metadata.tables.map((table) => (
              <div key={table.name} className="kr-table-line">
                <Database size={17} />
                <div>
                  <strong>{table.name}</strong>
                  <small>{table.role}</small>
                </div>
                <span>{table.rows.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Join confidence" meta="Model reliability checks">
          <div className="kr-signal-stack">
            {data.metadata.joinQuality.map((item) => (
              <SignalRow key={item.label} label={item.label} value={Math.round(item.value * 100)} total={100} suffix="%" />
            ))}
          </div>
          <div className="kr-context-strip">
            <ContextBlock icon={<Sprout />} title="Top crops" rows={data.metadata.growerContext.crops} />
            <ContextBlock icon={<Signal />} title="Languages" rows={data.metadata.growerContext.languages} />
            <ContextBlock icon={<Smartphone />} title="Devices" rows={data.metadata.growerContext.devices} />
          </div>
        </Panel>
      </section>
    </>
  );
}

function ActionBoard(props: {
  recommendations: Recommendation[];
  selectedId?: string;
  setSelectedId: (id: string) => void;
  outcomes: Record<string, string>;
}) {
  return (
    <Panel title="Ranked visit board" meta="Click a row to update the action inspector">
      <div className="kr-action-table">
        <div className="kr-action-head">
          <span>Rank</span>
          <span>Retailer</span>
          <span>Recommended action</span>
          <span>Priority</span>
          <span>Score</span>
          <span>Value</span>
        </div>
        {props.recommendations.map((rec, index) => (
          <button
            key={rec.id}
            className={clsx("kr-action-row", props.selectedId === rec.id && "selected")}
            onClick={() => props.setSelectedId(rec.id)}
          >
            <span className="kr-rank">{index + 1}</span>
            <span>
              <strong>{rec.retailerId}</strong>
              <small>{rec.tehsil}, {rec.district}</small>
            </span>
            <span>
              <strong>{rec.product}</strong>
              <small>{rec.nextBestAction}</small>
            </span>
            <span className={clsx("kr-priority", rec.priority.toLowerCase())}>{rec.priority}</span>
            <strong>{rec.score}</strong>
            <span className="kr-money">{formatCurrency(rec.expectedValue)}</span>
            <ChevronRight size={17} />
            {props.outcomes[rec.id] && <em>{props.outcomes[rec.id]}</em>}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function VisitInspector(props: {
  recommendation: Recommendation;
  mlRecommendation?: (typeof mlData.mlRecommendations)[number];
  dashboardContext: unknown;
  outcome?: string;
  setOutcome: (outcome: string) => void;
}) {
  const rec = props.recommendation;
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content:
        "I can turn this recommendation into a field-ready plan, retailer pitch, risk check, or manager summary.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  const askCopilot = async (message: string) => {
    const clean = message.trim();
    if (!clean || isAsking) return;

    const nextMessages = [...messages, { role: "user" as const, content: clean }];
    setMessages(nextMessages);
    setDraft("");
    setIsAsking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history: messages,
          context: {
            selectedRecommendation: rec,
            mlPrediction: props.mlRecommendation ?? null,
            dashboard: props.dashboardContext,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI copilot request failed.");
      setMessages([...nextMessages, { role: "assistant", content: payload.answer }]);
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "AI copilot is not available right now.",
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="kr-inspector-inner">
      <div className="kr-inspector-hero">
        <span className={clsx("kr-priority", rec.priority.toLowerCase())}>{rec.priority}</span>
        <h2>{rec.product}</h2>
        <p>{rec.retailerId} - {rec.tehsil}</p>
        <div className="kr-score-ring">
          <strong>{rec.score}</strong>
          <span>urgency</span>
        </div>
      </div>

      <section className="kr-copilot">
        <div className="kr-copilot-head">
          <div className="kr-copilot-orb">
            <BrainCircuit size={18} />
          </div>
          <div>
            <h3>Ask KrishiRoute</h3>
            <small>AI copilot for this retailer action</small>
          </div>
        </div>

        <div className="kr-copilot-context">
          <span>{rec.priority} priority</span>
          <span>{formatCurrency(rec.expectedValue)} expected value</span>
          <span>{props.mlRecommendation ? `${formatPct(props.mlRecommendation.stockoutProbability)} stockout risk` : "model context ready"}</span>
        </div>

        <div className="kr-prompt-chips">
          {[
            "Give me a 3-step field plan",
            "Write the retailer pitch",
            "What risk should I check?",
            "Summarize for my manager",
          ].map((prompt) => (
            <button key={prompt} onClick={() => askCopilot(prompt)} disabled={isAsking}>
              {prompt}
            </button>
          ))}
        </div>

        <div className="kr-chat-log">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={clsx("kr-chat-message", message.role)}>
              {message.content}
            </div>
          ))}
          {isAsking && (
            <div className="kr-chat-message assistant thinking">
              <span />
              Reading retailer, stock and sales context
            </div>
          )}
        </div>

        <form
          className="kr-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            askCopilot(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask what to do, say, or watch..."
          />
          <button type="submit" disabled={isAsking || !draft.trim()} aria-label="Send message">
            <SendHorizontal size={16} />
          </button>
        </form>
      </section>

      <section className="kr-next-action">
        <span>Next best action</span>
        <strong>{rec.nextBestAction}</strong>
      </section>

      <section className="kr-reasons">
        <h3>Explainability</h3>
        {rec.reasons.map((reason) => (
          <div key={reason}>
            <CheckCircle2 size={16} />
            <span>{reason}</span>
          </div>
        ))}
      </section>

      <section className="kr-inspector-metrics">
        <MiniMetric label="Expected value" value={formatCurrency(rec.expectedValue)} />
        <MiniMetric label="Recent qty" value={rec.recentQty.toString()} />
        <MiniMetric label="Inventory" value={`${rec.latestInventory}/${rec.normalInventory}`} />
        <MiniMetric label="Visit gap" value={`${rec.visitGapDays}d`} />
      </section>

      <section className="kr-outcome">
        <h3>Outcome logging</h3>
        <div>
          {["Sale made", "Order placed", "No interest", "Stock issue"].map((label) => (
            <button
              key={label}
              className={clsx(props.outcome === label && "active")}
              onClick={() => props.setOutcome(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <small>Session-only feedback shows how the pilot would learn after each visit.</small>
      </section>

    </div>
  );
}

function FloatingCopilot(props: {
  recommendation: Recommendation;
  mlRecommendation?: (typeof mlData.mlRecommendations)[number];
  currentView: string;
  dashboardContext: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content:
        "I can explain the dashboard, prepare a rep plan, or turn the selected retailer action into field talking points.",
    },
  ]);

  const ask = async (message: string) => {
    const clean = message.trim();
    if (!clean || isAsking) return;
    const nextMessages = [...messages, { role: "user" as const, content: clean }];
    setMessages(nextMessages);
    setDraft("");
    setOpen(true);
    setIsAsking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history: messages,
          context: {
            currentView: props.currentView,
            selectedRecommendation: props.recommendation,
            mlPrediction: props.mlRecommendation ?? null,
            dashboard: props.dashboardContext,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI copilot request failed.");
      setMessages([...nextMessages, { role: "assistant", content: payload.answer }]);
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "AI copilot is not available right now.",
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className={clsx("kr-floating-ai", open && "open")}>
      {open && (
        <motion.section
          className="kr-floating-panel"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18 }}
        >
          <div className="kr-floating-head">
            <div>
              <span>Ask KrishiRoute AI</span>
              <strong>{props.recommendation.retailerId} - {props.recommendation.product}</strong>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close AI assistant">x</button>
          </div>

          <div className="kr-floating-prompts">
            {[
              "Explain this screen",
              "What should I do next?",
              "Give retailer talking points",
            ].map((prompt) => (
              <button key={prompt} onClick={() => ask(prompt)} disabled={isAsking}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="kr-floating-log">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={clsx("kr-chat-message", message.role)}>
                {message.content}
              </div>
            ))}
            {isAsking && <div className="kr-chat-message assistant">Reading the live app context...</div>}
          </div>

          <form
            className="kr-floating-form"
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about route, retailer, risk..."
            />
            <button disabled={isAsking || !draft.trim()} aria-label="Send">
              <SendHorizontal size={16} />
            </button>
          </form>
        </motion.section>
      )}

      <button className="kr-floating-trigger" onClick={() => setOpen((value) => !value)}>
        <span className="kr-floating-orb">
          <BrainCircuit size={20} />
        </span>
        <span className="kr-floating-copy">
          <strong>Ask KrishiRoute AI</strong>
          <small>{props.currentView === "plan" ? `${props.recommendation.retailerId} field plan` : "Explain this workspace"}</small>
        </span>
        <i />
      </button>
    </div>
  );
}

function OnboardingGuide(props: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "Start with the rep route",
      body: "The main screen ranks retailer visits for the selected rep using sales, inventory, visit history and ML signals.",
      preview: "Rep selector -> ranked visit list -> route score",
      icon: Route,
    },
    {
      title: "Read the first move",
      body: "The command strip shows the top recommended retailer-product action for the day before the rep starts field work.",
      preview: "Top action -> SKU -> next best action",
      icon: Target,
    },
    {
      title: "Open a recommendation",
      body: "Click any row in the ranked board. The right panel updates with the reason, value, stock risk and expected action.",
      preview: "Retailer row -> explanation -> outcome",
      icon: ClipboardCheck,
    },
    {
      title: "Ask KrishiRoute AI",
      body: "Use the copilot to convert a recommendation into a field plan, retailer pitch, manager summary or risk checklist.",
      preview: "Ask -> business answer -> rep-ready script",
      icon: BrainCircuit,
    },
    {
      title: "Use command and evidence views",
      body: "Manager Command shows territory-level opportunities. Evidence shows which dataset tables power the recommendations.",
      preview: "KPIs -> anomalies -> data lineage",
      icon: Database,
    },
  ];
  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="kr-guide-backdrop">
      <motion.section
        className="kr-guide"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="kr-guide-icon">
          <Icon size={24} />
        </div>
        <span className="kr-eyebrow">Quick walkthrough - step {step + 1} of {steps.length}</span>
        <h2>{current.title}</h2>
        <p>{current.body}</p>

        <div className="kr-guide-preview">
          {current.preview.split(" -> ").map((item, index) => (
            <span key={item}>
              {item}
              {index < current.preview.split(" -> ").length - 1 && <ChevronRight size={14} />}
            </span>
          ))}
        </div>

        <div className="kr-guide-dots">
          {steps.map((item, index) => (
            <button
              key={item.title}
              className={clsx(index === step && "active")}
              onClick={() => setStep(index)}
              aria-label={`Go to walkthrough step ${index + 1}`}
            />
          ))}
        </div>

        <div className="kr-guide-actions">
          <button className="ghost" onClick={props.onClose}>Skip</button>
          <button
            onClick={() => {
              if (step === steps.length - 1) props.onClose();
              else setStep((value) => value + 1);
            }}
          >
            {step === steps.length - 1 ? "Start using app" : "Next"}
          </button>
        </div>
      </motion.section>
    </div>
  );
}

function Panel(props: { title: string; meta?: string; className?: string; children: ReactNode }) {
  return (
    <section className={clsx("kr-panel", props.className)}>
      <div className="kr-panel-head">
        <div>
          <h3>{props.title}</h3>
          {props.meta && <span>{props.meta}</span>}
        </div>
        <ArrowUpRight size={17} />
      </div>
      {props.children}
    </section>
  );
}

function MetricTile(props: { icon: ReactNode; label: string; value: string; accent: "green" | "blue" | "gold" | "red" }) {
  return (
    <motion.div className={clsx("kr-metric-tile", props.accent)} whileHover={{ y: -2 }}>
      <span>{props.icon}</span>
      <small>{props.label}</small>
      <strong>{props.value}</strong>
    </motion.div>
  );
}

function MiniMetric(props: { label: string; value: string }) {
  return (
    <div className="kr-mini-metric">
      <small>{props.label}</small>
      <strong>{props.value}</strong>
    </div>
  );
}

function SignalRow(props: { label: string; value: number; total: number; suffix?: string }) {
  const pct = Math.min(100, Math.round((props.value / props.total) * 100));
  return (
    <div className="kr-signal-row">
      <div>
        <span>{props.label}</span>
        <strong>{props.value}{props.suffix ?? ""}</strong>
      </div>
      <i>
        <b style={{ width: `${pct}%` }} />
      </i>
    </div>
  );
}

function ContextBlock(props: { icon: ReactNode; title: string; rows: Array<[string, number]> }) {
  return (
    <div className="kr-context-block">
      <h4>{props.icon}{props.title}</h4>
      {props.rows.slice(0, 4).map(([label, value]) => (
        <span key={label}>{label} <strong>{formatCompact(value)}</strong></span>
      ))}
    </div>
  );
}

