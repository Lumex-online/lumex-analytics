export class HealthController {
  getStatus() {
    return {
      ok: true,
      service: "lumex-analytics-api",
      now: new Date().toISOString()
    };
  }
}
