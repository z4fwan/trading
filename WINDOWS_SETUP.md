# Windows Setup Guide for Python Backend

## Prerequisites

To run the Python backend on Windows, you need to install additional build tools because some Python packages (like `pydantic-core`) require compilation.

## Step 1: Install Visual Studio Build Tools

1. Download **Visual Studio Build Tools** from Microsoft:
   - Visit: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Download the "Build Tools for Visual Studio"

2. Run the installer and select:
   - **"Desktop development with C++"** workload
   - This includes:
     - MSVC v143 - VS 2022 C++ x64/x86 build tools
     - Windows 10/11 SDK
     - C++ CMake tools

3. Complete the installation (this may take 5-10 minutes)

## Step 2: Verify Installation

Open a **new** Command Prompt or PowerShell window and run:

```bash
python -m pip install --upgrade pip
```

## Step 3: Install Python Dependencies

Navigate to the project directory and install dependencies:

```bash
cd backend
python -m pip install -r requirements.txt
```

## Alternative: Use Pre-built Wheels (No Build Tools Required)

If you cannot install Build Tools, you can try installing pre-built wheels:

```bash
# Install Pydantic from pre-built wheel
python -m pip install pydantic --only-binary :all:

# Then install other packages
python -m pip install fastapi uvicorn httpx python-dotenv websockets aiofiles aiosqlite yfinance pandas numpy scikit-learn
```

Note: This may not work for all packages or Python versions.

## Step 4: Verify Backend Installation

Test that the backend can start:

```bash
cd backend
python main.py
```

You should see:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Troubleshooting

### Error: "link.exe not found"
- Solution: Install Visual Studio Build Tools with C++ workload

### Error: "Microsoft Visual C++ 14.0 or greater is required"
- Solution: Same as above - install Build Tools

### Error: "Failed building wheel for pydantic-core"
- Solution: Ensure Build Tools are installed and restart your terminal

### Python version compatibility
- Recommended: Python 3.11 or 3.12
- Python 3.14 may require newer package versions

## Docker Alternative (Recommended for Production)

If you encounter persistent issues with Windows setup, use Docker:

```bash
# Build and run with Docker
docker build -t trading-dashboard .
docker run -p 7860:7860 trading-dashboard
```

The Docker container includes all necessary dependencies and build tools.

## Quick Start Summary

1. Install Visual Studio Build Tools with C++ workload
2. Open a new terminal
3. Run: `python -m pip install -r backend/requirements.txt`
4. Run: `cd backend && python main.py`

That's it! Your Python backend should now be ready to use.