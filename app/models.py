# app/models.py
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base 

class Victim(Base):
    __tablename__ = "victims"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    disease = Column(String, nullable=False)
    hospital_name = Column(String, nullable=False)
    municipality_name = Column(String, nullable=False)
    estimated_cost = Column(Float, nullable=False)
    total_collected = Column(Float, default=0.0)
    
    # Verification Flags
    hospital_verified = Column(Boolean, default=False)
    muni_verified = Column(Boolean, default=False)
    
    # Relationship to the collector
    # uselist=False makes this a one-to-one relationship
    collector = relationship("Collector", back_populates="victim", uselist=False)

class Collector(Base):
    __tablename__ = "collectors"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    relation_to_victim = Column(String, nullable=False)
    contact = Column(String, nullable=False)
    
    # Links this collector to a specific victim
    victim_id = Column(Integer, ForeignKey("victims.id"))
    victim = relationship("Victim", back_populates="collector")