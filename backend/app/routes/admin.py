import re

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import AuditLog, Report, User
from ..services.audit import record_audit

bp = Blueprint("admin", __name__, url_prefix="/api/admin")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def require_admin():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    return user if user and user.role == "admin" else None


@bp.get("/overview")
@jwt_required()
def overview():
    if not require_admin():
        return jsonify(error="Administrator access required."), 403
    return jsonify(
        patients=User.query.filter_by(role="patient").count(),
        laboratory_staff=User.query.filter_by(role="lab").count(),
        reports=Report.query.count(),
        audit_events=AuditLog.query.count(),
    )


@bp.post("/staff")
@jwt_required()
def create_staff():
    admin = require_admin()
    if not admin:
        return jsonify(error="Administrator access required."), 403
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    role = data.get("role", "lab")
    if not name or not EMAIL_RE.match(email) or role not in ("lab", "admin"):
        return jsonify(error="Provide a valid name, email and role (lab or admin)."), 400
    if not isinstance(password, str) or len(password) < 12 or not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return jsonify(error="Staff passwords must be at least 12 characters and contain letters and numbers."), 400
    staff = User(name=name, email=email, role=role)
    staff.set_password(password)
    db.session.add(staff)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(error="An account with that email already exists."), 409
    record_audit("STAFF_ACCOUNT_CREATED", f"Created {role} account: {email}")
    return jsonify(user=staff.to_dict()), 201


@bp.get("/audit-logs")
@jwt_required()
def audit_logs():
    if not require_admin():
        return jsonify(error="Administrator access required."), 403
    limit = min(max(request.args.get("limit", default=100, type=int), 1), 300)
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return jsonify(logs=[entry.to_dict() for entry in logs])


@bp.get("/users")
@jwt_required()
def users():
    if not require_admin():
        return jsonify(error="Administrator access required."), 403
    all_users = User.query.order_by(User.created_at.desc()).limit(300).all()
    return jsonify(users=[u.to_dict() for u in all_users])
