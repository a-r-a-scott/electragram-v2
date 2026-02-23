import type { TwilioSender } from "./messages.service.js";

/**
 * Production Twilio sender using the Twilio REST API via fetch.
 * No external SDK — avoids sandbox network dependency issues.
 */
export class TwilioHttpSender implements TwilioSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
  ) {}

  async send(params: { to: string; from: string; body: string; channel: string }): Promise<{ sid: string }> {
    const to = params.channel === "whatsapp" ? `whatsapp:${params.to}` : params.to;
    const from = params.channel === "whatsapp" ? `whatsapp:${params.from}` : params.from;

    const body = new URLSearchParams({ To: to, From: from, Body: params.body });
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { sid: string };
    return { sid: data.sid };
  }
}
