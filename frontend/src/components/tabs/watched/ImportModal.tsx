import { useState, useRef, useCallback } from "react";
import type { TFunction } from "i18next";
import type { MediaImport } from "../../../types";
import { parseCSV, parseMovieData } from "../../../utils/csv";
import { useToast } from "../../../context/ToastContext";
import { Modal } from "../../Modal";
import { Separator } from "../../ui/separator";
import { Upload } from "lucide-react";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (raw: MediaImport[]) => Promise<boolean>;
  onLoadSample: () => void;
  t: TFunction;
}

export function ImportModal({ open, onClose, onImport, onLoadSample, t }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const [jsonText, setJsonText] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [importing, setImporting] = useState(false);

  const { showToast } = useToast();

  const handleFile = useCallback(
    (file: File) => {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".json") && !name.endsWith(".csv")) {
        showToast && showToast(t("watched_import.upload_json_or_csv"), "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          let movies: MediaImport[];
          if (name.endsWith(".json")) {
            const data = JSON.parse(text);
            movies = parseMovieData(data);
          } else {
            movies = parseCSV(text);
          }
          importMovies(movies);
        } catch (err: any) {
          showToast && showToast(t("watched_import.parse_failed", { message: err.message }), "error");
        }
      };
      reader.onerror = () => showToast && showToast(t("watched_import.read_failed"), "error");
      reader.readAsText(file);
    },
    [showToast, t]
  );

  const importMovies = useCallback(
    async (movies: MediaImport[]) => {
      setImporting(true);
      const ok = await onImport(movies);
      if (ok) {
        setImportSuccess(true);
        await new Promise((r) => setTimeout(r, 1000));
        setImportSuccess(false);
        setImporting(false);
        onClose();
      } else {
        setImporting(false);
      }
    },
    [onImport, onClose]
  );

  const handleManualParse = useCallback(() => {
    if (!jsonText.trim()) {
      showToast && showToast(t("watched_import.paste_json"), "error");
      return;
    }
    try {
      const data = JSON.parse(jsonText);
      const movies = parseMovieData(data);
      importMovies(movies);
    } catch (err: any) {
      showToast && showToast(t("watched_import.json_parse_failed", { message: err.message }), "error");
    }
  }, [jsonText, showToast, t]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFile(files[0]);
    },
    [handleFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
        e.target.value = "";
      }
    },
    [handleFile]
  );

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (!importSuccess && !importing) onClose();
        }}
        title={importSuccess ? undefined : t("watched.import_title")}
      >
        {importSuccess ? (
          <div className="flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-500">{t("watched_import.success")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Upload Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl transition-all ${
                isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30"
              }`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div
                className="py-8 px-4 text-center cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={`text-2xl mb-2 transition-transform ${isDragOver ? "scale-110" : ""}`}><Upload size={28} /></div>
                <p className={`text-sm font-medium ${isDragOver ? "text-primary" : ""}`}>{t("watched.drag_hint")}</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{t("watched.import_json_or_csv")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
                  hidden
                  onChange={handleFileSelect}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  {t("watched.select_file")}
                </button>
                <button
                  className="btn btn-ghost btn-sm ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSampleModal(true);
                  }}
                  title={t("watched.sample_format")}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  {t("watched.sample_format")}
                </button>
              </div>

              {isDragOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 rounded-xl z-10 animate-overlay-fade">
                  <div className="text-4xl"><Upload size={36} /></div>
                  <div className="text-sm font-semibold text-primary">{t("watched.drop_release")}</div>
                  <span className="badge text-[10px]">JSON / CSV</span>
                </div>
              )}
            </div>

            {/* Manual Input */}
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground">{t("watched.or_manual_input")}</span>
              </div>
            </div>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='[\n  {"title": "The Shawshank Redemption", "rating": 9.3, "year": 1994, "genre": "Drama"},\n  {"title": "The Dark Knight", "rating": 9.0, "year": 2008, "genre": "Action / Crime"}\n]'
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground font-mono text-xs leading-relaxed resize-y min-h-[80px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground"
            />
            <button
              className="btn btn-ghost btn-sm w-full"
              onClick={handleManualParse}
              disabled={importing}
            >
              {t("watched.parse_data")}
            </button>
          </div>
        )}
      </Modal>

      {/* Sample Data Modal */}
      <Modal
        open={showSampleModal}
        onClose={() => setShowSampleModal(false)}
        title={t("sample_modal.title")}
        footer={
          <>
            <button className="btn btn-primary" onClick={() => { onLoadSample(); setShowSampleModal(false); }}>
              {t("sample_modal.load_sample")}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowSampleModal(false)}>
              {t("common.close")}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-2">{t("sample_modal.format1_title")}</p>
        <pre className="bg-muted/50 border border-border rounded-lg p-3 overflow-x-auto text-xs mb-4">{`{\n  "meta": { "user": "...", "export_date": "..." },\n  "items": [\n    { "title": "The Shawshank Redemption", "user_rating": 9 }\n  ]\n}`}</pre>
        <p className="text-sm text-muted-foreground mb-2">{t("sample_modal.format2_title")}</p>
        <pre className="bg-muted/50 border border-border rounded-lg p-3 overflow-x-auto text-xs">{`{\n  "movies": [\n    { "title": "Inception", "rating": 8.8, "year": 2010 }\n  ]\n}`}</pre>
      </Modal>
    </>
  );
}
