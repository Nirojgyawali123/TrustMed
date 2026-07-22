from pydantic import BaseModel
from typing import Optional

# Collector data validation
class CollectorCreate(BaseModel):
    name: str
    address: str
    relation_to_victim: str
    contact: str

# Victim data validation
class VictimCreate(BaseModel):
    name: str
    address: str
    disease: str
    hospital_name: str
    municipality_name: str
    estimated_cost: float
    collector: CollectorCreate

# Used when returning data to the frontend
class Victim(VictimCreate):
    id: int
    total_collected: float
    hospital_verified: bool
    muni_verified: bool

    class Config:
        from_attributes = True