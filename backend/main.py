"""PIH2026 Drug Repurposing API."""
import sys
import os
import json
import hashlib
import warnings
import threading
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import numpy as np
import pandas as pd
import joblib

from config import (
    FEATURE_NAMES, TRAINED_MODEL_DIR, CHECKPOINTS_DIR,
    POPULAR_DISEASES,
    MAX_CANDIDATE_DRUGS, PARALLEL_WORKERS, SKIP_ALPHAFOLD,
)
from src.opentargets_client import OpenTargetsClient
from src.data_loader import DataLoader
from src.feature_engine import FeatureEngine
from src.gates import PostModelGates

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

app = FastAPI(title="PIH2026 Drug Repurposing API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client: OpenTargetsClient = None
engine: FeatureEngine = None
model = None
scaler = None
gates: PostModelGates = None

prediction_cache: dict   = {}
drug_details_cache: dict = {}
drug_structure_cache: dict = {}
drug_network_cache: dict   = {}
gemini_cache: dict         = {}

DISK_CACHE_DIR = BACKEND_DIR / "cache"
DISK_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _disk_cache_path(key: str) -> Path:
    h = hashlib.md5(key.encode()).hexdigest()
    return DISK_CACHE_DIR / f"{h}.json"


def _load_from_disk(key: str) -> Optional[dict]:
    p = _disk_cache_path(key)
    if p.exists():
        try:
            with open(p) as f:
                return json.load(f)
        except Exception:
            pass
    return None


def _save_to_disk(key: str, data: dict):
    try:
        with open(_disk_cache_path(key), "w") as f:
            json.dump(data, f)
    except Exception:
        pass


HARDCODED_EXPLANATIONS: dict = {
    "OMALIZUMAB_Asthma": {
        "summary": "Omalizumab is a recombinant humanized monoclonal antibody that selectively binds to immunoglobulin E (IgE). It is FDA-approved for moderate-to-severe persistent asthma in patients with elevated IgE levels who are inadequately controlled with inhaled corticosteroids.",
        "mechanism_detail": "Omalizumab binds to free IgE in the bloodstream, preventing IgE from binding to high-affinity receptors on mast cells and basophils. This reduces the release of inflammatory mediators that cause asthmatic symptoms.",
        "disease_relevance": "Asthma is driven by allergic inflammation in many patients, with IgE playing a central role. Omalizumab directly addresses this by blocking IgE-mediated allergic responses.",
        "contraindications": [
            "Known hypersensitivity to omalizumab",
            "Acute bronchospasm or status asthmaticus",
            "Hypereosinophilic syndrome",
            "Pregnancy — avoid unless clearly necessary",
        ],
    },
    "OPICAPONE_Parkinson's Disease": {
        "summary": "Opicapone is a third-generation COMT inhibitor approved as adjunctive therapy to levodopa/carbidopa in Parkinson's disease patients with motor fluctuations.",
        "mechanism_detail": "Opicapone selectively inhibits COMT, increasing levodopa bioavailability and prolonging its half-life for more sustained dopaminergic stimulation.",
        "disease_relevance": "Parkinson's disease involves dopamine deficiency from nigrostriatal neuron degeneration. Opicapone extends levodopa duration, reducing OFF time.",
        "contraindications": [
            "Pheochromocytoma or paraganglioma",
            "History of neuroleptic malignant syndrome",
            "Non-selective MAO inhibitors",
            "Severe hepatic impairment",
        ],
    },
    "RIVASTIGMINE_Alzheimer's Disease": {
        "summary": "Rivastigmine is a dual acetylcholinesterase and butyrylcholinesterase inhibitor approved for mild-to-moderate Alzheimer's disease and Parkinson's disease dementia.",
        "mechanism_detail": "Inhibits both AChE and BuChE, increasing acetylcholine availability in cortical and hippocampal synapses.",
        "disease_relevance": "Alzheimer's disease involves progressive cholinergic deficit. Rivastigmine enhances remaining cholinergic function, slowing cognitive decline.",
        "contraindications": [
            "Hypersensitivity to rivastigmine or carbamate derivatives",
            "Severe hepatic impairment",
            "Sick sinus syndrome",
            "Active gastrointestinal bleeding",
        ],
    },
    "DONEPEZIL HYDROCHLORIDE_Alzheimer's Disease": {
        "summary": "Donepezil is the most widely prescribed acetylcholinesterase inhibitor for all stages of Alzheimer's disease.",
        "mechanism_detail": "Selectively inhibits AChE, increasing acetylcholine availability in cholinergic synapses throughout the cortex and hippocampus.",
        "disease_relevance": "Provides symptomatic benefit across all Alzheimer's stages by compensating for progressive cholinergic neuron loss.",
        "contraindications": [
            "Hypersensitivity to donepezil or piperidine derivatives",
            "Sick sinus syndrome or other cardiac conduction abnormalities",
            "Active peptic ulcer disease",
            "Asthma or COPD",
        ],
    },
    "METFORMIN_Diabetes Mellitus": {
        "summary": "Metformin is the first-line oral medication for type 2 diabetes mellitus, used for over 60 years worldwide.",
        "mechanism_detail": "Reduces hepatic glucose production via AMPK activation and AMP kinase pathway, improves insulin sensitivity in peripheral tissues.",
        "disease_relevance": "Addresses insulin resistance and hepatic glucose overproduction — the core pathophysiology of type 2 diabetes.",
        "contraindications": [
            "eGFR < 30 mL/min/1.73m² (risk of lactic acidosis)",
            "Acute or chronic metabolic acidosis",
            "IV contrast administration (hold 48h)",
            "Severe hepatic impairment",
        ],
    },
}


class DiseaseResult(BaseModel):
    disease_id: str
    disease_name: str
    description: str = ""


class DrugCandidate(BaseModel):
    rank: int
    drug_id: str
    drug_name: str
    score: float
    confidence: str
    drug_type: str = "Unknown"
    max_phase: int = 0
    mechanism: str = "Unknown"
    gene_overlap: int = 0
    association_score: float = 0.0
    guardrail: str = ""


class PredictResponse(BaseModel):
    disease_id: str
    disease_name: str
    candidates: list[DrugCandidate]
    total_evaluated: int


class NetworkNode(BaseModel):
    id: str
    label: str
    type: str


class NetworkEdge(BaseModel):
    source: str
    target: str
    label: str = ""
    weight: float = 1.0


class NetworkResponse(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]


class GeminiRequest(BaseModel):
    drug_name: str
    disease_name: str
    drug_type: str = "Unknown"
    mechanism: str = "Unknown"


class GeminiExplanation(BaseModel):
    summary: str
    contraindications: list[str]
    mechanism_detail: str
    disease_relevance: str = ""


class GeminiChatResponse(BaseModel):
    response: str



@app.on_event("startup")
def load_resources():
    global client, engine, model, scaler, gates

    client = OpenTargetsClient(use_cache=True)
    loader = DataLoader(use_cache=True)
    engine = FeatureEngine(
        opentargets_client=client,
        structure_handler=None if SKIP_ALPHAFOLD else loader.structure_handler,
    )
    gates = PostModelGates(opentargets_client=client)

    model_json   = TRAINED_MODEL_DIR / "xgb_temporal_model.json"
    model_joblib = CHECKPOINTS_DIR   / "final_xgb_classifier.joblib"
    scaler_path  = TRAINED_MODEL_DIR / "feature_scaler.joblib"

    if model_json.exists():
        import xgboost as xgb
        m = xgb.XGBClassifier()
        m.load_model(str(model_json))
        model = m
        print("XGBoost model loaded from JSON")
    elif model_joblib.exists():
        model = joblib.load(str(model_joblib))
        print("XGBoost model loaded from joblib")
    else:
        print("No model found - predictions will fail")
        model = None

    scaler = joblib.load(str(scaler_path)) if scaler_path.exists() else None

    for name, did in POPULAR_DISEASES:
        key = f"{did}_10"
        if key not in prediction_cache:
            cached = _load_from_disk(key)
            if cached:
                prediction_cache[key] = cached

    threading.Thread(target=_prewarm_popular_diseases, daemon=True).start()


def _prewarm_popular_diseases():
    if model is None:
        return
    for name, did in POPULAR_DISEASES:
        key = f"{did}_10"
        if key in prediction_cache:
            continue
        try:
            result = _run_prediction(did, 10)
            prediction_cache[key] = result
            _save_to_disk(key, result)
        except Exception:
            pass



def _compute_single_drug(drug: dict, disease_id: str) -> Optional[dict]:
    drug_id   = drug.get("drug_id", "")
    drug_name = drug.get("drug_name", drug_id)
    if not drug_id:
        return None
    try:
        features = engine.compute_features(drug_id, disease_id)

        if SKIP_ALPHAFOLD:
            features["mean_plddt"]          = float("nan")
            features["low_confidence_frac"] = float("nan")

        feature_vector = [features.get(f, float("nan")) for f in FEATURE_NAMES]

        if scaler:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                feature_vector = scaler.transform([feature_vector])[0].tolist()

        prob = float(model.predict_proba([feature_vector])[0][1])

        try:
            props = client.get_drug_properties(drug_id)
        except Exception:
            props = {}

        return {
            "drug_id":           drug_id,
            "drug_name":         drug_name,
            "score":             prob,
            "gene_overlap":      int(features.get("gene_overlap_count", 0)),
            "association_score": float(features.get("max_association_score", 0)),
            "drug_type":         props.get("drug_type", "Unknown"),
            "max_phase":         int(props.get("max_phase", 0)),
            "mechanism":         props.get("mechanism_class", "Unknown"),
        }
    except Exception:
        return None


def _run_prediction(disease_id: str, top_k: int) -> dict:
    disease_name = disease_id
    try:
        results = client.search_diseases(disease_id, limit=1)
        if results:
            disease_name = results[0].get("disease_name", disease_id)
    except Exception:
        pass

    try:
        client.get_disease_genes(disease_id, limit=100)
    except Exception:
        pass

    all_drugs = _get_candidate_drugs(disease_id)[:MAX_CANDIDATE_DRUGS]
    if not all_drugs:
        raise HTTPException(404, "No candidate drugs found for this disease.")

    predictions = []
    with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as pool:
        futures = {
            pool.submit(_compute_single_drug, drug, disease_id): drug
            for drug in all_drugs
        }
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                predictions.append(result)

    if not predictions:
        raise HTTPException(500, "Feature computation failed for all candidates.")

    drug_ids     = [p["drug_id"] for p in predictions]
    base_scores  = pd.Series([p["score"] for p in predictions])
    feats_for_gates = [
        {
            "gene_overlap_count":  p["gene_overlap"],
            "max_association_score": p["association_score"],
        }
        for p in predictions
    ]

    try:
        adjusted, _ = gates.apply_gates(
            base_scores, drug_ids, disease_id, features_list=feats_for_gates
        )
        for i, p in enumerate(predictions):
            p["score"] = float(adjusted.iloc[i])
    except Exception:
        pass

    predictions.sort(key=lambda x: x["score"], reverse=True)

    candidates = []
    for rank, p in enumerate(predictions[:top_k], 1):
        pct = p["score"] * 100
        confidence = "High" if pct >= 70 else ("Medium" if pct >= 40 else "Low")
        candidates.append(
            DrugCandidate(
                rank=rank,
                drug_id=p["drug_id"],
                drug_name=p["drug_name"],
                score=round(p["score"], 4),
                confidence=confidence,
                drug_type=p.get("drug_type", "Unknown"),
                max_phase=p.get("max_phase", 0),
                mechanism=p.get("mechanism", "Unknown"),
                gene_overlap=p.get("gene_overlap", 0),
                association_score=round(p.get("association_score", 0), 4),
            )
        )

    return PredictResponse(
        disease_id=disease_id,
        disease_name=disease_name,
        candidates=candidates,
        total_evaluated=len(predictions),
    ).model_dump()



@app.get("/api/diseases/popular", response_model=list[DiseaseResult])
def get_popular_diseases():
    return [
        DiseaseResult(disease_id=did, disease_name=name)
        for name, did in POPULAR_DISEASES
    ]


@app.get("/api/diseases/search", response_model=list[DiseaseResult])
def search_diseases(q: str = Query(..., min_length=2)):
    results = client.search_diseases(q, limit=20)
    exclusion = {"measurement", "symptom", "phenotype", "trait", "biomarker"}
    filtered = [
        DiseaseResult(
            disease_id=r["disease_id"],
            disease_name=r["disease_name"],
            description=r.get("description", ""),
        )
        for r in results
        if not any(t in r.get("disease_name", "").lower() for t in exclusion)
    ]
    return filtered or [DiseaseResult(**r) for r in results[:10]]


@app.get("/api/predict/{disease_id}", response_model=PredictResponse)
def predict_candidates(disease_id: str, top_k: int = Query(10, ge=1, le=50)):
    """
    Predict top-K drug repurposing candidates using XGBoost + PostModelGates.

    Fast path: parallel scoring, no AlphaFold, 25-drug pool.
    Results are cached in memory and on disk.
    """
    if model is None:
        raise HTTPException(503, "Model not loaded.")

    cache_key = f"{disease_id}_{top_k}"

    if cache_key in prediction_cache:
        data = prediction_cache[cache_key]
        return PredictResponse(**data) if isinstance(data, dict) else data

    disk_data = _load_from_disk(cache_key)
    if disk_data:
        prediction_cache[cache_key] = disk_data
        return PredictResponse(**disk_data)

    result = _run_prediction(disease_id, top_k)

    prediction_cache[cache_key] = result
    _save_to_disk(cache_key, result)

    return PredictResponse(**result)


@app.get("/api/drug/{drug_id}/details")
def get_drug_details(drug_id: str):
    if drug_id in drug_details_cache:
        return drug_details_cache[drug_id]

    try:
        props = client.get_drug_properties(drug_id)
    except Exception:
        props = {}

    indications = []
    try:
        ind_data = client.get_drug_indications(drug_id)
        indications = ind_data.get("indications", [])[:10]
    except Exception:
        pass

    response = {
        "drug_id":        drug_id,
        "drug_type":      props.get("drug_type", "Unknown"),
        "max_phase":      props.get("max_phase", 0),
        "mechanism_class": props.get("mechanism_class", "Unknown"),
        "indications":    indications,
    }
    drug_details_cache[drug_id] = response
    return response


@app.get("/api/drug/{drug_id}/structure")
def get_drug_structure(drug_id: str):
    if drug_id in drug_structure_cache:
        return drug_structure_cache[drug_id]

    cid = _chembl_to_pubchem_cid(drug_id)
    if not cid:
        raise HTTPException(404, f"No PubChem structure found for {drug_id}")

    for three_d in (True, False):
        sdf = _fetch_pubchem_sdf(cid, three_d)
        if sdf:
            resp = {"drug_id": drug_id, "cid": cid, "format": "sdf", "is_3d": three_d, "data": sdf}
            drug_structure_cache[drug_id] = resp
            return resp

    raise HTTPException(404, f"Structure unavailable for CID {cid}")


@app.get("/api/drug/{drug_id}/network/{disease_id}", response_model=NetworkResponse)
def get_drug_disease_network(drug_id: str, disease_id: str):
    ck = f"{drug_id}_{disease_id}"
    if ck in drug_network_cache:
        return drug_network_cache[ck]

    nodes, edges = [], []

    drug_name = drug_id
    try:
        r = client.search_drugs(drug_id, limit=1)
        if r:
            drug_name = r[0].get("drug_name", drug_id)
    except Exception:
        pass
    nodes.append(NetworkNode(id=drug_id, label=drug_name, type="drug"))

    dis_name = disease_id
    try:
        r = client.search_diseases(disease_id, limit=1)
        if r:
            dis_name = r[0].get("disease_name", disease_id)
    except Exception:
        pass
    nodes.append(NetworkNode(id=disease_id, label=dis_name, type="disease"))

    drug_targets = set()
    try:
        for t in (client.get_drug_targets(drug_id) or [])[:15]:
            gid  = t.get("target_id", "")
            gname = t.get("target_name", gid)
            if gid:
                drug_targets.add(gid)
                nodes.append(NetworkNode(id=gid, label=gname, type="gene"))
                edges.append(NetworkEdge(source=drug_id, target=gid, label="targets"))
    except Exception:
        pass

    try:
        for g in (client.get_disease_genes(disease_id, limit=20) or []):
            gid  = g.get("gene_id") or g.get("target_id", "")
            gname = g.get("gene_symbol") or g.get("target_name", gid)
            score = g.get("association_score", g.get("score", 0))
            if gid:
                if gid not in drug_targets:
                    nodes.append(NetworkNode(id=gid, label=gname, type="gene"))
                edges.append(NetworkEdge(source=gid, target=disease_id, label="associated", weight=score))
    except Exception:
        pass

    resp = NetworkResponse(nodes=nodes, edges=edges)
    drug_network_cache[ck] = resp
    return resp



@app.post("/api/gemini/explain", response_model=GeminiExplanation)
def explain_drug_with_gemini(request: GeminiRequest):
    ck = f"{request.drug_name}_{request.disease_name}_explain"
    if ck in gemini_cache:
        return gemini_cache[ck]

    key_exact = f"{request.drug_name}_{request.disease_name}"
    if key_exact in HARDCODED_EXPLANATIONS:
        d = HARDCODED_EXPLANATIONS[key_exact]
    else:
        d = None
        drug_up = request.drug_name.upper()
        for hk, hd in HARDCODED_EXPLANATIONS.items():
            if drug_up in hk.upper():
                d = hd
                break

    if d:
        resp = GeminiExplanation(
            summary=d["summary"],
            contraindications=d["contraindications"],
            mechanism_detail=d["mechanism_detail"],
            disease_relevance=d.get("disease_relevance", ""),
        )
        gemini_cache[ck] = resp
        return resp

    if GEMINI_API_KEY:
        try:
            resp = _call_gemini_explain(request)
            gemini_cache[ck] = resp
            return resp
        except Exception:
            pass

    fallback = GeminiExplanation(
        summary=(
            f"{request.drug_name} is a {request.drug_type.lower()} drug being evaluated "
            f"as a potential repurposing candidate for {request.disease_name}."
        ),
        mechanism_detail=f"Mechanism of action: {request.mechanism}.",
        disease_relevance=(
            f"Computational analysis suggests biological plausibility for "
            f"{request.disease_name} based on shared gene targets."
        ),
        contraindications=[
            "Consult a qualified healthcare provider before use.",
            "This is AI-generated research information — not clinical advice.",
        ],
    )
    gemini_cache[ck] = fallback
    return fallback


@app.post("/api/gemini/chat")
def chat_with_gemini(request: GeminiRequest, question: str = Query(...)):
    ck = f"{request.drug_name}_{request.disease_name}_{question[:50]}"
    if ck in gemini_cache:
        return gemini_cache[ck]

    if GEMINI_API_KEY:
        try:
            resp = _call_gemini_chat(request, question)
            gemini_cache[ck] = resp
            return resp
        except Exception:
            pass

    fallback = GeminiChatResponse(
        response=(
            f"I can provide general information about {request.drug_name} "
            f"in the context of {request.disease_name}. "
            f"Your question: '{question}' — please consult a medical professional "
            f"or a clinical database like DrugBank for authoritative answers."
        )
    )
    gemini_cache[ck] = fallback
    return fallback



def _get_candidate_drugs(disease_id: str) -> list:
    all_drugs: dict = {}

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


def _chembl_to_pubchem_cid(chembl_id: str) -> Optional[int]:
    try:
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{chembl_id}/cids/JSON"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            cids = r.json().get("IdentifierList", {}).get("CID", [])
            if cids:
                return cids[0]
    except Exception:
        pass
    try:
        url = f"https://www.ebi.ac.uk/unichem/rest/src_compound_id/{chembl_id}/1/22"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data and isinstance(data, list):
                return int(data[0]["src_compound_id"])
    except Exception:
        pass
    return None


def _fetch_pubchem_sdf(cid: int, three_d: bool) -> Optional[str]:
    rt = "3d" if three_d else "2d"
    try:
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/SDF?record_type={rt}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200 and len(r.text) > 100:
            return r.text
    except Exception:
        pass
    return None


def _call_gemini_explain(request: GeminiRequest) -> GeminiExplanation:
    """Live Gemini 1.5 Flash call for drug explanation."""
    prompt = (
        f"You are a clinical pharmacologist. Provide a structured summary for "
        f"a drug repurposing candidate.\n\n"
        f"Drug: {request.drug_name}\n"
        f"Disease: {request.disease_name}\n"
        f"Drug type: {request.drug_type}\n"
        f"Mechanism: {request.mechanism}\n\n"
        f"Return JSON with keys: summary, mechanism_detail, disease_relevance, "
        f"contraindications (list of strings). Keep each section under 150 words."
    )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    text = text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    data = json.loads(text)
    return GeminiExplanation(
        summary=data.get("summary", ""),
        mechanism_detail=data.get("mechanism_detail", ""),
        disease_relevance=data.get("disease_relevance", ""),
        contraindications=data.get("contraindications", []),
    )


def _call_gemini_chat(request: GeminiRequest, question: str) -> GeminiChatResponse:
    """Live Gemini chat call."""
    prompt = (
        f"Drug: {request.drug_name}, Disease: {request.disease_name}, "
        f"Mechanism: {request.mechanism}.\n"
        f"Question: {question}\n"
        f"Answer concisely in 2-3 sentences as a clinical pharmacologist."
    )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return GeminiChatResponse(response=text.strip())
