"use client";

import type { Fixture, HomeDocument, MoveFixtureInput, UpdateRoomInput } from "@portego/home-model";
import { Bot, Lightbulb, Magnet, Plus } from "lucide-react";
import dynamic from "next/dynamic";

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
  onSelectFixture: (fixture?: Fixture) => void;
  onUpdateRoom: (input: UpdateRoomInput) => void;
  onMoveFixture: (input: MoveFixtureInput) => void;
  onToggleFixture: (fixture: Fixture) => void;
  onBuildDemo: () => void;
};

export function HomeCanvas({
  home,
  selectedFixtureId,
  onSelectFixture,
  onUpdateRoom,
  onMoveFixture,
  onToggleFixture,
  onBuildDemo,
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
        <div className="canvas-tools-hint">
          <Magnet aria-hidden="true" size={14} />
          <span>Drag · snap 20 · resize rooms</span>
        </div>
      </div>

      <div className="canvas-stage">
        <KonvaHomeCanvas
          home={home}
          selectedFixtureId={selectedFixtureId}
          onSelectFixture={onSelectFixture}
          onUpdateRoom={onUpdateRoom}
          onMoveFixture={onMoveFixture}
          onToggleFixture={onToggleFixture}
        />

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
