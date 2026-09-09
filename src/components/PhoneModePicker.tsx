"use client";

import type { CallFrom } from "@/lib/calls";

export function PhoneModePicker({
  value,
  onChange,
  extension,
  disabled,
}: {
  value: CallFrom;
  onChange: (next: CallFrom) => void;
  extension?: string;
  disabled?: boolean;
}) {
  return (
    <div className="phone-mode">
      <span className="call-from-label">Active phone</span>
      <p className="muted">
        Extension {extension || "—"} can have both a hard phone and a browser softphone. Only one is used at a time.
      </p>
      <div className="call-from" role="group" aria-label="Active phone">
        <button
          type="button"
          className={value === "desk" ? "on" : ""}
          disabled={disabled}
          onClick={() => onChange("desk")}
        >
          Hard phone{extension ? ` ${extension}` : ""}
        </button>
        <button
          type="button"
          className={value === "sip" ? "on" : ""}
          disabled={disabled}
          onClick={() => onChange("sip")}
        >
          Softphone
        </button>
      </div>
    </div>
  );
}
