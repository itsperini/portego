"use client";

import {
  type Device,
  endpointForDevice,
  type HomeDocument,
  type MoveDeviceInput,
  type Opening,
  type Room,
  type UpdateRoomInput,
} from "@portego/home-model";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";

const DOCUMENT_WIDTH = 1000;
const DOCUMENT_HEIGHT = 650;
const GRID_SIZE = 20;
const ROOM_INSET = 28;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type Guide = {
  x?: number;
  y?: number;
};

type KonvaHomeCanvasProps = {
  home: HomeDocument;
  selectedDeviceId?: string;
  selectedRoomId?: string;
  onSelectDevice: (device?: Device) => void;
  onSelectRoom: (room?: Room) => void;
  onUpdateRoom: (input: UpdateRoomInput) => void;
  onMoveDevice: (input: MoveDeviceInput) => void;
  onToggleDevice: (device: Device) => void;
};

function OpeningShape({ opening, room }: { opening: Opening; room: Room }) {
  const horizontal = opening.wall === "top" || opening.wall === "bottom";
  const span = opening.type === "door" ? 48 : 58;
  const center = horizontal
    ? {
        x: room.x + room.width * opening.offset,
        y: opening.wall === "top" ? room.y : room.y + room.height,
      }
    : {
        x: opening.wall === "left" ? room.x : room.x + room.width,
        y: room.y + room.height * opening.offset,
      };
  const gapPoints = horizontal
    ? [center.x - span / 2, center.y, center.x + span / 2, center.y]
    : [center.x, center.y - span / 2, center.x, center.y + span / 2];
  const leafPoints = horizontal
    ? [
        center.x - span / 2,
        center.y,
        center.x - span / 2,
        center.y + (opening.wall === "top" ? span * 0.72 : -span * 0.72),
      ]
    : [
        center.x,
        center.y - span / 2,
        center.x + (opening.wall === "left" ? span * 0.72 : -span * 0.72),
        center.y - span / 2,
      ];

  return (
    <Group listening={false}>
      <Line points={gapPoints} stroke="#f3f8f8" strokeWidth={12} lineCap="square" />
      {opening.type === "window" ? (
        <>
          <Line points={gapPoints} stroke="#2d7c79" strokeWidth={5} lineCap="square" />
          <Line points={gapPoints} stroke="#f3f8f8" strokeWidth={1.5} lineCap="square" />
        </>
      ) : (
        <>
          <Line points={gapPoints} stroke="#9fb4be" strokeWidth={1.5} dash={[5, 4]} />
          <Line points={leafPoints} stroke="#173146" strokeWidth={3} lineCap="square" />
        </>
      )}
    </Group>
  );
}

const snap = (value: number): number => Math.round(value / GRID_SIZE) * GRID_SIZE;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

function fitViewport(width: number, height: number): Viewport {
  const padding = width < 560 ? 30 : 72;
  const scale = Math.min(
    (width - padding * 2) / DOCUMENT_WIDTH,
    (height - padding * 2) / DOCUMENT_HEIGHT,
  );
  const safeScale = clamp(scale, MIN_ZOOM, 1.2);
  return {
    x: (width - DOCUMENT_WIDTH * safeScale) / 2,
    y: (height - DOCUMENT_HEIGHT * safeScale) / 2,
    scale: safeScale,
  };
}

type RoomShapeProps = {
  room: Room;
  selected: boolean;
  viewportScale: number;
  onSelect: () => void;
  onGuide: (guide: Guide) => void;
  onCommit: (input: UpdateRoomInput) => void;
};

function RoomShape({ room, selected, viewportScale, onSelect, onGuide, onCommit }: RoomShapeProps) {
  const roomRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && roomRef.current && transformerRef.current) {
      transformerRef.current.nodes([roomRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const snapRoomPosition = useCallback(
    (node: Konva.Group) => {
      const x = clamp(snap(node.x()), 0, DOCUMENT_WIDTH - room.width);
      const y = clamp(snap(node.y()), 0, DOCUMENT_HEIGHT - room.height);
      node.position({ x, y });
      onGuide({ x, y });
      return { x, y };
    },
    [onGuide, room.height, room.width],
  );

  return (
    <>
      <Group
        ref={roomRef}
        x={room.x}
        y={room.y}
        draggable
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onDragStart={() => onSelect()}
        onDragMove={(event) => snapRoomPosition(event.target as Konva.Group)}
        onDragEnd={(event) => {
          const position = snapRoomPosition(event.target as Konva.Group);
          onGuide({});
          onCommit({ roomId: room.id, ...position });
        }}
        onTransformStart={() => onSelect()}
        onTransformEnd={() => {
          const node = roomRef.current;
          if (!node) {
            return;
          }
          const x = clamp(snap(node.x()), 0, DOCUMENT_WIDTH - 120);
          const y = clamp(snap(node.y()), 0, DOCUMENT_HEIGHT - 100);
          const width = clamp(snap(room.width * Math.abs(node.scaleX())), 120, DOCUMENT_WIDTH - x);
          const height = clamp(
            snap(room.height * Math.abs(node.scaleY())),
            100,
            DOCUMENT_HEIGHT - y,
          );
          node.scale({ x: 1, y: 1 });
          node.position({ x, y });
          onCommit({ roomId: room.id, x, y, width, height });
        }}
      >
        <Rect
          name="room-surface"
          width={room.width}
          height={room.height}
          fill="rgba(255, 255, 255, 0.78)"
          stroke={selected ? "#2d7c79" : "#173146"}
          strokeWidth={selected ? 8 : 7}
          shadowColor="#0b2133"
          shadowBlur={selected ? 11 : 0}
          shadowOpacity={0.08}
        />
        <Text
          x={20}
          y={17}
          text={room.label}
          fontFamily="Manrope Variable, Manrope, sans-serif"
          fontSize={16}
          fontStyle="bold"
          fill="#173146"
          listening={false}
        />
        <Text
          x={20}
          y={43}
          text={`${Math.round(room.width / 40)} × ${Math.round(room.height / 40)} approx.`}
          fontFamily="JetBrains Mono Variable, monospace"
          fontSize={8}
          fill="#637580"
          letterSpacing={0.4}
          listening={false}
        />
      </Group>
      {selected ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          flipEnabled={false}
          keepRatio={false}
          enabledAnchors={[
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ]}
          borderStroke="#2d7c79"
          borderStrokeWidth={1 / viewportScale}
          borderDash={[7 / viewportScale, 5 / viewportScale]}
          anchorFill="#f8fbfa"
          anchorStroke="#2d7c79"
          anchorStrokeWidth={1.5 / viewportScale}
          anchorSize={10 / viewportScale}
          anchorCornerRadius={2 / viewportScale}
          padding={5 / viewportScale}
          boundBoxFunc={(oldBox, nextBox) =>
            Math.abs(nextBox.width) < 120 * viewportScale ||
            Math.abs(nextBox.height) < 100 * viewportScale
              ? oldBox
              : nextBox
          }
        />
      ) : null}
    </>
  );
}

type DeviceShapeProps = {
  device: Device;
  home: HomeDocument;
  selected: boolean;
  onSelect: () => void;
  onGuide: (guide: Guide) => void;
  onCommit: (input: MoveDeviceInput) => void;
  onToggle: () => void;
};

function DeviceShape({
  device,
  home,
  selected,
  onSelect,
  onGuide,
  onCommit,
  onToggle,
}: DeviceShapeProps) {
  const endpoint = endpointForDevice(home, device.id);
  const room = home.rooms.find((candidate) => candidate.id === device.roomId);
  const isOn = endpoint?.reportedState.on === true;

  const snapDevicePosition = (node: Konva.Group) => {
    if (!room) {
      return { x: snap(node.x()), y: snap(node.y()) };
    }
    const x = clamp(snap(node.x()), room.x + ROOM_INSET, room.x + room.width - ROOM_INSET);
    const y = clamp(snap(node.y()), room.y + ROOM_INSET, room.y + room.height - ROOM_INSET);
    node.position({ x, y });
    onGuide({ x, y });
    return { x, y };
  };

  return (
    <Group
      x={device.position.x}
      y={device.position.y}
      draggable
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDblClick={(event) => {
        event.cancelBubble = true;
        if (device.capabilities.includes("power")) onToggle();
      }}
      onDblTap={(event) => {
        event.cancelBubble = true;
        if (device.capabilities.includes("power")) onToggle();
      }}
      onDragStart={() => onSelect()}
      onDragMove={(event) => snapDevicePosition(event.target as Konva.Group)}
      onDragEnd={(event) => {
        const position = snapDevicePosition(event.target as Konva.Group);
        onGuide({});
        onCommit({ deviceId: device.id, ...position });
      }}
    >
      {isOn ? (
        <Circle
          radius={42}
          fill="rgba(242, 174, 55, 0.18)"
          shadowColor="#f2ae37"
          shadowBlur={22}
          shadowOpacity={0.42}
          listening={false}
        />
      ) : null}
      <Circle
        radius={selected ? 27 : 24}
        fill="#f8fbfa"
        stroke={selected ? "#2d7c79" : "#9fb4be"}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <Circle
        radius={14}
        fill={isOn ? "#f5c85a" : "#f8fbfa"}
        stroke={isOn ? "#a66a09" : "#173146"}
        strokeWidth={1.6}
        listening={false}
      />
      {device.type === "light" ? (
        <>
          <Line
            points={[-6, 0, -4, -6, 0, -9, 4, -6, 6, 0, 3, 7, -3, 7, -6, 0]}
            closed
            stroke="#173146"
            strokeWidth={1.6}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Line
            points={[-4, 11, 4, 11]}
            stroke="#173146"
            strokeWidth={1.5}
            lineCap="round"
            listening={false}
          />
        </>
      ) : device.type === "switch" ? (
        <>
          <Rect
            x={-7}
            y={-9}
            width={14}
            height={18}
            cornerRadius={3}
            stroke="#173146"
            strokeWidth={1.5}
            listening={false}
          />
          <Line points={[0, -5, 0, 1]} stroke="#173146" strokeWidth={1.7} listening={false} />
          <Circle y={5} radius={1.4} fill="#173146" listening={false} />
        </>
      ) : device.type === "plug" ? (
        <>
          <Line
            points={[-7, -2, -7, 3, -3, 7, 3, 7, 7, 3, 7, -2]}
            stroke="#173146"
            strokeWidth={1.6}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Line points={[-4, -8, -4, -2]} stroke="#173146" strokeWidth={1.7} listening={false} />
          <Line points={[4, -8, 4, -2]} stroke="#173146" strokeWidth={1.7} listening={false} />
        </>
      ) : (
        <>
          <Circle radius={3} fill="#173146" listening={false} />
          <Line
            points={[-6, -5, -9, 0, -6, 5]}
            stroke="#173146"
            strokeWidth={1.5}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[6, -5, 9, 0, 6, 5]}
            stroke="#173146"
            strokeWidth={1.5}
            lineCap="round"
            listening={false}
          />
        </>
      )}
      {isOn && device.type === "light" ? (
        <>
          <Line points={[0, -22, 0, -29]} stroke="#a66a09" strokeWidth={1.5} />
          <Line points={[20, -12, 26, -16]} stroke="#a66a09" strokeWidth={1.5} />
          <Line points={[-20, -12, -26, -16]} stroke="#a66a09" strokeWidth={1.5} />
        </>
      ) : null}
      <Text
        x={-75}
        y={35}
        width={150}
        align="center"
        text={device.label}
        fontFamily="Manrope Variable, Manrope, sans-serif"
        fontSize={11}
        fontStyle="bold"
        fill="#173146"
        stroke="#f8fbfa"
        strokeWidth={3}
        fillAfterStrokeEnabled
        listening={false}
      />
      <Circle
        x={17}
        y={-17}
        radius={5}
        fill={endpoint ? "#2d7c79" : "#f8fbfa"}
        stroke={endpoint ? "#f8fbfa" : "#9fb4be"}
        strokeWidth={2}
        listening={false}
      />
    </Group>
  );
}

export function KonvaHomeCanvas({
  home,
  selectedDeviceId,
  selectedRoomId,
  onSelectDevice,
  onSelectRoom,
  onUpdateRoom,
  onMoveDevice,
  onToggleDevice,
}: KonvaHomeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const panRef = useRef<{
    active: boolean;
    start: { x: number; y: number };
    origin: { x: number; y: number };
  }>({ active: false, start: { x: 0, y: 0 }, origin: { x: 0, y: 0 } });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [guide, setGuide] = useState<Guide>({});

  const resetViewport = useCallback(
    (nextSize = size) => setViewport(fitViewport(nextSize.width, nextSize.height)),
    [size],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextSize = {
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      };
      setSize(nextSize);
      setViewport(fitViewport(nextSize.width, nextSize.height));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const gridLines = useMemo(() => {
    const lines: Array<{ key: string; points: number[]; major: boolean }> = [];
    for (let x = 0; x <= DOCUMENT_WIDTH; x += GRID_SIZE) {
      lines.push({ key: `v-${x}`, points: [x, 0, x, DOCUMENT_HEIGHT], major: x % 100 === 0 });
    }
    for (let y = 0; y <= DOCUMENT_HEIGHT; y += GRID_SIZE) {
      lines.push({ key: `h-${y}`, points: [0, y, DOCUMENT_WIDTH, y], major: y % 100 === 0 });
    }
    return lines;
  }, []);

  const zoomBy = (factor: number) => {
    const nextScale = clamp(viewport.scale * factor, MIN_ZOOM, MAX_ZOOM);
    const center = { x: size.width / 2, y: size.height / 2 };
    const world = {
      x: (center.x - viewport.x) / viewport.scale,
      y: (center.y - viewport.y) / viewport.scale,
    };
    setViewport({
      x: center.x - world.x * nextScale,
      y: center.y - world.y * nextScale,
      scale: nextScale,
    });
  };

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }
    const direction = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
    const nextScale = clamp(viewport.scale * direction, MIN_ZOOM, MAX_ZOOM);
    const world = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
    setViewport({
      x: pointer.x - world.x * nextScale,
      y: pointer.y - world.y * nextScale,
      scale: nextScale,
    });
  };

  const beginPan = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer || (event.target !== stage && event.target.name() !== "canvas-background")) {
      return;
    }
    onSelectDevice(undefined);
    onSelectRoom(undefined);
    panRef.current = {
      active: true,
      start: pointer,
      origin: { x: viewport.x, y: viewport.y },
    };
    if (stage) {
      stage.container().style.cursor = "grabbing";
    }
  };

  const movePan = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer || !panRef.current.active) {
      return;
    }
    setViewport((current) => ({
      ...current,
      x: panRef.current.origin.x + pointer.x - panRef.current.start.x,
      y: panRef.current.origin.y + pointer.y - panRef.current.start.y,
    }));
  };

  const endPan = () => {
    panRef.current.active = false;
    const stage = stageRef.current;
    if (stage) {
      stage.container().style.cursor = "grab";
    }
  };

  return (
    <div className="konva-host" ref={hostRef}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onMouseDown={beginPan}
        onTouchStart={beginPan}
        onMouseMove={movePan}
        onTouchMove={movePan}
        onMouseUp={endPan}
        onTouchEnd={endPan}
        onMouseLeave={endPan}
      >
        <Layer x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
          <Rect
            name="canvas-background"
            width={DOCUMENT_WIDTH}
            height={DOCUMENT_HEIGHT}
            fill="#f3f8f8"
          />
          {gridLines.map((line) => (
            <Line
              key={line.key}
              points={line.points}
              stroke={line.major ? "#aebfc7" : "#cddde1"}
              strokeWidth={line.major ? 0.95 : 0.65}
              opacity={line.major ? 0.44 : 0.46}
              listening={false}
            />
          ))}
          {home.rooms.map((room) => (
            <RoomShape
              key={room.id}
              room={room}
              selected={selectedRoomId === room.id}
              viewportScale={viewport.scale}
              onSelect={() => {
                onSelectDevice(undefined);
                onSelectRoom(room);
              }}
              onGuide={setGuide}
              onCommit={onUpdateRoom}
            />
          ))}
          {home.openings.map((opening) => {
            const room = home.rooms.find((candidate) => candidate.id === opening.roomId);
            return room ? <OpeningShape key={opening.id} opening={opening} room={room} /> : null;
          })}
          {home.devices.map((device) => (
            <DeviceShape
              key={device.id}
              device={device}
              home={home}
              selected={selectedDeviceId === device.id}
              onSelect={() => {
                onSelectRoom(undefined);
                onSelectDevice(device);
              }}
              onGuide={setGuide}
              onCommit={onMoveDevice}
              onToggle={() => onToggleDevice(device)}
            />
          ))}
          {guide.x !== undefined ? (
            <Line
              points={[guide.x, 0, guide.x, DOCUMENT_HEIGHT]}
              stroke="#2d7c79"
              strokeWidth={1 / viewport.scale}
              dash={[7 / viewport.scale, 5 / viewport.scale]}
              listening={false}
            />
          ) : null}
          {guide.y !== undefined ? (
            <Line
              points={[0, guide.y, DOCUMENT_WIDTH, guide.y]}
              stroke="#2d7c79"
              strokeWidth={1 / viewport.scale}
              dash={[7 / viewport.scale, 5 / viewport.scale]}
              listening={false}
            />
          ) : null}
        </Layer>
      </Stage>

      <div className="canvas-editor-controls" role="group" aria-label="Canvas zoom controls">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          <Minus size={14} />
        </button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <Plus size={14} />
        </button>
        <button type="button" onClick={() => resetViewport()} aria-label="Fit home to canvas">
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}
