/**
 * API service — TypeScript port of DrugRepurposeV2-main/frontend/src/services/api.js
 *
 * Backend URL configuration:
 *   Android emulator : http://10.0.2.2:8000/api
 *   iOS simulator    : http://localhost:8000/api
 *   Physical device  : http://<your-LAN-IP>:8000/api
 *   Production       : https://<deployed-domain>/api
 *
 * Set via API_BASE_URL in app.config.ts → Constants.expoConfig.extra.apiBaseUrl
 */

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

// ─── Base URL ────────────────────────────────────────────────────────────────

const API_BASE: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://10.0.2.2:8000/api';

// ─── Axios instance ──────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: API_BASE,
  // 600s timeout — ML prediction over the network can be slow
  timeout: 600_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Disease endpoints ───────────────────────────────────────────────────────

/** Returns the hardcoded list of ~22 popular diseases from the backend. */
export const getPopularDiseases = (): Promise<Disease[]> =>
  api.get<Disease[]>('/diseases/popular').then(r => r.data);

/** Searches diseases via OpenTargets GraphQL; requires query length >= 2. */
export const searchDiseases = (query: string): Promise<Disease[]> =>
  api.get<Disease[]>('/diseases/search', { params: { q: query } }).then(r => r.data);

// ─── Prediction endpoint ─────────────────────────────────────────────────────

/**
 * Core ML prediction — scores up to 100 candidates via XGBoost + PostModelGates.
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

// ─── Drug detail endpoints ───────────────────────────────────────────────────

/** Fetches drug type, max clinical phase, mechanism class from OpenTargets. */
export const getDrugDetails = (drugId: string): Promise<DrugDetails> =>
  api.get<DrugDetails>(`/drug/${drugId}/details`).then(r => r.data);

/**
 * Resolves ChEMBL ID → PubChem CID → fetches 3D SDF mol file.
 * Falls back to 2D if 3D is unavailable.
 */
export const getDrugStructure = (drugId: string): Promise<StructureData> =>
  api.get<StructureData>(`/drug/${drugId}/structure`).then(r => r.data);

/**
 * Builds drug → target → disease network graph data.
 * Uses OpenTargets to fetch drug targets + disease-associated genes.
 */
export const getDrugDiseaseNetwork = (
  drugId: string,
  diseaseId: string,
): Promise<NetworkData> =>
  api
    .get<NetworkData>(`/drug/${drugId}/network/${encodeURIComponent(diseaseId)}`)
    .then(r => r.data);

// ─── Gemini AI endpoints ─────────────────────────────────────────────────────

/** Returns structured AI explanation (summary, mechanism, contraindications). */
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

/** Chatbot Q&A about a specific drug-disease pair. */
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

// ─── Default export ──────────────────────────────────────────────────────────

export default api;
