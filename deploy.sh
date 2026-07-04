#!/bin/bash
# Automated Deployment Script for Trading AI Dashboard
# This script sets up and runs the entire system automatically

set -e

echo "🚀 Starting Automated Trading AI Dashboard Setup..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_error "Please do not run as root. Run as regular user with sudo privileges."
    exit 1
fi

# 1. System Updates
print_warning "Updating system packages..."
sudo apt update && sudo apt upgrade -y
print_success "System updated"

# 2. Install Python and dependencies
print_warning "Installing Python and dependencies..."
sudo apt install -y python3 python3-pip python3-venv git curl wget
print_success "Python installed"

# 3. Install Node.js
print_warning "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
print_success "Node.js installed"

# 4. Install Redis (optional but recommended)
print_warning "Installing Redis..."
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
print_success "Redis installed and running"

# 5. Install Playwright for NSE polling
print_warning "Installing Playwright..."
pip3 install playwright
playwright install chromium
print_success "Playwright installed"

# 6. Install Ollama for LLM
print_warning "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
print_success "Ollama installed"

# 7. Start Ollama service
print_warning "Setting up Ollama service..."
sudo systemctl enable ollama
sudo systemctl start ollama

# Wait for Ollama to start
sleep 5

# Pull the model
print_warning "Pulling Llama 3.1 8B model (this may take 10-20 minutes)..."
ollama pull llama3.1:8b
print_success "LLM model ready"

# 8. Install Python dependencies
print_warning "Installing Python packages..."
cd backend
pip3 install -r requirements.txt
cd ..
print_success "Python packages installed"

# 9. Install Node.js dependencies
print_warning "Installing Node.js packages..."
npm install
print_success "Node.js packages installed"

# 10. Create .env file if not exists
if [ ! -f .env ]; then
    print_warning "Creating .env file..."
    cp .env.example .env
    echo "" >> .env
    echo "# Add your Telegram credentials below:" >> .env
    echo "TELEGRAM_BOT_TOKEN=your_bot_token_here" >> .env
    echo "TELEGRAM_CHAT_ID=your_chat_id_here" >> .env
    echo "" >> .env
    echo "⚠️  Please edit .env and add your Telegram Bot Token and Chat ID" >> .env
    echo "   Get token from @BotFather, chat ID from @userinfobot" >> .env
fi

# 11. Build Next.js frontend
print_warning "Building frontend..."
npm run build
print_success "Frontend built"

# 12. Create systemd service files
print_warning "Creating systemd services..."

# Backend service
sudo tee /etc/systemd/system/trading-backend.service > /dev/null <<EOF
[Unit]
Description=Trading AI Backend
After=network.target redis.service ollama.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
Environment="PATH=/usr/bin:/usr/local/bin:$PATH"
ExecStart=$(which python3) backend/main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=trading-backend

[Install]
WantedBy=multi-user.target
EOF

# Frontend service
sudo tee /etc/systemd/system/trading-frontend.service > /dev/null <<EOF
[Unit]
Description=Trading AI Frontend
After=network.target trading-backend.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
Environment="PATH=/usr/bin:/usr/local/bin:$PATH"
Environment="NODE_ENV=production"
ExecStart=$(which npm) start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=trading-frontend

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable trading-backend
sudo systemctl enable trading-frontend

print_success "Systemd services created"

# 13. Start services
print_warning "Starting services..."
sudo systemctl start trading-backend
sudo systemctl start trading-frontend
print_success "Services started"

# 14. Wait for services to be ready
sleep 10

# 15. Check service status
echo ""
print_success "=== Service Status ==="
sudo systemctl status trading-backend --no-pager -l
echo ""
sudo systemctl status trading-frontend --no-pager -l

# 16. Final instructions
echo ""
echo "=============================================="
echo "          SETUP COMPLETE! 🎉"
echo "=============================================="
echo ""
echo "📌 IMPORTANT: Configure Telegram"
echo "   1. Edit .env file"
echo "   2. Add TELEGRAM_BOT_TOKEN from @BotFather"
echo "   3. Add TELEGRAM_CHAT_ID from @userinfobot"
echo "   4. Restart services: sudo systemctl restart trading-backend"
echo ""
echo "🌐 Access Points:"
echo "   • Frontend: http://localhost:3000"
echo "   • Backend API: http://localhost:8000"
echo "   • API Docs: http://localhost:8000/docs"
echo ""
echo "🔧 Management Commands:"
echo "   • Check status: sudo systemctl status trading-backend"
echo "   • View logs: sudo journalctl -u trading-backend -f"
echo "   • Restart: sudo systemctl restart trading-backend"
echo "   • Stop: sudo systemctl stop trading-backend"
echo ""
echo "✅ System is running 24/7 automatically!"
echo ""