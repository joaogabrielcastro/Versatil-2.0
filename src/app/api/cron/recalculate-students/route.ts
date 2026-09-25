import { authorizeCron, cronFailure, finishCron } from "@/lib/cron/http";
import { recalculateAllStudents } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const result = await recalculateAllStudents();
    return finishCron("recalculate-students", result);
  } catch (err) {
    return cronFailure(err);
  }
}
