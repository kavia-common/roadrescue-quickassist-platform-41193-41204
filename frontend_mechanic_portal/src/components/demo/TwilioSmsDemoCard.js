import React, { useMemo, useState } from "react";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

/**
 * DEMO-ONLY SECURITY WARNING:
 * This component calls Twilio's REST API directly from the browser using
 * REACT_APP_TWILIO_* credentials. That exposes secrets to anyone who loads the page.
 *
 * In production, replace this with a secure backend endpoint (or Supabase Edge Function)
 * that holds Twilio credentials server-side.
 */

function getTwilioConfig() {
  const accountSid = process.env.REACT_APP_TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.REACT_APP_TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.REACT_APP_TWILIO_MESSAGING_SERVICE_SID || "";
  const fromNumber = process.env.REACT_APP_TWILIO_FROM_NUMBER || "";

  return { accountSid, authToken, messagingServiceSid, fromNumber };
}

function isLikelyE164(phone) {
  return /^\+\d{8,15}$/.test(phone.trim());
}

async function parseTwilioError(response) {
  try {
    const data = await response.json();
    const message = data?.message || data?.detail || "Twilio request failed.";
    const code = data?.code ? ` (code ${data.code})` : "";
    return `${message}${code}`;
  } catch {
    try {
      const text = await response.text();
      return text || `Twilio request failed with status ${response.status}.`;
    } catch {
      return `Twilio request failed with status ${response.status}.`;
    }
  }
}

// PUBLIC_INTERFACE
export function TwilioSmsDemoCard({ title = "SMS Demo", defaultTo = "" }) {
  /** Demo card that simulates the mocked "mechanic accepts job" event by sending an SMS via Twilio. */
  const [to, setTo] = useState(defaultTo);
  const [body, setBody] = useState("Your RoadRescue job has been accepted by a mechanic.");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  const cfg = useMemo(() => getTwilioConfig(), []);

  const canSend = useMemo(() => {
    if (!cfg.accountSid || !cfg.authToken) return false;
    if (!cfg.messagingServiceSid && !cfg.fromNumber) return false;
    return true;
  }, [cfg.accountSid, cfg.authToken, cfg.messagingServiceSid, cfg.fromNumber]);

  const onSend = async () => {
    setStatus({ type: "", message: "" });

    const toTrim = to.trim();
    if (!toTrim) {
      setStatus({ type: "error", message: "Please enter a destination phone number in E.164 format (e.g. +15551234567)." });
      return;
    }
    if (!isLikelyE164(toTrim)) {
      setStatus({ type: "error", message: "Invalid phone number format. Use E.164 like +15551234567." });
      return;
    }
    if (!body.trim()) {
      setStatus({ type: "error", message: "Message cannot be empty." });
      return;
    }
    if (!canSend) {
      setStatus({
        type: "error",
        message:
          "Missing Twilio env vars. Required: REACT_APP_TWILIO_ACCOUNT_SID, REACT_APP_TWILIO_AUTH_TOKEN, and one of REACT_APP_TWILIO_MESSAGING_SERVICE_SID or REACT_APP_TWILIO_FROM_NUMBER.",
      });
      return;
    }

    setLoading(true);
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;

      const form = new URLSearchParams();
      form.set("To", toTrim);
      form.set("Body", body.trim());
      if (cfg.messagingServiceSid) {
        form.set("MessagingServiceSid", cfg.messagingServiceSid);
      } else {
        form.set("From", cfg.fromNumber);
      }

      const basic = btoa(`${cfg.accountSid}:${cfg.authToken}`);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: form.toString(),
      });

      if (!resp.ok) {
        const msg = await parseTwilioError(resp);
        throw new Error(msg);
      }

      const data = await resp.json();
      setStatus({
        type: "success",
        message: `SMS queued successfully. Twilio SID: ${data?.sid || "(unknown)"}`,
      });
    } catch (e) {
      setStatus({ type: "error", message: e?.message || "Could not send SMS." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={title} subtitle="Demo-only: Simulates ‘Mechanic accepts job’ by sending an SMS via Twilio.">
      <div
        style={{
          border: "1px solid rgba(37, 99, 235, 0.18)",
          background: "linear-gradient(180deg, rgba(37, 99, 235, 0.06), rgba(249, 250, 251, 1))",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text)", opacity: 0.9, lineHeight: 1.35 }}>
          <strong>Demo-only warning:</strong> This sends via Twilio directly from the browser (credentials exposed). Replace with a secure backend/edge function for production.
        </div>
      </div>

      {!canSend ? (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          Twilio is not fully configured for this demo. Set:
          <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
            REACT_APP_TWILIO_ACCOUNT_SID, REACT_APP_TWILIO_AUTH_TOKEN, REACT_APP_TWILIO_MESSAGING_SERVICE_SID (or REACT_APP_TWILIO_FROM_NUMBER)
          </div>
        </div>
      ) : null}

      {status.message ? (
        <div className={`alert ${status.type === "success" ? "alert-success" : status.type === "error" ? "alert-error" : "alert-info"}`} style={{ marginBottom: 12 }}>
          {status.message}
        </div>
      ) : null}

      <div className="grid2" style={{ gap: 12, alignItems: "end" }}>
        <div>
          <label className="label" htmlFor="twilioTo">
            Destination number (E.164)
          </label>
          <Input id="twilioTo" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+15551234567" />
        </div>

        <div>
          <label className="label" htmlFor="twilioBody">
            Message
          </label>
          <Input id="twilioBody" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your RoadRescue job has been accepted by a mechanic." />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <Button onClick={onSend} disabled={loading}>
          {loading ? "Sending…" : "Accept Job (Demo) → Send SMS"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setStatus({ type: "", message: "" });
            setBody("Your RoadRescue job has been accepted by a mechanic.");
          }}
          disabled={loading}
        >
          Reset
        </Button>
      </div>
    </Card>
  );
}
