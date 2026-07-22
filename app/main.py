# app/main.py
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app import crud, models, schemas, database

# 1. Create database tables in the SQLite file
models.Base.metadata.create_all(bind=database.engine)

# 2. Initialize FastAPI app
app = FastAPI(title="TechMed API")

# 3. Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://localhost:5175", "http://127.0.0.1:5175", "http://localhost:5177", "http://127.0.0.1:5177"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Routes
@app.post("/victims/", response_model=schemas.Victim)
def create_victim(victim: schemas.VictimCreate, db: Session = Depends(database.get_db)):
    return crud.create_victim(db=db, victim_data=victim)

@app.get("/victims/", response_model=list[schemas.Victim])
def read_victims(db: Session = Depends(database.get_db)):
    return crud.get_all_victims(db)

@app.patch("/victims/{victim_id}/verify/{role}")
def verify_victim(victim_id: int, role: str, db: Session = Depends(database.get_db)):
    if role not in ["hospital", "municipality"]:
        raise HTTPException(status_code=400, detail="Invalid role. Use 'hospital' or 'municipality'.")
    
    updated_victim = crud.verify_case(db=db, victim_id=victim_id, role=role)
    if not updated_victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    
    return updated_victim