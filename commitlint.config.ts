import { SCOPES } from "./scripts/commitlint-scopes";

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", SCOPES],
    "subject-case": [0],
    "body-max-line-length": [0],
  },
};
