"use client";

import type {
  Fixture,
  HomeDocument,
  MoveFixtureInput,
  Room,
  UpdateRoomInput,
} from "@portego/home-model";
import { Bot, Lightbulb, Magnet, Plus, Redo2, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const KonvaHomeCanvas = dynamic(
  () => import("./konva-home-canvas").then((module) => module.KonvaHomeCanvas),
  {
    ssr: false,
    loading: () => <div className="canvas-loading">Preparing the spatial editor…</div>,
  },
);

type HomeCanvasProps = {
  home: HomeDocument;
  selectedFixtureId?: string;
  selectedRoomId?: string;
  onSelectFixture: (fixture?: Fixture) => void;
  onSelectRoom: (room?: Room) => void;
  onUpdateRoom: (input: UpdateRoomInput) => void;
  onMoveFixture: (input: MoveFixtureInput) => void;
  onToggleFixture: (fixture: Fixture) => void;
  onBuildDemo: () => void;
  floatingCard?: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  busy: boolean;
};

export function HomeCanvas({
  home,
  selectedFixtureId,
  selectedRoomId,
  onSelectFixture,
  onSelectRoom,
  onUpdateRoom,
  onMoveFixture,
  onToggleFixture,
  onBuildDemo,
  floatingCard,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  busy,
}: HomeCanvasProps) {
  return (
    <section className="canvas-shell" aria-label="Portego home canvas">
      <div className="canvas-toolbar">
        <div className="canvas-title">
          <span className="floor-index">F.01</span>
          <div>
            <strong>Ground floor</strong>
            <span>Spatial model · revision {home.revision}</span>
          </div>
        </div>
        <div className="canvas-toolbar-actions">
          <div className="history-controls" role="group" aria-label="Edit history">
            <button type="button" onClick={onUndo} disabled={!canUndo || busy} aria-label="Undo">
              <Undo2 size={14} />
            </button>
            <button type="button" onClick={onRedo} disabled={!canRedo || busy} aria-label="Redo">
              <Redo2 size={14} />
            </button>
          </div>
          <div className="canvas-tools-hint">
            <Magnet aria-hidden="true" size={14} />
            <span>Drag · snap 20 · resize rooms</span>
          </div>
        </div>
      </div>

      <div className="canvas-stage">
        <KonvaHomeCanvas
          home={home}
          selectedFixtureId={selectedFixtureId}
          selectedRoomId={selectedRoomId}
          onSelectFixture={onSelectFixture}
          onSelectRoom={onSelectRoom}
          onUpdateRoom={onUpdateRoom}
          onMoveFixture={onMoveFixture}
          onToggleFixture={onToggleFixture}
        />

        {floatingCard}

        {home.rooms.length === 0 ? (
          <div className="canvas-empty">
            <div className="empty-symbol" aria-hidden="true">
              <Lightbulb size={25} strokeWidth={1.7} />
            </div>
            <span className="eyebrow">Blank home model</span>
            <h2>Start with one room.</h2>
            <p>Describe it to Codex, or build the first kitchen and simulated light yourself.</p>
            <button className="primary-action" type="button" onClick={onBuildDemo}>
              <Plus size={16} />
              Build the demo home
            </button>
          </div>
        ) : null}

        <div className="canvas-accessible-actions">
          <span>Select an item on the spatial editor:</span>
          {home.fixtures.map((fixture) => (
            <button type="button" key={fixture.id} onClick={() => onSelectFixture(fixture)}>
              <Bot size={14} aria-hidden="true" />
              {fixture.label}
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
