@echo off
echo ========================================================
echo Starting Quantum Alpha V3 (Python ML Backend)
echo ========================================================

cd backend

echo [1/2] Installing requirements...
pip install -r requirements.txt

echo [2/2] Booting FastAPI ML Engine...
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
