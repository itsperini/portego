from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


Capability = Literal[
    "power",
    "brightness",
    "color_temperature",
    "temperature",
    "contact",
    "occupancy",
    "energy",
]


class Position(StrictModel):
    x: float = Field(ge=0, le=1000)
    y: float = Field(ge=0, le=720)


class Floor(StrictModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    areaM2: float | None = Field(default=None, gt=0, le=100_000)
    notes: str = Field(default="", max_length=1000)


class Room(StrictModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=80)
    floor: str = Field(min_length=1, max_length=80)
    x: float = Field(ge=0, le=900)
    y: float = Field(ge=0, le=620)
    width: float = Field(ge=120, le=900)
    height: float = Field(ge=100, le=620)


class DeviceConfig(StrictModel):
    mounting: Literal["ceiling", "wall", "table", "floor"] | None = None
    dimmable: bool | None = None
    colorTemperature: bool | None = None
    mode: Literal["toggle", "momentary", "dimmer"] | None = None
    channels: int | None = Field(default=None, ge=1, le=4)
    energyMonitoring: bool | None = None
    measures: list[Literal["temperature", "occupancy", "contact"]] | None = None


class Device(StrictModel):
    id: str = Field(min_length=1)
    roomId: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=80)
    type: Literal["light", "switch", "plug", "sensor"]
    config: DeviceConfig
    position: Position
    capabilities: list[Capability] = Field(min_length=1)


class DeviceState(StrictModel):
    on: bool | None = None
    brightness: int | None = Field(default=None, ge=0, le=100)
    temperature: float | None = None
    contact: bool | None = None
    occupancy: bool | None = None
    energy: float | None = Field(default=None, ge=0)


class DeviceStateInput(StrictModel):
    on: bool | None = None
    brightness: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def has_command(self) -> "DeviceStateInput":
        if self.on is None and self.brightness is None:
            raise ValueError("At least one device state must be provided")
        return self


class DeviceEndpoint(StrictModel):
    id: str
    gatewayId: str
    label: str = Field(min_length=1, max_length=120)
    protocol: str
    reachable: bool
    capabilities: list[Capability] = Field(min_length=1)
    desiredState: DeviceState
    reportedState: DeviceState
    updatedAt: datetime


class Binding(StrictModel):
    id: str
    deviceId: str
    endpointId: str
    createdAt: datetime


class Opening(StrictModel):
    id: str
    roomId: str
    connectsToRoomId: str | None = None
    label: str | None = Field(default=None, max_length=80)
    type: Literal["door", "window"]
    wall: Literal["top", "right", "bottom", "left"]
    offset: float = Field(gt=0, lt=1)


class GatewayDocument(StrictModel):
    id: str
    label: str
    status: Literal["online", "connecting", "offline"]
    lastSeenAt: datetime | None = None
    version: str


class HomeDocument(StrictModel):
    id: str
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    homeType: str = Field(default="", max_length=80)
    areaM2: float | None = Field(default=None, gt=0, le=100_000)
    notes: str = Field(default="", max_length=1000)
    revision: int = Field(ge=0)
    floors: list[Floor]
    rooms: list[Room]
    devices: list[Device]
    endpoints: list[DeviceEndpoint]
    bindings: list[Binding]
    openings: list[Opening]
    gateway: GatewayDocument
    updatedAt: datetime

    @model_validator(mode="after")
    def validate_references(self) -> "HomeDocument":
        floor_names = {floor.name for floor in self.floors}
        room_ids = {room.id for room in self.rooms}
        device_ids = {device.id for device in self.devices}
        endpoint_ids = {endpoint.id for endpoint in self.endpoints}
        if any(room.floor not in floor_names for room in self.rooms):
            raise ValueError("Every room must reference an existing floor")
        if any(device.roomId not in room_ids for device in self.devices):
            raise ValueError("Every device must reference an existing room")
        if any(opening.roomId not in room_ids for opening in self.openings):
            raise ValueError("Every opening must reference an existing room")
        if any(
            opening.connectsToRoomId and opening.connectsToRoomId not in room_ids
            for opening in self.openings
        ):
            raise ValueError("Connected openings must reference an existing room")
        if any(
            binding.deviceId not in device_ids or binding.endpointId not in endpoint_ids
            for binding in self.bindings
        ):
            raise ValueError("Every binding must reference an existing device and endpoint")
        return self


class LoginInput(StrictModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class ProfileInput(StrictModel):
    displayName: str | None = Field(default=None, min_length=1, max_length=100)
    currentPassword: str | None = Field(default=None, min_length=8, max_length=256)
    newPassword: str | None = Field(default=None, min_length=12, max_length=256)

    @model_validator(mode="after")
    def password_pair(self) -> "ProfileInput":
        if bool(self.currentPassword) != bool(self.newPassword):
            raise ValueError("Provide both the current and new password")
        if self.displayName is None and self.newPassword is None:
            raise ValueError("Provide a profile change")
        return self


class HomeUpdateInput(StrictModel):
    baseRevision: int = Field(ge=0)
    home: HomeDocument


class GatewayClaimStartInput(StrictModel):
    gatewayName: str = Field(min_length=1, max_length=100)
    agentVersion: str = Field(default="unknown", min_length=1, max_length=40)


class GatewayClaimPollInput(StrictModel):
    deviceCode: str = Field(min_length=32, max_length=256)


class GatewayClaimApproveInput(StrictModel):
    userCode: str = Field(min_length=8, max_length=16)


class GatewayDiscoverInput(StrictModel):
    methods: list[Literal["mdns", "ssdp", "manual", "ble", "matter"]] = Field(
        default_factory=lambda: ["mdns", "ssdp"]
    )
    host: str | None = Field(default=None, max_length=253)

    @model_validator(mode="after")
    def manual_host(self) -> "GatewayDiscoverInput":
        if "manual" in self.methods and not self.host:
            raise ValueError("A local host is required for manual discovery")
        return self
