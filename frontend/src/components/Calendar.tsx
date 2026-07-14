import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

interface CalendarProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onSelectRange: (start: string, end: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function Calendar({ startDate, endDate, onSelectRange }: CalendarProps) {
  // Initialize current month view based on startDate if valid, otherwise today
  const initialDate = startDate ? new Date(startDate) : new Date();
  const [viewDate, setViewDate] = useState<Date>(
    isNaN(initialDate.getTime()) ? new Date() : initialDate
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const numDays = new Date(year, month + 1, 0).getDate();
  const prevMonthNumDays = new Date(year, month, 0).getDate();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDatePress = (dateStr: string) => {
    if (!startDate || (startDate && endDate)) {
      onSelectRange(dateStr, "");
    } else {
      if (dateStr < startDate) {
        onSelectRange(dateStr, "");
      } else {
        onSelectRange(startDate, dateStr);
      }
    }
  };

  // Generate grid days
  const grid: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthNumDays - i;
    const prevMonthDate = new Date(year, month - 1, d);
    grid.push({
      dateStr: toDateString(prevMonthDate),
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= numDays; d++) {
    const curDate = new Date(year, month, d);
    grid.push({
      dateStr: toDateString(curDate),
      dayNum: d,
      isCurrentMonth: true,
    });
  }

  // Next month padding days to complete grid rows
  const remainingCells = 42 - grid.length; // 6 rows * 7 days = 42 cells
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthDate = new Date(year, month + 1, d);
    grid.push({
      dateStr: toDateString(nextMonthDate),
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  return (
    <View style={styles.container}>
      {/* Calendar Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn} testID="calendar-prev-month">
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn} testID="calendar-next-month">
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Weekdays Row */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((day, idx) => (
          <Text key={idx} style={styles.weekdayText}>{day}</Text>
        ))}
      </View>

      {/* Days Grid */}
      <View style={styles.grid}>
        {grid.map((cell, idx) => {
          const { dateStr, dayNum, isCurrentMonth } = cell;
          const isSelectedStart = dateStr === startDate;
          const isSelectedEnd = dateStr === endDate;
          const isInRange = startDate && endDate && dateStr > startDate && dateStr < endDate;

          // Determine styles
          let dayStyle = [styles.dayCell];
          let textStyle = [styles.dayText];

          if (!isCurrentMonth) {
            textStyle.push(styles.outOfMonthText as any);
          }

          if (isSelectedStart) {
            dayStyle.push(styles.selectedStartCell as any);
            textStyle.push(styles.selectedText as any);
          } else if (isSelectedEnd) {
            dayStyle.push(styles.selectedEndCell as any);
            textStyle.push(styles.selectedText as any);
          } else if (isInRange) {
            dayStyle.push(styles.rangeCell as any);
            textStyle.push(styles.rangeText as any);
          }

          return (
            <TouchableOpacity
              key={idx}
              style={dayStyle}
              onPress={() => handleDatePress(dateStr)}
              testID={`calendar-day-${dateStr}`}
              activeOpacity={0.8}
            >
              <Text style={textStyle}>{dayNum}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  navBtn: {
    padding: spacing.xs,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    flex: 1,
  },
  weekdaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  weekdayText: {
    width: "14.28%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.textLight,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
    borderRadius: radius.sm,
  },
  dayText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  outOfMonthText: {
    color: colors.textLight,
    opacity: 0.5,
  },
  selectedStartCell: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  selectedEndCell: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  selectedText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  rangeCell: {
    backgroundColor: colors.primary50,
    borderRadius: 0,
  },
  rangeText: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
});
