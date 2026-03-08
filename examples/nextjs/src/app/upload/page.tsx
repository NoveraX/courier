"use client";

import { useRef, useState } from "react";
import { DemoCard } from "@/components/demo-card";
import { ResponseViewer } from "@/components/response-viewer";
import { RunButton } from "@/components/run-button";
import { request } from "@/lib/request";

const simpleCode = `import { request } from "@/lib/request";

const formData = new FormData();
formData.append("file", file);
formData.append("description", "My upload");

// FormData is auto-detected — nexus sends multipart/form-data
const result = await request("mockApi")("files:upload", formData);`;

const progressCode = `import { request } from "@/lib/request";

const formData = new FormData();
formData.append("file", file);

// onUploadProgress tracks real upload progress (HTTP/2 compatible)
const result = await request("mockApi", {
  onUploadProgress: (progress) => {
    setProgress(Math.round(progress.percent * 100));
  },
})("files:upload", formData);`;

const sourceCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass";

class Files extends RequestGroup {
  constructor() {
    super({ prefix: "upload" });
  }

  // FormData auto-detected — no bodyEncoder needed
  // Empty files are automatically removed before sending
  upload: Method<UploadResponse, FormData> = ({ post }) => post();
}`;

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">File Upload</h1>
        <p className="text-muted-foreground mt-1">
          FormData file upload through the proxy. Nexus auto-detects FormData and handles encoding.
        </p>
      </div>

      <SimpleUploadDemo />
      <ProgressUploadDemo />

      <DemoCard
        title="Source Definition"
        description="FormData is automatically detected. No special configuration needed."
        code={sourceCode}
      >
        <p className="text-sm text-muted-foreground">
          When variables is FormData, nexus skips JSON encoding and sends it as
          multipart/form-data. Empty files are automatically removed before sending.
        </p>
      </DemoCard>
    </div>
  );
}

function useFilePicker() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };

  const dropZoneProps = {
    className: `border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
      dragOver
        ? "border-primary bg-primary/5"
        : "border-muted-foreground/25 hover:border-muted-foreground/50"
    }`,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: handleDrop,
    onClick: () => inputRef.current?.click(),
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) setFile(f);
      }}
    />
  );

  return { file, setFile, dropZoneProps, fileInput, formatSize };
}

function SimpleUploadDemo() {
  const { file, dropZoneProps, fileInput, formatSize } = useFilePicker();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", "Uploaded via nexus demo");

      const response = await request("mockApi")("files:upload", formData);
      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="Simple Upload"
      description="Single-request file upload. FormData is auto-detected by nexus."
      code={simpleCode}
    >
      <div {...dropZoneProps}>
        {fileInput}
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(file.size)} &middot; {file.type || "unknown type"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
        )}
      </div>

      {file ? (
        <div className="mt-4">
          <RunButton loading={loading} label="Upload" onClick={handleUpload} />
        </div>
      ) : null}

      {error ? <ResponseViewer error={error} /> : null}
      {result ? <ResponseViewer data={result} status={200} /> : null}
    </DemoCard>
  );
}

function ProgressUploadDemo() {
  const { file, dropZoneProps, fileInput, formatSize } = useFilePicker();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", "Uploaded via nexus demo");

      const response = await request("mockApi", {
        onUploadProgress: (p) => {
          const pct = Math.round(p.percent * 100);
          setProgress(pct);
          // Direct DOM updates bypass React batching for real-time feedback
          if (barRef.current) barRef.current.style.width = `${pct}%`;
          if (labelRef.current) labelRef.current.textContent = `${pct}%`;
        },
      })("files:upload", formData);

      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="Upload with Progress"
      description="onUploadProgress tracks real upload progress. HTTP/2 compatible — uses ReadableStream internally instead of XHR."
      code={progressCode}
    >
      <div {...dropZoneProps}>
        {fileInput}
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(file.size)} &middot; {file.type || "unknown type"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
        )}
      </div>

      {file ? (
        <div className="space-y-3 mt-4">
          {loading || progress > 0 ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{loading ? "Uploading..." : "Complete"}</span>
                <span ref={labelRef}>{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  ref={barRef}
                  className="h-full bg-primary rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}
          <RunButton loading={loading} label="Upload with Progress" onClick={handleUpload} />
          <p className="text-xs text-muted-foreground">
            Tip: On localhost uploads are nearly instant. Use DevTools Network throttling (e.g. &quot;Slow 3G&quot;) to see gradual progress.
          </p>
        </div>
      ) : null}

      {error ? <ResponseViewer error={error} /> : null}
      {result ? <ResponseViewer data={result} status={200} /> : null}
    </DemoCard>
  );
}
