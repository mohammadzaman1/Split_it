"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StepShell } from "@/components/StepShell";
import { Button } from "@/components/Button";
import { useBill } from "@/lib/bill-store";
import { downscaleImage } from "@/lib/image";
import {
  blankReceipt,
  extractReceipt,
  type ExtractionFailure,
} from "@/lib/extract-client";

type Phase =
  | { status: "idle" }
  | { status: "ready" }
  | { status: "scanning" }
  | { status: "failed"; error: ExtractionFailure };

export default function UploadPage() {
  const router = useRouter();
  const { update } = useBill();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The image lives here and nowhere else: a ref for the bytes we POST, and a
   * blob URL for the preview. Neither touches the bill store.
   */
  const fileRef = useRef<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ status: "idle" });

  // Blob URLs leak until revoked.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhase({
        status: "failed",
        error: {
          code: "bad_image",
          message: "That doesn't look like an image. Try a JPG, PNG, or HEIC photo.",
        },
      });
      return;
    }
    fileRef.current = file;
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setPhase({ status: "ready" });
  }

  async function scan() {
    const file = fileRef.current;
    if (!file) return;

    setPhase({ status: "scanning" });
    const upload = await downscaleImage(file);
    const result = await extractReceipt(upload);

    if (!result.ok) {
      setPhase({ status: "failed", error: result.error });
      return;
    }

    // Only the extracted JSON goes into the store; the photo is dropped here.
    update({ receipt: result.receipt });
    fileRef.current = null;
    router.push("/summary");
  }

  function enterManually() {
    update({ receipt: blankReceipt() });
    fileRef.current = null;
    router.push("/summary");
  }

  const scanning = phase.status === "scanning";

  return (
    <StepShell
      step="upload"
      title={scanning ? "Reading your receipt…" : "Snap the receipt"}
      subtitle={
        scanning
          ? "This usually takes a few seconds."
          : "Take a photo or pick one from your library. We'll pull out the line items."
      }
      footer={
        <>
          <Button
            variant="secondary"
            className="flex-1"
            type="button"
            onClick={enterManually}
            disabled={scanning}
          >
            Enter manually
          </Button>
          <Button
            className="flex-[2]"
            type="button"
            onClick={scan}
            disabled={scanning || !previewUrl}
          >
            {scanning ? "Scanning…" : "Scan receipt"}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {previewUrl ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {/* Blob URL of a local file — next/image would only add indirection. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="h-auto max-h-[52dvh] w-full object-contain"
            />
            {scanning ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-sm">
                <Spinner />
                <span className="text-sm font-medium text-slate-700">
                  Reading your receipt…
                </span>
              </div>
            ) : null}
          </div>
          {!scanning ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              Choose a different photo
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/40"
        >
          <span className="text-3xl" aria-hidden>
            🧾
          </span>
          <span className="text-sm font-medium text-slate-700">
            Tap to add a receipt photo
          </span>
          <span className="text-xs text-slate-400">JPG, PNG, or HEIC</span>
        </button>
      )}

      {phase.status === "failed" ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="text-sm text-red-800">{phase.error.message}</p>
          <div className="mt-3 flex gap-3">
            {previewUrl ? (
              <button
                type="button"
                onClick={scan}
                className="text-sm font-medium text-red-800 underline underline-offset-2"
              >
                Try again
              </button>
            ) : null}
            <button
              type="button"
              onClick={enterManually}
              className="text-sm font-medium text-red-800 underline underline-offset-2"
            >
              Enter it manually
            </button>
          </div>
        </div>
      ) : null}
    </StepShell>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600"
    />
  );
}
