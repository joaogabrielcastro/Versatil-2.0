import { z } from "zod";

export const workoutExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  sets: z.string().max(64).optional(),
  reps: z.string().max(64).optional(),
  load: z.string().max(64).optional(),
  rest: z.string().max(64).optional(),
  notes: z.string().max(500).optional(),
});

export const workoutExercisesSchema = z
  .array(workoutExerciseSchema)
  .min(1, "Adicione pelo menos um exercício.");

export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export type WorkoutExercises = WorkoutExercise[];
