import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import {
  predictCandidates,
  getDrugDetails,
  getDrugDiseaseNetwork,
  getDrugStructure,
} from "@/services/index";

import type {
  Disease,
  DrugCandidate,
  DrugDetails,
  LoadingState,
  NetworkData,
  StructureData,
} from "@/types/index";

interface AppContextType {
  selectedDisease: Disease | null;
  candidates: DrugCandidate[];
  selectedDrug: DrugCandidate | null;
  networkData: NetworkData | null;
  structureData: StructureData | null;
  drugDetails: DrugDetails | null;
  loading: LoadingState;
  error: string | null;
  showChatbot: boolean;
  selectDisease: (disease: Disease) => Promise<void>;
  selectDrug: (drug: DrugCandidate) => Promise<void>;
  setShowChatbot: (show: boolean) => void;
  clearError: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedDisease, setSelectedDisease] = useState<Disease | null>(null);
  const [candidates, setCandidates] = useState<DrugCandidate[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<DrugCandidate | null>(null);
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [structureData, setStructureData] = useState<StructureData | null>(
    null,
  );
  const [drugDetails, setDrugDetails] = useState<DrugDetails | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    predict: false,
    structure: false,
    network: false,
    details: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [showChatbot, setShowChatbot] = useState(false);

  const selectDisease = useCallback(async (disease: Disease): Promise<void> => {
    setSelectedDisease(disease);
    setCandidates([]);
    setSelectedDrug(null);
    setNetworkData(null);
    setStructureData(null);
    setDrugDetails(null);
    setError(null);
    setLoading((prev) => ({ ...prev, predict: true }));

    try {
      const result = await predictCandidates(disease.disease_id, 5);
      setCandidates(result.candidates ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError("Failed to predict drug candidates. " + (detail ?? msg));
    } finally {
      setLoading((prev) => ({ ...prev, predict: false }));
    }
  }, []);

  const selectDrug = useCallback(
    async (drug: DrugCandidate): Promise<void> => {
      if (!selectedDisease) return;

      setSelectedDrug(drug);
      setStructureData(null);
      setNetworkData(null);
      setDrugDetails(null);
      setLoading((prev) => ({
        ...prev,
        structure: true,
        network: true,
        details: true,
      }));

      const fetchStructure = async () => {
        try {
          const data = await getDrugStructure(drug.drug_id);
          setStructureData(data);
        } catch (err) {
          console.error("Structure fetch failed:", err);
          setStructureData(null);
        } finally {
          setLoading((prev) => ({ ...prev, structure: false }));
        }
      };

      const fetchNetwork = async () => {
        try {
          const data = await getDrugDiseaseNetwork(
            drug.drug_id,
            selectedDisease.disease_id,
          );
          setNetworkData(data);
        } catch (err) {
          console.error("Network fetch failed:", err);
          setNetworkData(null);
        } finally {
          setLoading((prev) => ({ ...prev, network: false }));
        }
      };

      const fetchDetails = async () => {
        try {
          const data = await getDrugDetails(drug.drug_id);
          setDrugDetails(data);
        } catch (err) {
          console.error("Details fetch failed:", err);
          setDrugDetails(null);
        } finally {
          setLoading((prev) => ({ ...prev, details: false }));
        }
      };

      await Promise.all([fetchStructure(), fetchNetwork(), fetchDetails()]);
    },
    [selectedDisease],
  );

  const value: AppContextType = {
    selectedDisease,
    candidates,
    selectedDrug,
    networkData,
    structureData,
    drugDetails,
    loading,
    error,
    showChatbot,
    selectDisease,
    selectDrug,
    setShowChatbot,
    clearError: () => setError(null),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside <AppProvider>");
  }
  return ctx;
}

export default AppContext;
