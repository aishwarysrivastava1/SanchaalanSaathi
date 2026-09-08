"use client";

/**
 * Field report ingestion.
 *
 * Frontend for /api/ingest/{text,document,voice}, which had no UI at all. Each
 * submission runs the report through entity extraction and writes the result
 * into this NGO's knowledge graph.
 */
import React, { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Mic, Send, Sparkles, Upload } from "lucide-react";
import { motion } from "motion/react";

import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Segmented,
} from "../../../components/ui/primitives";

type Mode = "text" | "document" | "voice";

const MAX_BYTES = 5 * 1024 * 1024;

const ACCEPT: Record<Exclude<Mode, "text">, string> = {
  document: "image/*,application/pdf,text/plain",
  voice: "audio/*",
};

interface Extracted {
  need_id: string | null;
  transcript?: string;
  entities: {
    nodes?: { label: string; properties?: Record<string, any> }[];
    edges?: { type: string }[];
  };
}

export default function FieldReportsPage() {
  const { user } = useNGOAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extracted | null>(null);

  const reset = () => {
    setText("");
    setFile(null);
    setError("");
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const pickFile = (chosen: File | null) => {
    setError("");
    if (!chosen) return;
    if (chosen.size > MAX_BYTES) {
      setError(`That file is ${(chosen.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`);
      return;
    }
    setFile(chosen);
  };

  const submit = async () => {
    if (!user?.token) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (mode === "text") {
        setResult((await api.ingestText(user.token, text.trim())) as Extracted);
      } else if (file) {
        setResult((await api.ingestFile(user.token, file, mode)) as Extracted);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && (mode === "text" ? text.trim().length >= 10 : file !== null);

  const need = result?.entities?.nodes?.find((n) => n.label === "Need")?.properties ?? null;
  const skills = (result?.entities?.nodes ?? []).filter((n) => n.label === "Skill");
  const places = (result?.entities?.nodes ?? []).filter((n) => n.label === "Location");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      <PageHeader
        title="Field reports"
        description="Turn a message, photo or voice note from the field into a structured need."
        action={
          <Segmented
            label="Report type"
            value={mode}
            onChange={(next) => {
              setMode(next);
              reset();
            }}
            options={[
              { value: "text", label: "Text" },
              { value: "document", label: "Photo or file" },
              { value: "voice", label: "Voice note" },
            ]}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              mode === "text"
                ? "Describe what is happening"
                : mode === "document"
                  ? "Upload a photo or document"
                  : "Upload a voice note"
            }
            description={
              mode === "text"
                ? "Plain language is fine. Any language is fine."
                : "Up to 5MB. Handwriting and non-English are both supported."
            }
          />

          <div className="space-y-4 p-5">
            {mode === "text" ? (
              <>
                <label htmlFor="report-text" className="sr-only">
                  Field report
                </label>
                <textarea
                  id="report-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  maxLength={20000}
                  placeholder="Flooding on the east approach road. About 200 families cut off, no drinking water since yesterday."
                  className="w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-[#115E54] dark:border-white/15 dark:bg-white/5 dark:text-gray-100 dark:placeholder-white/30"
                />
                <p className="text-xs text-gray-500 dark:text-white/45">
                  {text.trim().length < 10
                    ? "Write at least a sentence so there is something to extract."
                    : `${text.trim().length} characters`}
                </p>
              </>
            ) : (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT[mode]}
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                  id="report-file"
                />
                <label
                  htmlFor="report-file"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-center transition-colors hover:border-[#115E54] dark:border-white/20 dark:hover:border-[#48A15E]"
                >
                  {mode === "voice" ? (
                    <Mic size={26} className="text-gray-400 dark:text-white/40" />
                  ) : (
                    <Upload size={26} className="text-gray-400 dark:text-white/40" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {file ? file.name : "Choose a file"}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-white/45">
                    {file
                      ? `${(file.size / 1024).toFixed(0)} KB`
                      : mode === "voice"
                        ? "Audio up to 5MB"
                        : "Image, PDF or text up to 5MB"}
                  </span>
                </label>
              </>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={!canSubmit} loading={busy}>
                <Send size={14} />
                {busy ? "Extracting…" : "Submit report"}
              </Button>
              {(text || file || result) && (
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="What was extracted"
            description="Saved to your knowledge graph and visible on the map."
          />
          {busy ? (
            <EmptyState
              title="Reading the report"
              description="Extraction usually takes a few seconds."
              icon={<Sparkles size={28} className="animate-pulse" />}
            />
          ) : !result ? (
            <EmptyState
              title="Nothing submitted yet"
              description="Send a report and the structured result will appear here."
              icon={<FileText size={28} />}
            />
          ) : !need ? (
            <EmptyState
              title="No need identified"
              description="The report did not describe an actionable need. Try adding more detail."
              icon={<FileText size={28} />}
            />
          ) : (
            <div className="space-y-4 p-5">
              {result.transcript && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/50">
                    Transcript
                  </p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-white/70">
                    {result.transcript}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{String(need.type ?? "unknown")}</Badge>
                <Badge
                  tone={
                    Number(need.urgency_score ?? 0) >= 0.7
                      ? "danger"
                      : Number(need.urgency_score ?? 0) >= 0.4
                        ? "warning"
                        : "neutral"
                  }
                >
                  urgency {Number(need.urgency_score ?? 0).toFixed(2)}
                </Badge>
                {need.population_affected ? (
                  <Badge>{need.population_affected} affected</Badge>
                ) : null}
              </div>

              {need.description && (
                <p className="text-sm text-gray-700 dark:text-white/70">{need.description}</p>
              )}

              {places.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/50">
                    Location
                  </p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {places
                      .map((p) => p.properties?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              )}

              {skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/50">
                    Skills needed
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {skills.map((s, i) => (
                      <Badge key={`${s.properties?.name}-${i}`}>
                        {String(s.properties?.name ?? "general")}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.need_id && (
                <p className="border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-white/10 dark:text-white/45">
                  Saved as <code className="font-mono">{result.need_id}</code>
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="How this works" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            {
              icon: FileText,
              title: "Text",
              body: "Type or paste a message from the field, in any language.",
            },
            {
              icon: ImageIcon,
              title: "Photo or document",
              body: "Handwritten notes and scanned forms are read directly.",
            },
            {
              icon: Mic,
              title: "Voice note",
              body: "Audio is transcribed, translated, then extracted.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <Icon size={18} className="mt-0.5 shrink-0 text-[#115E54] dark:text-[#48A15E]" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
