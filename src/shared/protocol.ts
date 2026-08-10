/**
 * E2A WebSocket envelope protocol — browser channel.
 *
 * Mirrors the same wire format used by jiuwenswarm-ide and jiuwenswarm-jupyterlab
 * so the server-side agent router requires no changes.
 */

import { CHANNEL_ID } from "./constants";

// ---------------------------------------------------------------------------
// Outbound (browser → server)
// ---------------------------------------------------------------------------

export type OutboundMsgType =
  | "chat"
  | "create_session"
  | "list_sessions"
  | "delete_session"
  | "set_mode"
  | "tool_result"
  | "ping";

export interface OutboundEnvelope {
  type: OutboundMsgType;
  channel_id: typeof CHANNEL_ID;
  session_id?: string;
  payload: Record<string, unknown>;
}

// Chat message sent to agent
export interface ChatPayload {
  message: string;
  /** Aggregated page context injected as assistant context */
  context?: string;
  mode?: string;
}

// Create a new agent session
export interface CreateSessionPayload {
  title: string;
  mode: string;
}

// ---------------------------------------------------------------------------
// Inbound (server → browser)
// ---------------------------------------------------------------------------

export type InboundMsgType =
  | "token"
  | "done"
  | "error"
  | "sessions"
  | "session_created"
  | "tool_call"
  | "pong";

export interface InboundEnvelope {
  type: InboundMsgType;
  session_id?: string;
  payload: Record<string, unknown>;
}

export interface TokenPayload {
  text: string;
}

export interface DonePayload {
  text: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface SessionInfo {
  session_id: string;
  title: string;
  created_at: string;
  mode: string;
}

export interface SessionsPayload {
  sessions: SessionInfo[];
}

export interface SessionCreatedPayload extends SessionInfo {}

export interface ToolCallPayload {
  tool: string;
  args: Record<string, unknown>;
  call_id: string;
}

export interface ToolResultPayload {
  call_id: string;
  result: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeEnvelope(
  type: OutboundMsgType,
  payload: Record<string, unknown>,
  sessionId?: string
): OutboundEnvelope {
  return {
    type,
    channel_id: CHANNEL_ID,
    ...(sessionId ? { session_id: sessionId } : {}),
    payload,
  };
}
