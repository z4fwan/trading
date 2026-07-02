/**
 * Market status utility.
 * Calculates NSE/BSE active hours in India Standard Time (IST).
 */

export function getISTTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  // IST is UTC + 5:30
  return new Date(utc + (5.5 * 60 * 60 * 1000));
}

export function isMarketClosed(): boolean {
  const istDate = getISTTime();
  const day = istDate.getDay();
  
  // Sunday = 0, Saturday = 6
  if (day === 0 || day === 6) return true;
  
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market hours: 9:15 AM (555 mins) to 3:30 PM (930 mins)
  if (timeInMinutes < 555 || timeInMinutes >= 930) {
    return true;
  }
  
  return false;
}

export function isWeekend(): boolean {
  const istDate = getISTTime();
  const day = istDate.getDay();
  return day === 0 || day === 6;
}
