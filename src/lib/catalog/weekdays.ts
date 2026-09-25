export const CLASS_WEEKDAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
] as const;

export function weekdayLabel(weekday: number): string {
  return CLASS_WEEKDAYS.find((day) => day.value === weekday)?.label ?? String(weekday);
}

export const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
