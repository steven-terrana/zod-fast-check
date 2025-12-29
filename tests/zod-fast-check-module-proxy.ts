// Zod 3 implementation
export {
  ZodFastCheck,
  ZodFastCheckError,
  ZodFastCheckGenerationError,
  ZodFastCheckUnsupportedSchemaError,
} from "../src/zod-fast-check";

// Zod 4 implementation (re-export with Zod4 prefix for test compatibility)
export {
  ZodFastCheck as Zod4FastCheck,
  ZodFastCheckError as Zod4FastCheckError,
  ZodFastCheckGenerationError as Zod4FastCheckGenerationError,
  ZodFastCheckUnsupportedSchemaError as Zod4FastCheckUnsupportedSchemaError,
} from "../src/zod4-fast-check";
