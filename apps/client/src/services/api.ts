import { toast } from "sonner";
import { createApiService } from "./api-client";

export {
  createApiService,
  extractData,
  type ApiServiceOptions,
  type PublicFixtureDetail,
  type PublicFixtureMetadata,
} from "./api-client";

const apiService = createApiService({
  onError: (message) => {
    toast.error(message);
  },
});

export default apiService;
