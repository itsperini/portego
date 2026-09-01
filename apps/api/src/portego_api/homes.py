from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from .schemas import HomeDocument


def timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def empty_home(name: str = "Casa Portego") -> dict:
    now = timestamp()
    return {
        "id": f"home_{uuid4()}",
        "name": name,
        "description": "",
        "homeType": "",
        "notes": "",
        "revision": 0,
        "floors": [
            {
                "id": f"floor_{uuid4()}",
                "name": "Ground floor",
                "description": "",
                "notes": "",
            }
        ],
        "rooms": [],
        "devices": [],
        "endpoints": [],
        "bindings": [],
        "openings": [],
        "gateway": {
            "id": "gateway_unpaired",
            "label": "No gateway paired",
            "status": "offline",
            "lastSeenAt": None,
            "version": "",
        },
        "updatedAt": now,
    }


def import_home(raw_home: HomeDocument) -> dict:
    document = deepcopy(raw_home.model_dump(mode="json", exclude_none=True))
    document["id"] = f"home_{uuid4()}"
    document["revision"] = 0
    document["endpoints"] = []
    document["bindings"] = []
    document["gateway"] = {
        "id": "gateway_unpaired",
        "label": "No gateway paired",
        "status": "offline",
        "lastSeenAt": None,
        "version": "",
    }
    document["updatedAt"] = timestamp()
    validated = HomeDocument.model_validate(document).model_dump(mode="json", exclude_none=True)
    validated["gateway"]["lastSeenAt"] = None
    return validated


def merge_canvas_update(current: dict, incoming: HomeDocument) -> dict:
    document = incoming.model_dump(mode="json", exclude_none=True)
    document["id"] = current["id"]
    document["endpoints"] = current.get("endpoints", [])
    document["gateway"] = current.get("gateway", document["gateway"])
    valid_endpoint_ids = {endpoint["id"] for endpoint in document["endpoints"]}
    document["bindings"] = [
        binding for binding in document["bindings"] if binding["endpointId"] in valid_endpoint_ids
    ]
    document["updatedAt"] = timestamp()
    validated = HomeDocument.model_validate(document).model_dump(mode="json", exclude_none=True)
    validated["gateway"].setdefault("lastSeenAt", None)
    return validated
