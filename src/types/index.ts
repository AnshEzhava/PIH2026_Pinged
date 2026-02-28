/**
 * Shared TypeScript type definitions for DrugRepurpose RN app.
 * Ported from implicit data shapes in DrugRepurposeV2-main/frontend/src/
 */

// ─── Disease ────────────────────────────────────────────────────────────────

export interface Disease {
  disease_id: string;
  disease_name: string;
}

// ─── Drug Candidate ─────────────────────────────────────────────────────────

export type ConfidenceTier = 'High' | 'Medium' | 'Low';

export interface DrugCandidate {
  drug_id: string;
  drug_name: string;
  rank: number;
  /** XGBoost probability score, 0–1 */
  score: number;
  confidence: ConfidenceTier;
  drug_type?: string;
  mechanism?: string;
  gene_overlap: number;
  max_phase: number;
  association_score?: number;
  /** PostModelGates warning string, present when a rule fired */
  guardrail?: string;
}

// ─── Network Graph ───────────────────────────────────────────────────────────

export type NetworkNodeType = 'drug' | 'gene' | 'target' | 'disease';

export interface NetworkNode {
  id: string;
  label?: string;
  type: NetworkNodeType;
  /** Populated by d3-force simulation */
  x?: number;
  y?: number;
  /** Fixed position during drag (d3-force) */
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
  /** Backend returns 'edges'; d3-force calls them 'links' — both accepted */
  edges: NetworkEdge[];
  links?: NetworkEdge[];
}

// ─── Molecular Structure ─────────────────────────────────────────────────────

export interface StructureData {
  /** Raw SDF mol file content */
  data: string;
  source?: '3d' | '2d';
  pubchem_cid?: number;
}

// ─── Drug Details ────────────────────────────────────────────────────────────

export interface DrugDetails {
  drug_id?: string;
  drug_name?: string;
  drug_type?: string;
  max_phase?: number;
  mechanism?: string;
  known_indications?: string[];
}

// ─── Gemini AI ───────────────────────────────────────────────────────────────

export interface GeminiExplanation {
  summary?: string;
  mechanism_detail?: string;
  disease_relevance?: string;
  contraindications?: string[];
}

export interface GeminiChatResponse {
  response: string;
}

// ─── API response wrappers ───────────────────────────────────────────────────

export interface PredictResponse {
  disease_id: string;
  disease_name: string;
  candidates: DrugCandidate[];
  total_candidates_scored: number;
}

// ─── Loading state ───────────────────────────────────────────────────────────

export interface LoadingState {
  predict: boolean;
  structure: boolean;
  network: boolean;
  details: boolean;
}
