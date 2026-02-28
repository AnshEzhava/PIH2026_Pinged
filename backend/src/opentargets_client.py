"""
OpenTargets GraphQL API Client

Provides access to:
- Disease → Gene associations (with scores)
- Drug → Target mappings  
- Drug → Disease evidence (clinical trials, literature)
"""
import requests
import json
import time
from pathlib import Path
from typing import Optional
import hashlib

try:
    from config import OPENTARGETS_API, CACHE_DIR
except ImportError:
    OPENTARGETS_API = "https://api.platform.opentargets.org/api/v4/graphql"
    CACHE_DIR = Path("./data/cache")


class OpenTargetsClient:
    """Client for OpenTargets GraphQL API with caching."""
    
    def __init__(self, use_cache: bool = True):
        self.api_url = OPENTARGETS_API
        self.use_cache = use_cache
        self.cache_dir = CACHE_DIR / "opentargets"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
    def _get_cache_path(self, query_hash: str) -> Path:
        return self.cache_dir / f"{query_hash}.json"
    
    def _query_hash(self, query: str, variables: dict) -> str:
        content = json.dumps({'query': query, 'variables': variables}, sort_keys=True)
        return hashlib.md5(content.encode()).hexdigest()
    
    def _execute_query(self, query: str, variables: dict) -> dict:
        """Execute GraphQL query with caching and retry logic."""
        query_hash = self._query_hash(query, variables)
        cache_path = self._get_cache_path(query_hash)
        
        # Check cache
        if self.use_cache and cache_path.exists():
            with open(cache_path, 'r') as f:
                return json.load(f)
        
        # Execute query with retry
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    self.api_url,
                    json={'query': query, 'variables': variables},
                    headers={'Content-Type': 'application/json'},
                    timeout=30
                )
                
                # Handle 400 errors gracefully - return empty data
                if response.status_code == 400:
                    # Try to get error message from response
                    try:
                        error_data = response.json()
                        if 'errors' in error_data:
                            # Log but don't raise - return empty result
                            pass
                    except:
                        pass
                    return {'data': None}
                
                response.raise_for_status()
                data = response.json()
                
                # Cache successful response
                if self.use_cache and 'data' in data:
                    with open(cache_path, 'w') as f:
                        json.dump(data, f)
                
                return data
                
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    # Return empty data instead of raising
                    return {'data': None}
        
        return {}
    
    def get_disease_genes(self, disease_id: str, limit: int = 100) -> list[dict]:
        """
        Fetch genes associated with a disease.
        
        Args:
            disease_id: EFO disease ID (e.g., 'EFO_0000384' for Parkinson's)
            limit: Maximum number of associations to return
            
        Returns:
            List of dicts with gene info and association scores
        """
        query = """
        query DiseaseGenes($diseaseId: String!, $limit: Int!) {
            disease(efoId: $diseaseId) {
                id
                name
                associatedTargets(page: {size: $limit, index: 0}) {
                    rows {
                        target {
                            id
                            approvedSymbol
                            approvedName
                            proteinIds {
                                id
                                source
                            }
                        }
                        score
                        datatypeScores {
                            id
                            score
                        }
                    }
                }
            }
        }
        """
        
        result = self._execute_query(query, {'diseaseId': disease_id, 'limit': limit})
        
        if not result or not result.get('data', {}).get('disease'):
            return []
        
        disease_data = result['data']['disease']
        associations = disease_data.get('associatedTargets', {}).get('rows', [])
        
        genes = []
        for assoc in associations:
            target = assoc.get('target', {})
            # Get UniProt ID if available
            uniprot_id = None
            for pid in target.get('proteinIds', []):
                if pid.get('source') == 'uniprot_swissprot':
                    uniprot_id = pid.get('id')
                    break
            
            genes.append({
                'gene_id': target.get('id'),
                'gene_symbol': target.get('approvedSymbol'),
                'gene_name': target.get('approvedName'),
                'uniprot_id': uniprot_id,
                'association_score': assoc.get('score', 0),
                'datatype_scores': {
                    dt['id']: dt['score'] 
                    for dt in assoc.get('datatypeScores', [])
                }
            })
        
        return genes
    
    def get_drug_targets(self, drug_id: str) -> list[dict]:
        """
        Fetch protein targets for a drug.
        
        Args:
            drug_id: ChEMBL drug ID (e.g., 'CHEMBL1431')
            
        Returns:
            List of dicts with target info including UniProt IDs for AlphaFold
        """
        query = """
        query DrugTargets($drugId: String!) {
            drug(chemblId: $drugId) {
                id
                name
                linkedTargets {
                    count
                    rows {
                        id
                        approvedSymbol
                        approvedName
                        proteinIds {
                            id
                            source
                        }
                    }
                }
            }
        }
        """
        
        result = self._execute_query(query, {'drugId': drug_id})
        
        if not result or not result.get('data', {}).get('drug'):
            return []
        
        drug_data = result['data']['drug']
        linked_targets = drug_data.get('linkedTargets', {}).get('rows', [])
        
        targets = []
        for target in linked_targets:
            # Extract UniProt ID from proteinIds
            uniprot_id = None
            for pid in target.get('proteinIds', []):
                if pid.get('source') == 'uniprot_swissprot':
                    uniprot_id = pid.get('id')
                    break
            
            targets.append({
                'target_id': target.get('id'),
                'target_symbol': target.get('approvedSymbol'),
                'target_name': target.get('approvedName'),
                'uniprot_id': uniprot_id
            })
        
        return targets
    
    def get_drug_disease_evidence(self, drug_id: str, disease_id: str) -> dict:
        """
        Get evidence linking a drug to a disease.
        
        Uses drug indications to check if there's a link between drug and disease.
        
        Args:
            drug_id: ChEMBL drug ID
            disease_id: EFO/MONDO disease ID
            
        Returns:
            Dict with evidence counts and scores
        """
        query = """
        query DrugDiseaseEvidence($drugId: String!) {
            drug(chemblId: $drugId) {
                id
                name
                indications {
                    rows {
                        disease {
                            id
                            name
                        }
                        maxPhaseForIndication
                    }
                }
            }
        }
        """
        
        result = self._execute_query(query, {'drugId': drug_id})
        
        if not result or not result.get('data', {}).get('drug'):
            return {'evidence_count': 0, 'max_score': 0.0}
        
        drug_data = result['data']['drug']
        indications = drug_data.get('indications', {}).get('rows', [])
        
        # Find matching disease
        for ind in indications:
            ind_disease_id = ind.get('disease', {}).get('id')
            if ind_disease_id == disease_id:
                max_phase = ind.get('maxPhaseForIndication', 0)
                # Convert phase to a score (0-4 -> 0-1)
                return {
                    'evidence_count': 1,
                    'max_score': max_phase / 4.0
                }
        
        return {'evidence_count': 0, 'max_score': 0.0}
    
    def search_diseases(self, query_text: str, limit: int = 10) -> list[dict]:
        """
        Search for diseases by name.
        
        Args:
            query_text: Search term
            limit: Maximum results
            
        Returns:
            List of matching diseases
        """
        query = """
        query SearchDiseases($queryText: String!, $limit: Int!) {
            search(queryString: $queryText, entityNames: ["disease"], page: {size: $limit, index: 0}) {
                hits {
                    id
                    name
                    description
                }
            }
        }
        """
        
        result = self._execute_query(query, {'queryText': query_text, 'limit': limit})
        
        if not result or not result.get('data', {}).get('search'):
            return []
        
        return [
            {
                'disease_id': hit.get('id'),
                'disease_name': hit.get('name'),
                'description': (hit.get('description') or '')[:200]
            }
            for hit in result['data']['search'].get('hits', [])
        ]
    
    def search_drugs(self, query_text: str, limit: int = 20) -> list[dict]:
        """
        Search for drugs by name.
        
        Args:
            query_text: Search term
            limit: Maximum results
            
        Returns:
            List of matching drugs
        """
        query = """
        query SearchDrugs($queryText: String!, $limit: Int!) {
            search(queryString: $queryText, entityNames: ["drug"], page: {size: $limit, index: 0}) {
                hits {
                    id
                    name
                    description
                }
            }
        }
        """
        
        result = self._execute_query(query, {'queryText': query_text, 'limit': limit})
        
        if not result or not result.get('data', {}).get('search'):
            return []
        
        return [
            {
                'drug_id': hit.get('id'),
                'drug_name': hit.get('name'),
                'description': hit.get('description', '')[:200]
            }
            for hit in result['data']['search'].get('hits', [])
        ]
    
    def get_all_approved_drugs(self, limit: int = 500) -> list[dict]:
        """
        Get a list of approved drugs with pagination.
        
        Args:
            limit: Maximum number of drugs to fetch
            
        Returns:
            List of approved drugs with basic info
        """
        drugs = []
        page_size = 500  # OpenTargets max per request
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
                result = self._execute_query(query, {'size': page_size, 'index': page_index})
                
                if not result or result.get('data') is None:
                    break
                
                rows = result.get('data', {}).get('drugs', {}).get('rows', [])
                if not rows:
                    break
                
                for drug in rows:
                    if len(drugs) >= limit:
                        break
                    # Filter for approved drugs (phase 4 = approved)
                    if drug.get('maximumClinicalTrialPhase', 0) >= 4 and not drug.get('hasBeenWithdrawn'):
                        drugs.append({
                            'drug_id': drug.get('id'),
                            'drug_name': drug.get('name'),
                            'drug_type': drug.get('drugType'),
                            'max_phase': drug.get('maximumClinicalTrialPhase')
                        })
                
                page_index += 1
                
                # Safety limit
                if page_index > 20:
                    break
                    
            except Exception as e:
                print(f"   ⚠️ Drug fetch page {page_index} failed: {e}")
                break
        
        return drugs
    
    def get_drug_indications(self, drug_id: str) -> dict:
        """
        Get known disease indications for a drug.
        
        Args:
            drug_id: ChEMBL drug ID
            
        Returns:
            Dict with drug name and list of indications
        """
        query = """
        query DrugIndications($drugId: String!) {
            drug(chemblId: $drugId) {
                id
                name
                indications {
                    count
                    rows {
                        disease {
                            id
                            name
                        }
                        maxPhaseForIndication
                    }
                }
            }
        }
        """
        
        result = self._execute_query(query, {'drugId': drug_id})
        
        if not result or not result.get('data', {}).get('drug'):
            return {'drug_id': drug_id, 'drug_name': '', 'indications': []}
        
        drug_data = result['data']['drug']
        indications = drug_data.get('indications', {}).get('rows', [])
        
        return {
            'drug_id': drug_data.get('id'),
            'drug_name': drug_data.get('name'),
            'indications': [
                {
                    'disease_id': ind.get('disease', {}).get('id'),
                    'disease_name': ind.get('disease', {}).get('name'),
                    'max_phase': ind.get('maxPhaseForIndication', 0)
                }
                for ind in indications
            ]
        }
    
    def get_drugs_for_disease(self, disease_id: str, limit: int = 50) -> list:
        """
        Get drugs that have indication links to a specific disease.
        
        Args:
            disease_id: EFO/MONDO disease ID
            limit: Maximum number of drugs
            
        Returns:
            List of drugs with their indication phase
        """
        query = """
        query DiseaseKnownDrugs($diseaseId: String!, $size: Int!) {
            disease(efoId: $diseaseId) {
                id
                name
                knownDrugs(size: $size) {
                    count
                    rows {
                        drug {
                            id
                            name
                        }
                        phase
                        status
                    }
                }
            }
        }
        """
        
        result = self._execute_query(query, {'diseaseId': disease_id, 'size': limit})
        
        if not result or not result.get('data', {}).get('disease'):
            return []
        
        disease_data = result['data']['disease']
        known_drugs = disease_data.get('knownDrugs', {}).get('rows', [])
        
        drugs = []
        seen_ids = set()
        for entry in known_drugs:
            drug_info = entry.get('drug', {})
            drug_id = drug_info.get('id')
            if drug_id and drug_id not in seen_ids:
                seen_ids.add(drug_id)
                drugs.append({
                    'drug_id': drug_id,
                    'drug_name': drug_info.get('name', ''),
                    'phase': entry.get('phase', 0),
                    'status': entry.get('status', '')
                })
        
        return drugs
    
    def get_evidence_breakdown(self, disease_id: str, target_ids: list = None) -> dict:
        """
        Get evidence type breakdown for a disease.
        
        Returns aggregated scores for:
        - genetic_association (GWAS, genetic studies)
        - somatic_mutation (cancer mutations)
        - known_drug (existing treatments)
        - animal_model (preclinical)
        - literature (text mining)
        
        Args:
            disease_id: EFO disease ID
            target_ids: Optional list of target IDs (used for bonus scoring, not filtering)
            
        Returns:
            Dict with evidence type scores (0-1)
        """
        # Get disease genes which already include datatypeScores
        genes = self.get_disease_genes(disease_id, limit=50)
        
        if not genes:
            return {
                'genetic_score': 0.0,
                'somatic_score': 0.0,
                'known_drug_score': 0.0,
                'animal_model_score': 0.0,
                'literature_score': 0.0
            }
        
        # Aggregate evidence scores across ALL disease genes (not filtered by targets)
        genetic_scores = []
        somatic_scores = []
        known_drug_scores = []
        animal_model_scores = []
        literature_scores = []
        
        # Also track if any genes overlap with drug targets
        target_set = set(target_ids) if target_ids else set()
        has_overlap = False
        overlap_genetic = []
        
        for gene in genes:
            dt_scores = gene.get('datatype_scores', {})
            
            genetic_scores.append(dt_scores.get('genetic_association', 0))
            somatic_scores.append(dt_scores.get('somatic_mutation', 0))
            known_drug_scores.append(dt_scores.get('known_drug', 0))
            animal_model_scores.append(dt_scores.get('animal_model', 0))
            literature_scores.append(dt_scores.get('literature', 0))
            
            # If this gene overlaps with drug targets, track it
            if gene.get('gene_id') in target_set:
                has_overlap = True
                overlap_genetic.append(dt_scores.get('genetic_association', 0))
        
        # Use MAX across all genes for disease-level evidence
        result = {
            'genetic_score': max(genetic_scores) if genetic_scores else 0.0,
            'somatic_score': max(somatic_scores) if somatic_scores else 0.0,
            'known_drug_score': max(known_drug_scores) if known_drug_scores else 0.0,
            'animal_model_score': max(animal_model_scores) if animal_model_scores else 0.0,
            'literature_score': max(literature_scores) if literature_scores else 0.0
        }
        
        # Bonus: if there's target overlap, use the overlapping gene's genetic score
        # (this adds biological specificity when available)
        if has_overlap and overlap_genetic:
            result['genetic_score'] = max(result['genetic_score'], max(overlap_genetic))
        
        return result
    
    def get_drug_properties(self, drug_id: str) -> dict:
        """
        Get drug properties including type, max phase, and mechanism.
        
        Args:
            drug_id: ChEMBL drug ID
            
        Returns:
            Dict with drug_type, max_phase, mechanism_class
        """
        query = """
        query DrugProperties($drugId: String!) {
            drug(chemblId: $drugId) {
                id
                name
                drugType
                maximumClinicalTrialPhase
                mechanismsOfAction {
                    rows {
                        mechanismOfAction
                        actionType
                    }
                }
            }
        }
        """
        
        result = self._execute_query(query, {'drugId': drug_id})
        
        if not result or not result.get('data', {}).get('drug'):
            return {
                'drug_type': 'UNKNOWN',
                'drug_type_encoded': 2,  # 0=small, 1=biologic, 2=unknown
                'max_phase': 0,
                'mechanism_class': 'UNKNOWN',
                'mechanism_encoded': 0
            }
        
        drug = result['data']['drug']
        
        # Encode drug type
        drug_type = drug.get('drugType', 'Unknown')
        if drug_type in ['Small molecule', 'small molecule']:
            drug_type_encoded = 0
        elif drug_type in ['Antibody', 'Protein', 'antibody', 'protein']:
            drug_type_encoded = 1
        else:
            drug_type_encoded = 2
        
        # Get mechanism from mechanisms of action
        mechanism_class = 'UNKNOWN'
        moas = drug.get('mechanismsOfAction', {}).get('rows', [])
        if moas:
            moa_text = moas[0].get('mechanismOfAction', '').lower()
            action_type = moas[0].get('actionType', '').lower()
            mechanism_class = self._classify_mechanism(moa_text, action_type)
        
        return {
            'drug_type': drug_type,
            'drug_type_encoded': drug_type_encoded,
            'max_phase': drug.get('maximumClinicalTrialPhase', 0) or 0,
            'mechanism_class': mechanism_class,
            'mechanism_encoded': self._encode_mechanism(mechanism_class)
        }
    
    def _classify_mechanism(self, moa_text: str, action_type: str) -> str:
        """Classify drug mechanism from free text (strict keyword matching)."""
        text = f"{moa_text} {action_type}".lower()
        
        # Dopaminergic (critical for PD)
        if 'dopamine' in text:
            if 'agonist' in text:
                return 'DOPAMINE_AGONIST'
            if 'antagonist' in text or 'blocker' in text:
                return 'DOPAMINE_ANTAGONIST'
        
        # Anticholinergic (bad for PD)
        if 'anticholinergic' in text or 'muscarinic antagonist' in text:
            return 'ANTICHOLINERGIC'
        if 'acetylcholinesterase inhibitor' in text:
            return 'ACETYLCHOLINESTERASE_INHIBITOR'
        
        # Kinase inhibitors (cancer)
        if 'kinase inhibitor' in text or 'tyrosine kinase' in text:
            return 'KINASE_INHIBITOR'
        
        # General patterns
        if 'agonist' in text:
            return 'AGONIST'
        if 'antagonist' in text or 'blocker' in text:
            return 'ANTAGONIST'
        if 'inhibitor' in text:
            return 'INHIBITOR'
        if 'modulator' in text:
            return 'MODULATOR'
        if 'antibody' in text:
            return 'ANTIBODY'
        
        return 'UNKNOWN'
    
    def _encode_mechanism(self, mechanism: str) -> int:
        """Encode mechanism class as integer."""
        encoding = {
            'DOPAMINE_AGONIST': 1,
            'DOPAMINE_ANTAGONIST': 2,
            'ANTICHOLINERGIC': 3,
            'ACETYLCHOLINESTERASE_INHIBITOR': 4,
            'KINASE_INHIBITOR': 5,
            'AGONIST': 6,
            'ANTAGONIST': 7,
            'INHIBITOR': 8,
            'MODULATOR': 9,
            'ANTIBODY': 10,
            'UNKNOWN': 0
        }
        return encoding.get(mechanism, 0)
    
    def get_disease_therapeutic_area(self, disease_id: str) -> dict:
        """
        Get therapeutic area for a disease.
        
        Returns:
            Dict with therapeutic_area (string) and therapeutic_area_encoded (int)
        """
        query = """
        query DiseaseTA($diseaseId: String!) {
            disease(efoId: $diseaseId) {
                id
                name
                therapeuticAreas {
                    id
                    name
                }
            }
        }
        """
        
        result = self._execute_query(query, {'diseaseId': disease_id})
        
        if not result or not result.get('data', {}).get('disease'):
            return {
                'therapeutic_area': 'OTHER',
                'therapeutic_area_encoded': 7
            }
        
        disease = result['data']['disease']
        tas = disease.get('therapeuticAreas', [])
        
        if not tas:
            return {
                'therapeutic_area': 'OTHER',
                'therapeutic_area_encoded': 7
            }
        
        # Map to our 8 macro areas
        ta_name = tas[0].get('name', '').lower()
        ta_id = tas[0].get('id', '').upper()
        
        therapeutic_area, encoded = self._map_therapeutic_area(ta_name, ta_id)
        
        return {
            'therapeutic_area': therapeutic_area,
            'therapeutic_area_encoded': encoded
        }
    
    def _map_therapeutic_area(self, ta_name: str, ta_id: str) -> tuple:
        """Map OpenTargets therapeutic area to our 8 macro classes."""
        name = ta_name.lower()
        
        # Oncology
        if 'neoplasm' in name or 'cancer' in name or 'tumor' in name or 'oncolog' in name:
            return 'ONCOLOGY', 0
        
        # Neurology
        if 'nervous' in name or 'neuro' in name or 'brain' in name or 'psychiatric' in name:
            return 'NEUROLOGY', 1
        
        # Immunology
        if 'immune' in name or 'autoimmune' in name or 'inflammatory' in name:
            return 'IMMUNOLOGY', 2
        
        # Cardiovascular
        if 'cardio' in name or 'vascular' in name or 'heart' in name:
            return 'CARDIOVASCULAR', 3
        
        # Metabolic
        if 'metabolic' in name or 'endocrine' in name or 'diabetes' in name:
            return 'METABOLIC', 4
        
        # Infectious
        if 'infect' in name or 'viral' in name or 'bacterial' in name:
            return 'INFECTIOUS', 5
        
        # Rare/Genetic
        if 'genetic' in name or 'rare' in name or 'congenital' in name:
            return 'RARE_GENETIC', 6
        
        return 'OTHER', 7


# Quick test
if __name__ == "__main__":
    client = OpenTargetsClient(use_cache=True)
    
    # Test disease search
    print("Searching for Parkinson's disease...")
    diseases = client.search_diseases("Parkinson")
    for d in diseases[:3]:
        print(f"  - {d['disease_name']} ({d['disease_id']})")
    
    if diseases:
        # Test gene associations
        disease_id = diseases[0]['disease_id']
        print(f"\nTop genes for {disease_id}:")
        genes = client.get_disease_genes(disease_id, limit=5)
        for g in genes:
            print(f"  - {g['gene_symbol']}: score={g['association_score']:.3f}")

