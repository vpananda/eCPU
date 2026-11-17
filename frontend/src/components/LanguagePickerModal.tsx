import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLanguage, LanguageCode } from "@/src/i18n";
import { colors, radius, spacing, shadow } from "@/src/theme";

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LanguagePickerModal({ visible, onClose }: LanguagePickerModalProps) {
  const { language, setLanguage, t, languages } = useLanguage();

  const handleSelect = async (code: LanguageCode) => {
    await setLanguage(code);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="translate" size={18} color="#6D28D9" />
              </View>
              <View>
                <Text style={styles.modalTitle}>{t("common.select_language", "Choose App Language")}</Text>
                <Text style={styles.modalSubtitle}>மொழி / ഭാഷ / भाषा</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} bounces={false}>
            {languages.map(item => {
              const isSelected = item.code === language;
              return (
                <TouchableOpacity
                  key={item.code}
                  onPress={() => handleSelect(item.code)}
                  style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                  activeOpacity={0.75}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 24 }}>{item.flag}</Text>
                    <View>
                      <Text style={[styles.modalItemTitle, isSelected && styles.modalItemTitleSelected]}>
                        {item.nativeName}
                      </Text>
                      <Text style={styles.modalItemSub}>{item.label}</Text>
                    </View>
                  </View>
                  {isSelected ? (
                    <MaterialCommunityIcons name="check-circle" size={22} color="#6D28D9" />
                  ) : (
                    <View style={styles.unselectedRadio} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 27, 20, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
  },
  modalItemSelected: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  modalItemTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  modalItemTitleSelected: {
    color: "#6D28D9",
    fontWeight: "800",
  },
  modalItemSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  unselectedRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
