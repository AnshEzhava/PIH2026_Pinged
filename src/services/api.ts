import axios from 'axios';
import Constants from 'expo-constants';

import type {
  Disease,
  DrugCandidate,
  DrugDetails,
  StructureData,
  NetworkData,
  GeminiExplanation,
  GeminiChatResponse,
  PredictResponse,
} from '@/types/index';

const API_BASE: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://10.0.2.2:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 600_000,
  headers: { 'Content-Type': 'application/json' },
});

export const getPopularDiseases = (): Promise<Disease[]> =>
  api.get<Disease[]>('/diseases/popular').then(r => r.data);

/** Requires query length >= 2. */
export const searchDiseases = (query: string): Promise<Disease[]> =>
  api.get<Disease[]>('/diseases/search', { params: { q: query } }).then(r => r.data);

/**
 * Scores drug candidates via XGBoost + PostModelGates.
 * Returns top-k ranked DrugCandidates for the given disease.
 */
export const predictCandidates = (
  diseaseId: string,
  topK = 5,
): Promise<PredictResponse> =>
  api
    .get<PredictResponse>(`/predict/${encodeURIComponent(diseaseId)}`, {
      params: { top_k: topK },
    })
    .then(r => r.data);

export const getDrugDetails = (drugId: string): Promise<DrugDetails> =>
  api.get<DrugDetails>(`/drug/${drugId}/details`).then(r => r.data);

/**
 * Resolves ChEMBL ID → PubChem CID → fetches 3D SDF mol file.
 * Falls back to 2D if 3D is unavailable.
 */
export const getDrugStructure = (drugId: string): Promise<StructureData> =>
  api.get<StructureData>(`/drug/${drugId}/structure`).then(r => r.data);

/**
 * Builds drug → target → disease network graph data using OpenTargets.
 */
export const getDrugDiseaseNetwork = (
  drugId: string,
  diseaseId: string,
): Promise<NetworkData> =>
  api
    .get<NetworkData>(`/drug/${drugId}/network/${encodeURIComponent(diseaseId)}`)
    .then(r => r.data);

export const getGeminiExplanation = (
  drugName: string,
  diseaseName: string,
  drugType: string,
  mechanism: string,
): Promise<GeminiExplanation> =>
  api
    .post<GeminiExplanation>('/gemini/explain', {
      drug_name: drugName,
      disease_name: diseaseName,
      drug_type: drugType || 'Unknown',
      mechanism: mechanism || 'Unknown',
    })
    .then(r => r.data);

export const chatWithGemini = (
  drugName: string,
  diseaseName: string,
  drugType: string,
  mechanism: string,
  question: string,
): Promise<GeminiChatResponse> =>
  api
    .post<GeminiChatResponse>(
      '/gemini/chat',
      {
        drug_name: drugName,
        disease_name: diseaseName,
        drug_type: drugType || 'Unknown',
        mechanism: mechanism || 'Unknown',
      },
      { params: { question } },
    )
    .then(r => r.data);

export default api;
