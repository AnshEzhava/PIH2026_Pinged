from pathlib import Path
import os

PROJECT_ROOT = Path(__file__).parent

DATA_DIR          = PROJECT_ROOT / "data"
MODELS_DIR        = PROJECT_ROOT / "models"
CACHE_DIR         = DATA_DIR / "cache"
RAW_DATA_DIR      = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

TRAINED_MODEL_DIR = MODELS_DIR

CHECKPOINTS_DIR   = MODELS_DIR


for d in [DATA_DIR, MODELS_DIR, CACHE_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

OPENTARGETS_API = "https://api.platform.opentargets.org/api/v4/graphql"
ALPHAFOLD_API   = "https://alphafold.ebi.ac.uk/files/"
REPODB_URL      = "https://raw.githubusercontent.com/NCBI-Hackathons/RepoDB_Predictions/master/repodb/data/full.csv"

RANDOM_STATE  = 42
DEFAULT_MODEL = "xgboost"
TOP_K_DRUGS   = 10

XGBOOST_PARAMS = {
    "n_estimators": 100,
    "max_depth": 6,
    "learning_rate": 0.1,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
}

FEATURE_NAMES = [
    "genetic_score",
    "somatic_score_raw",
    "somatic_score_masked",
    "max_association_score",
    "gene_overlap_count",
    "mean_plddt",
    "low_confidence_frac",
]

MONOTONIC_CONSTRAINTS = {
    "genetic_score": 1,
    "somatic_score_raw": 1,
    "somatic_score_masked": 1,
    "max_association_score": 1,
    "gene_overlap_count": 1,
    "mean_plddt": 1,
    "low_confidence_frac": -1,
}


MAX_CANDIDATE_DRUGS = 25
PARALLEL_WORKERS    = 8
SKIP_ALPHAFOLD      = True


POPULAR_DISEASES = [
    ("Alzheimer's Disease",     "MONDO_0004975"),
    ("Parkinson's Disease",     "MONDO_0005180"),
    ("Asthma",                  "MONDO_0004979"),
    ("Diabetes Mellitus",       "MONDO_0005015"),
    ("Breast Cancer",           "MONDO_0007254"),
    ("Brain Cancer",            "MONDO_0006130"),
    ("Bipolar Disorder",        "MONDO_0004985"),
    ("Anxiety Disorder",        "MONDO_0005618"),
    ("Autism Spectrum Disorder","MONDO_0005258"),
    ("Rheumatoid Arthritis",    "MONDO_0008383"),
    ("Multiple Sclerosis",      "EFO_0003885"),
    ("Epilepsy",                "MONDO_0005027"),
    ("Depression",              "MONDO_0002050"),
    ("Schizophrenia",           "MONDO_0005090"),
    ("Lung Cancer",             "MONDO_0008903"),
    ("Colorectal Cancer",       "MONDO_0005575"),
    ("Chronic Kidney Disease",  "EFO_0003884"),
    ("Heart Failure",           "MONDO_0005252"),
    ("Hypertension",            "MONDO_0001134"),
    ("Obesity",                 "EFO_0001073"),
    ("Crohn's Disease",         "MONDO_0005011"),
    ("Ulcerative Colitis",      "MONDO_0005101"),
]
