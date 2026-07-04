"""
NSE/BSE Corporate Announcements Poller Engine
Polls exchanges every 3-5 seconds during market hours
Deduplicates via Redis and extracts PDF text via pdfplumber
"""

import httpx
import asyncio
import json
import os
import re
import tempfile
import hashlib
from datetime import datetime, timedelta
from typing import AsyncGenerator, Dict, List, Set, Optional

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import redis.asyncio as redis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

class AnnouncementPoller:
    """Polls NSE and BSE for corporate announcements"""
    
    def __init__(self):
        # BSE client (Direct REST, no stealth needed)
        self.bse_client = httpx.AsyncClient(
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json, text/plain, */*",
            },
            timeout=30.0,
        )
        
        self.seen_ids_memory: Set[str] = set()
        self.redis_client = None
        self.redis_connected = False
        
        self.nse_base = "https://www.nseindia.com"
        self.bse_base = "https://api.bseindia.com/BseIndiaAPI/api"
        
        self.playwright = None
        self.browser = None
        self.context = None
        
        # Stats
        self.nse_count = 0
        self.bse_count = 0
        self.error_count = 0
    
    async def init_redis(self):
        """Initialize Redis connection for deduplication"""
        if HAS_REDIS:
            try:
                self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
                await self.redis_client.ping()
                self.redis_connected = True
                print("Redis connected successfully for deduplication.")
            except Exception as e:
                print(f"Redis connection failed, falling back to in-memory deduplication: {e}")
                self.redis_connected = False
    
    async def is_duplicate(self, uid: str) -> bool:
        """Check if an announcement ID is already seen"""
        if self.redis_connected:
            try:
                exists = await self.redis_client.exists(f"ann:{uid}")
                if not exists:
                    # Set with 7 days TTL (604800 seconds)
                    await self.redis_client.setex(f"ann:{uid}", 604800, "1")
                    return False
                return True
            except Exception:
                self.redis_connected = False
                
        # Fallback to in-memory
        if uid in self.seen_ids_memory:
            return True
        self.seen_ids_memory.add(uid)
        
        # Keep memory size manageable
        if len(self.seen_ids_memory) > 10000:
            self.seen_ids_memory.clear()
            self.seen_ids_memory.add(uid)
            
        return False
        
    async def init_browser(self):
        """Initialize Playwright browser for NSE stealth polling"""
        if not HAS_PLAYWRIGHT:
            print("Playwright not installed. NSE polling will fail.")
            return False
            
        if self.browser:
            return True
            
        try:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=True)
            self.context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080},
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
                }
            )
            
            # Hit homepage to get cookies
            page = await self.context.new_page()
            
            try:
                # Optional stealth mode if playwright-stealth is installed
                from playwright_stealth import stealth_async
                await stealth_async(page)
            except ImportError:
                pass
                
            print("Initializing NSE session via Playwright...")
            await page.goto(self.nse_base, timeout=60000)
            await asyncio.sleep(2)  # Wait for Cloudflare validation
            await page.close()
            return True
        except Exception as e:
            print(f"Failed to initialize Playwright browser: {e}")
            if self.browser:
                await self.browser.close()
                self.browser = None
            return False
            
    async def extract_pdf_text(self, pdf_url: str) -> str:
        """Download PDF and extract text using pdfplumber"""
        if not pdf_url or not HAS_PDFPLUMBER:
            return ""
            
        try:
            # Add base URL if relative
            if pdf_url.startswith('/'):
                pdf_url = f"https://www.bseindia.com{pdf_url}"
                
            # Download PDF
            async with httpx.AsyncClient(verify=False) as client:
                response = await client.get(pdf_url, timeout=30.0)
                if response.status_code != 200:
                    return ""
                    
            # Save to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name
                
            # Extract text
            text_content = []
            try:
                with pdfplumber.open(tmp_path) as pdf:
                    # Only read first 5 pages to save time/memory
                    for i, page in enumerate(pdf.pages[:5]):
                        page_text = page.extract_text()
                        if page_text:
                            text_content.append(page_text)
            finally:
                os.unlink(tmp_path)
                
            return "\n".join(text_content)
        except Exception as e:
            print(f"PDF extraction error for {pdf_url}: {e}")
            return ""

    def _generate_id(self, source: str, symbol: str, headline: str, timestamp: str) -> str:
        """Generate a unique ID for deduplication"""
        raw = f"{source}_{symbol}_{headline}_{timestamp}"
        return hashlib.md5(raw.encode()).hexdigest()

    async def normalize_nse(self, item: Dict) -> Dict:
        """Normalize NSE announcement to standard format"""
        symbol = item.get("symbol", item.get("symbolName", item.get("security", "")))
        symbol = re.sub(r'\.EQ$', '', symbol)
        
        headline = item.get("headline", item.get("subject", item.get("description", "")))
        timestamp = item.get("date", item.get("datetime", item.get("timestamp", "")))
        category = item.get("category", item.get("announcementType", "General"))
        attachment_url = item.get("pdfUrl", item.get("attachmentUrl", ""))
        
        uid = self._generate_id("NSE", symbol, headline, timestamp)
        
        # Extract full text if PDF is available
        full_text = ""
        if attachment_url:
            full_text = await self.extract_pdf_text(attachment_url)
            
        return {
            "id": uid,
            "symbol": symbol.upper(),
            "company": item.get("companyName", symbol),
            "headline": headline,
            "full_text": full_text,
            "category": category,
            "timestamp": timestamp,
            "attachment_url": attachment_url,
            "source": "NSE",
            "exchange": "NSE",
            "raw_data": item,
        }
    
    async def normalize_bse(self, item: Dict) -> Dict:
        """Normalize BSE announcement to standard format"""
        scrip_code = str(item.get("scripCode", ""))
        scrip_name = item.get("scripName", "")
        headline = item.get("description", item.get("subject", ""))
        category = item.get("category", "General")
        timestamp = item.get("dt", item.get("date", ""))
        attachment_url = item.get("attachUrl", "")
        
        full_pdf_url = f"https://www.bseindia.com/xml-data/corpfiling/AttachHis/{attachment_url}" if attachment_url else ""
        
        uid = self._generate_id("BSE", scrip_code, headline, timestamp)
        
        full_text = ""
        if full_pdf_url:
            full_text = await self.extract_pdf_text(full_pdf_url)
            
        return {
            "id": uid,
            "symbol": scrip_name.upper().replace(" ", ""),
            "scrip_code": scrip_code,
            "company": scrip_name,
            "headline": headline,
            "full_text": full_text,
            "category": category,
            "timestamp": timestamp,
            "attachment_url": full_pdf_url,
            "source": "BSE",
            "exchange": "BSE",
            "raw_data": item,
        }
    
    async def poll_nse(self) -> AsyncGenerator[Dict, None]:
        """Poll NSE via Playwright"""
        # Check if browser/context is still valid
        if not self.browser or not self.context:
            if not await self.init_browser():
                return
                
        # Verify browser is still running
        try:
            if not self.browser.is_connected():
                print("Browser disconnected, reinitializing...")
                self.browser = None
                self.context = None
                if not await self.init_browser():
                    return
        except Exception:
            self.browser = None
            self.context = None
            if not await self.init_browser():
                return
                
        try:
            page = await self.context.new_page()
            url = f"{self.nse_base}/api/home-corporate-announcements?index=homepage"
            
            response = await page.goto(url, timeout=30000)
            if response and response.ok:
                content = await page.content()
                # Parse JSON from pre tag or directly
                json_match = re.search(r'\{.*\}|\[.*\]', content, re.DOTALL)
                if json_match:
                    try:
                        data = json.loads(json_match.group(0))
                        items = data if isinstance(data, list) else data.get("data", [])
                        
                        for item in items:
                            symbol = item.get("symbol", "")
                            headline = item.get("headline", item.get("subject", ""))
                            timestamp = item.get("date", "")
                            uid = self._generate_id("NSE", symbol, headline, timestamp)
                            
                            if not await self.is_duplicate(uid):
                                normalized = await self.normalize_nse(item)
                                self.nse_count += 1
                                yield normalized
                    except json.JSONDecodeError:
                        print("Failed to parse NSE JSON")
            
            await page.close()
            self.error_count = 0
            
        except Exception as e:
            error_msg = str(e)
            print(f"NSE poll error: {error_msg}")
            self.error_count += 1
            
            # Check if browser was closed
            if "has been closed" in error_msg or "Target page" in error_msg:
                print("Browser context closed, forcing reinitialization...")
                try:
                    await self.browser.close()
                except Exception:
                    pass
                self.browser = None
                self.context = None
            
            # Exponential backoff
            backoff_time = min(60, 2 ** min(5, self.error_count))
            print(f"Backing off NSE poller for {backoff_time}s...")
            await asyncio.sleep(backoff_time)
            
            # Recreate browser on persistent errors
            if self.error_count > 3 and self.browser:
                try:
                    await self.browser.close()
                except Exception:
                    pass
                self.browser = None
                self.context = None
    
    async def poll_bse(self) -> AsyncGenerator[Dict, None]:
        """Poll BSE via REST API"""
        try:
            today = datetime.now().strftime("%Y%m%d")
            
            response = await self.bse_client.get(
                f"{self.bse_base}/AnnGetData/w",
                params={
                    "strCat": "-1",
                    "strPrevDate": today,
                    "strSearch": "P",
                    "strToDate": today,
                    "strType": "C"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data if isinstance(data, list) else data.get("Table", [])
                
                for item in items:
                    scrip_code = str(item.get("scripCode", ""))
                    headline = item.get("description", "")
                    timestamp = item.get("dt", "")
                    uid = self._generate_id("BSE", scrip_code, headline, timestamp)
                    
                    if not await self.is_duplicate(uid):
                        normalized = await self.normalize_bse(item)
                        self.bse_count += 1
                        yield normalized
                        
            self.error_count = 0
        except Exception as e:
            print(f"BSE poll error: {e}")
            self.error_count += 1
            backoff_time = min(15, 2 ** min(4, self.error_count))
            await asyncio.sleep(backoff_time)
    
    def get_poll_interval(self) -> int:
        """Get poll interval based on market hours"""
        now = datetime.now()
        hour, minute = now.hour, now.minute
        total_minutes = hour * 60 + minute
        
        market_open = 9 * 60 + 15
        market_close = 15 * 60 + 30
        
        if market_open <= total_minutes <= market_close:
            return 2  # 2 seconds during market hours for ultra-low latency
        else:
            return 30  # 30 seconds outside market hours
    
    async def run(self, callback) -> None:
        """Run the poller continuously"""
        print("Starting advanced announcement poller...")
        await self.init_redis()
        await self.init_browser()
        
        while True:
            try:
                interval = self.get_poll_interval()
                
                # Poll both concurrently
                async def consume_nse():
                    async for item in self.poll_nse():
                        await callback(item)
                
                async def consume_bse():
                    async for item in self.poll_bse():
                        await callback(item)
                        
                await asyncio.gather(consume_nse(), consume_bse())
                
                await asyncio.sleep(interval)
            except Exception as e:
                print(f"Poller run error: {e}")
                await asyncio.sleep(interval)
                
    def get_stats(self) -> Dict:
        return {
            "nse_announcements": self.nse_count,
            "bse_announcements": self.bse_count,
            "redis_connected": self.redis_connected,
            "error_count": self.error_count,
        }