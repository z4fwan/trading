/** Bandwidth saver — opt-in via RENDER_BANDWIDTH_SAVER=true env var. Defaults OFF for fastest polls. */
export function isRenderBandwidthSaver(): boolean {
  if (process.env.RENDER_BANDWIDTH_SAVER === 'true') return true;
  return false;
}

export function isClientRenderHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('onrender.com');
}

export function shouldSaveBandwidth(): boolean {
  if (typeof window !== 'undefined' && isClientRenderHost()) return true;
  return isRenderBandwidthSaver();
}
