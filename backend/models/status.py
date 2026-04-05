from dataclasses import asdict, dataclass


@dataclass
class ServiceStatus:
    service: str
    status: str

    def to_dict(self) -> dict:
        return asdict(self)

