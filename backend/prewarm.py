import sys
import time
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from config import POPULAR_DISEASES, FEATURE_NAMES, TRAINED_MODEL_DIR, CHECKPOINTS_DIR
from config import MAX_CANDIDATE_DRUGS, PARALLEL_WORKERS, SKIP_ALPHAFOLD
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
import warnings
import numpy as np
import pandas as pd
import joblib

from src.opentargets_client import OpenTargetsClient
from src.data_loader import DataLoader
from src.feature_engine import FeatureEngine
from src.gates import PostModelGates

print("Initialising pipeline...")
client = OpenTargetsClient(use_cache=True)
loader = DataLoader(use_cache=True)
engine = FeatureEngine(
    opentargets_client=client,
    structure_handler=None if SKIP_ALPHAFOLD else loader.structure_handler,
)
gates = PostModelGates(opentargets_client=client)

model_json   = TRAINED_MODEL_DIR / "xgb_temporal_model.json"
model_joblib = CHECKPOINTS_DIR / "final_xgb_classifier.joblib"
scaler_path  = TRAINED_MODEL_DIR / "feature_scaler.joblib"

model = None
if model_json.exists():
    import xgboost as xgb
    m = xgb.XGBClassifier()
    m.load_model(str(model_json))
    model = m
    print("[OK] Model loaded")
elif model_joblib.exists():
    model = joblib.load(str(model_joblib))
    print("[OK] Model loaded (joblib)")
else:
    print("[ERROR] No model found -- aborting")
    sys.exit(1)

scaler = joblib.load(str(scaler_path)) if scaler_path.exists() else None

CACHE_DIR = BACKEND_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

import hashlib

def _disk_path(key: str) -> Path:
    h = hashlib.md5(key.encode()).hexdigest()
    return CACHE_DIR / f"{h}.json"


def _get_candidate_drugs(disease_id: str) -> list:
    all_drugs = {}
    try:
        for drug in client.get_drugs_for_disease(disease_id, limit=50):
            did = drug.get("drug_id", "")
            if did.startswith("CHEMBL"):
                all_drugs[did] = drug
    except Exception:
        pass
    for query in [
        "levodopa", "metformin", "atorvastatin", "aspirin", "prednisone",
        "adalimumab", "rituximab", "gabapentin", "ibuprofen", "omalizumab",
    ]:
        try:
            for drug in client.search_drugs(query, limit=2):
                did = drug.get("drug_id", "")
                if did.startswith("CHEMBL"):
                    all_drugs[did] = drug
        except Exception:
            continue
    return list(all_drugs.values())


def _score_drug(drug: dict, disease_id: str) -> Optional[dict]:
    drug_id   = drug.get("drug_id", "")
    drug_name = drug.get("drug_name", drug_id)
    if not drug_id:
        return None
    try:
        features = engine.compute_features(drug_id, disease_id)
        if SKIP_ALPHAFOLD:
            features["mean_plddt"]          = float("nan")
            features["low_confidence_frac"] = float("nan")
        fv = [features.get(f, float("nan")) for f in FEATURE_NAMES]
        if scaler:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fv = scaler.transform([fv])[0].tolist()
        prob = float(model.predict_proba([fv])[0][1])
        props = {}
        try:
            props = client.get_drug_properties(drug_id)
        except Exception:
            pass
        return {
            "drug_id": drug_id, "drug_name": drug_name, "score": prob,
            "gene_overlap":      int(features.get("gene_overlap_count", 0)),
            "association_score": float(features.get("max_association_score", 0)),
            "drug_type":         props.get("drug_type", "Unknown"),
            "max_phase":         int(props.get("max_phase", 0)),
            "mechanism":         props.get("mechanism_class", "Unknown"),
        }
    except Exception:
        return None


def prewarm_disease(name: str, did: str, top_k: int = 10):
    key        = f"{did}_{top_k}"
    cache_file = _disk_path(key)
    if cache_file.exists():
        print(f"  [skip] Already cached: {name}")
        return

    t0 = time.time()
    try:
        client.get_disease_genes(did, limit=100)

        drugs = _get_candidate_drugs(did)[:MAX_CANDIDATE_DRUGS]
        if not drugs:
            print(f"  [WARN] No drugs found: {name}")
            return

        predictions = []
        with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as pool:
            futures = {pool.submit(_score_drug, d, did): d for d in drugs}
            for fut in as_completed(futures):
                res = fut.result()
                if res:
                    predictions.append(res)

        if not predictions:
            print(f"  [WARN] Scoring failed: {name}")
            return

        try:
            drug_ids    = [pred["drug_id"] for pred in predictions]
            base_scores = pd.Series([pred["score"] for pred in predictions])
            feats_g     = [{"gene_overlap_count": pred["gene_overlap"],
                            "max_association_score": pred["association_score"]} for pred in predictions]
            adj, _ = gates.apply_gates(base_scores, drug_ids, did, features_list=feats_g)
            for i, pred in enumerate(predictions):
                pred["score"] = float(adj.iloc[i])
        except Exception:
            pass

        predictions.sort(key=lambda x: x["score"], reverse=True)

        candidates = []
        for rank, pred in enumerate(predictions[:top_k], 1):
            pct  = pred["score"] * 100
            conf = "High" if pct >= 70 else ("Medium" if pct >= 40 else "Low")
            candidates.append({
                "rank": rank, "drug_id": pred["drug_id"], "drug_name": pred["drug_name"],
                "score": round(pred["score"], 4), "confidence": conf,
                "drug_type": pred.get("drug_type", "Unknown"),
                "max_phase": pred.get("max_phase", 0),
                "mechanism": pred.get("mechanism", "Unknown"),
                "gene_overlap": pred.get("gene_overlap", 0),
                "association_score": round(pred.get("association_score", 0), 4),
                "guardrail": "",
            })

        disease_name = name
        try:
            search_result = client.search_diseases(did, limit=1)
            if search_result:
                disease_name = search_result[0].get("disease_name", name)
        except Exception:
            pass

        result = {
            "disease_id": did, "disease_name": disease_name,
            "candidates": candidates, "total_evaluated": len(predictions),
        }
        with open(cache_file, "w") as f:
            json.dump(result, f)

        elapsed = time.time() - t0
        print(f"  [OK] {name}: {len(candidates)} drugs in {elapsed:.1f}s")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] {name}: {e}")


if __name__ == "__main__":
    total_start = time.time()
    print(f"\nPre-warming {len(POPULAR_DISEASES)} diseases...\n")
    for dname, did in POPULAR_DISEASES:
        prewarm_disease(dname, did)
    total = time.time() - total_start
    print(f"\nDone in {total:.1f}s -- all results cached to backend/cache/")
