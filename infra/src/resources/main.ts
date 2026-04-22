import "./exports-dns";
import "./exports-workers";
import "./exports-database";
import "./exports-storage";
import { hyperdriveId } from "./exports-database";
import { kvNamespace } from "./exports-storage";

// Outputs consumed by CI to configure wrangler.toml bindings
export const outputs = {
  hyperdriveId,
  kvNamespaceId: kvNamespace.id,
};
