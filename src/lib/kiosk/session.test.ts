import { describe, expect, it } from "vitest";
import {
  readCookieValue,
  signKioskSession,
  verifyKioskSession,
} from "@/lib/kiosk/session";

const secret = "01234567890123456789012345678901";

describe("kiosk session cookie", () => {
  it("assina e verifica sessão do dispositivo", async () => {
    const token = await signKioskSession(
      {
        deviceId: "11111111-1111-1111-1111-111111111111",
        tid: "22222222-2222-2222-2222-222222222222",
      },
      secret,
    );
    const parsed = await verifyKioskSession(token, secret);
    expect(parsed.deviceId).toBe("11111111-1111-1111-1111-111111111111");
    expect(parsed.tid).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("lê cookie HttpOnly do header", () => {
    expect(readCookieValue("a=1; tf_kiosk=abc%3D; b=2", "tf_kiosk")).toBe("abc=");
    expect(readCookieValue(null, "tf_kiosk")).toBeNull();
  });
});
