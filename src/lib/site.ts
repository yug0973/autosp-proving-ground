/**
 * Facts about the pilot that only the owner can give. Until one is filled in, the page says so plainly
 * where it would go ("To confirm"), and nothing is made up in its place. `tests/panels.py` lists every
 * one still open.
 */
interface Site {
  readonly replyFrom: string;
  readonly bookingUrl: string;
}

export const SITE: Site = {
  /** The address replies come from, for the note after sending: for example hello@yourdomain.com. */
  replyFrom: '',
  /** A Cal.com or Calendly link for a 20-minute call, offered once an application is sent. */
  bookingUrl: '',
};
