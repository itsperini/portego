"use client";

import {
  endpointForFixture,
  type Fixture,
  type Floor,
  type HomeDocument,
  type OpeningType,
  type Room,
  type UpdateFloorDetailsInput,
  type UpdateHomeDetailsInput,
  type WallSide,
} from "@portego/home-model";
import { DoorOpen, Lightbulb, PanelRightOpen, Plus, Trash2, Unlink, X } from "lucide-react";
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

type FloorMiniMapProps = {
  home: HomeDocument;
  floor: string;
};

function FloorMiniMap({ home, floor }: FloorMiniMapProps) {
  const rooms = home.rooms.filter((room) => room.floor === floor);
  return (
    <span className="floor-mini-map" aria-hidden="true">
      {rooms.map((room) => (
        <i
          key={room.id}
          title={room.label}
          style={{
            left: `${room.x / 10}%`,
            top: `${room.y / 6.5}%`,
            width: `${room.width / 10}%`,
            height: `${room.height / 6.5}%`,
          }}
        ></i>
      ))}
    </span>
  );
}

function HomeDetailsCard({
  home,
  busy,
  onClose,
  onSave,
}: {
  home: HomeDocument;
  busy: boolean;
  onClose: () => void;
  onSave: (input: UpdateHomeDetailsInput) => void;
}) {
  const [name, setName] = useState(home.name);
  const [description, setDescription] = useState(home.description);
  const [homeType, setHomeType] = useState(home.homeType);
  const [area, setArea] = useState(home.areaM2?.toString() ?? "");
  const [notes, setNotes] = useState(home.notes);

  useEffect(() => {
    setName(home.name);
    setDescription(home.description);
    setHomeType(home.homeType);
    setArea(home.areaM2?.toString() ?? "");
    setNotes(home.notes);
  }, [home]);

  return (
    <aside className="floating-object-card details-card" aria-label={`${home.name} details`}>
      <header className="floating-card-header">
        <div>
          <span className="eyebrow">Home</span>
          <strong>{home.name}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close home details">
          <X size={15} />
        </button>
      </header>
      <form
        className="details-card-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            name: name.trim(),
            description: description.trim(),
            homeType: homeType.trim(),
            areaM2: area ? Number(area) : null,
            notes: notes.trim(),
          });
        }}
      >
        <label className="config-field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="config-field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="A short description of this home"
          />
        </label>
        <div className="details-card-row">
          <label className="config-field">
            <span>Home type</span>
            <input
              value={homeType}
              onChange={(event) => setHomeType(event.target.value)}
              placeholder="Apartment"
            />
          </label>
          <label className="config-field">
            <span>Area · m²</span>
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              type="number"
              min="0.1"
              step="0.1"
            />
          </label>
        </div>
        <label className="config-field">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Private setup notes"
          />
        </label>
        <button className="primary-action details-save" type="submit" disabled={busy}>
          Save home details
        </button>
      </form>
    </aside>
  );
}

function FloorDetailsCard({
  floor,
  busy,
  onClose,
  onSave,
}: {
  floor: Floor;
  busy: boolean;
  onClose: () => void;
  onSave: (input: UpdateFloorDetailsInput) => void;
}) {
  const [name, setName] = useState(floor.name);
  const [description, setDescription] = useState(floor.description);
  const [area, setArea] = useState(floor.areaM2?.toString() ?? "");
  const [notes, setNotes] = useState(floor.notes);

  useEffect(() => {
    setName(floor.name);
    setDescription(floor.description);
    setArea(floor.areaM2?.toString() ?? "");
    setNotes(floor.notes);
  }, [floor]);

  return (
    <aside className="floating-object-card details-card" aria-label={`${floor.name} details`}>
      <header className="floating-card-header">
        <div>
          <span className="eyebrow">Floor</span>
          <strong>{floor.name}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close floor details">
          <X size={15} />
        </button>
      </header>
      <form
        className="details-card-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            floorName: floor.name,
            name: name.trim(),
            description: description.trim(),
            areaM2: area ? Number(area) : null,
            notes: notes.trim(),
          });
        }}
      >
        <label className="config-field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="config-field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="How this floor is used"
          />
        </label>
        <label className="config-field">
          <span>Area · m²</span>
          <input
            value={area}
            onChange={(event) => setArea(event.target.value)}
            type="number"
            min="0.1"
            step="0.1"
          />
        </label>
        <label className="config-field">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Floor-specific notes"
          />
        </label>
        <button className="primary-action details-save" type="submit" disabled={busy}>
          Save floor details
        </button>
      </form>
    </aside>
  );
}

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
    error,
    history,
    getHome,
    updateHomeDetails,
    updateFloorDetails,
    removeFloor,
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
  const [selectedDetails, setSelectedDetails] = useState<"home" | "floor">();
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [activeFloor, setActiveFloor] = useState("Ground floor");
  const [activity, setActivity] = useState("The home is ready for a conversational edit.");
  const [busy, setBusy] = useState(false);

  const webMcpActions = useMemo(
    () => ({
      getHome,
      updateHomeDetails,
      updateFloorDetails: async (input: UpdateFloorDetailsInput) => {
        const next = await updateFloorDetails(input);
        if (input.name && input.floorName === activeFloor) setActiveFloor(input.name);
        return next;
      },
      removeFloor,
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
      activeFloor,
      updateHomeDetails,
      updateFloorDetails,
      removeFloor,
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
  useWebMcp(webMcpActions, onAgentActivity);
  const selectedFixture = home.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const selectedRoom = home.rooms.find((room) => room.id === selectedRoomId);
  const selectedFloor = home.floors.find((floor) => floor.name === activeFloor);
  const floors = useMemo(
    () =>
      Array.from(
        new Set([
          ...home.floors.map((floor) => floor.name),
          ...home.rooms.map((room) => room.floor),
        ]),
      ),
    [home.floors, home.rooms],
  );
  const visibleRoomIds = useMemo(
    () => new Set(home.rooms.filter((room) => room.floor === activeFloor).map((room) => room.id)),
    [activeFloor, home.rooms],
  );
  const visibleHome = useMemo(
    () => ({
      ...home,
      rooms: home.rooms.filter((room) => visibleRoomIds.has(room.id)),
      fixtures: home.fixtures.filter((fixture) => visibleRoomIds.has(fixture.roomId)),
      openings: home.openings.filter((opening) => visibleRoomIds.has(opening.roomId)),
    }),
    [home, visibleRoomIds],
  );

  useEffect(() => {
    if (!floors.includes(activeFloor)) setActiveFloor(floors[0] ?? "No floor");
  }, [activeFloor, floors]);

  const selectFixture = useCallback((fixtureId?: string) => {
    setSelectedDetails(undefined);
    setSelectedRoomId(undefined);
    setSelectedFixtureId(fixtureId);
    setInspectorExpanded(false);
  }, []);

  const selectRoom = useCallback((roomId?: string) => {
    setSelectedDetails(undefined);
    setSelectedFixtureId(undefined);
    setSelectedRoomId(roomId);
    setInspectorExpanded(false);
  }, []);

  const selectDetails = useCallback((details: "home" | "floor") => {
    setSelectedFixtureId(undefined);
    setSelectedRoomId(undefined);
    setSelectedDetails(details);
    setInspectorExpanded(true);
  }, []);

  const activateFloor = useCallback(
    (floor: string) => {
      setActiveFloor(floor);
      selectRoom(undefined);
    },
    [selectRoom],
  );

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
        selectFixture(complete.fixtures.at(-1)?.id);
        setActivity("Kitchen ceiling is bound to Simulator light 01.");
      }),
    [addFixture, addRoom, reset, run, selectFixture],
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
        selectFixture(next.fixtures.at(-1)?.id);
        setActivity(`${label} was added.`);
      }),
    [addFixture, addRoom, getHome, run, selectFixture],
  );

  const floatingCard = selectedFixture ? (
    <FixtureCard
      key={selectedFixture.id}
      home={home}
      fixture={selectedFixture}
      busy={busy}
      onClose={() => setInspectorExpanded(false)}
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
          selectFixture(undefined);
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
      onClose={() => setInspectorExpanded(false)}
      onRename={(label) =>
        void run(async () => {
          await updateRoom({ roomId: selectedRoom.id, label });
          setActivity(`${selectedRoom.label} was renamed to ${label}.`);
        })
      }
      onRemove={() =>
        void run(async () => {
          await removeRoom({ roomId: selectedRoom.id });
          selectRoom(undefined);
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
  ) : selectedDetails === "home" ? (
    <HomeDetailsCard
      home={home}
      busy={busy}
      onClose={() => setInspectorExpanded(false)}
      onSave={(input) =>
        void run(async () => {
          const next = await updateHomeDetails(input);
          setActivity(`${next.name} details were updated.`);
        })
      }
    />
  ) : selectedDetails === "floor" && selectedFloor ? (
    <FloorDetailsCard
      floor={selectedFloor}
      busy={busy}
      onClose={() => setInspectorExpanded(false)}
      onSave={(input) =>
        void run(async () => {
          const next = await updateFloorDetails(input);
          const nextFloorName = input.name ?? input.floorName;
          setActiveFloor(nextFloorName);
          setActivity(`${nextFloorName} details were updated.`);
          if (!next.floors.some((floor) => floor.name === nextFloorName)) {
            setSelectedDetails(undefined);
          }
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
        </a>
        <button className="dashboard-button" type="button">
          Dashboard
        </button>
      </header>

      <div className={`workspace-grid ${inspectorExpanded ? "inspector-open" : ""}`}>
        <aside className="left-rail">
          <section className="rail-section">
            <div className="section-heading">
              <span>Home structure</span>
              <strong>{home.rooms.length + home.fixtures.length}</strong>
            </div>
            <nav className="structure-tree" aria-label="Home structure">
              <div className="floor-index-list">
                {floors.map((floor, index) => {
                  const floorRooms = home.rooms.filter((room) => room.floor === floor);
                  const floorRoomIds = new Set(floorRooms.map((room) => room.id));
                  const fixtureCount = home.fixtures.filter((fixture) =>
                    floorRoomIds.has(fixture.roomId),
                  ).length;
                  return (
                    <button
                      className={`floor-index-card ${activeFloor === floor ? "is-selected" : ""}`}
                      type="button"
                      key={floor}
                      onClick={() => activateFloor(floor)}
                    >
                      <span className="floor-card-copy">
                        <small>F.{String(index + 1).padStart(2, "0")}</small>
                        <strong>{floor}</strong>
                        <span>
                          {floorRooms.length} rooms · {fixtureCount} fixtures
                        </span>
                      </span>
                      <FloorMiniMap home={home} floor={floor} />
                    </button>
                  );
                })}
              </div>
              {visibleHome.rooms.length === 0 ? (
                <p className="tree-empty">No rooms yet. The canvas is waiting for a description.</p>
              ) : (
                visibleHome.rooms.map((room) => {
                  const fixtures = home.fixtures.filter((fixture) => fixture.roomId === room.id);
                  return (
                    <div className="tree-room" key={room.id}>
                      <button
                        className={`tree-room-label ${selectedRoomId === room.id ? "is-selected" : ""}`}
                        type="button"
                        onClick={() => selectRoom(room.id)}
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
                            onClick={() => selectFixture(fixture.id)}
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
          home={visibleHome}
          floorName={activeFloor}
          selectedFixtureId={selectedFixtureId}
          selectedRoomId={selectedRoomId}
          onSelectFixture={(fixture) => selectFixture(fixture?.id)}
          onSelectRoom={(room) => selectRoom(room?.id)}
          onSelectHome={() => selectDetails("home")}
          onSelectFloor={() => {
            if (selectedFloor) selectDetails("floor");
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

        <aside
          className={`property-rail ${inspectorExpanded && floatingCard ? "is-open" : ""}`}
          aria-label="Selected object properties"
        >
          {inspectorExpanded && floatingCard ? (
            floatingCard
          ) : (
            <button
              className="property-rail-trigger"
              type="button"
              disabled={!selectedFixture && !selectedRoom && !selectedDetails}
              onClick={() => setInspectorExpanded(true)}
              aria-label={
                selectedFixture || selectedRoom || selectedDetails
                  ? `Open properties for ${selectedFixture?.label ?? selectedRoom?.label ?? (selectedDetails === "home" ? home.name : activeFloor)}`
                  : "Select a home, floor, room, or fixture to view properties"
              }
            >
              <PanelRightOpen size={16} />
              <span>
                {selectedFixture?.label ??
                  selectedRoom?.label ??
                  (selectedDetails === "home"
                    ? home.name
                    : selectedDetails === "floor"
                      ? activeFloor
                      : "Select item")}
              </span>
              <small>
                {selectedFixture
                  ? "Fixture"
                  : selectedRoom
                    ? "Room"
                    : selectedDetails === "home"
                      ? "Home"
                      : selectedDetails === "floor"
                        ? "Floor"
                        : "Properties"}
              </small>
            </button>
          )}
        </aside>
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
