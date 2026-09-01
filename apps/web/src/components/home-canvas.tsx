"use client";

import type {
  Device,
  HomeDocument,
  MoveDeviceInput,
  Room,
  UpdateRoomInput,
} from "@portego/home-model";
import { Bot, ChevronRight, House, Lightbulb, Plus, Redo2, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

const CHATGPT_HOME_SETUP_PROMPT =
  'I need to set up my house for smart devices. Open https://tryportego.com and create a standard 180 m² house split across two floors. The 90 m² ground floor should contain a kitchen, living room, two bedrooms, a bathroom, and a common-space room connecting all the other rooms. Add one light to every ground-floor room except the common space. In the living room, add a second light named "TV lamp" and place it close to the right wall. Add a 90 m² attic floor with three rooms and only one light across the entire attic. Remember to add appropriate doors and windows on both floors.';

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
  busy,
}: HomeCanvasProps) {
  const [promptCopied, setPromptCopied] = useState(false);

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
          aria-label="Edit history"
        >
          <button type="button" onClick={onUndo} disabled={!canUndo || busy} aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo || busy} aria-label="Redo">
            <Redo2 size={14} />
          </button>
        </div>
        <KonvaHomeCanvas
          home={home}
          selectedDeviceId={selectedDeviceId}
          selectedRoomId={selectedRoomId}
          onSelectDevice={onSelectDevice}
          onSelectRoom={onSelectRoom}
          onSelectFloor={onSelectFloor}
          onUpdateRoom={onUpdateRoom}
          onMoveDevice={onMoveDevice}
          onToggleDevice={onToggleDevice}
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
    </section>
  );
}
