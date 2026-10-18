/**
 * LAN address discovery shared by the launcher (`npm start`) and the Vite
 * `/__tide/lan` endpoint the lobby uses to build phone QR codes.
 *
 * Returns non-internal IPv4 addresses, best guess first: real Wi-Fi/Ethernet
 * and hotspot adapters before virtual ones (WSL, Hyper-V, VirtualBox, VPNs).
 */
import os from 'node:os';

const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|loopback|tailscale|zerotier|vpn|bluetooth/i;

function rank(name, ip) {
  let r = 0;
  if (ip.startsWith('192.168.137.')) r = 0; // Windows Mobile Hotspot (laptop is the hotspot)
  else if (ip.startsWith('192.168.')) r = 1;
  else if (ip.startsWith('10.')) r = 2;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) r = 3;
  else r = 4;
  if (VIRTUAL.test(name)) r += 10;
  return r;
}

/** @returns {string[]} */
export function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push({ ip: ni.address, r: rank(name, ni.address) });
    }
  }
  return out.sort((a, b) => a.r - b.r).map((a) => a.ip);
}
