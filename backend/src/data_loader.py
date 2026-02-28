"""
Data Loader Module

Handles loading and preprocessing of:
- RepoDB drug-disease approval data (training labels)
- OpenTargets data aggregation
- Feature matrix construction
"""
import pandas as pd
import numpy as np
import requests
from pathlib import Path
from typing import Optional, Tuple
from tqdm import tqdm
import json

try:
    from config import RAW_DATA_DIR, PROCESSED_DATA_DIR, REPODB_URL, CACHE_DIR
except ImportError:
    RAW_DATA_DIR = Path("./data/raw")
    PROCESSED_DATA_DIR = Path("./data/processed")
    CACHE_DIR = Path("./data/cache")
    REPODB_URL = "https://raw.githubusercontent.com/NCBI-Hackathons/RepoDB_Predictions/master/repodb/data/full.csv"


class DataLoader:
    """
    Unified data loading for drug repurposing pipeline.
    
    Primary data sources:
    - RepoDB: Drug-disease pairs with approval status (labels)
    - OpenTargets: Disease-gene and drug-target associations (features)
    - AlphaFold: Protein structure features
    """
    
    def __init__(self, use_cache: bool = True):
        self.use_cache = use_cache
        self.cache_dir = CACHE_DIR / "dataloader"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Lazy load clients
        self._opentargets_client = None
        self._structure_handler = None
    
    @property
    def opentargets_client(self):
        if self._opentargets_client is None:
            from .opentargets_client import OpenTargetsClient
            self._opentargets_client = OpenTargetsClient(use_cache=self.use_cache)
        return self._opentargets_client
    
    @property
    def structure_handler(self):
        if self._structure_handler is None:
            from .structure_handler import StructureHandler
            self._structure_handler = StructureHandler(use_cache=self.use_cache)
        return self._structure_handler
    
    def download_repodb(self, force: bool = False) -> Path:
        """
        Download RepoDB dataset from available mirrors.
        
        RepoDB contains ~2,000 drug-disease pairs with approval status:
        - 'Approved': Drug approved for this indication
        - 'Terminated': Drug failed trials for this indication
        
        Returns:
            Path to downloaded file
        """
        output_path = RAW_DATA_DIR / "repodb.csv"
        
        if output_path.exists() and not force:
            print(f"RepoDB already downloaded: {output_path}")
            return output_path
        
        print("Downloading RepoDB dataset...")
        RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
        
        # Try multiple mirror URLs
        urls_to_try = [
            REPODB_URL,
            # Archived versions and mirrors
            "https://raw.githubusercontent.com/tatonetti-lab/repoDB/main/data/repodb_full.csv",
            "https://raw.githubusercontent.com/Adam-Brown/repoDB/main/repodb/data/full.csv",
            "https://s3.amazonaws.com/drug-repurposing/repodb_full.csv",
        ]
        
        for url in urls_to_try:
            try:
                print(f"  Trying: {url[:60]}...")
                response = requests.get(url, timeout=60)
                if response.status_code == 200:
                    # Verify it looks like valid CSV
                    content = response.text
                    if 'drug' in content.lower() and len(content) > 1000:
                        with open(output_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print(f"Downloaded to: {output_path}")
                        return output_path
            except Exception as e:
                print(f"  Failed: {e}")
                continue
        
        # If all URLs fail, create training data from OpenTargets
        print("  All mirrors failed. Generating training data from OpenTargets...")
        return self._create_training_data_from_opentargets(output_path)
    
    def _create_training_data_from_opentargets(self, output_path: Path) -> Path:
        """
        Create LARGE training dataset from OpenTargets.
        
        Discovers diseases and drugs dynamically from the API.
        Uses drug indications as positive labels and non-indicated pairs as negatives.
        
        Target: 2000-5000 samples for robust training.
        """
        print("  Fetching LARGE training dataset from OpenTargets API...")
        print("  This may take 10-30 minutes for comprehensive data collection...")
        
        from .opentargets_client import OpenTargetsClient
        client = OpenTargetsClient(use_cache=self.use_cache)
        
        records = []
        
        # ================================================================
        # STEP 1: MEDIUM disease list (~100 terms for testing)
        # ================================================================
        disease_search_terms = [
            # NEUROLOGICAL (15)
            "parkinson", "alzheimer", "huntington", "multiple sclerosis", "epilepsy",
            "migraine", "stroke", "dementia", "amyotrophic lateral sclerosis",
            "peripheral neuropathy", "essential tremor", "dystonia", "restless legs",
            "myasthenia gravis", "narcolepsy",
            
            # METABOLIC (12)
            "type 1 diabetes", "type 2 diabetes", "obesity", "hyperlipidemia",
            "hypothyroidism", "hyperthyroidism", "metabolic syndrome", "gout",
            "wilson disease", "hemochromatosis", "phenylketonuria", "cushing syndrome",
            
            # CARDIOVASCULAR (12)
            "hypertension", "heart failure", "coronary artery disease", "myocardial infarction",
            "atrial fibrillation", "cardiomyopathy", "pulmonary hypertension", "deep vein thrombosis",
            "aortic stenosis", "peripheral vascular disease", "atherosclerosis", "arrhythmia",
            
            # CANCER (20)
            "breast cancer", "lung cancer", "prostate cancer", "colorectal cancer",
            "pancreatic cancer", "ovarian cancer", "melanoma", "leukemia",
            "lymphoma", "multiple myeloma", "glioblastoma", "hepatocellular carcinoma",
            "gastric cancer", "kidney cancer", "bladder cancer", "head and neck cancer",
            "thyroid cancer", "acute myeloid leukemia", "chronic myeloid leukemia", "non hodgkin lymphoma",
            
            # INFLAMMATORY/AUTOIMMUNE (15)
            "rheumatoid arthritis", "systemic lupus erythematosus", "psoriasis",
            "crohn disease", "ulcerative colitis", "asthma", "copd",
            "pulmonary fibrosis", "ankylosing spondylitis", "sjogren syndrome",
            "scleroderma", "dermatomyositis", "vasculitis", "atopic dermatitis",
            "inflammatory bowel disease",
            
            # INFECTIOUS (10)
            "hepatitis b", "hepatitis c", "hiv", "tuberculosis",
            "malaria", "covid 19", "sepsis", "pneumonia",
            "meningitis", "influenza",
            
            # PSYCHIATRIC (10)
            "major depression", "bipolar disorder", "schizophrenia", "anxiety disorder",
            "ptsd", "ocd", "adhd", "autism spectrum disorder",
            "substance use disorder", "insomnia",
            
            # OTHER (8)
            "chronic kidney disease", "cirrhosis", "osteoporosis", "endometriosis",
            "polycystic ovary syndrome", "cystic fibrosis", "sickle cell disease", "hemophilia"
        ]
        
        discovered_diseases = []
        seen_disease_ids = set()
        
        print(f"  Searching {len(disease_search_terms)} disease categories...")
        for i, term in enumerate(disease_search_terms):
            if i % 20 == 0:
                print(f"    Progress: {i}/{len(disease_search_terms)} terms ({len(discovered_diseases)} diseases found)")
            try:
                search_results = client.search_diseases(term, limit=2)
                for result in search_results:
                    disease_id = result.get('disease_id')
                    disease_name = result.get('disease_name')
                    if disease_id and disease_name and disease_id not in seen_disease_ids:
                        discovered_diseases.append((disease_id, disease_name))
                        seen_disease_ids.add(disease_id)
            except Exception:
                continue
        
        # Cap at 100 diseases for medium dataset
        discovered_diseases = discovered_diseases[:100]
        print(f"  ✓ Using {len(discovered_diseases)} diseases (capped for medium dataset)")
        
        # ================================================================
        # STEP 2: MEDIUM drug list (~100 terms for testing)
        # ================================================================
        drug_search_terms = [
            # NEUROLOGICAL / PD (15) - Critical for Parkinson's testing
            "levodopa", "carbidopa", "pramipexole", "ropinirole", "rasagiline",
            "selegiline", "entacapone", "amantadine", "apomorphine", "rotigotine",
            "trihexyphenidyl", "benztropine", "donepezil", "memantine", "rivastigmine",
            
            # METABOLIC (12)
            "metformin", "glipizide", "sitagliptin", "empagliflozin", "semaglutide",
            "insulin", "atorvastatin", "rosuvastatin", "ezetimibe", "levothyroxine",
            "allopurinol", "colchicine",
            
            # CARDIOVASCULAR (15)
            "lisinopril", "amlodipine", "metoprolol", "losartan", "hydrochlorothiazide",
            "furosemide", "carvedilol", "warfarin", "clopidogrel", "digoxin",
            "propranolol", "valsartan", "diltiazem", "verapamil", "spironolactone",
            
            # PSYCH / CNS (12)
            "sertraline", "fluoxetine", "duloxetine", "bupropion", "lithium",
            "quetiapine", "risperidone", "aripiprazole", "clonazepam", "gabapentin",
            "pregabalin", "lamotrigine",
            
            # CANCER / TARGETED (15)
            "imatinib", "pembrolizumab", "rituximab", "trastuzumab", "bevacizumab",
            "osimertinib", "palbociclib", "tamoxifen", "letrozole", "enzalutamide",
            "methotrexate", "doxorubicin", "cisplatin", "paclitaxel", "fluorouracil",
            
            # INFLAMMATORY / IMMUNE (15)
            "adalimumab", "etanercept", "infliximab", "prednisone", "methylprednisolone",
            "tacrolimus", "cyclosporine", "mycophenolate", "hydroxychloroquine", "sulfasalazine",
            "dupilumab", "secukinumab", "ustekinumab", "tocilizumab", "baricitinib",
            
            # INFECTIOUS (12)
            "amoxicillin", "azithromycin", "ciprofloxacin", "doxycycline", "vancomycin",
            "remdesivir", "sofosbuvir", "tenofovir", "dolutegravir", "fluconazole",
            "ivermectin", "chloroquine",
            
            # OTHER COMMON (10)
            "omeprazole", "acetaminophen", "ibuprofen", "aspirin", "morphine",
            "albuterol", "montelukast", "loratadine", "cetirizine", "diphenhydramine"
        ]
        
        discovered_drugs = []
        seen_drug_ids = set()
        
        print(f"  Searching {len(drug_search_terms)} drug categories...")
        for i, term in enumerate(drug_search_terms):
            if i % 30 == 0:
                print(f"    Progress: {i}/{len(drug_search_terms)} terms ({len(discovered_drugs)} drugs found)")
            try:
                search_results = client.search_drugs(term, limit=1)
                for result in search_results:
                    drug_id = result.get('drug_id')
                    drug_name = result.get('drug_name')
                    if drug_id and drug_name and drug_id not in seen_drug_ids:
                        discovered_drugs.append((drug_id, drug_name))
                        seen_drug_ids.add(drug_id)
            except Exception:
                continue
        
        # Cap at 100 drugs for medium dataset
        discovered_drugs = discovered_drugs[:100]
        print(f"  ✓ Using {len(discovered_drugs)} drugs (capped for medium dataset)")
        
        # ================================================================
        # STEP 3: Build drug-disease pairs
        # ================================================================
        print(f"  Building drug-disease pairs (this takes time)...")
        
        for i, (drug_id, drug_name) in enumerate(discovered_drugs):
            if i % 25 == 0:
                print(f"    Progress: {i}/{len(discovered_drugs)} drugs processed ({len(records)} pairs)")
            
            try:
                # Get the drug's known indications from API
                drug_info = client.get_drug_indications(drug_id)
                indicated_disease_ids = set()
                
                positive_count = 0  # Limit positives per drug
                for indication in drug_info.get('indications', []):
                    if positive_count >= 3:  # Max 3 indications per drug for balance
                        break
                    ind_disease_id = indication.get('disease_id')
                    ind_disease_name = indication.get('disease_name')
                    max_phase = indication.get('max_phase', 0)
                    
                    if ind_disease_id and max_phase >= 3:
                        indicated_disease_ids.add(ind_disease_id)
                        
                        # Create positive sample
                        records.append({
                            'drug_name': drug_name,
                            'drugbank_id': drug_id,
                            'chembl_id': drug_id,
                            'indication': ind_disease_name,
                            'efo_id': ind_disease_id,
                            'status': 'Approved'
                        })
                        positive_count += 1
                
                # Create negative samples - 20 per drug for MEDIUM dataset
                for disease_id, disease_name in discovered_diseases[:20]:  # 20 per drug for medium
                    if disease_id not in indicated_disease_ids:
                        records.append({
                            'drug_name': drug_name,
                            'drugbank_id': drug_id,
                            'chembl_id': drug_id,
                            'indication': disease_name,
                            'efo_id': disease_id,
                            'status': 'Terminated'
                        })
                        
            except Exception as e:
                continue
        
        if not records:
            raise RuntimeError("Could not create training data from OpenTargets API")
        
        df = pd.DataFrame(records)
        print(f"  Raw data: {len(df)} pairs ({(df['status'] == 'Approved').sum()} pos, {(df['status'] == 'Terminated').sum()} neg)")
        
        # Use ALL data for OVERKILL mode - minimal downsampling
        # XGBoost handles class imbalance via scale_pos_weight parameter
        pos_df = df[df['status'] == 'Approved']
        neg_df = df[df['status'] == 'Terminated']
        
        # Only downsample if extremely imbalanced (>10:1 ratio for overkill)
        if len(neg_df) > len(pos_df) * 10:
            neg_df = neg_df.sample(n=len(pos_df) * 10, random_state=42)
            df = pd.concat([pos_df, neg_df], ignore_index=True)
            print(f"  Downsampled negatives to 10:1 ratio")
        
        df.to_csv(output_path, index=False)
        
        pos_count = (df['status'] == 'Approved').sum()
        neg_count = (df['status'] == 'Terminated').sum()
        print(f"  ✓ Created {len(df)} samples ({pos_count} positive, {neg_count} negative)")
        print(f"  Saved to: {output_path}")
        return output_path
    
    def load_repodb(self) -> pd.DataFrame:
        """
        Load and clean RepoDB data.
        
        Returns:
            DataFrame with columns:
            - drug_name: Drug name
            - drugbank_id: DrugBank ID (for linking)
            - indication: Disease/condition name
            - status: 'Approved' or 'Terminated'
            - label: 1 for Approved, 0 for Terminated
        """
        repodb_path = self.download_repodb()
        
        df = pd.read_csv(repodb_path)
        
        # Standardize column names
        df.columns = df.columns.str.lower().str.strip()
        
        # Expected columns: drug_name, drugbank_id, ind_name, status
        # Rename for clarity
        rename_map = {
            'ind_name': 'indication',
            'drug_name': 'drug_name',
            'drugbank_id': 'drugbank_id',
            'status': 'status'
        }
        
        for old, new in rename_map.items():
            if old in df.columns:
                df = df.rename(columns={old: new})
        
        # Create binary label
        df['label'] = (df['status'] == 'Approved').astype(int)
        
        # Clean
        df = df.dropna(subset=['drug_name', 'indication'])
        df['drug_name'] = df['drug_name'].str.strip()
        df['indication'] = df['indication'].str.strip()
        
        print(f"Loaded RepoDB: {len(df)} drug-disease pairs")
        print(f"  Approved: {df['label'].sum()}")
        print(f"  Terminated: {(df['label'] == 0).sum()}")
        
        return df
    
    def create_drug_id_mapping(self, repodb_df: pd.DataFrame) -> dict:
        """
        Create mapping from drug names to ChEMBL IDs via OpenTargets.
        
        Args:
            repodb_df: RepoDB DataFrame
            
        Returns:
            Dict mapping drug_name -> chembl_id
        """
        cache_path = self.cache_dir / "drug_id_mapping.json"
        
        if cache_path.exists() and self.use_cache:
            with open(cache_path, 'r') as f:
                return json.load(f)
        
        mapping = {}
        unique_drugs = repodb_df['drug_name'].unique()
        
        print(f"Mapping {len(unique_drugs)} drugs to ChEMBL IDs...")
        for drug_name in tqdm(unique_drugs):
            results = self.opentargets_client.search_drugs(drug_name, limit=1)
            if results:
                mapping[drug_name] = results[0]['drug_id']
        
        # Save cache
        with open(cache_path, 'w') as f:
            json.dump(mapping, f)
        
        print(f"Mapped {len(mapping)}/{len(unique_drugs)} drugs")
        return mapping
    
    def create_disease_id_mapping(self, repodb_df: pd.DataFrame) -> dict:
        """
        Create mapping from disease names to EFO IDs via OpenTargets.
        
        Args:
            repodb_df: RepoDB DataFrame
            
        Returns:
            Dict mapping indication -> efo_id
        """
        cache_path = self.cache_dir / "disease_id_mapping.json"
        
        if cache_path.exists() and self.use_cache:
            with open(cache_path, 'r') as f:
                return json.load(f)
        
        mapping = {}
        unique_diseases = repodb_df['indication'].unique()
        
        print(f"Mapping {len(unique_diseases)} diseases to EFO IDs...")
        for disease_name in tqdm(unique_diseases):
            results = self.opentargets_client.search_diseases(disease_name, limit=1)
            if results:
                mapping[disease_name] = results[0]['disease_id']
        
        # Save cache
        with open(cache_path, 'w') as f:
            json.dump(mapping, f)
        
        print(f"Mapped {len(mapping)}/{len(unique_diseases)} diseases")
        return mapping
    
    def build_training_data(
        self,
        max_samples: Optional[int] = None,
        force_rebuild: bool = False
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
        """
        Build complete training dataset with features.
        
        Args:
            max_samples: Limit samples for testing
            force_rebuild: Ignore cache and rebuild
            
        Returns:
            Tuple of (raw_df, feature_df, labels)
        """
        cache_path = PROCESSED_DATA_DIR / "training_data.parquet"
        labels_path = PROCESSED_DATA_DIR / "training_labels.parquet"
        
        if cache_path.exists() and labels_path.exists() and not force_rebuild:
            print("Loading cached training data...")
            feature_df = pd.read_parquet(cache_path)
            labels_df = pd.read_parquet(labels_path)
            return feature_df, feature_df, labels_df['label']
        
        # Load RepoDB
        repodb_df = self.load_repodb()
        
        if max_samples:
            repodb_df = repodb_df.sample(n=min(max_samples, len(repodb_df)), random_state=42)
        
        # Get ID mappings
        drug_mapping = self.create_drug_id_mapping(repodb_df)
        disease_mapping = self.create_disease_id_mapping(repodb_df)
        
        # Add IDs to dataframe
        repodb_df['chembl_id'] = repodb_df['drug_name'].map(drug_mapping)
        repodb_df['efo_id'] = repodb_df['indication'].map(disease_mapping)
        
        # Filter to rows with valid IDs
        valid_df = repodb_df.dropna(subset=['chembl_id', 'efo_id'])
        print(f"Valid samples with IDs: {len(valid_df)}")
        
        # Build features
        from .feature_engine import FeatureEngine
        engine = FeatureEngine(
            opentargets_client=self.opentargets_client,
            structure_handler=self.structure_handler
        )
        
        feature_df = engine.build_feature_matrix(valid_df)
        
        # Save
        PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
        feature_df.to_parquet(cache_path)
        valid_df[['label']].to_parquet(labels_path)
        
        return valid_df, feature_df, valid_df['label']
    
    def get_sample_data(self, n_diseases: int = 5, n_drugs_per_disease: int = 20) -> pd.DataFrame:
        """
        Get a sample dataset for quick testing.
        
        Fetches top diseases and their candidate drugs from OpenTargets.
        """
        sample_diseases = [
            ("EFO_0000384", "Parkinson's disease"),
            ("EFO_0000249", "Alzheimer's disease"),
            ("EFO_0001360", "Type 2 diabetes"),
            ("EFO_0000389", "Breast cancer"),
            ("EFO_0003086", "Rheumatoid arthritis"),
        ][:n_diseases]
        
        records = []
        for disease_id, disease_name in sample_diseases:
            print(f"Fetching data for {disease_name}...")
            
            # Get associated genes
            genes = self.opentargets_client.get_disease_genes(disease_id, limit=50)
            
            # Get some approved drugs (via search)
            drugs = self.opentargets_client.get_all_approved_drugs(limit=n_drugs_per_disease)
            
            for drug in drugs:
                records.append({
                    'disease_id': disease_id,
                    'disease_name': disease_name,
                    'drug_id': drug['drug_id'],
                    'drug_name': drug['drug_name'],
                    'num_disease_genes': len(genes)
                })
        
        return pd.DataFrame(records)
    
    def load_drugbank_temporal(self, cutoff_year: int = 2018) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Load DrugBank parsed data for temporal train/test split.
        
        Uses approved drugs with known approval dates and ChEMBL IDs.
        Train set: drugs approved before cutoff_year
        Test set: drugs approved in cutoff_year or later
        
        Args:
            cutoff_year: Year to split on (default 2018)
            
        Returns:
            Tuple of (train_df, test_df) with drug info
        """
        # Find DrugBank parsed files
        project_root = Path(__file__).parent.parent
        db_folder = project_root / "DB"
        
        train_path = db_folder / "train_drugs.csv"
        test_path = db_folder / "test_drugs.csv"
        
        if not train_path.exists():
            raise FileNotFoundError(
                f"DrugBank train data not found at {train_path}\n"
                "Run scripts/parse_drugbank.py first to create temporal splits."
            )
        
        train_df = pd.read_csv(train_path)
        test_df = pd.read_csv(test_path)
        
        # Filter to drugs with ChEMBL IDs (needed for OpenTargets features)
        train_df = train_df[train_df['chembl_id'].notna()].copy()
        test_df = test_df[test_df['chembl_id'].notna()].copy()
        
        print(f"📊 DrugBank Temporal Split (cutoff: {cutoff_year})")
        print(f"   Train drugs (pre-{cutoff_year}): {len(train_df)} with ChEMBL IDs")
        print(f"   Test drugs ({cutoff_year}+): {len(test_df)} with ChEMBL IDs")
        
        return train_df, test_df
    
    def _get_opentargets_drugs(self, limit: int = 5000) -> pd.DataFrame:
        """
        Fetch approved drugs from OpenTargets API.
        
        Args:
            limit: Maximum number of drugs to fetch
            
        Returns:
            DataFrame with drug_id, drug_name, drug_type columns
        """
        print(f"🔍 Fetching up to {limit} drugs from OpenTargets...")
        
        import requests
        
        drugs = []
        page_size = 500  # OpenTargets max per page
        page_index = 0
        
        while len(drugs) < limit:
            query = """
            query ApprovedDrugs($size: Int!, $index: Int!) {
                drugs(page: {size: $size, index: $index}) {
                    rows {
                        id
                        name
                        drugType
                        maximumClinicalTrialPhase
                        hasBeenWithdrawn
                    }
                }
            }
            """
            
            try:
                response = requests.post(
                    "https://api.platform.opentargets.org/api/v4/graphql",
                    json={"query": query, "variables": {"size": page_size, "index": page_index}},
                    timeout=30
                )
                
                if response.status_code != 200:
                    print(f"   ⚠️ API error on page {page_index}: {response.status_code}")
                    break
                
                data = response.json()
                rows = data.get('data', {}).get('drugs', {}).get('rows', [])
                
                if not rows:
                    break
                
                for drug in rows:
                    if len(drugs) >= limit:
                        break
                    # Filter for approved drugs (phase 4 = approved)
                    if drug.get('maximumClinicalTrialPhase', 0) >= 4 and not drug.get('hasBeenWithdrawn'):
                        drugs.append({
                            'chembl_id': drug.get('id'),
                            'drug_name': drug.get('name'),
                            'drug_type': drug.get('drugType'),
                        })
                
                page_index += 1
                
                # Progress every 10 pages
                if page_index % 10 == 0:
                    print(f"   📊 Fetched {len(drugs)} approved drugs so far...")
                
                # Safety limit (200 pages = 100k drugs max)
                if page_index > 200:
                    break
                    
            except Exception as e:
                print(f"   ⚠️ Error on page {page_index}: {e}")
                break
        
        print(f"   ✅ Got {len(drugs)} approved drugs from OpenTargets")
        
        if not drugs:
            df = pd.DataFrame(columns=['chembl_id', 'drug_name', 'drug_type'])
        else:
            df = pd.DataFrame(drugs)
        
        # Save to CSV
        try:
            from pathlib import Path
            ckpt_dir = Path(__file__).parent.parent / "checkpoints"
            ckpt_dir.mkdir(parents=True, exist_ok=True)
            df.to_csv(ckpt_dir / "opentargets_drugs.csv", index=False)
            print(f"   📝 Saved to checkpoints/opentargets_drugs.csv")
        except:
            pass
        
        return df
    
    def create_temporal_training_data(
        self,
        n_diseases: int = 1000,
        max_drugs_per_split: int = 1000,
        neg_samples_per_pos: int = 3,
        use_opentargets_drugs: bool = False
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Create training data using DrugBank temporal split + optional OpenTargets drugs.
        
        For each drug, find diseases it's indicated for (from OpenTargets)
        and create positive pairs. Then sample negative pairs.
        
        Args:
            n_diseases: Number of diseases (BFS expansion for large values)
            max_drugs_per_split: Max drugs per train/test split
            neg_samples_per_pos: Negative samples per positive
            use_opentargets_drugs: If True, supplement DrugBank with OpenTargets drugs
        
        Returns:
            Tuple of (train_pairs_df, test_pairs_df)
        """
        train_drugs, test_drugs = self.load_drugbank_temporal()
        
        # Optionally add OpenTargets drugs
        if use_opentargets_drugs:
            ot_drugs = self._get_opentargets_drugs(limit=max_drugs_per_split * 2)
            
            # Merge with DrugBank, avoiding duplicates
            existing_chembl_ids = set(train_drugs['chembl_id'].tolist() + test_drugs['chembl_id'].tolist())
            overlap_count = ot_drugs['chembl_id'].isin(existing_chembl_ids).sum()
            print(f"   📊 Overlap: {overlap_count} / {len(ot_drugs)} fetched drugs already in DrugBank")
            
            new_drugs = ot_drugs[~ot_drugs['chembl_id'].isin(existing_chembl_ids)]
            
            print(f"   Adding {len(new_drugs)} unique drugs from OpenTargets (not in DrugBank)")
            
            # Add to train set (since we don't have approval dates for OT drugs)
            if len(new_drugs) > 0:
                # Ensure columns match
                new_drugs_formatted = new_drugs[['chembl_id', 'drug_name']].copy()
                new_drugs_formatted.columns = ['chembl_id', 'name']
                train_drugs = pd.concat([train_drugs, new_drugs_formatted], ignore_index=True)
            
            print(f"   Total train drugs after merge: {len(train_drugs)}")
        
        # Get diseases from BFS expansion
        diseases = self._get_disease_set(n_diseases)
        
        print(f"📊 Building training data: {min(len(train_drugs), max_drugs_per_split)} drugs × {len(diseases)} diseases")
        
        # Build train pairs
        train_pairs = self._build_pairs_from_drugs(
            train_drugs.head(max_drugs_per_split),
            diseases,
            neg_samples_per_pos
        )
        
        # Build test pairs
        test_pairs = self._build_pairs_from_drugs(
            test_drugs.head(max_drugs_per_split),
            diseases,
            neg_samples_per_pos
        )
        
        print(f"✅ Created {len(train_pairs)} train pairs, {len(test_pairs)} test pairs")
        return train_pairs, test_pairs
    
    def _get_disease_set(self, n_diseases: int = 1000) -> list:
        """
        Get diseases for training using BFS traversal of disease ontology.
        
        For n_diseases <= 100: Use high-quality curated list
        For n_diseases > 100: BFS expansion up to 4 levels deep
        """
        # Core curated diseases (~100 high-quality seeds)
        curated = [
            # Neurology
            "EFO_0000384", "EFO_0000249", "EFO_0000616", "EFO_0000253", "EFO_0001359",
            "EFO_0000474", "EFO_0003821", "EFO_0004720", "EFO_0003761", "EFO_0003885",
            # Oncology (broad categories with many children)
            "EFO_0000311", "EFO_0000389", "EFO_0001663", "EFO_0001641", "EFO_0000756",
            "EFO_0000612", "EFO_0000574", "EFO_0001086", "EFO_0001075", "EFO_0001378",
            "EFO_0000305", "EFO_0000178", "EFO_0000220", "EFO_0004205", "EFO_0000365",
            # Immunology
            "EFO_0000685", "EFO_0003767", "EFO_0000676", "EFO_0003785", "EFO_0000729",
            "EFO_0003890", "EFO_0003898", "EFO_0001060", "EFO_0000774", "EFO_0003778",
            # Cardiovascular
            "EFO_0000537", "EFO_0001645", "EFO_0003777", "EFO_0000407", "EFO_0001501",
            "EFO_0005741", "EFO_0004298", "EFO_0000401", "EFO_0006505", "EFO_0001360",
            # Metabolic
            "EFO_0001073", "EFO_0004324", "EFO_0000768", "EFO_0002506", "EFO_0003843",
            "EFO_0009605", "EFO_0000508", "EFO_0000516", "EFO_0004254", "EFO_0005295",
            # Infectious
            "EFO_0000182", "EFO_0000181", "EFO_0000764", "EFO_0000694", "EFO_0007243",
            "EFO_0000549", "EFO_0000662", "EFO_0005232", "EFO_0001067", "EFO_0000689",
            # Respiratory
            "EFO_0000270", "EFO_0000341", "EFO_0001071", "EFO_0003818", "EFO_0000571",
            "EFO_0000708", "EFO_0006833", "EFO_0002609", "EFO_0003959", "EFO_0004591",
            # Rare/Genetic
            "EFO_0000558", "EFO_0000568", "EFO_0003966", "EFO_0004220", "EFO_0003086",
            "EFO_0006336", "EFO_0003824", "EFO_0000555", "EFO_0000699", "EFO_0004232",
            # GI/Other
            "EFO_0005842", "EFO_0003758", "EFO_0000231", "EFO_0000437", "EFO_0005672",
            "EFO_0003144", "EFO_0003768", "EFO_0000666", "EFO_0000692", "EFO_0001185",
            # Psychiatric (broad)
            "EFO_0003935", "EFO_0001360", "EFO_0000289", "EFO_0000247",
        ]
        
        if n_diseases <= len(curated):
            return curated[:n_diseases]
        
        # BFS expansion using disease children endpoint
        print(f"🔍 Fetching up to {n_diseases} diseases via BFS expansion...")
        
        import requests
        
        diseases = {d: d for d in curated}  # Dict: id -> name
        
        def fetch_children(disease_id):
            """Fetch children of a disease"""
            query = """
            query GetDiseaseChildren($efoId: String!) {
                disease(efoId: $efoId) {
                    id
                    name
                    children { id name }
                }
            }
            """
            try:
                response = requests.post(
                    "https://api.platform.opentargets.org/api/v4/graphql",
                    json={"query": query, "variables": {"efoId": disease_id}},
                    timeout=10
                )
                if response.status_code == 200:
                    data = response.json()
                    disease_data = data.get('data', {}).get('disease', {})
                    if disease_data:
                        return disease_data.get('name', disease_id), disease_data.get('children', []) or []
            except:
                pass
            return disease_id, []
        
        # BFS: 4 levels of expansion
        current_level = list(curated)
        last_print_count = len(diseases)
        
        for level in range(1, 5):  # 4 levels
            if len(diseases) >= n_diseases:
                break
                
            print(f"   Level {level}: Processing {len(current_level)} parent diseases...")
            next_level = []
            
            # Limit parents per level to avoid API overload
            max_parents = min(len(current_level), 2000)
            
            for i, parent_id in enumerate(current_level[:max_parents]):
                if len(diseases) >= n_diseases:
                    break
                    
                name, children = fetch_children(parent_id)
                diseases[parent_id] = name
                
                for child in children:
                    if len(diseases) >= n_diseases:
                        break
                    child_id = child.get('id')
                    if child_id and child_id not in diseases:
                        diseases[child_id] = child.get('name', child_id)
                        next_level.append(child_id)
                
                # Progress print every 500 diseases
                if len(diseases) - last_print_count >= 500:
                    print(f"      📊 Progress: {len(diseases)} diseases collected...")
                    last_print_count = len(diseases)
            
            current_level = next_level
            print(f"   Level {level} done: {len(diseases)} total diseases")
            
            if not next_level:
                print("   No more children to explore.")
                break
        
        print(f"   ✅ Got {len(diseases)} diseases total")
        
        # Save diseases with names to CSV
        try:
            import pandas as pd
            from pathlib import Path
            ckpt_dir = Path(__file__).parent.parent / "checkpoints"
            ckpt_dir.mkdir(parents=True, exist_ok=True)
            diseases_df = pd.DataFrame([
                {'disease_id': k, 'disease_name': v} for k, v in diseases.items()
            ])
            diseases_df.to_csv(ckpt_dir / "all_diseases.csv", index=False)
            print(f"   📝 Saved {len(diseases)} disease names to checkpoints/all_diseases.csv")
        except Exception as e:
            pass
            
        return list(diseases.keys())[:n_diseases]
    
    def _build_pairs_from_drugs(
        self,
        drugs_df: pd.DataFrame,
        disease_ids: list,
        neg_samples_per_pos: int
    ) -> pd.DataFrame:
        """
        Build drug-disease pairs with labels.
        
        Strategy:
        - Positive: Drug's actual indications from OpenTargets
        - Negative: Random diseases the drug is NOT indicated for
        """
        pairs = []
        disease_set = set(disease_ids)
        
        for _, drug in tqdm(drugs_df.iterrows(), total=len(drugs_df), desc="Building pairs"):
            chembl_id = drug['chembl_id']
            
            # Get drug's indicated diseases from OpenTargets
            try:
                result = self.opentargets_client.get_drug_indications(chembl_id)
                indications_list = result.get('indications', [])
                all_indicated = {ind['disease_id'] for ind in indications_list if ind.get('disease_id')}
                # Only use indications that match our disease set
                indicated_diseases = all_indicated & disease_set
            except Exception as e:
                indicated_diseases = set()
            
            if not indicated_diseases:
                # No matching indications - just add some negatives
                n_neg = min(neg_samples_per_pos, len(disease_set))
                if n_neg > 0:
                    import random
                    neg_diseases = random.sample(list(disease_set), n_neg)
                    for disease_id in neg_diseases:
                        pairs.append({
                            'chembl_id': chembl_id,
                            'disease_id': disease_id,
                            'label': 0
                        })
                continue
            
            # POSITIVE: Indications that are in our disease set
            for disease_id in indicated_diseases:
                pairs.append({
                    'chembl_id': chembl_id,
                    'disease_id': disease_id,
                    'label': 1
                })
            
            # NEGATIVE: Diseases NOT in indications (limited)
            non_indicated = disease_set - indicated_diseases
            n_neg = min(len(indicated_diseases) * neg_samples_per_pos, len(non_indicated))
            
            if n_neg > 0:
                import random
                neg_diseases = random.sample(list(non_indicated), n_neg)
                for disease_id in neg_diseases:
                    pairs.append({
                        'chembl_id': chembl_id,
                        'disease_id': disease_id,
                        'label': 0
                    })
        
        result = pd.DataFrame(pairs)
        
        if len(result) > 0:
            pos_count = result['label'].sum()
            neg_count = len(result) - pos_count
            print(f"   Built {len(result)} pairs: {pos_count} positive, {neg_count} negative")
        else:
            print("   ⚠️ No pairs built! Check drug data.")
        
        return result


# Quick test
if __name__ == "__main__":
    loader = DataLoader(use_cache=True)
    
    # Test RepoDB loading
    print("Testing RepoDB loading...")
    repodb = loader.load_repodb()
    print(repodb.head())
    
    print("\n" + "="*50)
    print("Testing sample data retrieval...")
    sample = loader.get_sample_data(n_diseases=2, n_drugs_per_disease=5)
    print(sample)
