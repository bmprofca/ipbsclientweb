"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL, api, getToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { DEFAULT_VOICE_KEYS, renderVoiceScript } from "@ipbs/shared";

type Key = { digit: string; label: string; disposition: string };

type Script = {
  id: string;
  name: string;
  script: string;
  source: string;
  audioPath: string;
  keysJson: string;
  notes: string;
};

type RecordRow = {
  id: string;
  phone: string;
  contactName: string;
  spokenText: string;
  dtmf: string;
  disposition: string;
  status: string;
  duration: number;
  createdAt: string;
  script?: { name: string } | null;
};

const SCRIPT_VARS = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "notes", label: "Notes" },
  { key: "email", label: "Email" },
] as const;

const PREVIEW_VARS = {
  name: "Priya",
  company: "Neron NXG",
  phone: "7002695990",
  notes: "Overdue invoice",
  email: "priya@example.com",
};

const STARTER_SCRIPT =
  "Hello {{name}}. This is a call about {{company}}. Press 1 if you are interested, 2 for a callback, or 3 if you are not interested.";

function parseKeys(raw: string): Key[] {
  try {
    const parsed = JSON.parse(raw || "[]") as Key[];
    if (parsed.length) return parsed;
  } catch {
    /* default */
  }
  return DEFAULT_VOICE_KEYS.map((k) => ({ ...k }));
}

function clip(text: string, max = 88) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function audioLabel(row: Script) {
  if (!row.audioPath) return { pill: "dead" as const, label: "No audio" };
  if (row.source === "recording") return { pill: "ring" as const, label: "Recorded" };
  return { pill: "live" as const, label: "Generated" };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
}

export default function VoicePage() {
  const { user } = useSession();
  const canEdit = ["owner", "admin", "supervisor"].includes(user?.role || "");
  const [tab, setTab] = useState<"scripts" | "records">("scripts");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [script, setScript] = useState(STARTER_SCRIPT);
  const [keys, setKeys] = useState<Key[]>(DEFAULT_VOICE_KEYS.map((k) => ({ ...k })));
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  const blobsRef = useRef<Record<string, string>>({});
  const [loadingPlay, setLoadingPlay] = useState<string | null>(null);

  async function load() {
    setScripts(await api<Script[]>("/voice/scripts"));
    setRecords(await api<RecordRow[]>("/voice/records"));
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load voice"));
  }, []);

  useEffect(() => {
    function close() {
      setMenuId(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(blobsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function forgetBlob(id: string) {
    const url = blobsRef.current[id];
    if (url) URL.revokeObjectURL(url);
    delete blobsRef.current[id];
    setBlobs((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  async function loadAudio(row: Script) {
    if (blobsRef.current[row.id]) return blobsRef.current[row.id];
    setLoadingPlay(row.id);
    setError("");
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/voice/scripts/${row.id}/audio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Audio not available");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobsRef.current[row.id] = url;
      setBlobs((m) => ({ ...m, [row.id]: url }));
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play audio");
      return "";
    } finally {
      setLoadingPlay(null);
    }
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setScript(STARTER_SCRIPT);
    setKeys(DEFAULT_VOICE_KEYS.map((k) => ({ ...k })));
    setOpen(true);
    setError("");
    setMenuId(null);
  }

  function openEdit(row: Script) {
    setEditing(row);
    setName(row.name);
    setScript(row.script);
    setKeys(parseKeys(row.keysJson));
    setOpen(true);
    setError("");
    setMenuId(null);
  }

  function insertVar(key: string) {
    const token = `{{${key}}}`;
    const el = scriptRef.current;
    if (!el) {
      setScript((s) => `${s}${token}`);
      return;
    }
    const start = el.selectionStart ?? script.length;
    const end = el.selectionEnd ?? script.length;
    const next = `${script.slice(0, start)}${token}${script.slice(end)}`;
    setScript(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function updateKey(i: number, patch: Partial<Key>) {
    setKeys((prev) => prev.map((k, idx) => (idx === i ? { ...k, ...patch } : k)));
  }

  function addKey() {
    const used = new Set(keys.map((k) => k.digit));
    const nextDigit = ["4", "5", "6", "7", "8", "0", "*", "#"].find((d) => !used.has(d)) || "";
    setKeys([...keys, { digit: nextDigit, label: "", disposition: "" }]);
  }

  function removeKey(i: number) {
    if (keys.length <= 1) return;
    setKeys(keys.filter((_, idx) => idx !== i));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cleanKeys = keys
        .filter((k) => k.digit && k.label.trim())
        .map((k) => ({
          digit: k.digit,
          label: k.label.trim(),
          disposition: k.disposition.trim() || slugify(k.label) || k.digit,
        }));
      const body = { name: name.trim(), script: script.trim(), keys: cleanKeys };
      if (editing) {
        await api(`/voice/scripts/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setMessage("Script updated.");
      } else {
        await api("/voice/scripts", { method: "POST", body: JSON.stringify(body) });
        setMessage("Script created.");
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save script");
    } finally {
      setBusy(false);
    }
  }

  function pickUpload(row: Script) {
    setUploadFor(row.id);
    setMenuId(null);
    requestAnimationFrame(() => uploadRef.current?.click());
  }

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const id = uploadFor;
    setUploadFor(null);
    if (!file || !id) return;
    if (file.size > 12 * 1024 * 1024) {
      setError("File too large. Maximum is 12MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      await api(`/voice/scripts/${id}/audio`, {
        method: "POST",
        body: JSON.stringify({ audioBase64, mime: file.type || "audio/mpeg" }),
      });
      forgetBlob(id);
      setMessage(`Uploaded “${file.name}” as the recorded voice.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function generate(row: Script) {
    setBusy(true);
    setError("");
    try {
      await api(`/voice/scripts/${row.id}/tts`, { method: "POST" });
      forgetBlob(row.id);
      setMessage("Voice generated from the script.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "TTS failed — record the message instead");
    } finally {
      setBusy(false);
    }
  }

  async function startRec(row: Script) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunks.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size) chunks.current.push(ev.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => {
        const audioBase64 = String(reader.result || "");
        void api(`/voice/scripts/${row.id}/audio`, {
          method: "POST",
          body: JSON.stringify({ audioBase64, mime: blob.type }),
        })
          .then(() => {
            forgetBlob(row.id);
            setMessage("Recording saved.");
            return load();
          })
          .catch((err) => setError(err instanceof Error ? err.message : "Upload failed"));
      };
      reader.readAsDataURL(blob);
      setRecordingId(null);
    };
    recRef.current = rec;
    rec.start();
    setRecordingId(row.id);
    setMenuId(null);
  }

  function stopRec() {
    recRef.current?.stop();
    recRef.current = null;
  }

  async function remove(row: Script) {
    if (!window.confirm(`Delete script “${row.name}”?`)) return;
    setMenuId(null);
    await api(`/voice/scripts/${row.id}`, { method: "DELETE" });
    await load();
  }

  const preview = renderVoiceScript(script, PREVIEW_VARS);
  const recordingRow = scripts.find((s) => s.id === recordingId);

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Outbound</p>
          <h1 className="page-title">Voice campaigns</h1>
          <p className="muted">
            Write or record the message, then start a campaign on Client list. Preloaded audio plays through the
            browser softphone — a hard phone will not play the script.
          </p>
        </div>
        <div className="toolbar-actions">
          <Link href="/app/clients" className="btn ghost">
            Use on Client list
          </Link>
          <div className="seg-tabs" role="tablist">
            <button
              className={tab === "scripts" ? "on" : ""}
              type="button"
              role="tab"
              aria-selected={tab === "scripts"}
              onClick={() => setTab("scripts")}
            >
              Scripts
            </button>
            <button
              className={tab === "records" ? "on" : ""}
              type="button"
              role="tab"
              aria-selected={tab === "records"}
              onClick={() => setTab("records")}
            >
              Call records
            </button>
          </div>
          {canEdit && tab === "scripts" && (
            <button className="btn" type="button" onClick={openCreate}>
              New script
            </button>
          )}
        </div>
      </div>
      {error && !open ? <p className="error">{error}</p> : null}
      {message ? <p className="ok-msg">{message}</p> : null}
      <input
        ref={uploadRef}
        type="file"
        accept="audio/*,.mp3,.wav,.webm,.m4a,.ogg,.mpeg"
        hidden
        onChange={(e) => void onUploadFile(e)}
      />

      {recordingRow && (
        <section className="people-table" style={{ marginBottom: 16 }}>
          <div className="dir-toolbar">
            <div>
              <h3>
                Recording <span className="pill ring">live</span>
              </h3>
              <p className="muted">Speak the message for {recordingRow.name}, then stop to save it.</p>
            </div>
            <button className="btn danger btn-tiny" type="button" onClick={stopRec}>
              Stop recording
            </button>
          </div>
        </section>
      )}

      {tab === "scripts" ? (
        <section className="people-table">
          {scripts.length === 0 ? (
            <div className="people-empty">
              No scripts yet. Create one, generate or record audio, then use it on{" "}
              <Link href="/app/clients" className="link-btn">
                Client list
              </Link>
              .
            </div>
          ) : (
            <>
              <div className="voice-head">
                <span>Script</span>
                <span>Audio</span>
                <span>Keypad</span>
                <span className="align-right">Actions</span>
              </div>
              {scripts.map((row) => {
                const rowKeys = parseKeys(row.keysJson);
                const audioUrl = blobs[row.id];
                const audio = audioLabel(row);
                const recordingThis = recordingId === row.id;
                return (
                  <div key={row.id} className={`voice-row${recordingThis ? " current" : ""}`}>
                    <div className="user-id">
                      <b>{row.name}</b>
                      <span className="muted">{clip(row.script)}</span>
                    </div>
                    <span className={`pill ${audio.pill}`}>{audio.label}</span>
                    <div className="key-pills">
                      {rowKeys.length ? (
                        rowKeys.map((k) => (
                          <span key={`${row.id}-${k.digit}`} className="hunt-chip" title={k.disposition}>
                            {k.digit}
                            <em>{k.label}</em>
                          </span>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                    <div className="align-right">
                      <div className="row-actions">
                        {recordingThis ? (
                          <button className="btn danger btn-tiny" type="button" onClick={stopRec}>
                            Stop
                          </button>
                        ) : (
                          <>
                            {row.audioPath ? (
                              audioUrl ? (
                                <audio key={audioUrl} src={audioUrl} controls autoPlay />
                              ) : (
                                <button
                                  className="btn ghost btn-tiny"
                                  type="button"
                                  disabled={loadingPlay === row.id}
                                  onClick={() => void loadAudio(row)}
                                >
                                  {loadingPlay === row.id ? "Loading…" : "Play"}
                                </button>
                              )
                            ) : null}
                            {canEdit ? (
                              <>
                                <button
                                  className="btn ghost btn-tiny"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void generate(row)}
                                >
                                  Generate
                                </button>
                                <button
                                  className="btn ghost btn-tiny"
                                  type="button"
                                  onClick={() => void startRec(row)}
                                >
                                  Record
                                </button>
                                <button
                                  className="btn ghost btn-tiny"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => pickUpload(row)}
                                >
                                  Upload
                                </button>
                              </>
                            ) : null}
                          </>
                        )}
                        {canEdit ? (
                          <div className="menu-wrap">
                            <button
                              className="kebab"
                              type="button"
                              aria-label={`More actions for ${row.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuId((id) => (id === row.id ? null : row.id));
                              }}
                            >
                              <span />
                              <span />
                              <span />
                            </button>
                            {menuId === row.id && (
                              <div className="menu" onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={() => openEdit(row)}>
                                  Edit
                                </button>
                                <button type="button" onClick={() => pickUpload(row)}>
                                  Upload recorded voice
                                </button>
                                <button type="button" className="warn" onClick={() => void remove(row)}>
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </section>
      ) : (
        <section className="people-table">
          <div className="voice-rec-head">
            <span>When</span>
            <span>Contact</span>
            <span>Script</span>
            <span>Key</span>
            <span>Response</span>
            <span>Status</span>
          </div>
          {records.length === 0 ? (
            <div className="people-empty">
              No voice call records yet. Start a campaign on{" "}
              <Link href="/app/clients" className="link-btn">
                Client list
              </Link>{" "}
              with a script selected.
            </div>
          ) : (
            records.map((row) => (
              <div key={row.id} className="voice-rec-row">
                <span className="muted">{new Date(row.createdAt).toLocaleString()}</span>
                <div className="user-id">
                  <b>{row.contactName || "—"}</b>
                  <span className="muted">{row.phone}</span>
                </div>
                <span>{row.script?.name || "—"}</span>
                <span className="ext-read">{row.dtmf || "—"}</span>
                <span>{row.disposition || "—"}</span>
                <span className={`pill ${row.status === "answered" ? "live" : row.status === "missed" ? "dead" : "idle"}`}>
                  {row.status}
                </span>
              </div>
            ))
          )}
        </section>
      )}

      {open && (
        <div className="modal-back" onClick={closeModal}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-labelledby="voice-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="voice-modal-title">{editing ? "Edit voice script" : "New voice script"}</h2>
                <p className="muted">Personalize the spoken line, then map keypad digits to outcomes.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Close" onClick={closeModal}>
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div className="modal-body">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={name}
                    placeholder="Collection reminder"
                    required
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>

                <div className="script-block">
                  <div className="script-block-head">
                    <span>Spoken script</span>
                    <div className="var-chips">
                      {SCRIPT_VARS.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          className="var-chip"
                          title={`Insert {{${v.key}}}`}
                          onClick={() => insertVar(v.key)}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={scriptRef}
                    rows={5}
                    value={script}
                    required
                    onChange={(e) => setScript(e.target.value)}
                  />
                  {preview ? (
                    <p className="script-preview">
                      <span>Preview</span>
                      {preview}
                    </p>
                  ) : null}
                </div>

                <div className="form-card">
                  <div className="form-card-head">
                    <div>
                      <h3>Response keys</h3>
                      <p className="muted">Saved when the customer presses a digit, or when an agent taps the overlay.</p>
                    </div>
                    <button className="btn ghost btn-tiny" type="button" onClick={addKey}>
                      Add key
                    </button>
                  </div>
                  <div className="keys-editor">
                    <div className="keys-head">
                      <span>Digit</span>
                      <span>Label</span>
                      <span>Save as</span>
                      <span />
                    </div>
                    {keys.map((k, i) => (
                      <div key={i} className="keys-row">
                        <input
                          className="keys-digit"
                          value={k.digit}
                          maxLength={1}
                          inputMode="numeric"
                          aria-label={`Digit ${i + 1}`}
                          onChange={(e) => updateKey(i, { digit: e.target.value.replace(/[^\d*#]/g, "").slice(0, 1) })}
                        />
                        <input
                          value={k.label}
                          placeholder="Interested"
                          aria-label={`Label ${i + 1}`}
                          onChange={(e) => {
                            const label = e.target.value;
                            const patch: Partial<Key> = { label };
                            if (!k.disposition || k.disposition === slugify(k.label)) {
                              patch.disposition = slugify(label);
                            }
                            updateKey(i, patch);
                          }}
                        />
                        <input
                          value={k.disposition}
                          placeholder="interested"
                          aria-label={`Save as ${i + 1}`}
                          onChange={(e) => updateKey(i, { disposition: e.target.value.replace(/\s+/g, "_").toLowerCase() })}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove key ${k.digit || i + 1}`}
                          disabled={keys.length <= 1}
                          onClick={() => removeKey(i)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {error ? <p className="error">{error}</p> : null}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save script" : "Create script"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
