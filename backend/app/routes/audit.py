from flask import Blueprint, jsonify, request

from ..models import AuditLog
from ..security import role_required


audit_bp = Blueprint("audit", __name__)


@audit_bp.get("")
@role_required("admin")
def list_audit_events():
    query = AuditLog.query
    action = request.args.get("action", "", type=str).strip()
    resource_type = request.args.get("resource_type", "", type=str).strip()
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 25, type=int)))
    results = query.order_by(AuditLog.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({"items": [{
        "id": row.id,
        "actor": {"id": row.actor.id, "email": row.actor.email} if row.actor else None,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "details": row.details,
        "created_at": row.created_at.isoformat(),
    } for row in results.items], "pagination": {"page": results.page, "per_page": results.per_page, "total": results.total, "pages": results.pages}}), 200
