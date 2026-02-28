"""
AlphaFold Structure Handler

Retrieves precomputed protein structures and extracts features:
- pLDDT confidence scores
- Structural uncertainty metrics
- Sequence length
"""
import requests
import gzip
import io
from pathlib import Path
from typing import Optional
import numpy as np

try:
    from config import ALPHAFOLD_API, CACHE_DIR
except ImportError:
    ALPHAFOLD_API = "https://alphafold.ebi.ac.uk/files/"
    CACHE_DIR = Path("./data/cache")


class StructureHandler:
    """
    Handles AlphaFold structure retrieval and feature extraction.
    
    We use AlphaFold as a LOOKUP service, not a prediction model.
    Structures are precomputed and publicly available.
    """
    
    def __init__(self, use_cache: bool = True):
        self.api_base = ALPHAFOLD_API
        self.use_cache = use_cache
        self.cache_dir = CACHE_DIR / "alphafold"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_cache_path(self, uniprot_id: str) -> Path:
        return self.cache_dir / f"{uniprot_id}_plddt.npy"
    
    def fetch_plddt_scores(self, uniprot_id: str) -> Optional[dict]:
        """
        Fetch pLDDT metrics for a protein from AlphaFold API.
        
        Uses the prediction metadata endpoint which provides pre-computed
        pLDDT fractions directly - no need to parse CIF files.
        
        Args:
            uniprot_id: UniProt accession (e.g., 'P00533')
            
        Returns:
            Dict with pLDDT metrics, or None if not found
        """
        cache_path = self._get_cache_path(uniprot_id)
        
        # Check cache
        if self.use_cache and cache_path.exists():
            import json
            with open(cache_path.with_suffix('.json'), 'r') as f:
                return json.load(f)
        
        # Fetch from AlphaFold prediction API
        # This endpoint provides pLDDT fractions directly
        api_url = f"https://alphafold.ebi.ac.uk/api/prediction/{uniprot_id}"
        
        try:
            response = requests.get(api_url, timeout=30)
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            if not data or not isinstance(data, list) or len(data) == 0:
                return None
            
            entry = data[0]
            
            # Extract pLDDT metrics directly from API response
            plddt_metrics = {
                'global_plddt': entry.get('globalMetricValue'),
                'frac_very_low': entry.get('fractionPlddtVeryLow', 0),    # pLDDT < 50
                'frac_low': entry.get('fractionPlddtLow', 0),             # 50 <= pLDDT < 70
                'frac_confident': entry.get('fractionPlddtConfident', 0), # 70 <= pLDDT < 90
                'frac_very_high': entry.get('fractionPlddtVeryHigh', 0),  # pLDDT >= 90
                'sequence_length': entry.get('sequenceEnd', 0) - entry.get('sequenceStart', 0) + 1,
                'gene': entry.get('gene'),
                'entry_id': entry.get('entryId')
            }
            
            # Cache the results
            if self.use_cache:
                import json
                with open(cache_path.with_suffix('.json'), 'w') as f:
                    json.dump(plddt_metrics, f)
            
            return plddt_metrics
            
        except requests.exceptions.RequestException:
            return None
        except (ValueError, KeyError):
            return None
    
    def _parse_plddt_from_cif(self, cif_content: str) -> Optional[np.ndarray]:
        """
        Parse pLDDT scores from mmCIF file.
        
        In AlphaFold CIF files, pLDDT is stored in the B-factor column
        of the _atom_site category.
        """
        plddt_values = []
        current_residue = None
        
        for line in cif_content.split('\n'):
            line = line.strip()
            
            # Parse atom records - look for CA atoms
            if line.startswith('ATOM'):
                parts = line.split()
                if len(parts) >= 14:
                    try:
                        # B-factor is typically column 14 (0-indexed: 13)
                        # We need CA atoms only (one per residue)
                        atom_name = parts[3] if len(parts) > 3 else ''
                        residue_num = int(parts[8]) if len(parts) > 8 else 0
                        b_factor = float(parts[14]) if len(parts) > 14 else 0.0
                        
                        # Only take CA atoms (one per residue)
                        if atom_name == 'CA' and residue_num != current_residue:
                            plddt_values.append(b_factor)
                            current_residue = residue_num
                    except (ValueError, IndexError):
                        continue
        
        if plddt_values:
            return np.array(plddt_values)
        
        # Fallback: simpler parsing
        plddt_values = []
        current_residue = None
        for line in cif_content.split('\n'):
            if line.startswith('ATOM') and ' CA ' in line:
                parts = line.split()
                try:
                    residue_num = int(parts[8]) if len(parts) > 8 else 0
                    if residue_num != current_residue:
                        for i, part in enumerate(parts):
                            try:
                                val = float(part)
                                if 0 <= val <= 100 and i > 10:  # B-factor range
                                    plddt_values.append(val)
                                    current_residue = residue_num
                                    break
                            except ValueError:
                                continue
                except (ValueError, IndexError):
                    continue
        
        return np.array(plddt_values) if plddt_values else None
    
    def extract_structural_features(self, uniprot_id: str) -> dict:
        """
        Extract structural features from AlphaFold API.
        
        Features:
        - mean_plddt: Overall structural confidence (0-100)
        - low_confidence_frac: Fraction of residues with pLDDT < 50 (disorder proxy)
        - sequence_length: Protein length
        
        Args:
            uniprot_id: UniProt accession
            
        Returns:
            Dict of structural features, or defaults if unavailable
        """
        plddt_data = self.fetch_plddt_scores(uniprot_id)
        
        if plddt_data is None:
            # Return default values for missing structures
            return {
                'mean_plddt': 70.0,  # Neutral default
                'low_confidence_frac': 0.2,  # Moderate uncertainty
                'sequence_length': 400,  # Average protein length
                'structure_available': False
            }
        
        # Use global pLDDT from API (already computed by AlphaFold)
        global_plddt = plddt_data.get('global_plddt')
        if global_plddt is None:
            global_plddt = 70.0
        
        # frac_very_low is the fraction with pLDDT < 50
        low_conf_frac = plddt_data.get('frac_very_low', 0.2)
        
        return {
            'mean_plddt': float(global_plddt),
            'low_confidence_frac': float(low_conf_frac),
            'sequence_length': plddt_data.get('sequence_length', 400),
            'structure_available': True
        }
    
    def get_features_for_targets(self, uniprot_ids: list[str]) -> dict:
        """
        Get aggregated structural features for multiple protein targets.
        
        For drugs with multiple targets, we aggregate by taking:
        - Mean of mean_plddt (average confidence across targets)
        - Max of low_confidence_frac (worst-case uncertainty)
        - Sum of sequence_lengths (total target space)
        
        Args:
            uniprot_ids: List of UniProt accessions
            
        Returns:
            Aggregated structural features
        """
        if not uniprot_ids:
            return {
                'mean_plddt': 70.0,
                'low_confidence_frac': 0.2,
                'total_sequence_length': 400,
                'num_targets_with_structure': 0
            }
        
        features_list = []
        for uid in uniprot_ids:
            if uid:
                features_list.append(self.extract_structural_features(uid))
        
        if not features_list:
            return {
                'mean_plddt': 70.0,
                'low_confidence_frac': 0.2,
                'total_sequence_length': 400,
                'num_targets_with_structure': 0
            }
        
        return {
            'mean_plddt': np.mean([f['mean_plddt'] for f in features_list]),
            'low_confidence_frac': np.max([f['low_confidence_frac'] for f in features_list]),
            'total_sequence_length': sum(f['sequence_length'] for f in features_list),
            'num_targets_with_structure': sum(1 for f in features_list if f['structure_available'])
        }


# Quick test
if __name__ == "__main__":
    handler = StructureHandler(use_cache=True)
    
    # Test with EGFR (well-characterized cancer target)
    print("Fetching EGFR structure features (P00533)...")
    features = handler.extract_structural_features("P00533")
    
    print(f"  Mean pLDDT: {features['mean_plddt']:.1f}")
    print(f"  Low confidence fraction: {features['low_confidence_frac']:.3f}")
    print(f"  Sequence length: {features['sequence_length']}")
    print(f"  Structure available: {features['structure_available']}")
