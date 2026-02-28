"""
Feature Engineering Module (7 Pure Biology Features)

XGBoost learns from biology only. Categorical features (therapeutic_area, 
drug_type, mechanism) are used as post-model gates, not features.

Feature Set (7 features):
1. genetic_score: GWAS/genetic evidence
2. somatic_score_raw: Cancer mutation evidence (raw)
3. somatic_score_masked: Somatic score (0 if non-oncology)
4. max_association_score: Highest OpenTargets score for any shared gene
5. gene_overlap_count: Shared genes between drug targets and disease genes
6. mean_plddt: Average structural confidence of target proteins
7. low_confidence_frac: Fraction of structurally uncertain residues

Post-model gates (not features, used in predict.py):
- therapeutic_area: Disease category for domain rules
- drug_mechanism_class: Mechanism-based penalties
- drug_type: Small molecule vs biologic context
"""
import pandas as pd
import numpy as np
from typing import Optional, List, Dict
from tqdm import tqdm
import warnings

try:
    from config import FEATURE_NAMES
except ImportError:
    FEATURE_NAMES = [
        "genetic_score",
        "somatic_score_raw",
        "somatic_score_masked",
        "max_association_score",
        "gene_overlap_count",
        "mean_plddt",
        "low_confidence_frac",
    ]


class FeatureEngine:
    """
    Feature engineering pipeline for drug-disease pairs.
    
    Combines:
    - Biological features from OpenTargets
    - Evidence breakdown (genetic, somatic, known_drug, animal_model)
    - Structural features from AlphaFold
    - Drug and disease properties
    """
    
    def __init__(self, opentargets_client=None, structure_handler=None):
        self.opentargets_client = opentargets_client
        self.structure_handler = structure_handler
        self.feature_names = FEATURE_NAMES
        
        # Cache for expensive lookups
        self._disease_genes_cache = {}
        self._drug_targets_cache = {}
        self._drug_properties_cache = {}
        self._disease_ta_cache = {}
        self._evidence_cache = {}
    
    def _get_disease_genes(self, disease_id: str) -> List[Dict]:
        """Get disease-associated genes with caching."""
        if disease_id not in self._disease_genes_cache:
            if self.opentargets_client:
                genes = self.opentargets_client.get_disease_genes(disease_id, limit=100)
                self._disease_genes_cache[disease_id] = genes
            else:
                self._disease_genes_cache[disease_id] = []
        return self._disease_genes_cache[disease_id]
    
    def _get_drug_targets(self, drug_id: str) -> List[Dict]:
        """Get drug targets with caching."""
        if drug_id not in self._drug_targets_cache:
            if self.opentargets_client:
                targets = self.opentargets_client.get_drug_targets(drug_id)
                self._drug_targets_cache[drug_id] = targets
            else:
                self._drug_targets_cache[drug_id] = []
        return self._drug_targets_cache[drug_id]
    
    def _get_drug_properties(self, drug_id: str) -> Dict:
        """Get drug properties with caching."""
        if drug_id not in self._drug_properties_cache:
            if self.opentargets_client:
                props = self.opentargets_client.get_drug_properties(drug_id)
                self._drug_properties_cache[drug_id] = props
            else:
                self._drug_properties_cache[drug_id] = {
                    'drug_type_encoded': 2,
                    'max_phase': 0,
                    'mechanism_encoded': 0
                }
        return self._drug_properties_cache[drug_id]
    
    def _get_disease_therapeutic_area(self, disease_id: str) -> Dict:
        """Get disease therapeutic area with caching."""
        if disease_id not in self._disease_ta_cache:
            if self.opentargets_client:
                ta = self.opentargets_client.get_disease_therapeutic_area(disease_id)
                self._disease_ta_cache[disease_id] = ta
            else:
                self._disease_ta_cache[disease_id] = {
                    'therapeutic_area': 'OTHER',
                    'therapeutic_area_encoded': 7
                }
        return self._disease_ta_cache[disease_id]
    
    def compute_biological_features(self, drug_id: str, disease_id: str) -> Dict[str, float]:
        """
        Compute biological features for a drug-disease pair.
        
        Features:
        - gene_overlap_count: Number of shared genes
        - max_association_score: Highest association score for overlapping genes
        """
        disease_genes = self._get_disease_genes(disease_id)
        drug_targets = self._get_drug_targets(drug_id)
        
        disease_gene_ids = {g['gene_id'] for g in disease_genes if g.get('gene_id')}
        drug_target_ids = {t['target_id'] for t in drug_targets if t.get('target_id')}
        
        overlap = disease_gene_ids & drug_target_ids
        gene_overlap_count = len(overlap)
        
        max_association_score = 0.0
        if overlap:
            overlapping_genes = [g for g in disease_genes if g.get('gene_id') in overlap]
            if overlapping_genes:
                max_association_score = max(g.get('association_score', 0) for g in overlapping_genes)
        
        return {
            'gene_overlap_count': gene_overlap_count,
            'max_association_score': max_association_score
        }
    
    def compute_evidence_features(self, drug_id: str, disease_id: str) -> Dict[str, float]:
        """
        Compute evidence breakdown features.
        
        Features:
        - genetic_score: GWAS/genetic associations
        - somatic_score_raw: Cancer somatic mutations
        - somatic_score_masked: Somatic (0 if non-cancer)
        - animal_model_score: Preclinical evidence
        - known_drug_score: Existing drug evidence (for analytic formula only)
        """
        cache_key = f"{drug_id}_{disease_id}"
        
        if cache_key not in self._evidence_cache:
            # Get drug targets for focused evidence
            drug_targets = self._get_drug_targets(drug_id)
            target_ids = [t['target_id'] for t in drug_targets if t.get('target_id')]
            
            if self.opentargets_client and target_ids:
                evidence = self.opentargets_client.get_evidence_breakdown(
                    disease_id, target_ids=target_ids
                )
            else:
                evidence = {
                    'genetic_score': 0.0,
                    'somatic_score': 0.0,
                    'known_drug_score': 0.0,
                    'animal_model_score': 0.0
                }
            self._evidence_cache[cache_key] = evidence
        else:
            evidence = self._evidence_cache[cache_key]
        
        # Get therapeutic area for somatic masking
        ta = self._get_disease_therapeutic_area(disease_id)
        is_oncology = ta['therapeutic_area'] == 'ONCOLOGY'
        
        somatic_raw = evidence.get('somatic_score', 0.0)
        somatic_masked = somatic_raw if is_oncology else 0.0
        
        return {
            'genetic_score': evidence.get('genetic_score', 0.0),
            'somatic_score_raw': somatic_raw,
            'somatic_score_masked': somatic_masked,
            'animal_model_score': evidence.get('animal_model_score', 0.0),
            'known_drug_score': evidence.get('known_drug_score', 0.0)  # For analytic formula
        }
    
    def compute_structural_features(self, drug_id: str) -> Dict[str, float]:
        """
        Compute structural features for a drug's targets.
        
        Features:
        - mean_plddt: Average structural confidence across targets
        - low_confidence_frac: Fraction of residues with pLDDT < 50
        """
        if not self.structure_handler:
            return {
                'mean_plddt': 70.0,
                'low_confidence_frac': 0.2
            }
        
        drug_targets = self._get_drug_targets(drug_id)
        uniprot_ids = [t.get('uniprot_id') for t in drug_targets if t.get('uniprot_id')]
        
        if not uniprot_ids:
            return {
                'mean_plddt': 70.0,
                'low_confidence_frac': 0.2
            }
        
        features = self.structure_handler.get_features_for_targets(uniprot_ids)
        
        return {
            'mean_plddt': features['mean_plddt'],
            'low_confidence_frac': features['low_confidence_frac']
        }
    
    def compute_drug_features(self, drug_id: str) -> Dict[str, float]:
        """
        Compute drug property features.
        
        Features:
        - drug_type_encoded: 0=small molecule, 1=biologic, 2=unknown
        - drug_max_phase: Clinical trial phase (0-4)
        - mechanism_encoded: Mechanism class (0-10)
        """
        props = self._get_drug_properties(drug_id)
        return {
            'drug_type_encoded': props.get('drug_type_encoded', 2),
            'drug_max_phase': props.get('max_phase', 0),
            'mechanism_encoded': props.get('mechanism_encoded', 0)
        }
    
    def compute_disease_features(self, disease_id: str) -> Dict[str, float]:
        """
        Compute disease property features.
        
        Features:
        - therapeutic_area_encoded: 0-7 macro therapeutic area
        """
        ta = self._get_disease_therapeutic_area(disease_id)
        return {
            'therapeutic_area_encoded': ta.get('therapeutic_area_encoded', 7)
        }
    
    def compute_features(self, drug_id: str, disease_id: str) -> Dict[str, float]:
        """
        Compute all 12 features for a drug-disease pair.
        
        Args:
            drug_id: ChEMBL drug ID
            disease_id: EFO disease ID
            
        Returns:
            Dict with all feature values
        """
        # Biological features (2)
        bio_features = self.compute_biological_features(drug_id, disease_id)
        
        # Structural features (2)
        struct_features = self.compute_structural_features(drug_id)
        
        # Evidence features (4 + known_drug_score for formula)
        evidence_features = self.compute_evidence_features(drug_id, disease_id)
        
        # Drug features (3)
        drug_features = self.compute_drug_features(drug_id)
        
        # Disease features (1)
        disease_features = self.compute_disease_features(disease_id)
        
        # Combine all
        all_features = {
            **bio_features,
            **struct_features,
            **evidence_features,
            **drug_features,
            **disease_features
        }
        
        return all_features
    
    def compute_composite_score(self, features: Dict[str, float]) -> float:
        """
        Compute composite score using analytic formula.
        
        Formula: E × (1 + β·S)
        where:
        - E = 1 - Π(1 - e_i) for evidence types
        - S = structural confidence
        - β = 0.25
        
        Note: known_drug_score is used here (NOT in XGBoost)
        """
        # Evidence compounding: E = 1 - Π(1 - e_i)
        evidence_scores = [
            features.get('genetic_score', 0),
            features.get('somatic_score_masked', 0),  # Use masked for non-cancer
            features.get('known_drug_score', 0),
            features.get('animal_model_score', 0)
        ]
        
        prod = 1.0
        for e in evidence_scores:
            prod *= (1 - e)
        E = 1 - prod
        
        # Structural (weak regularizer)
        plddt_norm = features.get('mean_plddt', 70) / 100.0
        low_conf = features.get('low_confidence_frac', 0.2)
        S = 0.4 * plddt_norm + 0.6 * (1 - low_conf)
        
        # Final: E × (1 + β·S)
        beta = 0.25
        final = E * (1 + beta * S)
        
        return final
    
    def build_feature_matrix(
        self,
        df: pd.DataFrame,
        drug_col: str = 'chembl_id',
        disease_col: str = 'efo_id',  # Note: verify column name in usage
        show_progress: bool = True,
        checkpoint_path: str = None,
        save_interval: int = 500
    ) -> pd.DataFrame:
        """
        Build feature matrix for multiple drug-disease pairs with checkpointing.
        
        Args:
            df: DataFrame with drug and disease IDs
            drug_col: Column name for drug IDs
            disease_col: Column name for disease IDs
            show_progress: Show progress bar
            checkpoint_path: Path to save intermediate CSV
            save_interval: Number of rows to process before saving
            
        Returns:
            DataFrame with features (same index as input)
        """
        processed_features = {}
        processed_indices = set()
        
        # Resume from checkpoint if exists
        if checkpoint_path:
            import os
            if os.path.exists(checkpoint_path):
                print(f"🔄 Resuming from checkpoint: {checkpoint_path}")
                try:
                    existing_df = pd.read_csv(checkpoint_path)
                    if 'index' in existing_df.columns:
                        existing_df.set_index('index', inplace=True)
                    
                    processed_indices = set(existing_df.index)
                    # Convert to dict for fast lookup
                    for idx, row in existing_df.iterrows():
                        processed_features[idx] = row.to_dict()
                    
                    print(f"   Loaded {len(processed_features)} processed rows.")
                except Exception as e:
                    print(f"⚠️ Failed to load checkpoint: {e}. Starting fresh.")
        
        features_list = []
        batch_new_features = []
        
        # Identify rows to process
        rows_to_process = [idx for idx in df.index if idx not in processed_indices]
        
        if show_progress:
            total = len(df)
            print(f"   To process: {len(rows_to_process)} / {total} total")
            
        iterator = tqdm(rows_to_process, desc="Computing features") if show_progress else rows_to_process
        
        count = 0 
        for idx in iterator:
            drug_id = df.loc[idx, drug_col]
            disease_id = df.loc[idx, disease_col] # Use passed col name
            
            try:
                features = self.compute_features(drug_id, disease_id)
            except Exception as e:
                # warnings.warn(f"Error computing features for {drug_id}, {disease_id}: {e}")
                features = {name: 0.0 for name in self.feature_names}
            
            features['index'] = idx
            processed_features[idx] = features
            batch_new_features.append(features)
            count += 1
            
            # Checkpoint
            if checkpoint_path and count % save_interval == 0:
                batch_df = pd.DataFrame(batch_new_features)
                header = not os.path.exists(checkpoint_path) or os.path.getsize(checkpoint_path) == 0
                batch_df.to_csv(checkpoint_path, mode='a', header=header, index=False)
                if show_progress:
                    print(f"\n      💾 Checkpoint saved: {count} rows processed")
                batch_new_features = [] # Clear batch
        
        # Final save of remaining items
        if checkpoint_path and batch_new_features:
            batch_df = pd.DataFrame(batch_new_features)
            header = not os.path.exists(checkpoint_path) or os.path.getsize(checkpoint_path) == 0
            batch_df.to_csv(checkpoint_path, mode='a', header=header, index=False)
        
        # Reconstruct DataFrame respecting original order
        final_list = [processed_features.get(idx, {name: 0.0 for name in self.feature_names}) for idx in df.index]
        feature_df = pd.DataFrame(final_list, index=df.index)
        
        return feature_df
    
    def get_feature_vector(self, drug_id: str, disease_id: str) -> List[float]:
        """
        Get feature vector in correct order for model.
        
        Returns:
            List of feature values in FEATURE_NAMES order
        """
        features = self.compute_features(drug_id, disease_id)
        return [features.get(name, 0.0) for name in self.feature_names]
    
    def preprocess_features(
        self, 
        feature_df: pd.DataFrame, 
        fit: bool = True,
        scaler=None
    ) -> tuple:
        """
        Preprocess features for model training/inference.
        
        Args:
            feature_df: DataFrame with feature columns
            fit: Whether to fit a new scaler (True for training)
            scaler: Pre-fitted scaler (for inference)
            
        Returns:
            Tuple of (scaled_df, scaler)
        """
        from sklearn.preprocessing import StandardScaler
        
        # Get only the feature columns
        feature_cols = [c for c in self.feature_names if c in feature_df.columns]
        X = feature_df[feature_cols].copy()
        
        # Fill NaN values with 0
        X = X.fillna(0)
        
        # Scale features
        if fit:
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
        else:
            if scaler is None:
                raise ValueError("Must provide scaler when fit=False")
            X_scaled = scaler.transform(X)
        
        # Return as DataFrame with same index
        scaled_df = pd.DataFrame(
            X_scaled, 
            columns=feature_cols, 
            index=feature_df.index
        )
        
        return scaled_df, scaler

# Test
if __name__ == "__main__":
    print("Testing FeatureEngine...")
    engine = FeatureEngine()
    print(f"Feature names: {engine.feature_names}")
    print(f"Total features: {len(engine.feature_names)}")
