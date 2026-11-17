/**
 * SDPNegotiator: presents an SDP offer as copyable text and a scannable QR data URL.
 * No signaling server; transfer is manual.
 */
import QRCode from 'qrcode';

export class SDPNegotiator {
  private readonly sdp: string;

  constructor(sdp: string) {
    this.sdp = sdp.trim();
  }

  /** Plain text for a monospace, copyable textarea (LF line endings, as textareas normalize). */
  getOfferText(): string {
    return this.sdp.replace(/\r\n/g, '\n');
  }

  /** PNG data URL of a QR code encoding the offer text. */
  getOfferQRDataURL(): Promise<string> {
    return QRCode.toDataURL(this.getOfferText(), {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: 320,
      color: { dark: '#e2e8f0', light: '#060810' },
    });
  }
}
