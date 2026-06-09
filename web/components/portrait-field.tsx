"use client";

import { useEffect, useState } from "react";

import { isSupportedPortraitUrl } from "@/lib/characters/portable";

type PortraitFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
};

export function PortraitField({ label, name, value, onChange }: PortraitFieldProps) {
  const [loadState, setLoadState] = useState<"empty" | "loading" | "loaded" | "error">(
    value ? "loading" : "empty",
  );
  const protocolValid = isSupportedPortraitUrl(value);

  useEffect(() => {
    setLoadState(value && protocolValid ? "loading" : value ? "error" : "empty");
  }, [protocolValid, value]);

  return (
    <div className="portrait-field">
      <div className="portrait-field__preview" aria-live="polite">
        {value && protocolValid ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={value}
            referrerPolicy="no-referrer"
            onLoad={() => setLoadState("loaded")}
            onError={() => setLoadState("error")}
          />
        ) : null}
        {loadState !== "loaded" ? (
          <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
        ) : null}
      </div>
      <label className="builder-field" htmlFor={name}>
        <span>{label} URL</span>
        <input
          className="input"
          id={name}
          inputMode="url"
          name={name}
          placeholder="https://example.com/portrait.jpg"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value && loadState === "error" ? (
          <small className="portrait-field__error">
            Use a public http or https image URL. The draft can still be saved.
          </small>
        ) : (
          <small className="portrait-field__hint">External images remain hosted by their original provider.</small>
        )}
      </label>
    </div>
  );
}
