import type { WorkoutExercises } from "./types";

export type PresetTemplate = {
  name: string;
  description: string;
  sortOrder: number;
  exercises: WorkoutExercises;
};

export const DEFAULT_WORKOUT_PRESETS: PresetTemplate[] = [
  {
    name: "Treino A — Peito e Tríceps",
    description: "Modelo clássico para hipertrofia de peitoral e tríceps.",
    sortOrder: 10,
    exercises: [
      { name: "Supino reto", sets: "4", reps: "8–10", rest: "90s" },
      { name: "Supino inclinado com halteres", sets: "3", reps: "10–12", rest: "75s" },
      { name: "Crucifixo na polia", sets: "3", reps: "12–15", rest: "60s" },
      { name: "Tríceps na polia", sets: "3", reps: "12–15", rest: "60s" },
      { name: "Tríceps testa", sets: "3", reps: "10–12", rest: "60s" },
    ],
  },
  {
    name: "Treino B — Costas e Bíceps",
    description: "Puxadas e remadas com finalização de bíceps.",
    sortOrder: 20,
    exercises: [
      { name: "Puxada frontal", sets: "4", reps: "8–10", rest: "90s" },
      { name: "Remada curvada", sets: "4", reps: "8–10", rest: "90s" },
      { name: "Remada unilateral", sets: "3", reps: "10–12", rest: "75s" },
      { name: "Rosca direta", sets: "3", reps: "10–12", rest: "60s" },
      { name: "Rosca martelo", sets: "3", reps: "12", rest: "60s" },
    ],
  },
  {
    name: "Treino C — Pernas",
    description: "Quadríceps, posteriores e panturrilhas.",
    sortOrder: 30,
    exercises: [
      { name: "Agachamento livre", sets: "4", reps: "8–10", rest: "120s" },
      { name: "Leg press", sets: "4", reps: "10–12", rest: "90s" },
      { name: "Cadeira extensora", sets: "3", reps: "12–15", rest: "60s" },
      { name: "Mesa flexora", sets: "3", reps: "12–15", rest: "60s" },
      { name: "Panturrilha em pé", sets: "4", reps: "15–20", rest: "45s" },
    ],
  },
  {
    name: "Treino D — Ombros e Abdômen",
    description: "Deltoide completo e core.",
    sortOrder: 40,
    exercises: [
      { name: "Desenvolvimento com halteres", sets: "4", reps: "8–10", rest: "90s" },
      { name: "Elevação lateral", sets: "3", reps: "12–15", rest: "60s" },
      { name: "Crucifixo invertido", sets: "3", reps: "12–15", rest: "60s" },
      { name: "Prancha", sets: "3", reps: "40–60s", notes: "Manter quadril alinhado" },
      { name: "Abdominal na polia", sets: "3", reps: "15", rest: "45s" },
    ],
  },
  {
    name: "Full Body — Iniciante",
    description: "Circuito simples para quem está começando.",
    sortOrder: 50,
    exercises: [
      { name: "Leg press", sets: "3", reps: "12", rest: "90s" },
      { name: "Puxada assistida", sets: "3", reps: "12", rest: "75s" },
      { name: "Supino máquina", sets: "3", reps: "12", rest: "75s" },
      { name: "Desenvolvimento máquina", sets: "2", reps: "12", rest: "60s" },
      { name: "Esteira / bike", sets: "1", reps: "15–20 min", notes: "Ritmo moderado" },
    ],
  },
];
