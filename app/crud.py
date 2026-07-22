from sqlalchemy.orm import Session
from app import models, schemas

def create_victim(db: Session, victim_data: schemas.VictimCreate):
    # Create the victim record
    db_victim = models.Victim(
        name=victim_data.name,
        address=victim_data.address,
        disease=victim_data.disease,
        hospital_name=victim_data.hospital_name,
        municipality_name=victim_data.municipality_name,
        estimated_cost=victim_data.estimated_cost
    )
    db.add(db_victim)
    db.commit()
    db.refresh(db_victim)
    
    # Create the linked collector record
    db_collector = models.Collector(
        name=victim_data.collector.name,
        address=victim_data.collector.address,
        relation_to_victim=victim_data.collector.relation_to_victim,
        contact=victim_data.collector.contact,
        victim_id=db_victim.id
    )
    db.add(db_collector)
    db.commit()
    return db_victim

def get_all_victims(db: Session):
    return db.query(models.Victim).all()

def verify_case(db: Session, victim_id: int, role: str):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if victim:
        if role == "hospital":
            victim.hospital_verified = True
        elif role == "municipality":
            victim.muni_verified = True
        db.commit()
        db.refresh(victim)
    return victim