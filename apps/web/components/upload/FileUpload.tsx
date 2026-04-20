"use client";

import React, { useState } from "react";
import { ingestDocument, ingestText } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useGeolocation } from "../../hooks/useGeolocation";
import { UploadCloud, Type } from "lucide-react";

export default function FileUpload({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"file" | "text">("text");
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const MAX_REPORT_LENGTH = 2000;
  const { toast } = useToast();
  const { requestLocation } = useGeolocation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setLoading(true);
    try {
      await ingestDocument(e.target.files[0]);
      toast("Document ingested and graph updated.", "success");
      onUploadSuccess();
    } catch (err) {
      toast("Upload failed. Check your Gemini API key.", "error");
    } finally {
      setLoading(false);
    }
  };

  const submitText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setLocationNote(null);

    const coords = await requestLocation();
    if (!coords) {
      setLocationNote("Location access denied — submitting without GPS coordinates");
      setTimeout(() => setLocationNote(null), 5000);
    }

    try {
      await ingestText(text, coords ?? undefined);
      setText("");
      toast("Report ingested and graph updated.", "success");
      onUploadSuccess();
    } catch (err) {
      toast("Submission failed. Check your Gemini API key.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm w-full glass-card hover:shadow-md transition-shadow">
      <div className="flex gap-1 mb-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-max">
        <button
          onClick={() => setMode("text")}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${
            mode === "text" ? "bg-[#115E54] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Type size={12} />
          Text Report
        </button>
        <button
          onClick={() => setMode("file")}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${
            mode === "file" ? "bg-[#115E54] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <UploadCloud size={12} />
          Photo/PDF
        </button>
      </div>

      {mode === "text" ? (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <textarea
              className={`w-full bg-gray-50 dark:bg-gray-800/50 border rounded-lg p-3 text-sm text-gray-800 dark:text-gray-200 outline-none transition-all focus:border-[#115E54]/40 h-24 resize-none placeholder-gray-400 dark:placeholder-gray-600 ${
                text.length > MAX_REPORT_LENGTH ? "border-red-400 focus:border-red-400" : "border-gray-200 dark:border-gray-800"
              }`}
              placeholder="Describe the emergency, location, and needed resources..."
              value={text}
              onChange={(e) => { setText(e.target.value); setLocationNote(null); }}
            />
            <div className={`absolute bottom-2 right-3 text-[10px] ${text.length > MAX_REPORT_LENGTH ? "text-red-500" : "text-gray-400"}`}>
              {text.length}/{MAX_REPORT_LENGTH}
            </div>
          </div>
          <button
            disabled={loading || !text.trim() || text.length > MAX_REPORT_LENGTH}
            onClick={submitText}
            className="bg-[#115E54] hover:bg-[#0d4a42] disabled:bg-gray-100 disabled:text-gray-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              "Submit Report"
            )}
          </button>
          {locationNote && (
            <p className="text-[10px] text-amber-600 text-center mt-0.5">{locationNote}</p>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center hover:border-[#115E54]/40 dark:hover:border-[#115E54]/60 transition-all cursor-pointer relative h-28 flex flex-col justify-center items-center hover:bg-gray-50 dark:hover:bg-gray-800/20 group">
          <input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={handleFileChange}
            disabled={loading}
          />
          <div className="text-gray-400 flex flex-col items-center gap-2">
            {loading ? (
              <span className="animate-pulse text-sm text-gray-500">Analyzing...</span>
            ) : (
              <>
                <UploadCloud size={26} className="text-gray-300" />
                <span className="text-xs text-gray-500">Drag & Drop or Click to Upload</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
