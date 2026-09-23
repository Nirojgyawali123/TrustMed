from sqlalchemy.orm import Session
from backend import models, schemas
from datetime import datetime


def generate_case_id(db: Session) -> str:
    year = datetime.utcnow().year
    count = db.query(models.Victim).count() + 1
    return f"TRUST-{year}-{count:04d}"


def create_victim(db: Session, victim_data: schemas.VictimCreate, account_id: int = None):
    case_id = generate_case_id(db)
    db_victim = models.Victim(
        account_id=account_id,
        case_id=case_id,
        name=victim_data.name,
        phone=victim_data.phone,
        address=victim_data.address,
        disease=victim_data.disease,
        hospital_name=victim_data.hospital_name,
        municipality_name=victim_data.municipality_name,
        estimated_cost=victim_data.estimated_cost,
        bank_name=victim_data.bank_name,
        bank_account_number=victim_data.bank_account_number,
        bank_account_holder=victim_data.bank_account_holder,
        bank_branch=victim_data.bank_branch,
        note_to_donors=victim_data.note_to_donors,
        other_hospital_name=victim_data.other_hospital_name,
        other_hospital_address=victim_data.other_hospital_address,
        other_hospital_contact=victim_data.other_hospital_contact,
    )
    db.add(db_victim)
    db.commit()
    db.refresh(db_victim)

    if victim_data.collectors:
        for c in victim_data.collectors:
            db_collector = models.Collector(
                name=c.name,
                address=c.address,
                relation_to_victim=c.relation_to_victim,
                contact=c.contact,
                citizenship_details=c.citizenship_details,
                victim_id=db_victim.id,
            )
            db.add(db_collector)
        db.commit()
        db.refresh(db_victim)

    log_action(db, "case_submitted", f"account_{account_id}" if account_id else "anonymous", "patient", db_victim.id, "Case submitted")
    return db_victim


def get_all_victims(db: Session):
    return db.query(models.Victim).all()


def get_victim(db: Session, victim_id: int):
    return db.query(models.Victim).filter(models.Victim.id == victim_id).first()


def verify_case(db: Session, victim_id: int, role: str, actor: str = "unknown"):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if victim:
        if role == "hospital":
            victim.hospital_verified = True
            log_action(db, "hospital_verified", actor, "hospital", victim_id, "Hospital approved diagnosis")
        elif role == "municipality":
            victim.muni_verified = True
            log_action(db, "municipality_verified", actor, "municipality", victim_id, "Municipality verified identity")
        db.commit()
        db.refresh(victim)
    return victim


def reject_case(db: Session, victim_id: int, role: str, reason: str = None, actor: str = "unknown"):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if victim:
        victim.rejected = True
        victim.rejection_reason = reason
        victim.rejected_by = role
        if role == "hospital":
            victim.hospital_verified = False
        elif role == "municipality":
            victim.muni_verified = False
        log_action(db, f"{role}_rejected", actor, role, victim_id, f"Rejected: {reason or 'No reason given'}")
        db.commit()
        db.refresh(victim)
    return victim


def create_medical_report(db: Session, victim_id: int, filename: str, original_name: str):
    report = models.MedicalReport(
        victim_id=victim_id,
        filename=filename,
        original_name=original_name,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def update_collector_photo(db: Session, collector_id: int, photo: str):
    collector = db.query(models.Collector).filter(models.Collector.id == collector_id).first()
    if collector:
        collector.photo = photo
        db.commit()
        db.refresh(collector)
    return collector


def log_action(db: Session, action: str, actor: str, actor_role: str, victim_id: int = None, details: str = None):
    log = models.AuditLog(
        action=action,
        actor=actor,
        actor_role=actor_role,
        victim_id=victim_id,
        details=details,
    )
    db.add(log)
    db.commit()
