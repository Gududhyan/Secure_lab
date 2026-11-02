from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..models import User

bp = Blueprint("lab", __name__, url_prefix="/api/lab")


@bp.get("/patients")
@jwt_required()
def search_patients():
    actor = User.query.filter_by(public_id=get_jwt_identity()).first()
    if not actor or actor.role not in ("lab", "admin"):
        return jsonify(error="Not authorised."), 403
    search = str(request.args.get("search", "")).strip()
    query = User.query.filter_by(role="patient", is_active=True)
    if search:
        like = f"%{search}%"
        query = query.filter((User.name.ilike(like)) | (User.email.ilike(like)) | (User.patient_code.ilike(like)))
    patients = query.order_by(User.name.asc()).limit(30).all()
    return jsonify(patients=[{
        "id": p.public_id,
        "name": p.name,
        "email": p.email,
        "patient_code": p.patient_code,
        "has_public_key": bool(p.public_key_pem),
    } for p in patients])
