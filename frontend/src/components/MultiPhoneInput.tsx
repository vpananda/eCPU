import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { formatDisplayPhone } from "@/src/utils/notifications";

interface MultiPhoneInputProps {
  label: string;
  helper?: string;
  value: string;
  onChangeText: (val: string) => void;
  placeholder?: string;
}

export function MultiPhoneInput({
  label,
  helper,
  value,
  onChangeText,
  placeholder = "Enter mobile number e.g. 9842100000",
}: MultiPhoneInputProps) {
  const [inputVal, setInputVal] = useState("");

  const numbers = value
    ? value
        .replace(/;/g, ",")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
    : [];

  const handleAdd = () => {
    if (!inputVal.trim()) return;
    const incoming = inputVal
      .replace(/;/g, ",")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const merged = Array.from(new Set([...numbers, ...incoming]));
    onChangeText(merged.join(", "));
    setInputVal("");
  };

  const handleRemove = (indexToRemove: number) => {
    const updated = numbers.filter((_, idx) => idx !== indexToRemove);
    onChangeText(updated.join(", "));
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.countBadge}>
          {numbers.length} {numbers.length === 1 ? "Number" : "Numbers"}
        </Text>
      </View>

      {/* Chip list of added numbers */}
      {numbers.length > 0 && (
        <View style={styles.chipsContainer}>
          {numbers.map((phone, idx) => (
            <View key={`${phone}-${idx}`} style={styles.chip}>
              <MaterialCommunityIcons name="whatsapp" size={13} color="#059669" />
              <Text style={styles.chipText}>{formatDisplayPhone(phone)}</Text>
              <TouchableOpacity
                onPress={() => handleRemove(idx)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.removeBtn}
              >
                <MaterialCommunityIcons name="close-circle" size={14} color="#64748B" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add number input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          value={inputVal}
          onChangeText={setInputVal}
          keyboardType="phone-pad"
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.text,
  },
  countBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    backgroundColor: colors.primary50,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  removeBtn: {
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.lg,
    gap: 3,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "700",
  },
  helper: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
});

