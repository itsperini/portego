"use client";

import type {
  Device,
  HomeDocument,
  MoveDeviceInput,
  Room,
  UpdateRoomInput,
} from "@portego/home-model";
import {
  Bot,
  ChevronRight,
  X as CloseIcon,
  Download,
  Eraser,
  House,
  Lightbulb,
  LoaderCircle,
  Plus,
  Redo2,
  Share2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

const CHATGPT_HOME_SETUP_PROMPT =
  'I need to set up my house for smart devices. Open https://tryportego.com and create a standard 180 m² house split across two floors. The 90 m² ground floor should contain a kitchen, living room, two bedrooms, a bathroom, and a common-space room connecting all the other rooms. Add one light to every ground-floor room except the common space. In the living room, add a second light named "TV lamp" and place it close to the right wall. Add a 90 m² attic floor with three rooms and only one light across the entire attic. Remember to add appropriate doors and windows on both floors.';
const SHARE_TEXT =
  "Try WebMCP with Portego to generate your home blueprint and add smart devices with AI.";

function XMark({ size = 14 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function ChatGptMark() {
  return (
    <svg
      aria-hidden="true"
      className="chatgpt-mark"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

const KonvaHomeCanvas = dynamic(
  () => import("./konva-home-canvas").then((module) => module.KonvaHomeCanvas),
  {
    ssr: false,
    loading: () => <div className="canvas-loading">Preparing the spatial editor…</div>,
  },
);

type HomeCanvasProps = {
  home: HomeDocument;
  floorName: string;
  selectedDeviceId?: string;
  selectedRoomId?: string;
  onSelectDevice: (device?: Device) => void;
  onSelectRoom: (room?: Room) => void;
  onSelectHome: () => void;
  onSelectFloor: () => void;
  onUpdateRoom: (input: UpdateRoomInput) => void;
  onMoveDevice: (input: MoveDeviceInput) => void;
  onToggleDevice: (device: Device) => void;
  onBuildDemo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  busy: boolean;
};

export function HomeCanvas({
  home,
  floorName,
  selectedDeviceId,
  selectedRoomId,
  onSelectDevice,
  onSelectRoom,
  onSelectHome,
  onSelectFloor,
  onUpdateRoom,
  onMoveDevice,
  onToggleDevice,
  onBuildDemo,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  busy,
}: HomeCanvasProps) {
  const [promptCopied, setPromptCopied] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareBlob, setShareBlob] = useState<Blob>();
  const [shareImageUrl, setShareImageUrl] = useState<string>();
  const [shareError, setShareError] = useState<string>();
  const [exportReady, setExportReady] = useState(false);
  const exporterRef = useRef<(() => Promise<Blob>) | undefined>(undefined);
  const keepHomeButtonRef = useRef<HTMLButtonElement>(null);

  const handleExporterReady = useCallback((exporter?: () => Promise<Blob>) => {
    exporterRef.current = exporter;
    setExportReady(Boolean(exporter));
  }, []);

  useEffect(
    () => () => {
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
    },
    [shareImageUrl],
  );

  useEffect(() => {
    if (!resetOpen) return;

    keepHomeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setResetOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, resetOpen]);

  async function copySetupPrompt() {
    try {
      await navigator.clipboard.writeText(CHATGPT_HOME_SETUP_PROMPT);
    } catch {
      const promptField = document.createElement("textarea");
      promptField.value = CHATGPT_HOME_SETUP_PROMPT;
      promptField.setAttribute("readonly", "");
      promptField.style.position = "fixed";
      promptField.style.opacity = "0";
      document.body.appendChild(promptField);
      promptField.select();
      document.execCommand("copy");
      promptField.remove();
    }
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 2200);
  }

  async function prepareShare() {
    const exporter = exporterRef.current;
    if (!exporter) return;
    setShareOpen(true);
    setShareBusy(true);
    setShareError(undefined);
    try {
      const blob = await exporter();
      setShareBlob(blob);
      setShareImageUrl(URL.createObjectURL(blob));
    } catch (shareFailure) {
      setShareError(
        shareFailure instanceof Error ? shareFailure.message : "The share image could not be made.",
      );
    } finally {
      setShareBusy(false);
    }
  }

  function downloadShareImage() {
    if (!shareBlob || !shareImageUrl) return;
    const link = document.createElement("a");
    link.download = `${home.name}-${floorName}-portego.png`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    link.href = shareImageUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function openXComposer() {
    downloadShareImage();
    const params = new URLSearchParams({ text: SHARE_TEXT, url: "https://tryportego.com" });
    window.open(`https://x.com/intent/tweet?${params.toString()}`, "portego-x-share", "popup");
  }

  async function shareImage() {
    if (!shareBlob) return;
    const file = new File([shareBlob], "portego-home-blueprint.png", { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) {
      openXComposer();
      return;
    }
    try {
      await navigator.share({
        files: [file],
        text: SHARE_TEXT,
        title: `${home.name} · ${floorName}`,
        url: "https://tryportego.com",
      });
    } catch (shareFailure) {
      if (shareFailure instanceof DOMException && shareFailure.name === "AbortError") return;
      setShareError(
        "The system share sheet could not be opened. You can download the image instead.",
      );
    }
  }

  return (
    <section className="canvas-shell" aria-label="Portego home canvas">
      <div className="canvas-stage">
        <nav className="canvas-breadcrumb" aria-label={`Editing ${floorName} in ${home.name}`}>
          <House size={14} aria-hidden="true" />
          <button type="button" onClick={onSelectHome}>
            {home.name}
          </button>
          <ChevronRight size={12} aria-hidden="true" />
          <button type="button" onClick={onSelectFloor}>
            {floorName}
          </button>
        </nav>

        <div
          className="history-controls floating-history-controls"
          role="group"
          aria-label="Canvas actions"
        >
          <button type="button" onClick={onUndo} disabled={!canUndo || busy} aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo || busy} aria-label="Redo">
            <Redo2 size={14} />
          </button>
          <button
            className="share-home-control"
            type="button"
            onClick={() => void prepareShare()}
            disabled={busy || shareBusy || !exportReady || home.rooms.length === 0}
            aria-label="Share blueprint"
            title={home.rooms.length === 0 ? "Add a room before sharing" : "Share blueprint"}
          >
            <Share2 size={14} />
          </button>
          <button
            className="reset-home-control"
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={busy}
            aria-label="Reset home structure"
            title="Reset home structure"
          >
            <Eraser size={14} />
          </button>
        </div>
        <KonvaHomeCanvas
          home={home}
          floorName={floorName}
          selectedDeviceId={selectedDeviceId}
          selectedRoomId={selectedRoomId}
          onSelectDevice={onSelectDevice}
          onSelectRoom={onSelectRoom}
          onUpdateRoom={onUpdateRoom}
          onMoveDevice={onMoveDevice}
          onToggleDevice={onToggleDevice}
          onExporterReady={handleExporterReady}
        />

        {home.rooms.length === 0 ? (
          <div className="canvas-empty">
            <div className="empty-symbol" aria-hidden="true">
              <Lightbulb size={25} strokeWidth={1.7} />
            </div>
            <span className="eyebrow">Blank home model</span>
            <h2>Start with one room.</h2>
            <p>Describe it to Codex, or load a complete four-room smart-home example.</p>
            <div className="canvas-empty-actions">
              <button className="primary-action" type="button" onClick={onBuildDemo}>
                <Plus size={16} />
                Build the demo home
              </button>
              <button
                className="copy-prompt-action"
                type="button"
                onClick={() => void copySetupPrompt()}
                aria-label={
                  promptCopied ? "Portego setup prompt copied" : "Copy Portego setup prompt"
                }
              >
                <ChatGptMark />
                <span aria-live="polite">{promptCopied ? "Prompt copied" : "Copy Prompt"}</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="canvas-accessible-actions">
          <span>Select an item on the spatial editor:</span>
          {home.devices.map((device) => (
            <button type="button" key={device.id} onClick={() => onSelectDevice(device)}>
              <Bot size={14} aria-hidden="true" />
              {device.label}
            </button>
          ))}
        </div>

        <div className="canvas-scale" aria-hidden="true">
          <span>0</span>
          <i />
          <span>5 m</span>
        </div>
      </div>

      {resetOpen ? (
        <div className="portal-overlay" role="presentation">
          <section
            className="portal-card reset-home-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-home-title"
            aria-describedby="reset-home-description"
          >
            <div className="reset-home-dialog-icon" aria-hidden="true">
              <TriangleAlert size={19} />
            </div>
            <span className="portal-kicker">Canvas reset</span>
            <h1 id="reset-home-title">Reset the home structure?</h1>
            <p id="reset-home-description">
              This removes every room, device, door, window, and physical binding from the canvas.
              Your account and paired gateway stay connected.
            </p>
            <div className="reset-home-dialog-actions">
              <button
                ref={keepHomeButtonRef}
                className="portal-secondary"
                type="button"
                onClick={() => setResetOpen(false)}
                disabled={busy}
              >
                Keep home
              </button>
              <button
                className="portal-danger-button"
                type="button"
                onClick={() => {
                  onReset();
                  setResetOpen(false);
                }}
                disabled={busy}
              >
                <Eraser size={15} />
                Reset home
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {shareOpen ? (
        <div className="portal-overlay" role="presentation">
          <section
            className="portal-card share-home-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-home-title"
          >
            <button
              className="portal-close"
              type="button"
              onClick={() => setShareOpen(false)}
              aria-label="Close share preview"
            >
              <CloseIcon size={17} />
            </button>
            <span className="portal-kicker">Share blueprint</span>
            <div className="share-home-copy">
              <h1 id="share-home-title">Show what you built with WebMCP.</h1>
              <p>{SHARE_TEXT}</p>
            </div>

            <div className="share-home-preview" aria-live="polite">
              {shareBusy ? (
                <div className="share-home-loading">
                  <LoaderCircle className="is-spinning" size={20} />
                  <span>Drawing your blueprint…</span>
                </div>
              ) : shareImageUrl ? (
                // biome-ignore lint/performance/noImgElement: the preview is a temporary local Blob URL
                <img src={shareImageUrl} alt={`Share preview of ${home.name}, ${floorName}`} />
              ) : null}
            </div>

            {shareError ? <p className="portal-error">{shareError}</p> : null}
            <div className="share-home-actions">
              <button
                className="portal-primary"
                type="button"
                onClick={() => void shareImage()}
                disabled={!shareBlob || shareBusy}
              >
                <Share2 size={15} />
                Share image
              </button>
              <button
                className="portal-secondary"
                type="button"
                onClick={downloadShareImage}
                disabled={!shareBlob || shareBusy}
              >
                <Download size={15} />
                Download PNG
              </button>
              <button
                className="share-x-fallback"
                type="button"
                onClick={openXComposer}
                disabled={!shareBlob || shareBusy}
              >
                <XMark />
                Open X composer
              </button>
            </div>
            <p className="share-home-note">
              On desktop, Portego downloads the image for you to attach in the X composer. Nothing
              is uploaded or stored by Portego.
            </p>
          </section>
        </div>
      ) : null}
    </section>
  );
}
