from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor, IsolationForest, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OrdinalEncoder


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "src" / "data" / "ml_insights.json"

RANDOM_STATE = 42
MAX_TRAIN_ROWS = 180_000
MAX_INFERENCE_ROWS = 80_000


def week_end(series: pd.Series) -> pd.Series:
    dates = pd.to_datetime(series)
    return dates + pd.to_timedelta(6 - dates.dt.dayofweek, unit="D")


def read_csv(name: str) -> pd.DataFrame:
    return pd.read_csv(RAW / name)


def safe_auc(y_true: pd.Series, y_pred: np.ndarray) -> float | None:
    if y_true.nunique() < 2:
        return None
    return float(roc_auc_score(y_true, y_pred))


def build_panel() -> tuple[pd.DataFrame, list[str], list[str]]:
    pos = read_csv("retailer_pos.csv")
    inv = read_csv("retailer_inventory_weekly.csv")
    retailers = read_csv("retailers.csv")
    visits = read_csv("retailer_visit_log.csv")

    pos["week_end_date"] = week_end(pos["transaction_date"])
    pos["revenue"] = pos["sku_qty"] * pos["sku_price"]
    weekly_sales = (
        pos.groupby(["retailer_id", "sku_id", "sku_name", "week_end_date"], as_index=False)
        .agg(sales_qty=("sku_qty", "sum"), revenue=("revenue", "sum"), transactions=("transaction_id", "nunique"))
    )

    inv["week_end_date"] = pd.to_datetime(inv["week_end_date"])
    inventory = inv.rename(columns={"sku_qty": "inventory_qty"})

    panel = inventory.merge(
        weekly_sales,
        on=["retailer_id", "sku_id", "sku_name", "week_end_date"],
        how="left",
    )
    panel[["sales_qty", "revenue", "transactions"]] = panel[["sales_qty", "revenue", "transactions"]].fillna(0)
    panel = panel.merge(retailers, on="retailer_id", how="left")

    visits["week_end_date"] = week_end(visits["visit_date"])
    visit_features = (
        visits.groupby(["territory_id", "visit_tehsil", "product_recommended", "week_end_date"], as_index=False)
        .size()
        .rename(columns={"visit_tehsil": "tehsil", "product_recommended": "sku_name", "size": "visit_count"})
    )
    panel = panel.merge(
        visit_features,
        on=["territory_id", "tehsil", "sku_name", "week_end_date"],
        how="left",
    )
    panel["visit_count"] = panel["visit_count"].fillna(0)

    panel = panel.sort_values(["retailer_id", "sku_id", "week_end_date"])
    group = panel.groupby(["retailer_id", "sku_id"], sort=False)
    panel["lag_1_sales_qty"] = group["sales_qty"].shift(1)
    panel["lag_2_sales_qty"] = group["sales_qty"].shift(2)
    panel["lag_4_sales_qty"] = group["sales_qty"].shift(4)
    panel["rolling_4_sales_qty"] = group["sales_qty"].transform(
        lambda series: series.shift(1).rolling(4, min_periods=1).mean()
    )
    panel["lag_1_revenue"] = group["revenue"].shift(1)
    panel["rolling_4_revenue"] = group["revenue"].transform(
        lambda series: series.shift(1).rolling(4, min_periods=1).mean()
    )
    panel["lag_1_inventory"] = group["inventory_qty"].shift(1)
    panel["next_week_revenue"] = group["revenue"].shift(-1)
    panel["next_week_sales_qty"] = group["sales_qty"].shift(-1)
    panel["next_week_inventory"] = group["inventory_qty"].shift(-1)

    panel["inventory_ratio"] = panel["inventory_qty"] / (panel["lag_1_inventory"].replace(0, np.nan))
    panel["inventory_ratio"] = panel["inventory_ratio"].replace([np.inf, -np.inf], np.nan).fillna(1)
    panel["sales_velocity"] = panel["sales_qty"] / (panel["inventory_qty"] + 1)
    panel["stockout_next_week"] = (panel["next_week_inventory"].fillna(99999) <= 0).astype(int)
    panel["week_index"] = ((panel["week_end_date"] - panel["week_end_date"].min()).dt.days // 7).astype(int)

    feature_cols = [
        "inventory_qty",
        "sales_qty",
        "revenue",
        "transactions",
        "visit_count",
        "lag_1_sales_qty",
        "lag_2_sales_qty",
        "lag_4_sales_qty",
        "rolling_4_sales_qty",
        "lag_1_revenue",
        "rolling_4_revenue",
        "lag_1_inventory",
        "inventory_ratio",
        "sales_velocity",
        "week_index",
        "state_code",
        "district_code",
        "tehsil_code",
        "sku_code",
    ]
    categorical_cols = ["state", "district", "tehsil", "sku_name"]

    encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
    encoded = encoder.fit_transform(panel[categorical_cols].fillna("unknown"))
    for idx, col in enumerate(["state_code", "district_code", "tehsil_code", "sku_code"]):
        panel[col] = encoded[:, idx]

    numeric_cols = [
        "inventory_qty",
        "sales_qty",
        "revenue",
        "transactions",
        "visit_count",
        "lag_1_sales_qty",
        "lag_2_sales_qty",
        "lag_4_sales_qty",
        "rolling_4_sales_qty",
        "lag_1_revenue",
        "rolling_4_revenue",
        "lag_1_inventory",
        "inventory_ratio",
        "sales_velocity",
        "next_week_revenue",
        "next_week_sales_qty",
        "next_week_inventory",
    ]
    panel[numeric_cols] = panel[numeric_cols].replace([np.inf, -np.inf], np.nan).fillna(0)
    return panel, feature_cols, categorical_cols


def train_models() -> dict:
    print("Building ML feature panel...")
    panel, feature_cols, categorical_cols = build_panel()
    usable = panel[panel["next_week_revenue"].notna()].copy()

    if len(usable) > MAX_TRAIN_ROWS:
      usable = usable.sample(MAX_TRAIN_ROWS, random_state=RANDOM_STATE)

    X = usable[feature_cols]
    y_revenue = np.log1p(usable["next_week_revenue"])
    y_stockout = usable["stockout_next_week"]

    train_idx, test_idx = train_test_split(
        np.arange(len(usable)),
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=y_stockout if y_stockout.nunique() > 1 else None,
    )

    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_rev_train, y_rev_test = y_revenue.iloc[train_idx], y_revenue.iloc[test_idx]
    y_stock_train, y_stock_test = y_stockout.iloc[train_idx], y_stockout.iloc[test_idx]

    print(f"Training demand model on {len(X_train):,} rows...")
    demand_model = HistGradientBoostingRegressor(
        max_iter=180,
        learning_rate=0.075,
        l2_regularization=0.04,
        random_state=RANDOM_STATE,
    )
    demand_model.fit(X_train, y_rev_train)
    revenue_pred = np.expm1(demand_model.predict(X_test)).clip(min=0)
    revenue_actual = np.expm1(y_rev_test)

    print("Training stockout probability model...")
    stockout_model = HistGradientBoostingClassifier(
        max_iter=160,
        learning_rate=0.075,
        l2_regularization=0.04,
        random_state=RANDOM_STATE,
    )
    stockout_model.fit(X_train, y_stock_train)
    stockout_proba = stockout_model.predict_proba(X_test)[:, 1]

    print("Training anomaly detector...")
    anomaly_features = [
        "inventory_qty",
        "sales_qty",
        "revenue",
        "transactions",
        "visit_count",
        "rolling_4_sales_qty",
        "rolling_4_revenue",
        "inventory_ratio",
        "sales_velocity",
        "week_index",
    ]
    anomaly_train = usable[anomaly_features].sample(min(len(usable), 80_000), random_state=RANDOM_STATE)
    anomaly_model = IsolationForest(
        n_estimators=160,
        contamination=0.035,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    anomaly_model.fit(anomaly_train)

    print("Training feature importance surrogate...")
    surrogate_rows = min(len(X_train), 40_000)
    surrogate_sample = X_train.sample(surrogate_rows, random_state=RANDOM_STATE)
    surrogate_target = y_rev_train.loc[surrogate_sample.index]
    importance_model = RandomForestRegressor(
        n_estimators=80,
        max_depth=12,
        min_samples_leaf=8,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    importance_model.fit(surrogate_sample, surrogate_target)

    latest_week = panel["week_end_date"].max()
    inference = panel[panel["week_end_date"] == latest_week].copy()
    if len(inference) > MAX_INFERENCE_ROWS:
        inference = inference.sample(MAX_INFERENCE_ROWS, random_state=RANDOM_STATE)
    inference["ml_predicted_revenue"] = np.expm1(demand_model.predict(inference[feature_cols])).clip(min=0)
    inference["ml_stockout_probability"] = stockout_model.predict_proba(inference[feature_cols])[:, 1]
    anomaly_score = -anomaly_model.score_samples(inference[anomaly_features])
    inference["ml_anomaly_score"] = anomaly_score
    threshold = np.quantile(anomaly_score, 0.965)
    inference["ml_is_anomaly"] = inference["ml_anomaly_score"] >= threshold

    ranked = inference.sort_values(
        ["ml_stockout_probability", "ml_predicted_revenue", "ml_anomaly_score"],
        ascending=[False, False, False],
    ).head(350)

    feature_importance = sorted(
        [
            {"feature": feature, "importance": float(value)}
            for feature, value in zip(feature_cols, importance_model.feature_importances_)
        ],
        key=lambda row: row["importance"],
        reverse=True,
    )[:10]

    output = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "sourceReposAndMethods": [
            {
                "name": "Nixtla MLForecast",
                "url": "https://github.com/Nixtla/mlforecast",
                "usedFor": "Lag-feature machine-learning forecasting pattern adapted to Syngenta retailer-SKU weekly POS.",
            },
            {
                "name": "scikit-learn HistGradientBoostingRegressor",
                "url": "https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html",
                "usedFor": "Next-week retailer-SKU revenue prediction.",
            },
            {
                "name": "scikit-learn IsolationForest",
                "url": "https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html",
                "usedFor": "Unsupervised demand/inventory anomaly detection.",
            },
        ],
        "modelCards": [
            {
                "id": "demand_forecast_hgb",
                "name": "Next-week demand forecaster",
                "algorithm": "HistGradientBoostingRegressor",
                "target": "log1p(next_week_revenue)",
                "trainingRows": int(len(X_train)),
                "validationRows": int(len(X_test)),
                "maeRevenue": float(mean_absolute_error(revenue_actual, revenue_pred)),
                "r2LogRevenue": float(r2_score(y_rev_test, demand_model.predict(X_test))),
            },
            {
                "id": "stockout_probability_hgb",
                "name": "Stockout risk classifier",
                "algorithm": "HistGradientBoostingClassifier",
                "target": "next_week_inventory <= 0",
                "trainingRows": int(len(X_train)),
                "validationRows": int(len(X_test)),
                "rocAuc": safe_auc(y_stock_test, stockout_proba),
                "positiveRate": float(y_stockout.mean()),
            },
            {
                "id": "opportunity_isolation_forest",
                "name": "Demand and inventory anomaly detector",
                "algorithm": "IsolationForest",
                "target": "unsupervised outlier score",
                "trainingRows": int(len(anomaly_train)),
                "contamination": 0.035,
                "latestWeekThreshold": float(threshold),
            },
        ],
        "featureImportance": feature_importance,
        "latestWeek": str(latest_week.date()),
        "mlRecommendations": [
            {
                "retailerId": row.retailer_id,
                "territoryId": row.territory_id,
                "state": row.state,
                "district": row.district,
                "tehsil": row.tehsil,
                "skuId": row.sku_id,
                "product": row.sku_name,
                "weekEndDate": str(row.week_end_date.date()),
                "predictedRevenue": round(float(row.ml_predicted_revenue), 2),
                "stockoutProbability": round(float(row.ml_stockout_probability), 4),
                "anomalyScore": round(float(row.ml_anomaly_score), 4),
                "isAnomaly": bool(row.ml_is_anomaly),
                "currentInventory": int(row.inventory_qty),
                "currentSalesQty": float(row.sales_qty),
                "rolling4SalesQty": round(float(row.rolling_4_sales_qty), 2),
                "visitCount": int(row.visit_count),
            }
            for row in ranked.itertuples(index=False)
        ],
    }
    return output


def main() -> None:
    output = train_models()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    for card in output["modelCards"]:
        print(card)


if __name__ == "__main__":
    main()
