import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Modal, TextInput, FlatList, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Option = { id: string; name: string; sub?: string; meta?: string };

export function Picker({
  label,
  value,
  onChange,
  options,
  placeholder,
  testID,
  disabled,
  searchable = true,
}: {
  label?: string;
  value: string | null;
  onChange: (id: string) => void;
  options: Option[];
  placeholder?: string;
  testID?: string;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => options.find(o => o.id === value), [options, value]);
  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const term = q.toLowerCase();
    return options.filter(
      o =>
        o.name.toLowerCase().includes(term) ||
        (o.sub || "").toLowerCase().includes(term) ||
        (o.meta || "").toLowerCase().includes(term)
    );
  }, [options, q]);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        testID={testID}
        disabled={disabled}
        style={[styles.trigger, disabled && { opacity: 0.6 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <View style={{ flex: 1 }}>
          {selected ? (
            <>
              <Text style={styles.triggerValue}>{selected.name}</Text>
              {selected.sub ? <Text style={styles.triggerSub}>{selected.sub}</Text> : null}
            </>
          ) : (
            <Text style={styles.triggerPh}>{placeholder || "Select..."}</Text>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
          {searchable ? (
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
              <TextInput
                testID={`${testID}-search`}
                style={styles.search}
                placeholder="Search..."
                placeholderTextColor={colors.textLight}
                value={q}
                onChangeText={setQ}
                autoFocus
              />
              {q ? (
                <TouchableOpacity onPress={() => setQ("")}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={o => o.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID={`${testID}-option-${item.id}`}
                style={[styles.item, value === item.id && styles.itemActive]}
                onPress={() => { onChange(item.id); setOpen(false); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.sub ? <Text style={styles.itemSub}>{item.sub}</Text> : null}
                </View>
                {item.meta ? <Text style={styles.itemMeta}>{item.meta}</Text> : null}
                {value === item.id ? (
                  <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No results</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  trigger: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, gap: spacing.sm },
  triggerValue: { fontSize: 15, color: colors.text, fontWeight: "700" },
  triggerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  triggerPh: { fontSize: 14, color: colors.textLight },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: spacing.xxl, maxHeight: "70%", ...shadow.card },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemActive: { backgroundColor: colors.primary50 },
  itemName: { fontSize: 15, color: colors.text, fontWeight: "700" },
  itemSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  itemMeta: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  empty: { textAlign: "center", padding: spacing.lg, color: colors.textMuted },
});
