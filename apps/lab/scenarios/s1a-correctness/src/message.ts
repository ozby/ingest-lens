/**
 * Message schema for scenario s1a-correctness.
 * { msg_id, seq, session_id, payload } — seq is ground truth for ordering.
 */

export interface Message {
  msg_id: string;
  seq: number;
  session_id: string;
  payload: string; // 64-char deterministic string
}
