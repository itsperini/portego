"use client";

import {
  endpointForFixture,
  type Fixture,
  type HomeDocument,
  type OpeningType,
  type Room,
  type WallSide,
} from "@portego/home-model";
import {
  ChevronRight,
  CircleDot,
  DoorOpen,
  House,
  Layers3,
  Lightbulb,
  Plus,
  Trash2,
  Unlink,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePortegoHome } from "../hooks/use-portego-home";
import { useWebMcp } from "../hooks/use-webmcp";
import { HomeCanvas } from "./home-canvas";

type FixtureCardProps = {
  home: HomeDocument;
  fixture: Fixture;
  busy: boolean;
  onClose: () => void;
  onUpdate: (input: { label?: string; roomId?: string }) => void;
  onRemove: () => void;
  onBind: (endpointId: string) => void;
  onUnbind: () => void;
  onSetState: (state: { on?: boolean; brightness?: number }) => void;
};

function FixtureCard({
  home,
  fixture,
  busy,
  onClose,
  onUpdate,
  onRemove,
  onBind,
  onUnbind,
  onSetState,
}: FixtureCardProps) {
  const endpoint = endpointForFixture(home, fixture.id);
  const [label, setLabel] = useState(fixture.label);
  const [brightness, setBrightness] = useState(endpoint?.reportedState.brightness ?? 72);

  useEffect(() => {
    setLabel(fixture.label);
    setBrightness(endpoint?.reportedState.brightness ?? 72);
  }, [endpoint?.reportedState.brightness, fixture.label]);

  const submitLabel = (event: FormEvent) => {
    event.preventDefault();
    const next = label.trim();
    if (next && next !== fixture.label) onUpdate({ label: next });
  };

  return (
    <aside className="floating-object-card fixture-card" aria-label={`${fixture.label} settings`}>
      <header className="floating-card-header">
        <div>
          <span className="eyebrow">Fixture</span>
          <strong>{fixture.label}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close fixture settings">
          <X size={15} />
        </button>
      </header>

      <div className="fixture-card-status">
        <span
          className={endpoint?.reportedState.on ? "fixture-card-icon is-on" : "fixture-card-icon"}
        >
          <Lightbulb size={20} />
        </span>
        <div>
          <strong>{endpoint?.reportedState.on ? "Light is on" : "Light is off"}</strong>
          <span>
            {endpoint ? `${endpoint.label} · ${endpoint.protocol}` : "Designed fixture · unbound"}
          </span>
        </div>
        <i className={endpoint?.reachable ? "is-reachable" : ""} />
      </div>

      <form className="floating-card-form" onSubmit={submitLabel}>
        <label>
          <span>Name</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
        </label>
        <button type="submit" disabled={busy || !label.trim() || label.trim() === fixture.label}>
          Save name
        </button>
      </form>

      <label className="config-field">
        <span>Room</span>
        <select
          value={fixture.roomId}
          disabled={busy}
          onChange={(event) => onUpdate({ roomId: event.target.value })}
        >
          {home.rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.label}
            </option>
          ))}
        </select>
      </label>

      <label className="config-field">
        <span>Device binding</span>
        <select
          value={endpoint?.id ?? ""}
          disabled={busy}
          onChange={(event) => (event.target.value ? onBind(event.target.value) : onUnbind())}
        >
          <option value="">Unbound</option>
          {home.endpoints.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
              {candidate.reachable ? " · online" : " · offline"}
            </option>
          ))}
        </select>
      </label>

      <div className="fixture-control-row">
        <button
          className={endpoint?.reportedState.on ? "power-button is-on" : "power-button"}
          type="button"
          disabled={!endpoint || busy}
          onClick={() => onSetState({ on: !endpoint?.reportedState.on })}
        >
          <Lightbulb size={16} />
          Turn {endpoint?.reportedState.on ? "off" : "on"}
        </button>
        {endpoint ? (
          <button className="text-action" type="button" disabled={busy} onClick={onUnbind}>
            <Unlink size={14} />
            Unbind
          </button>
        ) : null}
      </div>

      {fixture.capabilities.includes("brightness") ? (
        <div className="brightness-control">
          <div>
            <span>Brightness</span>
            <output>{brightness}%</output>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={brightness}
            disabled={!endpoint || busy}
            onChange={(event) => setBrightness(Number(event.target.value))}
          />
          <button
            type="button"
            disabled={!endpoint || busy || brightness === endpoint.reportedState.brightness}
            onClick={() => onSetState({ brightness })}
          >
            Apply brightness
          </button>
        </div>
      ) : null}

      <footer className="floating-card-footer">
        <span>
          Position {Math.round(fixture.position.x)}, {Math.round(fixture.position.y)}
        </span>
        <button className="danger-action" type="button" disabled={busy} onClick={onRemove}>
          <Trash2 size={14} />
          Remove
        </button>
      </footer>
    </aside>
  );
}

type RoomCardProps = {
  home: HomeDocument;
  room: Room;
  busy: boolean;
  onClose: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
  onAddOpening: (input: {
    label: string;
    type: OpeningType;
    wall: WallSide;
    connectsToRoomId?: string;
  }) => void;
  onRemoveOpening: (openingId: string) => void;
};

function RoomCard({
  home,
  room,
  busy,
  onClose,
  onRename,
  onRemove,
  onAddOpening,
  onRemoveOpening,
}: RoomCardProps) {
  const [label, setLabel] = useState(room.label);
  const [openingType, setOpeningType] = useState<OpeningType>("door");
  const [wall, setWall] = useState<WallSide>("right");
  const [connectedRoomId, setConnectedRoomId] = useState("");
  const openings = home.openings.filter((opening) => opening.roomId === room.id);

  useEffect(() => setLabel(room.label), [room.label]);

  return (
    <aside className="floating-object-card room-card" aria-label={`${room.label} settings`}>
      <header className="floating-card-header">
        <div>
          <span className="eyebrow">Room</span>
          <strong>{room.label}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close room settings">
          <X size={15} />
        </button>
      </header>

      <form
        className="floating-card-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim() && label.trim() !== room.label) onRename(label.trim());
        }}
      >
        <label>
          <span>Name</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
        </label>
        <button type="submit" disabled={busy || !label.trim() || label.trim() === room.label}>
          Save name
        </button>
      </form>

      <div className="room-dimensions">
        <span>{Math.round(room.width / 40)} m wide</span>
        <span>{Math.round(room.height / 40)} m deep</span>
        <span>{home.fixtures.filter((fixture) => fixture.roomId === room.id).length} fixtures</span>
      </div>

      <div className="opening-builder">
        <div className="opening-builder-title">
          <DoorOpen size={15} />
          <strong>Add an opening</strong>
        </div>
        <div className="opening-builder-grid">
          <label>
            <span>Type</span>
            <select
              value={openingType}
              onChange={(event) => setOpeningType(event.target.value as OpeningType)}
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
            </select>
          </label>
          <label>
            <span>Wall</span>
            <select value={wall} onChange={(event) => setWall(event.target.value as WallSide)}>
              <option value="top">Top</option>
              <option value="right">Right</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
            </select>
          </label>
        </div>
        {openingType === "door" ? (
          <label className="config-field">
            <span>Connects to</span>
            <select
              value={connectedRoomId}
              onChange={(event) => setConnectedRoomId(event.target.value)}
            >
              <option value="">Outside / no room</option>
              {home.rooms
                .filter((candidate) => candidate.id !== room.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <button
          className="secondary-action"
          type="button"
          disabled={busy}
          onClick={() =>
            onAddOpening({
              label: `${room.label} ${openingType} ${openings.length + 1}`,
              type: openingType,
              wall,
              ...(openingType === "door" && connectedRoomId
                ? { connectsToRoomId: connectedRoomId }
                : {}),
            })
          }
        >
          <Plus size={14} />
          Add {openingType}
        </button>
      </div>

      {openings.length > 0 ? (
        <div className="opening-list">
          {openings.map((opening) => (
            <div key={opening.id}>
              <span>{opening.label ?? `${opening.wall} ${opening.type}`}</span>
              <button type="button" disabled={busy} onClick={() => onRemoveOpening(opening.id)}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <footer className="floating-card-footer">
        <span>{openings.length} openings</span>
        <button className="danger-action" type="button" disabled={busy} onClick={onRemove}>
          <Trash2 size={14} />
          Remove room
        </button>
      </footer>
    </aside>
  );
}

export function PortegoWorkspace() {
  const {
    home,
    connectionMode,
    error,
    history,
    getHome,
    addRoom,
    addFixture,
    updateRoom,
    removeRoom,
    moveFixture,
    updateFixture,
    removeFixture,
    bindFixture,
    unbindFixture,
    addOpening,
    removeOpening,
    applyChanges,
    undo,
    redo,
    setFixtureState,
    reset,
  } = usePortegoHome();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>();
  const [selectedRoomId, setSelectedRoomId] = useState<string>();
  const [activity, setActivity] = useState("The home is ready for a conversational edit.");
  const [busy, setBusy] = useState(false);

  const webMcpActions = useMemo(
    () => ({
      getHome,
      addRoom,
      updateRoom,
      removeRoom,
      addFixture,
      moveFixture,
      updateFixture,
      removeFixture,
      bindFixture,
      unbindFixture,
      addOpening,
      removeOpening,
      applyChanges,
      undo,
      redo,
      setFixtureState,
      reset,
    }),
    [
      getHome,
      addRoom,
      updateRoom,
      removeRoom,
      addFixture,
      moveFixture,
      updateFixture,
      removeFixture,
      bindFixture,
      unbindFixture,
      addOpening,
      removeOpening,
      applyChanges,
      undo,
      redo,
      setFixtureState,
      reset,
    ],
  );
  const onAgentActivity = useCallback((message: string) => setActivity(message), []);
  const webMcpStatus = useWebMcp(webMcpActions, onAgentActivity);
  const selectedFixture = home.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const selectedRoom = home.rooms.find((room) => room.id === selectedRoomId);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      setActivity(
        actionError instanceof Error ? actionError.message : "The change could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const buildDemo = useCallback(
    () =>
      run(async () => {
        await reset();
        const withRoom = await addRoom({
          label: "Kitchen",
          x: 210,
          y: 132,
          width: 520,
          height: 340,
        });
        const room = withRoom.rooms.at(-1);
        if (!room) return;
        const complete = await addFixture({
          roomId: room.id,
          label: "Kitchen ceiling",
          type: "light",
          autoBind: true,
        });
        setSelectedFixtureId(complete.fixtures.at(-1)?.id);
        setActivity("Kitchen ceiling is bound to Simulator light 01.");
      }),
    [addFixture, addRoom, reset, run],
  );

  const addNextRoom = useCallback(
    () =>
      run(async () => {
        const label = home.rooms.length === 0 ? "Kitchen" : `Room ${home.rooms.length + 1}`;
        await addRoom({ label });
        setActivity(`${label} was added.`);
      }),
    [addRoom, home.rooms.length, run],
  );

  const addLight = useCallback(
    () =>
      run(async () => {
        let current = getHome();
        if (current.rooms.length === 0) current = await addRoom({ label: "Kitchen" });
        const room = current.rooms[0];
        if (!room) return;
        const roomLights = current.fixtures.filter((fixture) => fixture.roomId === room.id).length;
        const label = `${room.label} light ${roomLights + 1}`;
        const next = await addFixture({ roomId: room.id, label, type: "light", autoBind: true });
        setSelectedRoomId(undefined);
        setSelectedFixtureId(next.fixtures.at(-1)?.id);
        setActivity(`${label} was added.`);
      }),
    [addFixture, addRoom, getHome, run],
  );

  const toolStatusCopy = {
    ready: "Site tools ready",
    registering: "Registering tools",
    unavailable: "Open in Codex for tools",
    error: "Tools need attention",
  }[webMcpStatus];

  const floatingCard = selectedFixture ? (
    <FixtureCard
      key={selectedFixture.id}
      home={home}
      fixture={selectedFixture}
      busy={busy}
      onClose={() => setSelectedFixtureId(undefined)}
      onUpdate={(input) =>
        void run(async () => {
          const next = await updateFixture({ fixtureId: selectedFixture.id, ...input });
          const updated = next.fixtures.find((fixture) => fixture.id === selectedFixture.id);
          setActivity(`${updated?.label ?? "Fixture"} was updated.`);
        })
      }
      onRemove={() =>
        void run(async () => {
          await removeFixture({ fixtureId: selectedFixture.id });
          setSelectedFixtureId(undefined);
          setActivity(`${selectedFixture.label} was removed.`);
        })
      }
      onBind={(endpointId) =>
        void run(async () => {
          await bindFixture({ fixtureId: selectedFixture.id, endpointId });
          setActivity(`${selectedFixture.label} was bound.`);
        })
      }
      onUnbind={() =>
        void run(async () => {
          await unbindFixture({ fixtureId: selectedFixture.id });
          setActivity(`${selectedFixture.label} is now unbound.`);
        })
      }
      onSetState={(state) =>
        void run(async () => {
          await setFixtureState({ fixtureId: selectedFixture.id, ...state });
          setActivity(`${selectedFixture.label} confirmed the new state.`);
        })
      }
    />
  ) : selectedRoom ? (
    <RoomCard
      key={selectedRoom.id}
      home={home}
      room={selectedRoom}
      busy={busy}
      onClose={() => setSelectedRoomId(undefined)}
      onRename={(label) =>
        void run(async () => {
          await updateRoom({ roomId: selectedRoom.id, label });
          setActivity(`${selectedRoom.label} was renamed to ${label}.`);
        })
      }
      onRemove={() =>
        void run(async () => {
          await removeRoom({ roomId: selectedRoom.id });
          setSelectedRoomId(undefined);
          setActivity(`${selectedRoom.label} and its fixtures were removed.`);
        })
      }
      onAddOpening={(input) =>
        void run(async () => {
          await addOpening({ roomId: selectedRoom.id, ...input });
          setActivity(`${input.label} was added.`);
        })
      }
      onRemoveOpening={(openingId) =>
        void run(async () => {
          await removeOpening({ openingId });
          setActivity("The opening was removed.");
        })
      }
    />
  ) : undefined;

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Portego home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="brand-name">portego</span>
          <span className="build-tag">walking skeleton</span>
        </a>
        <div className="home-crumb">
          <House size={15} aria-hidden="true" />
          <span>{home.name}</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong>Ground floor</strong>
        </div>
        <div className="topbar-status">
          <span className={`status-chip tools-${webMcpStatus}`}>
            <CircleDot size={13} />
            {toolStatusCopy}
          </span>
          <span className={`status-chip connection-${connectionMode}`}>
            {connectionMode === "cloud" ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connectionMode === "cloud" ? "Render path" : "Local demo"}
          </span>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="left-rail">
          <section className="rail-section">
            <div className="section-heading">
              <span>Home structure</span>
              <strong>{home.rooms.length + home.fixtures.length}</strong>
            </div>
            <nav className="structure-tree" aria-label="Home structure">
              <div className="tree-root">
                <Layers3 size={15} />
                <span>Ground floor</span>
              </div>
              {home.rooms.length === 0 ? (
                <p className="tree-empty">No rooms yet. The canvas is waiting for a description.</p>
              ) : (
                home.rooms.map((room) => {
                  const fixtures = home.fixtures.filter((fixture) => fixture.roomId === room.id);
                  return (
                    <div className="tree-room" key={room.id}>
                      <button
                        className={`tree-room-label ${selectedRoomId === room.id ? "is-selected" : ""}`}
                        type="button"
                        onClick={() => {
                          setSelectedFixtureId(undefined);
                          setSelectedRoomId(room.id);
                        }}
                      >
                        <span className="room-swatch" />
                        <span>{room.label}</span>
                        <small>{fixtures.length}</small>
                      </button>
                      {fixtures.map((fixture) => {
                        const endpoint = endpointForFixture(home, fixture.id);
                        return (
                          <button
                            className={`tree-fixture ${selectedFixtureId === fixture.id ? "is-selected" : ""}`}
                            type="button"
                            key={fixture.id}
                            onClick={() => {
                              setSelectedRoomId(undefined);
                              setSelectedFixtureId(fixture.id);
                            }}
                          >
                            <Lightbulb size={14} />
                            <span>{fixture.label}</span>
                            <i className={endpoint?.reportedState.on ? "is-on" : ""} />
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </nav>
          </section>

          <section className="rail-section quick-actions">
            <div className="section-heading">
              <span>Direct actions</span>
            </div>
            <button type="button" onClick={addNextRoom} disabled={busy}>
              <Plus size={15} />
              Add a room
            </button>
            <button type="button" onClick={addLight} disabled={busy}>
              <Lightbulb size={15} />
              Add a light
            </button>
          </section>
        </aside>

        <HomeCanvas
          home={home}
          selectedFixtureId={selectedFixtureId}
          selectedRoomId={selectedRoomId}
          onSelectFixture={(fixture) => {
            setSelectedRoomId(undefined);
            setSelectedFixtureId(fixture?.id);
          }}
          onSelectRoom={(room) => {
            setSelectedFixtureId(undefined);
            setSelectedRoomId(room?.id);
          }}
          onUpdateRoom={(input) =>
            void run(async () => {
              const next = await updateRoom(input);
              const room = next.rooms.find((candidate) => candidate.id === input.roomId);
              setActivity(`${room?.label ?? "Room"} snapped to the drafting grid.`);
            })
          }
          onMoveFixture={(input) =>
            void run(async () => {
              const next = await moveFixture(input);
              const fixture = next.fixtures.find((candidate) => candidate.id === input.fixtureId);
              setActivity(`${fixture?.label ?? "Fixture"} moved inside its room.`);
            })
          }
          onToggleFixture={(fixture) =>
            void run(async () => {
              const endpoint = endpointForFixture(getHome(), fixture.id);
              if (!endpoint) {
                setActivity(`${fixture.label} needs a device binding first.`);
                return;
              }
              await setFixtureState({ fixtureId: fixture.id, on: !endpoint.reportedState.on });
              setActivity(`${fixture.label} changed state.`);
            })
          }
          onBuildDemo={() => void buildDemo()}
          floatingCard={floatingCard}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={() =>
            void run(async () => {
              await undo();
              setActivity("Last edit undone.");
            })
          }
          onRedo={() =>
            void run(async () => {
              await redo();
              setActivity("Last edit restored.");
            })
          }
          busy={busy}
        />
      </div>

      <footer className="workspace-footer">
        <span>{busy ? "Applying change…" : (error ?? activity)}</span>
        <span>
          {home.openings.length} openings · {home.bindings.length} physical bindings
        </span>
      </footer>
    </main>
  );
}
