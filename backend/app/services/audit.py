from flask import request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from ..extensions import db
from ..models import AuditLog, User


def record_audit(action: str, details: str = "", resource_id: str | None = None, actor_user: User | None = None) -> None:
    actor = actor_user
    if actor is None:
        # Unauthenticated routes (login, register) have no JWT context, so verify optionally first.
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        actor = User.query.filter_by(public_id=identity).first() if identity else None
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        resource_id=resource_id,
        details=(details or "")[:500],
        ip_address=(request.remote_addr or "")[:64],
    )
    db.session.add(entry)
    db.session.commit()
