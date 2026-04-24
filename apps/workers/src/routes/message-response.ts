import { messages } from "../db/schema";

export type DbMessage = typeof messages.$inferSelect;
export type SerializedMessage = Omit<DbMessage, "seq"> & { seq: string };

export function serializeMessage(message: DbMessage): SerializedMessage {
  return {
    ...message,
    seq: String(message.seq),
  };
}

export function serializeMessages(records: readonly DbMessage[]): SerializedMessage[] {
  return records.map(serializeMessage);
}
