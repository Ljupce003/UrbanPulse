from backend.models import ServiceStatus


def get_status_payload() -> dict:
    status = ServiceStatus(service="api", status="ok")
    return status.to_dict()

