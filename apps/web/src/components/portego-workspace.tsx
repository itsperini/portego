"use client";

import {
  capabilitiesForDevice,
  type Device,
  type DeviceConfig,
  type DeviceType,
  endpointForDevice,
  endpointSupportsDevice,
  type Floor,
  type HomeDocument,
  normalizeDeviceConfig,
  type OpeningType,
  type Room,
  type UpdateDeviceInput,
  type UpdateFloorDetailsInput,
  type UpdateHomeDetailsInput,
  type WallSide,
} from "@portego/home-model";
import {
  Activity,
  ChevronDown,
  Cpu,
  DoorOpen,
  Lightbulb,
  PanelRightOpen,
  Plug,
  Plus,
  SquareDashed,
  ToggleLeft,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortegoHome } from "../hooks/use-portego-home";
import { useWebMcp } from "../hooks/use-webmcp";
import { HomeCanvas } from "./home-canvas";

type DeviceCardProps = {
  home: HomeDocument;
  device: Device;
  busy: boolean;
  onClose: () => void;
  onUpdate: (input: Omit<UpdateDeviceInput, "deviceId" | "deviceLabel">) => void;
  onRemove: () => void;
  onBind: (endpointId: string) => void;
  onUnbind: () => void;
  onSetState: (state: { on?: boolean; brightness?: number }) => void;
};

const deviceTypeLabels: Record<DeviceType, string> = {
  light: "Light",
  switch: "Switch",
  plug: "Smart plug",
  sensor: "Sensor",
};

function DeviceTypeIcon({ type, size = 16 }: { type: DeviceType; size?: number }) {
  switch (type) {
    case "light":
      return <Lightbulb size={size} aria-hidden="true" />;
    case "switch":
      return <ToggleLeft size={size} aria-hidden="true" />;
    case "plug":
      return <Plug size={size} aria-hidden="true" />;
    case "sensor":
      return <Activity size={size} aria-hidden="true" />;
  }
}

function DeviceConfigFields({
  type,
  config,
  disabled,
  onChange,
}: {
  type: DeviceType;
  config: DeviceConfig;
  disabled: boolean;
  onChange: (config: DeviceConfig) => void;
}) {
  if (type === "light") {
    return (
      <div className="device-config-grid">
        <label className="config-field">
          <span>Mounting</span>
          <select
            value={config.mounting ?? "ceiling"}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...config, mounting: event.target.value as DeviceConfig["mounting"] })
            }
          >
            <option value="ceiling">Ceiling</option>
            <option value="wall">Wall</option>
            <option value="table">Table</option>
            <option value="floor">Floor</option>
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={config.dimmable ?? false}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, dimmable: event.target.checked })}
          />
          <span>Dimmable</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={config.colorTemperature ?? false}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, colorTemperature: event.target.checked })}
          />
          <span>Adjustable color temperature</span>
        </label>
      </div>
    );
  }

  if (type === "switch") {
    return (
      <div className="device-config-grid two-columns">
        <label className="config-field">
          <span>Switch mode</span>
          <select
            value={config.mode ?? "toggle"}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...config, mode: event.target.value as DeviceConfig["mode"] })
            }
          >
            <option value="toggle">Toggle</option>
            <option value="momentary">Momentary</option>
            <option value="dimmer">Dimmer</option>
          </select>
        </label>
        <label className="config-field">
          <span>Channels</span>
          <select
            value={config.channels ?? 1}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, channels: Number(event.target.value) })}
          >
            {[1, 2, 3, 4].map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (type === "plug") {
    return (
      <div className="device-config-grid">
        <label className="check-field">
          <input
            type="checkbox"
            checked={config.energyMonitoring ?? false}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, energyMonitoring: event.target.checked })}
          />
          <span>Energy monitoring</span>
        </label>
      </div>
    );
  }

  const measures = config.measures ?? ["temperature"];
  return (
    <fieldset className="device-measures" disabled={disabled}>
      <legend>Measurements</legend>
      {(["temperature", "occupancy", "contact"] as const).map((measure) => (
        <label className="check-field" key={measure}>
          <input
            type="checkbox"
            checked={measures.includes(measure)}
            onChange={(event) => {
              const next = event.target.checked
                ? [...measures, measure]
                : measures.filter((candidate) => candidate !== measure);
              if (next.length > 0) onChange({ ...config, measures: next });
            }}
          />
          <span>{measure[0]?.toUpperCase() + measure.slice(1)}</span>
        </label>
      ))}
    </fieldset>
  );
}

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

function AddDeviceCard({
  home,
  activeFloor,
  busy,
  onClose,
  onAdd,
}: {
  home: HomeDocument;
  activeFloor: string;
  busy: boolean;
  onClose: () => void;
  onAdd: (input: {
    roomId: string;
    label: string;
    type: DeviceType;
    config: DeviceConfig;
    autoBind: boolean;
  }) => void;
}) {
  const floorRooms = home.rooms.filter((room) => room.floor === activeFloor);
  const availableRooms = floorRooms.length > 0 ? floorRooms : home.rooms;
  const [roomId, setRoomId] = useState(availableRooms[0]?.id ?? "");
  const [label, setLabel] = useState("New light");
  const [type, setType] = useState<DeviceType>("light");
  const [config, setConfig] = useState<DeviceConfig>(() => normalizeDeviceConfig("light"));
  const [autoBind, setAutoBind] = useState(true);

  const changeType = (nextType: DeviceType) => {
    setType(nextType);
    setConfig(normalizeDeviceConfig(nextType));
    setLabel((current) =>
      /^New (light|switch|smart plug|sensor)$/i.test(current)
        ? `New ${deviceTypeLabels[nextType].toLowerCase()}`
        : current,
    );
  };

  return (
    <aside className="floating-object-card device-card" aria-label="Add device">
      <header className="floating-card-header">
        <div>
          <span className="eyebrow">New device</span>
          <strong>Configure before adding</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Cancel adding a device">
          <X size={15} />
        </button>
      </header>

      <form
        className="device-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (roomId && label.trim()) {
            onAdd({ roomId, label: label.trim(), type, config, autoBind });
          }
        }}
      >
        <label className="config-field">
          <span>Name</span>
          <input value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="config-field">
          <span>Room</span>
          <select
            value={roomId}
            disabled={busy}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {availableRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.label} · {room.floor}
              </option>
            ))}
          </select>
        </label>
        <label className="config-field">
          <span>Device type</span>
          <select
            value={type}
            disabled={busy}
            onChange={(event) => changeType(event.target.value as DeviceType)}
          >
            {(Object.keys(deviceTypeLabels) as DeviceType[]).map((deviceType) => (
              <option key={deviceType} value={deviceType}>
                {deviceTypeLabels[deviceType]}
              </option>
            ))}
          </select>
        </label>

        <div className="device-config-section">
          <div className="device-config-heading">
            <DeviceTypeIcon type={type} />
            <span>{deviceTypeLabels[type]} configuration</span>
          </div>
          <DeviceConfigFields type={type} config={config} disabled={busy} onChange={setConfig} />
        </div>

        <label className="check-field auto-bind-field">
          <input
            type="checkbox"
            checked={autoBind}
            disabled={busy}
            onChange={(event) => setAutoBind(event.target.checked)}
          />
          <span>Automatically bind compatible discovered hardware</span>
        </label>

        <div className="device-editor-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={busy || !roomId || !label.trim()}
          >
            <Plus size={15} />
            Add device
          </button>
        </div>
      </form>
    </aside>
  );
}

function DeviceCard({
  home,
  device,
  busy,
  onClose,
  onUpdate,
  onRemove,
  onBind,
  onUnbind,
  onSetState,
}: DeviceCardProps) {
  const endpoint = endpointForDevice(home, device.id);
  const [label, setLabel] = useState(device.label);
  const [roomId, setRoomId] = useState(device.roomId);
  const [type, setType] = useState<DeviceType>(device.type);
  const [config, setConfig] = useState<DeviceConfig>(device.config);
  const [brightness, setBrightness] = useState(endpoint?.reportedState.brightness ?? 72);
  const savedDeviceSignature = JSON.stringify({
    id: device.id,
    label: device.label,
    roomId: device.roomId,
    type: device.type,
    config: device.config,
  });
  const lastAppliedDeviceSignature = useRef("");

  useEffect(() => {
    if (lastAppliedDeviceSignature.current === savedDeviceSignature) return;
    lastAppliedDeviceSignature.current = savedDeviceSignature;
    setLabel(device.label);
    setRoomId(device.roomId);
    setType(device.type);
    setConfig(device.config);
  }, [device, savedDeviceSignature]);

  useEffect(() => {
    setBrightness(endpoint?.reportedState.brightness ?? 72);
  }, [endpoint?.reportedState.brightness]);

  const draftCapabilities = capabilitiesForDevice(type, config);
  const configurationChanged =
    label.trim() !== device.label ||
    roomId !== device.roomId ||
    type !== device.type ||
    JSON.stringify(config) !== JSON.stringify(device.config);
  const bindingWillBeRemoved =
    endpoint !== undefined &&
    !draftCapabilities.every((capability) => endpoint.capabilities.includes(capability));

  return (
    <aside className="floating-object-card device-card" aria-label={`${device.label} settings`}>
      <header className="floating-card-header">
        <div>
          <span className="eyebrow">Device</span>
          <strong>{device.label}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close device settings">
          <X size={15} />
        </button>
      </header>

      <div className="device-card-status">
        <span
          className={endpoint?.reportedState.on ? "device-card-icon is-on" : "device-card-icon"}
        >
          <DeviceTypeIcon type={device.type} size={20} />
        </span>
        <div>
          <strong>
            {!endpoint
              ? `${deviceTypeLabels[device.type]} is unbound`
              : device.capabilities.includes("power")
                ? `${deviceTypeLabels[device.type]} is ${endpoint?.reportedState.on ? "on" : "off"}`
                : `${deviceTypeLabels[device.type]} status`}
          </strong>
          <span>
            {endpoint ? `${endpoint.label} · ${endpoint.protocol}` : "Designed device · unbound"}
          </span>
        </div>
        <i className={endpoint?.reachable ? "is-reachable" : ""} />
      </div>

      <form
        className="device-editor-form existing-device-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim() && configurationChanged) {
            onUpdate({ label: label.trim(), roomId, type, config });
          }
        }}
      >
        <label className="config-field">
          <span>Name</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
        </label>
        <label className="config-field">
          <span>Room</span>
          <select
            value={roomId}
            disabled={busy}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {home.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.label}
              </option>
            ))}
          </select>
        </label>
        <label className="config-field">
          <span>Device type</span>
          <select
            value={type}
            disabled={busy}
            onChange={(event) => {
              const nextType = event.target.value as DeviceType;
              setType(nextType);
              setConfig(normalizeDeviceConfig(nextType));
            }}
          >
            {(Object.keys(deviceTypeLabels) as DeviceType[]).map((deviceType) => (
              <option key={deviceType} value={deviceType}>
                {deviceTypeLabels[deviceType]}
              </option>
            ))}
          </select>
        </label>
        <div className="device-config-section">
          <div className="device-config-heading">
            <DeviceTypeIcon type={type} />
            <span>{deviceTypeLabels[type]} configuration</span>
          </div>
          <DeviceConfigFields type={type} config={config} disabled={busy} onChange={setConfig} />
        </div>
        {bindingWillBeRemoved ? (
          <p className="binding-warning">
            Applying this configuration will unbind {endpoint.label} because it is no longer
            compatible.
          </p>
        ) : null}
        <button
          className="device-apply-button"
          type="submit"
          disabled={busy || !label.trim() || !configurationChanged}
        >
          Apply changes
        </button>
      </form>

      <label className="config-field">
        <span>Device binding</span>
        <select
          value={endpoint?.id ?? ""}
          disabled={busy}
          onChange={(event) => (event.target.value ? onBind(event.target.value) : onUnbind())}
        >
          <option value="">Unbound</option>
          {home.endpoints.map((candidate) => (
            <option
              key={candidate.id}
              value={candidate.id}
              disabled={!endpointSupportsDevice(candidate, device)}
            >
              {candidate.label}
              {endpointSupportsDevice(candidate, device)
                ? candidate.reachable
                  ? " · online"
                  : " · offline"
                : " · incompatible"}
            </option>
          ))}
        </select>
      </label>

      {device.capabilities.includes("power") ? (
        <div className="device-control-row">
          <button
            className={endpoint?.reportedState.on ? "power-button is-on" : "power-button"}
            type="button"
            disabled={!endpoint || busy}
            onClick={() => onSetState({ on: !endpoint?.reportedState.on })}
          >
            <DeviceTypeIcon type={device.type} />
            Turn {endpoint?.reportedState.on ? "off" : "on"}
          </button>
          {endpoint ? (
            <button className="text-action" type="button" disabled={busy} onClick={onUnbind}>
              <Unlink size={14} />
              Unbind
            </button>
          ) : null}
        </div>
      ) : null}

      {endpoint && device.type === "sensor" ? (
        <div className="sensor-readings">
          {device.capabilities.includes("temperature") ? (
            <span>
              <small>Temperature</small>
              <strong>{endpoint.reportedState.temperature ?? "—"}°</strong>
            </span>
          ) : null}
          {device.capabilities.includes("occupancy") ? (
            <span>
              <small>Occupancy</small>
              <strong>{endpoint.reportedState.occupancy ? "Detected" : "Clear"}</strong>
            </span>
          ) : null}
          {device.capabilities.includes("contact") ? (
            <span>
              <small>Contact</small>
              <strong>{endpoint.reportedState.contact ? "Open" : "Closed"}</strong>
            </span>
          ) : null}
        </div>
      ) : null}

      {endpoint && device.capabilities.includes("energy") ? (
        <div className="energy-reading">
          <span>Energy</span>
          <strong>{endpoint.reportedState.energy ?? 0} Wh</strong>
        </div>
      ) : null}

      {device.capabilities.includes("brightness") ? (
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
          Position {Math.round(device.position.x)}, {Math.round(device.position.y)}
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
        <span>{home.devices.filter((device) => device.roomId === room.id).length} devices</span>
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
    addDevice,
    updateRoom,
    removeRoom,
    moveDevice,
    updateDevice,
    removeDevice,
    bindDevice,
    unbindDevice,
    addOpening,
    removeOpening,
    applyChanges,
    undo,
    redo,
    setDeviceState,
    reset,
  } = usePortegoHome();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>();
  const [selectedRoomId, setSelectedRoomId] = useState<string>();
  const [selectedDetails, setSelectedDetails] = useState<"home" | "floor">();
  const [addingDevice, setAddingDevice] = useState(false);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [activeFloor, setActiveFloor] = useState("Ground floor");
  const [activeFloorExpanded, setActiveFloorExpanded] = useState(true);
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
      addDevice,
      moveDevice,
      updateDevice,
      removeDevice,
      bindDevice,
      unbindDevice,
      addOpening,
      removeOpening,
      applyChanges,
      undo,
      redo,
      setDeviceState,
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
      addDevice,
      moveDevice,
      updateDevice,
      removeDevice,
      bindDevice,
      unbindDevice,
      addOpening,
      removeOpening,
      applyChanges,
      undo,
      redo,
      setDeviceState,
      reset,
    ],
  );
  const onAgentActivity = useCallback((message: string) => setActivity(message), []);
  useWebMcp(webMcpActions, onAgentActivity);
  const selectedDevice = home.devices.find((device) => device.id === selectedDeviceId);
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
      devices: home.devices.filter((device) => visibleRoomIds.has(device.roomId)),
      openings: home.openings.filter((opening) => visibleRoomIds.has(opening.roomId)),
    }),
    [home, visibleRoomIds],
  );

  useEffect(() => {
    if (!floors.includes(activeFloor)) {
      setActiveFloor(floors[0] ?? "No floor");
      setActiveFloorExpanded(true);
    }
  }, [activeFloor, floors]);

  const selectDevice = useCallback((deviceId?: string) => {
    setAddingDevice(false);
    setSelectedDetails(undefined);
    setSelectedRoomId(undefined);
    setSelectedDeviceId(deviceId);
  }, []);

  const selectRoom = useCallback((roomId?: string) => {
    setAddingDevice(false);
    setSelectedDetails(undefined);
    setSelectedDeviceId(undefined);
    setSelectedRoomId(roomId);
  }, []);

  const selectDetails = useCallback((details: "home" | "floor") => {
    setAddingDevice(false);
    setSelectedDeviceId(undefined);
    setSelectedRoomId(undefined);
    setSelectedDetails(details);
    setInspectorExpanded(true);
  }, []);

  const activateFloor = useCallback(
    (floor: string) => {
      if (floor === activeFloor) {
        setActiveFloorExpanded((expanded) => !expanded);
        selectRoom(undefined);
        return;
      }
      setActiveFloor(floor);
      setActiveFloorExpanded(true);
      selectRoom(undefined);
    },
    [activeFloor, selectRoom],
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
        const complete = await applyChanges({
          changes: [
            {
              op: "add_room",
              input: { label: "Kitchen", x: 90, y: 80, width: 300, height: 230 },
            },
            {
              op: "add_room",
              input: { label: "Living room", x: 390, y: 80, width: 430, height: 310 },
            },
            {
              op: "add_room",
              input: { label: "Bedroom", x: 90, y: 310, width: 300, height: 250 },
            },
            {
              op: "add_room",
              input: { label: "Bathroom", x: 390, y: 390, width: 240, height: 170 },
            },
            {
              op: "add_device",
              input: {
                roomLabel: "Kitchen",
                label: "Kitchen ceiling",
                type: "light",
                config: { mounting: "ceiling", dimmable: true },
                position: { x: 240, y: 190 },
              },
            },
            {
              op: "add_device",
              input: {
                roomLabel: "Kitchen",
                label: "Kitchen temperature",
                type: "sensor",
                config: { measures: ["temperature"] },
                position: { x: 350, y: 265 },
              },
            },
            {
              op: "add_device",
              input: {
                roomLabel: "Living room",
                label: "Living ceiling",
                type: "light",
                config: { mounting: "ceiling", dimmable: true, colorTemperature: true },
                position: { x: 590, y: 220 },
                autoBind: false,
              },
            },
            {
              op: "add_device",
              input: {
                roomLabel: "Living room",
                label: "Living occupancy",
                type: "sensor",
                config: { measures: ["occupancy"] },
                position: { x: 770, y: 345 },
                autoBind: false,
              },
            },
            {
              op: "add_device",
              input: {
                roomLabel: "Bedroom",
                label: "Bedside lamp",
                type: "light",
                config: { mounting: "table", dimmable: true },
                position: { x: 335, y: 505 },
                autoBind: false,
              },
            },
            {
              op: "add_device",
              input: {
                roomLabel: "Bathroom",
                label: "Bathroom ceiling",
                type: "light",
                config: { mounting: "ceiling", dimmable: false },
                position: { x: 510, y: 475 },
                autoBind: false,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Kitchen",
                connectsToRoomLabel: "Living room",
                label: "Kitchen opening",
                type: "door",
                wall: "right",
                offset: 0.55,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Kitchen",
                connectsToRoomLabel: "Bedroom",
                label: "Bedroom door",
                type: "door",
                wall: "bottom",
                offset: 0.48,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Living room",
                connectsToRoomLabel: "Bathroom",
                label: "Bathroom door",
                type: "door",
                wall: "bottom",
                offset: 0.28,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Kitchen",
                label: "Kitchen window",
                type: "window",
                wall: "top",
                offset: 0.5,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Living room",
                label: "Living window",
                type: "window",
                wall: "top",
                offset: 0.6,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Bedroom",
                label: "Bedroom window",
                type: "window",
                wall: "left",
                offset: 0.55,
              },
            },
            {
              op: "add_opening",
              input: {
                roomLabel: "Bathroom",
                label: "Bathroom window",
                type: "window",
                wall: "right",
                offset: 0.5,
              },
            },
          ],
        });
        const kitchenCeiling = complete.devices.find(
          (device) => device.label === "Kitchen ceiling",
        );
        selectDevice(kitchenCeiling?.id);
        setActivity("The four-room demo home is ready with lights, sensors, doors, and windows.");
      }),
    [applyChanges, reset, run, selectDevice],
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

  const openAddDevice = useCallback(() => {
    setSelectedDeviceId(undefined);
    setSelectedRoomId(undefined);
    setSelectedDetails(undefined);
    setAddingDevice(true);
    setInspectorExpanded(true);
  }, []);

  const floatingCard = addingDevice ? (
    <AddDeviceCard
      home={home}
      activeFloor={activeFloor}
      busy={busy}
      onClose={() => {
        setAddingDevice(false);
        setInspectorExpanded(false);
      }}
      onAdd={(input) =>
        void run(async () => {
          const next = await addDevice(input);
          const created = next.devices.at(-1);
          setAddingDevice(false);
          selectDevice(created?.id);
          setInspectorExpanded(true);
          setActivity(`${created?.label ?? "Device"} was added.`);
        })
      }
    />
  ) : selectedDevice ? (
    <DeviceCard
      key={selectedDevice.id}
      home={home}
      device={selectedDevice}
      busy={busy}
      onClose={() => setInspectorExpanded(false)}
      onUpdate={(input) =>
        void run(async () => {
          const next = await updateDevice({ deviceId: selectedDevice.id, ...input });
          const updated = next.devices.find((device) => device.id === selectedDevice.id);
          setActivity(`${updated?.label ?? "Device"} was updated.`);
        })
      }
      onRemove={() =>
        void run(async () => {
          await removeDevice({ deviceId: selectedDevice.id });
          selectDevice(undefined);
          setActivity(`${selectedDevice.label} was removed.`);
        })
      }
      onBind={(endpointId) =>
        void run(async () => {
          await bindDevice({ deviceId: selectedDevice.id, endpointId });
          setActivity(`${selectedDevice.label} was bound.`);
        })
      }
      onUnbind={() =>
        void run(async () => {
          await unbindDevice({ deviceId: selectedDevice.id });
          setActivity(`${selectedDevice.label} is now unbound.`);
        })
      }
      onSetState={(state) =>
        void run(async () => {
          await setDeviceState({ deviceId: selectedDevice.id, ...state });
          setActivity(`${selectedDevice.label} confirmed the new state.`);
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
          setActivity(`${selectedRoom.label} and its devices were removed.`);
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
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">portego</span>
        </a>
        <button className="dashboard-button" type="button">
          Dashboard
        </button>
      </header>

      <div className={`workspace-grid ${inspectorExpanded ? "inspector-open" : ""}`}>
        <aside className="left-rail">
          <section className="rail-section structure-section">
            <div className="section-heading">
              <span>Home structure</span>
              <strong>{home.rooms.length + home.devices.length}</strong>
            </div>
            <nav className="structure-tree" aria-label="Home structure">
              <div className="floor-index-list">
                {floors.map((floor, index) => {
                  const floorRooms = home.rooms.filter((room) => room.floor === floor);
                  const floorRoomIds = new Set(floorRooms.map((room) => room.id));
                  const deviceCount = home.devices.filter((device) =>
                    floorRoomIds.has(device.roomId),
                  ).length;
                  return (
                    <button
                      className={`floor-index-card ${activeFloor === floor ? "is-selected" : ""}`}
                      type="button"
                      key={floor}
                      onClick={() => activateFloor(floor)}
                      aria-expanded={activeFloor === floor && activeFloorExpanded}
                    >
                      <span className="floor-card-copy">
                        <small>F.{String(index + 1).padStart(2, "0")}</small>
                        <span className="floor-card-title">
                          <strong>{floor}</strong>
                          <ChevronDown
                            className={
                              activeFloor === floor && activeFloorExpanded ? "" : "is-collapsed"
                            }
                            size={13}
                            aria-hidden="true"
                          />
                        </span>
                        <span>
                          {floorRooms.length} rooms · {deviceCount} devices
                        </span>
                      </span>
                      <FloorMiniMap home={home} floor={floor} />
                    </button>
                  );
                })}
              </div>
              {activeFloorExpanded ? (
                <div className="floor-children">
                  {visibleHome.rooms.length === 0 ? (
                    <p className="tree-empty">
                      No rooms yet. The canvas is waiting for a description.
                    </p>
                  ) : (
                    visibleHome.rooms.map((room) => {
                      const devices = home.devices.filter((device) => device.roomId === room.id);
                      return (
                        <div className="tree-room" key={room.id}>
                          <button
                            className={`tree-room-label ${selectedRoomId === room.id ? "is-selected" : ""}`}
                            type="button"
                            onClick={() => selectRoom(room.id)}
                          >
                            <span className="room-swatch" />
                            <span>{room.label}</span>
                            <small>{devices.length}</small>
                          </button>
                          {devices.map((device) => {
                            const endpoint = endpointForDevice(home, device.id);
                            return (
                              <button
                                className={`tree-device ${selectedDeviceId === device.id ? "is-selected" : ""}`}
                                type="button"
                                key={device.id}
                                onClick={() => selectDevice(device.id)}
                              >
                                <DeviceTypeIcon type={device.type} size={14} />
                                <span>{device.label}</span>
                                <i className={endpoint?.reportedState.on ? "is-on" : ""} />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </nav>
          </section>

          <section className="rail-section quick-actions">
            <div className="section-heading">
              <span>Direct actions</span>
            </div>
            <button type="button" onClick={addNextRoom} disabled={busy}>
              <SquareDashed size={15} />
              Add a room
            </button>
            <button
              type="button"
              onClick={openAddDevice}
              disabled={busy || home.rooms.length === 0}
              title={home.rooms.length === 0 ? "Add a room before placing a device" : undefined}
            >
              <Cpu size={15} />
              Add a device
            </button>
          </section>
        </aside>

        <HomeCanvas
          home={visibleHome}
          floorName={activeFloor}
          selectedDeviceId={selectedDeviceId}
          selectedRoomId={selectedRoomId}
          onSelectDevice={(device) => selectDevice(device?.id)}
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
          onMoveDevice={(input) =>
            void run(async () => {
              const next = await moveDevice(input);
              const device = next.devices.find((candidate) => candidate.id === input.deviceId);
              setActivity(`${device?.label ?? "Device"} moved inside its room.`);
            })
          }
          onToggleDevice={(device) =>
            void run(async () => {
              const endpoint = endpointForDevice(getHome(), device.id);
              if (!endpoint) {
                setActivity(`${device.label} needs a device binding first.`);
                return;
              }
              await setDeviceState({ deviceId: device.id, on: !endpoint.reportedState.on });
              setActivity(`${device.label} changed state.`);
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
              disabled={!addingDevice && !selectedDevice && !selectedRoom && !selectedDetails}
              onClick={() => setInspectorExpanded(true)}
              aria-label={
                selectedDevice || selectedRoom || selectedDetails
                  ? `Open properties for ${selectedDevice?.label ?? selectedRoom?.label ?? (selectedDetails === "home" ? home.name : activeFloor)}`
                  : "Select a home, floor, room, or device to view properties"
              }
            >
              <PanelRightOpen size={16} />
              <span>
                {selectedDevice?.label ??
                  selectedRoom?.label ??
                  (selectedDetails === "home"
                    ? home.name
                    : selectedDetails === "floor"
                      ? activeFloor
                      : "Select item")}
              </span>
              <small>
                {selectedDevice
                  ? "Device"
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
