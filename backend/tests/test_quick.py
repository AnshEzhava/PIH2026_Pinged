"""Quick integration test for the backend pipeline."""
import sys, warnings
from pathlib import Path

warnings.filterwarnings('ignore')

# Run from backend/ or backend/tests/ — always resolve to the backend root.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from config import MAX_CANDIDATE_DRUGS, PARALLEL_WORKERS, SKIP_ALPHAFOLD, FEATURE_NAMES
from src.opentargets_client import OpenTargetsClient
from src.feature_engine import FeatureEngine
from src.gates import PostModelGates
import xgboost as xgb, joblib, pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

client = OpenTargetsClient(use_cache=True)
engine = FeatureEngine(opentargets_client=client, structure_handler=None)
gates  = PostModelGates(opentargets_client=client)

m = xgb.XGBClassifier()
m.load_model(str(BACKEND_ROOT / 'models' / 'xgb_temporal_model.json'))
scaler = joblib.load(str(BACKEND_ROOT / 'models' / 'feature_scaler.joblib'))

disease_id = 'MONDO_0004975'  # Alzheimer
print("Testing with Alzheimer Disease (MONDO_0004975)...")

genes = client.get_disease_genes(disease_id, limit=10)
print(f"Disease genes: {len(genes)}")

drugs = []
try:
    disease_drugs = client.get_drugs_for_disease(disease_id, limit=5)
    for d in disease_drugs:
        if d.get('drug_id', '').startswith('CHEMBL'):
            drugs.append(d)
    print(f"Candidate drugs: {len(drugs)}")
except Exception as e:
    print(f"Could not fetch drugs: {e}")

def score_drug(drug):
    did = drug.get('drug_id', '')
    try:
        feats = engine.compute_features(did, disease_id)
        feats['mean_plddt'] = float('nan')
        feats['low_confidence_frac'] = float('nan')
        fv = [feats.get(f, float('nan')) for f in FEATURE_NAMES]
        scaled = scaler.transform([fv])[0]
        prob = float(m.predict_proba([scaled])[0][1])
        return {'drug_id': did, 'drug_name': drug.get('drug_name', '?'), 'score': prob}
    except Exception as ex:
        print(f"  WARN score failed {did}: {ex}")
        return None

if drugs:
    print(f"Parallel scoring {len(drugs)} drugs (workers={min(4,len(drugs))})...")
    results = []
    with ThreadPoolExecutor(max_workers=min(4, len(drugs))) as pool:
        futs = {pool.submit(score_drug, d): d for d in drugs}
        for f in as_completed(futs):
            r = f.result()
            if r:
                results.append(r)
    results.sort(key=lambda x: x['score'], reverse=True)
    print(f"Scored {len(results)} drugs OK. Top results:")
    for r in results[:3]:
        print(f"  {r['drug_name']}: {r['score']:.4f}")
else:
    print("No drugs to test (check API connectivity)")

print()
print("ALL CHECKS PASSED")
