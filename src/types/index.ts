export interface Disease {
  disease_id: string;
  disease_name: string;
}

export type ConfidenceTier = 'High' | 'Medium' | 'Low';

export interface DrugCandidate {
  drug_id: string;
  drug_name: string;
  rank: number;
  score: number;
  confidence: ConfidenceTier;
  drug_type?: string;
  mechanism?: string;
  gene_overlap: number;
  max_phase: number;
  association_score?: number;
  guardrail?: string;
}

export type NetworkNodeType = 'drug' | 'gene' | 'target' | 'disease';

export interface NetworkNode {
  id: string;
  label?: string;
  type: NetworkNodeType;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface NetworkEdge {
  source: string | NetworkNode;
  target: string | NetworkNode;
  label?: string;
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  links?: NetworkEdge[];
}

export interface StructureData {
  data: string;
  source?: '3d' | '2d';
  pubchem_cid?: number;
}

export interface DrugDetails {
  drug_id?: string;
  drug_name?: string;
  drug_type?: string;
  max_phase?: number;
  mechanism?: string;
  known_indications?: string[];
}

export interface GeminiExplanation {
  summary?: string;
  mechanism_detail?: string;
  disease_relevance?: string;
  contraindications?: string[];
}

export interface GeminiChatResponse {
  response: string;
}

export interface PredictResponse {
  disease_id: string;
  disease_name: string;
  candidates: DrugCandidate[];
  total_candidates_scored: number;
}

export interface LoadingState {
  predict: boolean;
  structure: boolean;
  network: boolean;
  details: boolean;
}
