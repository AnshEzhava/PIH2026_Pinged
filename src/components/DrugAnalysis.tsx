import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
} from "react-native";
import { Sparkles, AlertTriangle } from "lucide-react-native";

import type { DrugCandidate, Disease, NetworkData } from "@/types";
import { useThemeColors } from "@/theme";

interface DrugAnalysisProps {
  drug: DrugCandidate;
  disease: Disease;
  networkData: NetworkData | null;
  onOpenChatbot: () => void;
}

export default function DrugAnalysis({
  drug,
  disease,
  networkData,
  onOpenChatbot,
}: DrugAnalysisProps) {
  const C = useThemeColors();

  const mechanismText = useMemo(
    () =>
      drug.mechanism && drug.mechanism !== "Unknown"
        ? drug.mechanism
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/^\w/, (c) => c.toUpperCase())
        : "Mechanism of action is under investigation. This drug may act through novel pathways relevant to the target disease.",
    [drug.mechanism],
  );

  const targetNodes = useMemo(
    () =>
      networkData?.nodes?.filter(
        (n) => n.type === "gene" || n.type === "target",
      ) ?? [],
    [networkData],
  );

  const repurposingScore = useMemo(
    () => `${(drug.score * 100).toFixed(1)}% (${drug.confidence})`,
    [drug.score, drug.confidence],
  );

  const associationScore = useMemo(
    () => (drug.association_score ? drug.association_score.toFixed(3) : "N/A"),
    [drug.association_score],
  );

  const clinicalPhase = useMemo(
    () => (drug.max_phase > 0 ? `Phase ${drug.max_phase}` : "Preclinical"),
    [drug.max_phase],
  );

  const geneOverlap = useMemo(
    () => `${drug.gene_overlap} ${drug.gene_overlap === 1 ? "gene" : "genes"}`,
    [drug.gene_overlap],
  );

  const monoFont = Platform.OS === "ios" ? "Courier" : "monospace";

  return (
    <View>
      {/* Header row */}
      <View style={s.headerRow}>
        <Text style={[s.sectionTitle, { color: C.textPrimary }]}>
          Drug Details
        </Text>
        <Pressable
          onPress={onOpenChatbot}
          style={({ pressed }) => [
            s.aiButton,
            {
              backgroundColor: pressed ? C.accentSubtleAlt : C.accentSubtle,
              borderColor: C.accentBorder,
            },
          ]}
        >
          <Sparkles size={12} color={C.accent} style={s.aiIcon} />
          <Text style={[s.aiButtonText, { color: C.accent }]}>
            Explain with AI
          </Text>
        </Pressable>
      </View>

      {/* Drug Name — full width */}
      <InfoRow label="Drug Name" value={drug.drug_name} bold colors={C} />

      <View style={s.row}>
        <View style={s.col}>
          <InfoRow label="ChEMBL ID" value={drug.drug_id} mono colors={C} />
        </View>
        <View style={s.col}>
          <InfoRow label="Rank" value={`#${drug.rank}`} colors={C} />
        </View>
      </View>

      <View style={s.row}>
        <View style={s.col}>
          <InfoRow
            label="Repurposing Score"
            value={repurposingScore}
            colors={C}
          />
        </View>
        <View style={s.col}>
          <InfoRow
            label="Association Score"
            value={associationScore}
            colors={C}
          />
        </View>
      </View>

      <View style={s.row}>
        <View style={s.col}>
          <InfoRow
            label="Drug Type"
            value={drug.drug_type ?? "Unknown"}
            colors={C}
          />
        </View>
        <View style={s.col}>
          <InfoRow
            label="Max Clinical Phase"
            value={clinicalPhase}
            colors={C}
          />
        </View>
      </View>

      <View style={s.row}>
        <View style={s.col}>
          <InfoRow label="Gene Overlap" value={geneOverlap} colors={C} />
        </View>
        <View style={s.col}>
          <InfoRow
            label="Disease Context"
            value={disease.disease_name}
            truncate
            colors={C}
          />
        </View>
      </View>

      {/* Mechanism of Action */}
      <View style={[s.section, { borderTopColor: C.border }]}>
        <Text style={[s.sectionLabel, { color: C.textMuted }]}>
          Mechanism of Action
        </Text>
        <Text style={[s.bodyText, { color: C.textPrimary }]}>
          {mechanismText}
        </Text>
      </View>

      {/* Molecular Targets */}
      {targetNodes.length > 0 && (
        <View
          style={[s.section, { borderTopColor: C.border, marginBottom: 10 }]}
        >
          <Text style={[s.sectionLabel, { color: C.textMuted }]}>
            Molecular Targets ({targetNodes.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.tagRow}>
              {targetNodes.slice(0, 12).map((n) => (
                <View
                  key={n.id}
                  style={[
                    s.tag,
                    { backgroundColor: C.tagBg, borderColor: C.tagBorder },
                  ]}
                >
                  <Text
                    style={[
                      s.tagText,
                      { color: C.tagText, fontFamily: monoFont },
                    ]}
                  >
                    {n.label ?? n.id}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Guardrail */}
      {drug.guardrail && (
        <View style={[s.guardrailOuter, { borderTopColor: C.border }]}>
          <View
            style={[
              s.guardrailInner,
              { backgroundColor: C.warningBg, borderColor: C.warningBorder },
            ]}
          >
            <AlertTriangle
              size={11}
              color={C.warningIcon}
              style={s.warningIcon}
            />
            <Text style={[s.guardrailText, { color: C.warningText }]}>
              {drug.guardrail}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// InfoRow — memoised so it only re-renders when its own props change
// ---------------------------------------------------------------------------
const InfoRow = React.memo(function InfoRow({
  label,
  value,
  bold,
  mono,
  truncate,
  colors,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
  truncate?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const monoFont = Platform.OS === "ios" ? "Courier" : "monospace";
  return (
    <View>
      <Text style={[s.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        numberOfLines={truncate ? 1 : undefined}
        style={{
          fontSize: bold ? 12 : 10,
          fontWeight: bold ? "600" : mono ? "400" : "500",
          color: colors.textPrimary,
          fontFamily: mono ? monoFont : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Static styles — created once, never recreated on re-render
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  aiButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  aiIcon: {
    alignSelf: "center",
  },
  aiButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  col: {
    flex: 1,
  },
  section: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 10,
    lineHeight: 16,
  },
  tagRow: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
  },
  tag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 9,
  },
  guardrailOuter: {
    borderTopWidth: 1,
    paddingTop: 10,
  },
  guardrailInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    gap: 6,
  },
  warningIcon: {
    marginTop: 1,
  },
  guardrailText: {
    fontSize: 9,
    flex: 1,
    lineHeight: 14,
  },
  infoLabel: {
    fontSize: 9,
    marginBottom: 2,
  },
});
