import { Connection } from "watchman-client-json"
import { BserConnection } from "./BserConnection.js"

export { Delivery, SubscriptionCanceled, QueryReply, ConfigReply, type Reply } from "watchman-client-json"

type ClientOptions = ConstructorParameters<typeof Connection>[0]

export interface ConnectionOptions extends ClientOptions {
  /** JSON is the default. BSER v1 currently decodes invalid UTF-8 lossily. */
  readonly wireFormat?: "json" | "bser"
  readonly cleanupTimeoutMs?: number
  readonly maxBufferedEvents?: number
}

/** The public methods of the extracted client, without its private implementation. */
export type WireConnection = Pick<Connection, keyof Connection>

export function makeConnection(options: ConnectionOptions, onFailure?: (error: Error) => void): WireConnection {
  if (options.wireFormat !== undefined && options.wireFormat !== "json" && options.wireFormat !== "bser") {
    throw new Error("Watchman wireFormat must be json or bser")
  }
  return options.wireFormat === "bser" ? new BserConnection(options, onFailure) : new Connection(options, onFailure)
}
