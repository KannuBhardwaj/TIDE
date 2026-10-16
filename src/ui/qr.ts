import QRCode from 'qrcode';

/** render a QR code to a data URL (dark modules on pearl, for a light tile). */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#04141A', light: '#EAF6F2' },
  });
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars

export function makeRoomCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
