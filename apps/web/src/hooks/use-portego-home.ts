"use client";

import {
  type AddDeviceInput,
  type AddOpeningInput,
  type AddRoomInput,
  type ApplyHomeChangesInput,
  addDevice as addDeviceLocally,
  addOpening as addOpeningLocally,
  addRoom as addRoomLocally,
  applyHomeChanges as applyHomeChangesLocally,
  applyReportedState,
  type BindDeviceInput,
  bindDeviceToEndpoint as bindDeviceLocally,
  createDemoHome,
  type HomeDocument,
  type MoveDeviceInput,
  moveDevice as moveDeviceLocally,
  type RemoveDeviceInput,
  type RemoveFloorInput,
  type RemoveOpeningInput,
  type RemoveRoomInput,
  removeDevice as removeDeviceLocally,
  removeFloor as removeFloorLocally,
  removeOpening as removeOpeningLocally,
  removeRoom as removeRoomLocally,
  type SetDeviceStateInput,
  setDesiredDeviceState,
  type UnbindDeviceInput,
  type UpdateDeviceInput,
  type UpdateFloorDetailsInput,
  type UpdateHomeDetailsInput,
  type UpdateRoomInput,
  unbindDevice as unbindDeviceLocally,
  updateDevice as updateDeviceLocally,
  updateFloorDetails as updateFloorDetailsLocally,
  updateHomeDetails as updateHomeDetailsLocally,
  updateRoomGeometry as updateRoomLocally,
} from "@portego/home-model";
import { useCallback, useEffect, useRef, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_PORTEGO_API_URL ?? "http://localhost:4000";

type ConnectionMode = "connecting" | "cloud" | "local";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Portego request failed.");
  }
  return (await response.json()) as T;
}

export function usePortegoHome() {
  const [home, setHome] = useState<HomeDocument>(() => createDemoHome());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const homeRef = useRef(home);
  const localUndoRef = useRef<HomeDocument[]>([]);
  const localRedoRef = useRef<HomeDocument[]>([]);

  const updateHome = useCallback((next: HomeDocument) => {
    homeRef.current = next;
    setHome(next);
    return next;
  }, []);

  const acceptCloudMutation = useCallback(
    (next: HomeDocument) => {
      setHistory({ canUndo: true, canRedo: false });
      return updateHome(next);
    },
    [updateHome],
  );

  const acceptLocalMutation = useCallback(
    (next: HomeDocument) => {
      localUndoRef.current.push(structuredClone(homeRef.current));
      localRedoRef.current = [];
      setHistory({ canUndo: true, canRedo: false });
      return updateHome(next);
    },
    [updateHome],
  );

  const refresh = useCallback(async () => {
    try {
      const [next, nextHistory] = await Promise.all([
        request<HomeDocument>("/api/home", { cache: "no-store" }),
        request<{ canUndo: boolean; canRedo: boolean }>("/api/history", {
          cache: "no-store",
        }),
      ]);
      setConnectionMode("cloud");
      setError(null);
      setHistory(nextHistory);
      return updateHome(next);
    } catch {
      setConnectionMode("local");
      return homeRef.current;
    }
  }, [updateHome]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (connectionMode !== "cloud") {
      return;
    }
    const poller = setInterval(() => void refresh(), 1_500);
    return () => clearInterval(poller);
  }, [connectionMode, refresh]);

  const updateHomeDetails = useCallback(
    async (input: UpdateHomeDetailsInput) => {
      try {
        const next = await request<HomeDocument>("/api/home/details", {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") throw requestError;
        return acceptLocalMutation(updateHomeDetailsLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const updateFloorDetails = useCallback(
    async (input: UpdateFloorDetailsInput) => {
      try {
        const next = await request<HomeDocument>("/api/floors/details", {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") throw requestError;
        return acceptLocalMutation(updateFloorDetailsLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeFloor = useCallback(
    async (input: RemoveFloorInput) => {
      try {
        const next = await request<HomeDocument>(
          `/api/floors/${encodeURIComponent(input.floorName)}`,
          { method: "DELETE" },
        );
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") throw requestError;
        return acceptLocalMutation(removeFloorLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const addRoom = useCallback(
    async (input: AddRoomInput) => {
      try {
        const next = await request<HomeDocument>("/api/rooms", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not add the room.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(addRoomLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const addDevice = useCallback(
    async (input: AddDeviceInput) => {
      try {
        const next = await request<HomeDocument>("/api/devices", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not add the device.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(addDeviceLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const updateRoom = useCallback(
    async (input: UpdateRoomInput) => {
      const roomId =
        input.roomId ??
        homeRef.current.rooms.find(
          (room) => room.label.toLowerCase() === input.roomLabel?.toLowerCase(),
        )?.id;
      if (!roomId) {
        throw new Error("A room id is required for direct canvas editing.");
      }
      try {
        const next = await request<HomeDocument>(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, roomId }),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not update the room.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(updateRoomLocally(homeRef.current, { ...input, roomId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const moveDevice = useCallback(
    async (input: MoveDeviceInput) => {
      const deviceId =
        input.deviceId ??
        homeRef.current.devices.find(
          (device) => device.label.toLowerCase() === input.deviceLabel?.toLowerCase(),
        )?.id;
      if (!deviceId) {
        throw new Error("A device id is required for direct canvas editing.");
      }
      try {
        const next = await request<HomeDocument>(`/api/devices/${encodeURIComponent(deviceId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, deviceId }),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not move the device.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(moveDeviceLocally(homeRef.current, { ...input, deviceId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const setDeviceState = useCallback(
    async (input: SetDeviceStateInput) => {
      try {
        const next = await request<HomeDocument>("/api/devices/state", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not control the device.",
          );
          throw requestError;
        }
        const desired = setDesiredDeviceState(homeRef.current, input);
        setConnectionMode("local");
        return acceptLocalMutation(
          applyReportedState(desired.home, desired.endpoint.id, desired.requestedState),
        );
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeRoom = useCallback(
    async (input: RemoveRoomInput) => {
      const roomId =
        input.roomId ??
        homeRef.current.rooms.find(
          (room) => room.label.toLowerCase() === input.roomLabel?.toLowerCase(),
        )?.id;
      if (!roomId) {
        throw new Error("Room not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(removeRoomLocally(homeRef.current, { roomId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const updateDevice = useCallback(
    async (input: UpdateDeviceInput) => {
      const deviceId =
        input.deviceId ??
        homeRef.current.devices.find(
          (device) => device.label.toLowerCase() === input.deviceLabel?.toLowerCase(),
        )?.id;
      if (!deviceId) {
        throw new Error("Device not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/devices/${encodeURIComponent(deviceId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, deviceId }),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(updateDeviceLocally(homeRef.current, { ...input, deviceId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeDevice = useCallback(
    async (input: RemoveDeviceInput) => {
      const deviceId =
        input.deviceId ??
        homeRef.current.devices.find(
          (device) => device.label.toLowerCase() === input.deviceLabel?.toLowerCase(),
        )?.id;
      if (!deviceId) {
        throw new Error("Device not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/devices/${encodeURIComponent(deviceId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(removeDeviceLocally(homeRef.current, { deviceId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const bindDevice = useCallback(
    async (input: BindDeviceInput) => {
      try {
        const next = await request<HomeDocument>("/api/bindings", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(bindDeviceLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const unbindDevice = useCallback(
    async (input: UnbindDeviceInput) => {
      const deviceId =
        input.deviceId ??
        homeRef.current.devices.find(
          (device) => device.label.toLowerCase() === input.deviceLabel?.toLowerCase(),
        )?.id;
      if (!deviceId) {
        throw new Error("Device not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/bindings/${encodeURIComponent(deviceId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(unbindDeviceLocally(homeRef.current, { deviceId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const addOpening = useCallback(
    async (input: AddOpeningInput) => {
      try {
        const next = await request<HomeDocument>("/api/openings", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(addOpeningLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeOpening = useCallback(
    async (input: RemoveOpeningInput) => {
      const openingId =
        input.openingId ??
        homeRef.current.openings.find(
          (opening) => opening.label?.toLowerCase() === input.label?.toLowerCase(),
        )?.id;
      if (!openingId) {
        throw new Error("Opening not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/openings/${encodeURIComponent(openingId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(removeOpeningLocally(homeRef.current, { openingId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const applyChanges = useCallback(
    async (input: ApplyHomeChangesInput) => {
      try {
        const next = await request<HomeDocument>("/api/changes", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(applyHomeChangesLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const syncHistory = useCallback(async () => {
    if (connectionMode !== "cloud") {
      return;
    }
    const next = await request<{ canUndo: boolean; canRedo: boolean }>("/api/history");
    setHistory(next);
  }, [connectionMode]);

  const undo = useCallback(async () => {
    if (connectionMode === "cloud") {
      const next = await request<HomeDocument>("/api/history/undo", { method: "POST" });
      updateHome(next);
      await syncHistory();
      return next;
    }
    const previous = localUndoRef.current.pop();
    if (!previous) {
      throw new Error("There is nothing to undo.");
    }
    localRedoRef.current.push(structuredClone(homeRef.current));
    const next = updateHome(previous);
    setHistory({ canUndo: localUndoRef.current.length > 0, canRedo: true });
    return next;
  }, [connectionMode, syncHistory, updateHome]);

  const redo = useCallback(async () => {
    if (connectionMode === "cloud") {
      const next = await request<HomeDocument>("/api/history/redo", { method: "POST" });
      updateHome(next);
      await syncHistory();
      return next;
    }
    const following = localRedoRef.current.pop();
    if (!following) {
      throw new Error("There is nothing to redo.");
    }
    localUndoRef.current.push(structuredClone(homeRef.current));
    const next = updateHome(following);
    setHistory({ canUndo: true, canRedo: localRedoRef.current.length > 0 });
    return next;
  }, [connectionMode, syncHistory, updateHome]);

  const discover = useCallback(async () => {
    if (connectionMode !== "cloud") {
      return homeRef.current;
    }
    const next = await request<HomeDocument>("/api/discovery", { method: "POST" });
    return updateHome(next);
  }, [connectionMode, updateHome]);

  const reset = useCallback(async () => {
    try {
      const next = await request<HomeDocument>("/api/reset", { method: "POST" });
      setConnectionMode("cloud");
      setError(null);
      setHistory({ canUndo: false, canRedo: false });
      localUndoRef.current = [];
      localRedoRef.current = [];
      return updateHome(next);
    } catch {
      setConnectionMode("local");
      setHistory({ canUndo: false, canRedo: false });
      localUndoRef.current = [];
      localRedoRef.current = [];
      return updateHome(createDemoHome(homeRef.current.name));
    }
  }, [updateHome]);

  return {
    home,
    connectionMode,
    error,
    history,
    getHome: () => homeRef.current,
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
    discover,
    reset,
  };
}
