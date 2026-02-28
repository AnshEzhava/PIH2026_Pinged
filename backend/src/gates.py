"""
Post-Model Gates Module

Applies transparent categorical rules AFTER XGBoost scoring.
These are not learned - they're domain knowledge that prevents overfitting.

Gates:
1. therapeutic_area: Boost if drug's area matches disease area
2. drug_type: Small molecule vs antibody considerations  
3. mechanism_class: MOA compatibility check
"""

from typing import Dict, Tuple
import pandas as pd


class PostModelGates:
    """
    Applies categorical gates after model prediction.
    
    Each gate returns a multiplier (0.0 - 1.5) that adjusts the base score.
    Transparent rules > opaque learned weights.
    """
    
    # Therapeutic area compatibility scores
    AREA_COMPATIBILITY = {
        # Perfect matches (1.2x boost)
        ('oncology', 'oncology'): 1.2,
        ('immunology', 'immunology'): 1.2,
        ('neurology', 'neurology'): 1.2,
        ('cardiovascular', 'cardiovascular'): 1.2,
        ('metabolic', 'metabolic'): 1.2,
        ('infectious disease', 'infectious disease'): 1.2,
        
        # Cross-area synergies (Small boost or neutral)
        ('immunology', 'oncology'): 1.05,
        ('oncology', 'immunology'): 1.05,
        ('metabolic', 'cardiovascular'): 1.05,
        ('cardiovascular', 'metabolic'): 1.05,
        
        # Explicit Penalties for Unlikely Repurposing
        ('oncology', 'neurology'): 0.8,    # Cancer drugs rarely work for neuro (toxicity)
        ('infectious disease', 'neurology'): 0.8,
        ('infectious disease', 'oncology'): 0.8,
    }
    
    # Drug type considerations
    DRUG_TYPE_WEIGHTS = {
        'small molecule': 1.0,  
        'small_molecule': 1.0,
        'antibody': 1.0,        
        'protein': 0.9,         # Harder delivery
        'oligonucleotide': 0.85, 
        'unknown': 0.8,         # Penalize unknowns
    }
    
    # Mechanism class compatibility with disease types
    MECHANISM_DISEASE_COMPAT = {
        # (mechanism, disease_area) -> multiplier
        ('kinase inhibitor', 'oncology'): 1.15,
        ('immune modulator', 'immunology'): 1.15,
        ('receptor agonist', 'neurology'): 1.1,
        ('enzyme inhibitor', 'metabolic'): 1.1,
        ('ion channel blocker', 'neurology'): 1.15, # Good for ALS/Epilepsy
    }
    
    def __init__(self, opentargets_client=None):
        """
        Initialize gates.
        
        Args:
            opentargets_client: Optional client for fetching drug/disease properties
        """
        self.ot_client = opentargets_client
        
    def apply_gates(
        self,
        base_scores: pd.Series,
        drug_ids: list,
        disease_id: str,
        drug_properties: Dict[str, dict] = None,
        disease_area: str = None,
        features_list: list = None  # New: Pass features for relevance checking
    ) -> Tuple[pd.Series, pd.DataFrame]:
        """
        Apply all gates to base XGBoost scores.
        
        Args:
            base_scores: XGBoost predicted probabilities
            drug_ids: List of ChEMBL drug IDs
            disease_id: EFO disease ID
            drug_properties: Pre-computed drug properties
            disease_area: Pre-computed disease therapeutic area
            features_list: List of feature dicts (optional, for relevance checks)
            
        Returns:
            Tuple of (adjusted_scores, gate_details_df)
        """
        # Get disease area if not provided
        if disease_area is None and self.ot_client:
            try:
                ta_info = self.ot_client.get_disease_therapeutic_area(disease_id)
                disease_area = ta_info.get('therapeutic_area', 'unknown').lower()
            except:
                disease_area = 'unknown'
        
        disease_area = disease_area or 'unknown'
        
        # Manual Overrides for specific diseases (OpenTargets sometimes misses these)
        DISEASE_AREA_OVERRIDES = {
            'MONDO_0004976': 'neurology',  # ALS
            # Add others as needed
        }
        
        if disease_area == 'unknown' and disease_id in DISEASE_AREA_OVERRIDES:
            disease_area = DISEASE_AREA_OVERRIDES[disease_id]
            print(f"   ℹ️ Used manual override: {disease_id} -> {disease_area}")
        
        # Get drug properties if not provided
        if drug_properties is None and self.ot_client:
            drug_properties = {}
            for drug_id in drug_ids:
                try:
                    props = self.ot_client.get_drug_properties(drug_id)
                    drug_properties[drug_id] = props
                except:
                    drug_properties[drug_id] = {}
        
        drug_properties = drug_properties or {}
        
        # Apply gates
        gate_records = []
        adjusted_scores = []
        
        for i, (drug_id, base_score) in enumerate(zip(drug_ids, base_scores)):
            props = drug_properties.get(drug_id, {})
            
            # Gate 1: Therapeutic Area
            drug_area = props.get('therapeutic_areas', ['unknown'])[0].lower().replace('_', ' ') if props.get('therapeutic_areas') else 'unknown'
            # Default to 0.9 (penalty) if not explicitly matched or synergistic
            area_mult = self.AREA_COMPATIBILITY.get((drug_area, disease_area), 0.9)
            
            # Gate 2: Drug Type
            drug_type = props.get('drug_type', 'unknown').lower()
            type_mult = self.DRUG_TYPE_WEIGHTS.get(drug_type, 0.9)
            
            # Gate 3: Mechanism Class
            mechanism = props.get('mechanism_class', 'unknown').lower()
            mech_mult = self.MECHANISM_DISEASE_COMPAT.get((mechanism, disease_area), 1.0)
            
            # Gate 4: Relevance (Zero Evidence Penalty)
            relevance_mult = 1.0
            if features_list and i < len(features_list):
                feats = features_list[i]
                # If NO biological evidence (genes=0 AND assoc=0), apply heavy penalty
                if feats.get('gene_overlap_count', 0) <= 0 and feats.get('max_association_score', 0) <= 0:
                    relevance_mult = 0.5
            
            # Combined multiplier
            total_mult = area_mult * type_mult * mech_mult * relevance_mult
            adjusted_score = base_score * total_mult
            
            # Clamp to [0, 1]
            adjusted_score = min(max(adjusted_score, 0.0), 1.0)
            adjusted_scores.append(adjusted_score)
            
            gate_records.append({
                'drug_id': drug_id,
                'base_score': base_score,
                'area_gate': area_mult,
                'type_gate': type_mult,
                'mechanism_gate': mech_mult,
                'relevance_gate': relevance_mult,
                'total_multiplier': total_mult,
                'final_score': adjusted_score
            })
        
        return pd.Series(adjusted_scores), pd.DataFrame(gate_records)
    
    def explain_gates(self, gate_row: dict) -> str:
        """Generate text explanation of gate effects."""
        text = []
        
        if gate_row['area_gate'] != 1.0:
            direction = "+" if gate_row['area_gate'] > 1.0 else "-"
            pct = abs(gate_row['area_gate'] - 1.0) * 100
            text.append(f"Therapeutic area match: {direction}{pct:.0f}%")
        
        if gate_row['type_gate'] != 1.0:
            direction = "+" if gate_row['type_gate'] > 1.0 else "-"
            pct = abs(gate_row['type_gate'] - 1.0) * 100
            text.append(f"Drug type: {direction}{pct:.0f}%")
        
        if gate_row['mechanism_gate'] != 1.0:
            direction = "+" if gate_row['mechanism_gate'] > 1.0 else "-"
            pct = abs(gate_row['mechanism_gate'] - 1.0) * 100
            text.append(f"Mechanism compatibility: {direction}{pct:.0f}%")
            
        if gate_row.get('relevance_gate', 1.0) < 1.0:
            text.append("⚠️ No biological evidence (heavy penalty)")
        
        if not text:
            return "No gate adjustments applied"
        
        return " | ".join(text)


# Quick test
if __name__ == "__main__":
    gates = PostModelGates()
    
    # Test with mock data
    import numpy as np
    base_scores = pd.Series([0.8, 0.6, 0.4])
    drug_ids = ['CHEMBL1', 'CHEMBL2', 'CHEMBL3']
    disease_id = 'EFO_0000384'
    
    # Mock properties
    mock_props = {
        'CHEMBL1': {'drug_type': 'small_molecule', 'mechanism_class': 'kinase_inhibitor'},
        'CHEMBL2': {'drug_type': 'antibody', 'mechanism_class': 'immune_modulator'},
        'CHEMBL3': {'drug_type': 'unknown', 'mechanism_class': 'unknown'},
    }
    
    adjusted, details = gates.apply_gates(
        base_scores, 
        drug_ids, 
        disease_id,
        drug_properties=mock_props,
        disease_area='oncology'
    )
    
    print("Gate Effects:")
    print(details.to_string())
