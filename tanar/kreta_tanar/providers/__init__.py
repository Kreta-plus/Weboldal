"""Melyik adatforrás tartozik a belépett felhasználóhoz."""
from .. import config as C
from .base import NotSupported, Provider  # noqa: F401


def for_user(user):
    if user["inst"] == C.DEMO_INST:
        from .demo import DemoProvider
        return DemoProvider(user["id"])
    from .kreta import KretaProvider
    return KretaProvider(user)
