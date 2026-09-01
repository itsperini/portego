"use client";

import {
  endpointForFixture,
  type Fixture,
  type HomeDocument,
  roomForFixture,
} from "@portego/home-model";
import { Bot, Lightbulb, Plus } from "lucide-react";

type HomeCanvasProps = {
  home: HomeDocument;
  selectedFixtureId?: string;
  onSelectFixture: (fixture: Fixture) => void;
  onToggleFixture: (fixture: Fixture) => void;
  onBuildDemo: () => void;
};

export function HomeCanvas({
  home,
  selectedFixtureId,
  onSelectFixture,
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
          <Bot aria-hidden="true" size={15} />
          <span>Agent-editable surface</span>
        </div>
      </div>

      <div className="canvas-stage">
        <svg
          className="home-canvas"
          viewBox="0 0 1000 650"
          role="img"
          aria-label={
            home.rooms.length === 0
              ? "An empty Portego home canvas"
              : `Top-down home with ${home.rooms.length} rooms`
          }
        >
          <defs>
            <pattern id="draft-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" className="grid-line grid-line-small" />
            </pattern>
            <pattern id="draft-grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#draft-grid-small)" />
              <path d="M 100 0 L 0 0 0 100" className="grid-line grid-line-large" />
            </pattern>
            <filter id="fixture-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="9" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width="1000" height="650" className="canvas-paper" />
          <rect width="1000" height="650" fill="url(#draft-grid-large)" />

          {home.rooms.map((room) => (
            <g key={room.id} className="room-group">
              <rect
                x={room.x}
                y={room.y}
                width={room.width}
                height={room.height}
                className="room-fill"
              />
              <path
                d={
                  "M " +
                  room.x +
                  " " +
                  (room.y + room.height) +
                  " L " +
                  room.x +
                  " " +
                  room.y +
                  " L " +
                  (room.x + room.width) +
                  " " +
                  room.y +
                  " L " +
                  (room.x + room.width) +
                  " " +
                  (room.y + room.height)
                }
                className="room-wall"
              />
              <line
                x1={room.x}
                y1={room.y + room.height}
                x2={room.x + room.width}
                y2={room.y + room.height}
                className="room-wall room-wall-soft"
              />
              <text x={room.x + 20} y={room.y + 34} className="room-label">
                {room.label}
              </text>
              <text x={room.x + 20} y={room.y + 56} className="room-meta">
                {Math.round(room.width / 40)} × {Math.round(room.height / 40)} approx.
              </text>
            </g>
          ))}

          {home.fixtures.map((fixture) => {
            const endpoint = endpointForFixture(home, fixture.id);
            const isOn = endpoint?.reportedState.on === true;
            const selected = selectedFixtureId === fixture.id;
            const room = roomForFixture(home, fixture);
            return (
              <g
                key={fixture.id}
                className={
                  "fixture-group " +
                  (isOn ? "fixture-on " : "") +
                  (selected ? "fixture-selected" : "")
                }
                transform={`translate(${fixture.position.x} ${fixture.position.y})`}
                role="button"
                tabIndex={0}
                aria-label={
                  fixture.label +
                  ", " +
                  (endpoint ? (isOn ? "on" : "off") : "not bound") +
                  (room ? `, in ${room.label}` : "")
                }
                onClick={() => onSelectFixture(fixture)}
                onDoubleClick={() => onToggleFixture(fixture)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectFixture(fixture);
                  }
                }}
              >
                {isOn ? (
                  <circle r="44" className="fixture-aura" filter="url(#fixture-glow)" />
                ) : null}
                <circle r="25" className="fixture-hit-area" />
                <circle r="14" className="fixture-orb" />
                <path d="M -6 1 A 7 7 0 1 1 6 1 L 4 8 L -4 8 Z" className="fixture-bulb" />
                <line x1="-4" y1="11" x2="4" y2="11" className="fixture-detail" />
                <line x1="0" y1="-22" x2="0" y2="-29" className="fixture-ray" />
                <line x1="20" y1="-12" x2="26" y2="-16" className="fixture-ray" />
                <line x1="-20" y1="-12" x2="-26" y2="-16" className="fixture-ray" />
                <text x="0" y="43" textAnchor="middle" className="fixture-label">
                  {fixture.label}
                </text>
                <circle
                  cx="17"
                  cy="-17"
                  r="5"
                  className={endpoint ? "binding-dot" : "binding-dot unbound"}
                />
              </g>
            );
          })}
        </svg>

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

        <div className="canvas-scale" aria-hidden="true">
          <span>0</span>
          <i />
          <span>5 m</span>
        </div>
      </div>
    </section>
  );
}
