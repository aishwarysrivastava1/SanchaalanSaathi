"use client";

import React, { useState } from "react";
import { ingestDocument, ingestText } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { UploadCloud, Type } from "lucide-react";

export default function FileUpload({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"file" | "text">("text");
  const MAX_REPORT_LENGTH = 2000;
  const { toast } = useToast();

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
    if (!text) return;
    setLoading(true);
    try {
      await ingestText(text);
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg w-full">
      <div className="flex gap-2 mb-3 bg-slate-950 p-1 rounded-lg w-max">
        <button
          onClick={() => setMode("text")}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors ${mode === 'text' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <Type size={12} />
          Text Report
        </button>
        <button
          onClick={() => setMode("file")}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors ${mode === 'file' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <UploadCloud size={12} />
          Photo/PDF
        </button>
      </div>

      {mode === "text" ? (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <textarea 
              className={`w-full bg-slate-800 border bg-transparent border-slate-700 rounded-lg p-3 text-sm text-slate-200 outline-none transition-all focus:border-cyan-500 h-24 resize-none ${text.length > MAX_REPORT_LENGTH ? 'border-neon-red focus:border-neon-red' : ''}`}
              placeholder="Describe the emergency, location, and needed resources..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className={`absolute bottom-2 right-3 text-[10px] font-mono ${text.length > MAX_REPORT_LENGTH ? 'text-neon-red' : 'text-slate-500'}`}>
              {text.length}/{MAX_REPORT_LENGTH}
            </div>
          </div>
          <button 
            disabled={loading || !text.trim() || text.length > MAX_REPORT_LENGTH}
            onClick={submitText}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold py-2.5 rounded-lg transition-all shadow-lg active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Infiltrating Grid...
              </span>
            ) : "Submit Tactical Intelligence"}
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center hover:border-cyan-500 transition-colors cursor-pointer relative h-28 flex flex-col justify-center items-center">
          <input 
            type="file" 
            className="absolute inset-0 opacity-0 cursor-pointer" 
            onChange={handleFileChange}
            disabled={loading}
          />
          <div className="text-slate-400 flex flex-col items-center gap-2">
            {loading ? (
              <span className="animate-pulse text-sm">Analyzing...</span>
            ) : (
              <>
                <UploadCloud size={28} className="text-slate-500" />
                <span className="text-xs">Drag & Drop or Click to Upload</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
