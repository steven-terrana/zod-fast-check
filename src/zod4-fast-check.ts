import fc, { Arbitrary } from "fast-check";
import type { input, output, ZodType as ZodSchema } from "zod4";

// Zod 4 type discriminator values
type Zod4Type =
  | "string"
  | "number"
  | "int"
  | "boolean"
  | "bigint"
  | "symbol"
  | "null"
  | "undefined"
  | "void"
  | "never"
  | "any"
  | "unknown"
  | "date"
  | "object"
  | "record"
  | "file"
  | "array"
  | "tuple"
  | "union"
  | "xor"
  | "intersection"
  | "map"
  | "set"
  | "enum"
  | "literal"
  | "nullable"
  | "optional"
  | "nonoptional"
  | "success"
  | "transform"
  | "default"
  | "prefault"
  | "catch"
  | "nan"
  | "pipe"
  | "readonly"
  | "template_literal"
  | "promise"
  | "lazy"
  | "function"
  | "custom";

// Type definitions for Zod 4 internal structures
interface Zod4Def {
  type: Zod4Type;
  // Array
  element?: any;
  // Object
  shape?: Record<string, any>;
  catchall?: any;
  // Union
  options?: any[];
  discriminator?: string;
  // Tuple
  items?: any[];
  rest?: any;
  // Record
  keyType?: any;
  valueType?: any;
  // Wrapper types (optional, nullable, default, catch, readonly, pipe, nonoptional, prefault)
  innerType?: any;
  // Pipe
  in?: any;
  out?: any;
  // Literal
  values?: any[];
  // Enum
  entries?: Record<string, string | number>;
  // Default
  defaultValue?: any;
  // Function
  input?: any;
  output?: any;
  // Checks (still present for some operations)
  checks?: any[];
}

interface Zod4Internals {
  def: Zod4Def;
  bag: {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    format?: string;
    patterns?: Set<RegExp>;
  };
}

interface Zod4Schema {
  _def: Zod4Def;
  _zod: Zod4Internals;
  _input: unknown;
  _output: unknown;
  safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: unknown };
  unwrap?: () => Zod4Schema;
}

const MIN_SUCCESS_RATE = 0.01;
const ZOD_EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

type UnknownZodSchema = Zod4Schema;

type SchemaToArbitrary = (
  schema: Zod4Schema,
  path: string
) => Arbitrary<unknown>;

type ArbitraryBuilder = (
  schema: Zod4Schema,
  path: string,
  recurse: SchemaToArbitrary
) => Arbitrary<unknown>;

type ArbitraryBuilders = {
  [K in Zod4Type]?: ArbitraryBuilder;
};

const SCALAR_TYPES = new Set<Zod4Type>([
  "string",
  "number",
  "int",
  "bigint",
  "boolean",
  "date",
  "undefined",
  "null",
  "literal",
  "enum",
  "any",
  "unknown",
  "void",
  "nan",
  "symbol",
]);

type OverrideArbitrary<Input = unknown> =
  | Arbitrary<Input>
  | ((zfc: ZodFastCheck) => Arbitrary<Input>);

class _ZodFastCheck {
  private overrides = new Map<Zod4Schema, OverrideArbitrary>();

  private clone(): ZodFastCheck {
    const cloned = new _ZodFastCheck();
    this.overrides.forEach((arbitrary, schema) => {
      cloned.overrides.set(schema, arbitrary);
    });
    return cloned;
  }

  /**
   * Creates an arbitrary which will generate valid inputs to the schema.
   */
  inputOf<Schema extends ZodSchema<any, any>>(
    schema: Schema
  ): Arbitrary<input<Schema>> {
    return this.inputWithPath(schema as unknown as Zod4Schema, "") as Arbitrary<input<Schema>>;
  }

  private inputWithPath(
    schema: Zod4Schema,
    path: string
  ): Arbitrary<unknown> {
    const override = this.findOverride(schema);

    if (override) {
      return override;
    }

    const typeName = schema._def.type;
    const builder = arbitraryBuilders[typeName];

    if (builder) {
      return builder(schema, path, this.inputWithPath.bind(this));
    }

    unsupported(`'${typeName}'`, path);
  }

  /**
   * Creates an arbitrary which will generate valid parsed outputs of
   * the schema.
   */
  outputOf<Schema extends ZodSchema<any, any>>(
    schema: Schema
  ): Arbitrary<output<Schema>> {
    const zod4Schema = schema as unknown as Zod4Schema;
    let inputArbitrary = this.inputOf(schema);

    // For scalar types, the input is always the same as the output,
    // so we can just use the input arbitrary unchanged.
    if (SCALAR_TYPES.has(zod4Schema._def.type)) {
      return inputArbitrary as Arbitrary<any>;
    }

    return inputArbitrary
      .map((value) => zod4Schema.safeParse(value))
      .filter(
        throwIfSuccessRateBelow(
          MIN_SUCCESS_RATE,
          isUnionMember({ success: true }),
          ""
        )
      )
      .map((parsed) => parsed.data) as Arbitrary<output<Schema>>;
  }

  private findOverride(
    schema: Zod4Schema
  ): Arbitrary<unknown> | null {
    const override = this.overrides.get(schema);

    if (override) {
      return (
        typeof override === "function" ? override(this) : override
      ) as Arbitrary<unknown>;
    }

    return null;
  }

  /**
   * Returns a new `ZodFastCheck` instance which will use the provided
   * arbitrary when generating inputs for the given schema.
   */
  override<Schema extends ZodSchema<any, any>>(
    schema: Schema,
    arbitrary: OverrideArbitrary<input<Schema>>
  ): ZodFastCheck {
    const withOverride = this.clone();
    withOverride.overrides.set(schema as unknown as Zod4Schema, arbitrary);
    return withOverride;
  }
}

export type ZodFastCheck = _ZodFastCheck;

// Wrapper function to allow instantiation without "new"
export function ZodFastCheck(): ZodFastCheck {
  return new _ZodFastCheck();
}

// Reassign the wrapper function's prototype to ensure
// "instanceof" works as expected.
ZodFastCheck.prototype = _ZodFastCheck.prototype;

const arbitraryBuilders: ArbitraryBuilders = {
  // String type - uses _zod.bag for constraints, format for string formats
  string(schema: Zod4Schema, path: string) {
    const bag = schema._zod?.bag ?? {};
    const format = bag.format;

    // Handle special string formats
    if (format === "email") {
      return fc.emailAddress().filter((email) => ZOD_EMAIL_REGEX.test(email));
    }
    if (format === "uuid") {
      return fc.uuid();
    }
    if (format === "url") {
      return fc.webUrl();
    }
    if (format === "cuid") {
      return createCuidArb();
    }
    if (format === "cuid2") {
      // cuid2 is 24 characters of lowercase alphanumeric
      return fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 24, maxLength: 24 });
    }
    if (format === "datetime") {
      return createDatetimeStringArb(schema);
    }
    if (format === "ulid") {
      return createUlidArb();
    }
    if (format === "nanoid") {
      return createNanoidArb();
    }
    if (format === "guid") {
      // GUID is just a UUID alias
      return fc.uuid();
    }
    if (format === "xid") {
      return createXidArb();
    }
    if (format === "ksuid") {
      return createKsuidArb();
    }
    if (format === "ipv4") {
      return fc.ipV4();
    }
    if (format === "ipv6") {
      return fc.ipV6();
    }
    if (format === "cidrv4") {
      return createCidrV4Arb();
    }
    if (format === "cidrv6") {
      return createCidrV6Arb();
    }
    if (format === "mac") {
      return createMacArb();
    }
    if (format === "e164") {
      return createE164Arb();
    }
    if (format === "base64") {
      return fc.base64String();
    }
    if (format === "base64url") {
      return createBase64UrlArb();
    }
    if (format === "jwt") {
      return createJwtArb();
    }
    if (format === "hex") {
      return fc.hexaString();
    }
    if (format === "emoji") {
      return createEmojiArb();
    }
    if (format === "hostname") {
      return createHostnameArb();
    }
    // ISO namespace formats
    if (format === "date") {
      return createIsoDateArb();
    }
    if (format === "time") {
      return createIsoTimeArb(schema);
    }
    if (format === "duration") {
      return createIsoDurationArb();
    }

    // Get min/max from bag (Zod 4 style)
    let minLength = bag.minimum ?? 0;
    let maxLength = bag.maximum ?? null;

    // Check for checks array for startsWith/endsWith/regex
    const checks = schema._def.checks ?? [];
    const mappings: Array<(s: string) => string> = [];
    let hasUnsupportedCheck = false;

    for (const check of checks) {
      const checkDef = check._zod?.def ?? check;
      const checkType = checkDef.check;
      const checkFormat = checkDef.format;

      // In Zod 4, startsWith/endsWith are string_format checks with format property
      if (checkType === "string_format") {
        if (checkFormat === "starts_with" && checkDef.prefix) {
          mappings.push((s) => checkDef.prefix + s);
        } else if (checkFormat === "ends_with" && checkDef.suffix) {
          mappings.push((s) => s + checkDef.suffix);
        } else if (checkFormat === "regex" || checkFormat === "includes") {
          hasUnsupportedCheck = true;
        }
        // Other string_format checks (trim, lowercase, uppercase) don't need special handling for inputs
      } else if (checkType === "custom") {
        // Custom refinements need filtering
        hasUnsupportedCheck = true;
      }
    }

    if (maxLength === null) maxLength = 2 * minLength + 10;

    let unfiltered = fc.string({
      minLength,
      maxLength,
    });

    for (let mapping of mappings) {
      unfiltered = unfiltered.map(mapping);
    }

    if (hasUnsupportedCheck) {
      return filterArbitraryBySchema(unfiltered, schema, path);
    } else {
      return unfiltered;
    }
  },

  // Number type - uses _zod.bag for constraints
  // Note: Zod 4 does not accept Infinity/NaN by default
  number(schema: Zod4Schema, path: string) {
    const bag = schema._zod?.bag ?? {};

    let min = bag.minimum ?? bag.exclusiveMinimum ?? Number.MIN_SAFE_INTEGER;
    let max = bag.maximum ?? bag.exclusiveMaximum ?? Number.MAX_SAFE_INTEGER;

    // Handle exclusive bounds
    if (bag.exclusiveMinimum !== undefined && bag.minimum === undefined) {
      min = bag.exclusiveMinimum + 0.001;
    }
    if (bag.exclusiveMaximum !== undefined && bag.maximum === undefined) {
      max = bag.exclusiveMaximum - 0.001;
    }

    // Check if it's an integer type (format: 'safeint' or 'int')
    const format = bag.format;
    const isInt = format === 'safeint' || format === 'int';

    // Collect all multipleOf constraints from checks array
    const checks = schema._def.checks ?? [];
    const multipleOfs: number[] = [];
    for (const check of checks) {
      const checkDef = check._zod?.def ?? check;
      if (checkDef.check === 'multiple_of' && typeof checkDef.value === 'number') {
        multipleOfs.push(checkDef.value);
      }
    }
    // Also include bag.multipleOf if present
    if (bag.multipleOf !== undefined) {
      if (!multipleOfs.includes(bag.multipleOf)) {
        multipleOfs.unshift(bag.multipleOf);
      }
    }

    // Check for custom refinements
    const hasCustomRefinement = checks.some((c: any) => {
      const checkDef = c._zod?.def ?? c;
      return checkDef.check === 'custom';
    });

    if (multipleOfs.length > 0) {
      // Compute LCM of all multipleOf values
      const factor = multipleOfs.reduce((a, b) => lcm(a, b));
      let arb = fc
        .integer({
          min: Math.ceil(min / factor),
          max: Math.floor(max / factor),
        })
        .map((x) => x * factor);

      if (hasCustomRefinement) {
        return filterArbitraryBySchema(arb, schema, path);
      }
      return arb;
    } else if (isInt) {
      // Generate integers for safeint format
      let arb = fc.integer({
        min: Math.ceil(min),
        max: Math.floor(max),
      });
      if (hasCustomRefinement) {
        return filterArbitraryBySchema(arb, schema, path);
      }
      return arb;
    } else {
      // Zod 4 does not accept Infinity by default
      let arb = fc.double({
        min,
        max,
        noNaN: true,
        noDefaultInfinity: true,
      });
      if (hasCustomRefinement) {
        return filterArbitraryBySchema(arb, schema, path);
      }
      return arb;
    }
  },

  // Int type (new in Zod 4)
  int(schema: Zod4Schema) {
    const bag = schema._zod?.bag ?? {};

    let min = Math.ceil(bag.minimum ?? bag.exclusiveMinimum ?? Number.MIN_SAFE_INTEGER);
    let max = Math.floor(bag.maximum ?? bag.exclusiveMaximum ?? Number.MAX_SAFE_INTEGER);

    // Handle exclusive bounds
    if (bag.exclusiveMinimum !== undefined && bag.minimum === undefined) {
      min = Math.ceil(bag.exclusiveMinimum) + 1;
    }
    if (bag.exclusiveMaximum !== undefined && bag.maximum === undefined) {
      max = Math.floor(bag.exclusiveMaximum) - 1;
    }

    return fc.integer({ min, max });
  },

  bigint(schema: Zod4Schema) {
    const bag = schema._zod?.bag ?? {};

    // Handle min/max constraints from bag
    let min: bigint | undefined = undefined;
    let max: bigint | undefined = undefined;

    if (bag.minimum !== undefined) {
      min = BigInt(bag.minimum);
    }
    if (bag.maximum !== undefined) {
      max = BigInt(bag.maximum);
    }
    if (bag.exclusiveMinimum !== undefined) {
      min = BigInt(bag.exclusiveMinimum) + BigInt(1);
    }
    if (bag.exclusiveMaximum !== undefined) {
      max = BigInt(bag.exclusiveMaximum) - BigInt(1);
    }

    return fc.bigInt({ min, max });
  },

  boolean() {
    return fc.boolean();
  },

  date(schema: Zod4Schema) {
    const bag = schema._zod?.bag ?? {};

    // Handle min/max constraints from bag
    let min: Date | undefined = undefined;
    let max: Date | undefined = undefined;

    if (bag.minimum !== undefined) {
      min = new Date(bag.minimum);
    }
    if (bag.maximum !== undefined) {
      max = new Date(bag.maximum);
    }

    return fc.date({ min, max });
  },

  undefined() {
    return fc.constant(undefined);
  },

  null() {
    return fc.constant(null);
  },

  // Array - element is in _def.element (not _def.type)
  array(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const bag = schema._zod?.bag ?? {};
    const minLength = bag.minimum ?? 0;
    const maxLength = Math.min(bag.maximum ?? 10, 10);

    // Zod 4: element schema is in _def.element
    return fc.array(recurse(schema._def.element, path + "[*]"), {
      minLength,
      maxLength,
    });
  },

  // Object - shape is direct property (not a function)
  object(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    // Zod 4: shape is a direct property, not a function
    const shape = schema._def.shape ?? {};
    const propertyArbitraries = objectFromEntries(
      Object.entries(shape).map(([property, propSchema]) => [
        property,
        recurse(propSchema as Zod4Schema, path + "." + property),
      ])
    );
    return fc.record(propertyArbitraries);
  },

  // Union - handles both regular unions and discriminated unions
  union(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const options = schema._def.options ?? [];
    return fc.oneof(
      ...options.map((option: Zod4Schema) => recurse(option, path))
    );
  },

  intersection(_: Zod4Schema, path: string) {
    unsupported(`intersection`, path);
  },

  // XOR (Exclusive OR) union - same as union for arbitrary generation
  // since we just need to generate a value that matches one of the options
  xor(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const options = schema._def.options ?? [];
    return fc.oneof(
      ...options.map((option: Zod4Schema) => recurse(option, path))
    );
  },

  // Tuple - items is same as Zod 3
  tuple(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const items = schema._def.items ?? [];
    return fc.tuple(
      ...items.map((item: Zod4Schema, index: number) =>
        recurse(item, `${path}[${index}]`)
      )
    );
  },

  // Record - keyType and valueType are same
  record(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    return fc.dictionary(
      recurse(schema._def.keyType, path) as Arbitrary<string>,
      recurse(schema._def.valueType, path + "[*]")
    );
  },

  // Map - keyType and valueType are same
  map(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const key = recurse(schema._def.keyType, path + ".(key)");
    const value = recurse(schema._def.valueType, path + ".(value)");
    return fc.array(fc.tuple(key, value)).map((entries) => new Map(entries));
  },

  // Set - valueType is same, size constraints in bag
  set(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const bag = schema._zod?.bag ?? {};
    const minLength = bag.minimum ?? 0;
    const maxLength = Math.min(bag.maximum ?? 10, 10);

    return fc
      .uniqueArray(recurse(schema._def.valueType, path + ".(value)"), {
        minLength,
        maxLength,
      })
      .map((members) => new Set(members));
  },

  // Function - output is the return type in Zod 4
  function(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const outputType = schema._def.output;
    if (outputType) {
      return recurse(outputType, path + ".(return type)").map(
        (returnValue) => () => returnValue
      );
    }
    // If no output type, return a function that returns undefined
    return fc.constant(() => undefined);
  },

  lazy(_: Zod4Schema, path: string) {
    unsupported(`lazy`, path);
  },

  // Literal - values is now an array
  literal(schema: Zod4Schema) {
    const values = schema._def.values ?? [];
    if (values.length === 1) {
      return fc.constant(values[0]);
    }
    return fc.oneof(...values.map((v: unknown) => fc.constant(v)));
  },

  // Enum - entries is an object, get values
  // For native enums with numeric values, filter out reverse mappings
  enum(schema: Zod4Schema) {
    const entries = schema._def.entries ?? {};
    // Filter out reverse mappings (numeric keys that map back to string names)
    const values = getValidEnumValues(entries as Record<string | number, string | number>);
    return fc.oneof(...values.map((v) => fc.constant(v)));
  },

  // Promise - type is same
  promise(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    // Zod 4 uses innerType for promise
    const innerType = schema._def.innerType;
    return recurse(innerType, path + ".(resolved type)").map((value) =>
      Promise.resolve(value)
    );
  },

  any() {
    return fc.anything();
  },

  unknown() {
    return fc.anything();
  },

  never(_: Zod4Schema, path: string) {
    unsupported(`never`, path);
  },

  void() {
    return fc.constant(undefined);
  },

  // Optional - innerType is same
  optional(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const nil = undefined;
    return fc.option(recurse(schema._def.innerType, path), {
      nil,
      freq: 2,
    });
  },

  // Nullable - innerType is same
  nullable(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const nil = null;
    return fc.option(recurse(schema._def.innerType, path), {
      nil,
      freq: 2,
    });
  },

  // Nonoptional (new in Zod 4) - unwraps optional/nullable and generates only non-undefined values
  nonoptional(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    // nonoptional wraps an optional schema and removes the undefined option
    // We need to drill down through optional/nullable wrappers to get the actual type
    let innerType = schema._def.innerType as Zod4Schema;
    while (innerType && (innerType._def.type === 'optional' || innerType._def.type === 'nullable')) {
      innerType = innerType._def.innerType as Zod4Schema;
    }
    return recurse(innerType, path);
  },

  // Default - innerType is same
  default(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    return fc.oneof(
      fc.constant(undefined),
      recurse(schema._def.innerType, path)
    );
  },

  // Prefault (new in Zod 4) - similar to default
  prefault(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    return fc.oneof(
      fc.constant(undefined),
      recurse(schema._def.innerType, path)
    );
  },

  // Transform (new in Zod 4, was part of ZodEffects)
  transform(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    // For transforms, we generate inputs for the inner type
    const innerType = schema._def.innerType;
    if (innerType) {
      const preTransformArbitrary = recurse(innerType, path);
      return filterArbitraryBySchema(preTransformArbitrary, schema, path);
    }
    unsupported(`transform without innerType`, path);
  },

  // Catch - innerType is same
  catch(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    return fc.oneof(recurse(schema._def.innerType, path), fc.anything());
  },

  // Pipe - in is the input schema
  pipe(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    return recurse(schema._def.in, path).filter(
      throwIfSuccessRateBelow(
        MIN_SUCCESS_RATE,
        (value): value is typeof value => schema.safeParse(value).success,
        path
      )
    );
  },

  nan() {
    return fc.constant(Number.NaN);
  },

  symbol() {
    return fc.string().map((s) => Symbol(s));
  },

  // Readonly - unwrap to innerType
  readonly(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    return recurse(schema._def.innerType, path);
  },

  // File (new in Zod 4)
  file(_: Zod4Schema, path: string) {
    unsupported(`file`, path);
  },

  // Template literal (new in Zod 4)
  template_literal(_: Zod4Schema, path: string) {
    unsupported(`template_literal`, path);
  },

  // Success (new in Zod 4) - wraps an inner type, generates values for that type
  success(schema: Zod4Schema, path: string, recurse: SchemaToArbitrary) {
    const innerType = schema._def.innerType;
    if (innerType) {
      return recurse(innerType, path);
    }
    return fc.anything();
  },

  // Custom (new in Zod 4)
  custom(_: Zod4Schema, path: string) {
    unsupported(`custom`, path);
  },
};

export class ZodFastCheckError extends Error {}

export class ZodFastCheckUnsupportedSchemaError extends ZodFastCheckError {}

export class ZodFastCheckGenerationError extends ZodFastCheckError {}

function unsupported(schemaTypeName: string, path: string): never {
  // Remove quotes from schemaTypeName if present (for consistency)
  const cleanName = schemaTypeName.replace(/^'|'$/g, '');
  throw new ZodFastCheckUnsupportedSchemaError(
    `Unable to generate valid values for Zod schema. ` +
      `${cleanName} schemas are not supported (at path '${path || "."}').`
  );
}

// based on the rough spec provided here: https://github.com/paralleldrive/cuid
function createCuidArb(): Arbitrary<string> {
  return fc
    .tuple(
      fc.hexaString({ minLength: 8, maxLength: 8 }),
      fc
        .integer({ min: 0, max: 9999 })
        .map((n) => n.toString().padStart(4, "0")),
      fc.hexaString({ minLength: 4, maxLength: 4 }),
      fc.hexaString({ minLength: 8, maxLength: 8 })
    )
    .map(
      ([timestamp, counter, fingerprint, random]) =>
        "c" + timestamp + counter + fingerprint + random
    );
}

// ULID: 26 chars Crockford base32 (excludes I, L, O, U)
// Pattern: /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function createUlidArb(): Arbitrary<string> {
  return fc.stringOf(
    fc.constantFrom(...CROCKFORD_BASE32.split('')),
    { minLength: 26, maxLength: 26 }
  );
}

// NanoID: 21 chars URL-safe alphabet
// Pattern: /^[a-zA-Z0-9_-]{21}$/
const NANOID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
function createNanoidArb(): Arbitrary<string> {
  return fc.stringOf(
    fc.constantFrom(...NANOID_ALPHABET.split('')),
    { minLength: 21, maxLength: 21 }
  );
}

// XID: 20 chars base32 variant (0-9, a-v)
// Pattern: /^[0-9a-vA-V]{20}$/
const XID_ALPHABET = '0123456789abcdefghijklmnopqrstuv';
function createXidArb(): Arbitrary<string> {
  return fc.stringOf(
    fc.constantFrom(...XID_ALPHABET.split('')),
    { minLength: 20, maxLength: 20 }
  );
}

// KSUID: 27 chars base62
// Pattern: /^[A-Za-z0-9]{27}$/
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function createKsuidArb(): Arbitrary<string> {
  return fc.stringOf(
    fc.constantFrom(...BASE62.split('')),
    { minLength: 27, maxLength: 27 }
  );
}

// CIDR v4: IPv4 address + "/" + prefix length (0-32)
function createCidrV4Arb(): Arbitrary<string> {
  return fc.tuple(
    fc.ipV4(),
    fc.integer({ min: 0, max: 32 })
  ).map(([ip, prefix]) => `${ip}/${prefix}`);
}

// CIDR v6: IPv6 address + "/" + prefix length (0-128)
function createCidrV6Arb(): Arbitrary<string> {
  return fc.tuple(
    fc.ipV6(),
    fc.integer({ min: 0, max: 128 })
  ).map(([ip, prefix]) => `${ip}/${prefix}`);
}

// MAC address: 6 pairs of hex digits joined by ":"
function createMacArb(): Arbitrary<string> {
  return fc.tuple(
    fc.hexaString({ minLength: 2, maxLength: 2 }),
    fc.hexaString({ minLength: 2, maxLength: 2 }),
    fc.hexaString({ minLength: 2, maxLength: 2 }),
    fc.hexaString({ minLength: 2, maxLength: 2 }),
    fc.hexaString({ minLength: 2, maxLength: 2 }),
    fc.hexaString({ minLength: 2, maxLength: 2 })
  ).map((parts) => parts.join(':'));
}

// E.164 phone number: "+" followed by 7-15 digits
// Pattern: /^\+[1-9]\d{6,14}$/
function createE164Arb(): Arbitrary<string> {
  return fc.tuple(
    fc.integer({ min: 1, max: 9 }),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 14 })
  ).map(([first, rest]) => `+${first}${rest}`);
}

// Base64URL: URL-safe base64 that can be decoded
// Must be valid base64 (length must be 4k, 4k+2, or 4k+3 for proper decoding)
function createBase64UrlArb(): Arbitrary<string> {
  // Generate random bytes and encode them as base64url
  return fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 50 })
    .map((bytes) => {
      // Convert bytes to base64url
      const uint8Array = new Uint8Array(bytes);
      const base64 = btoa(String.fromCharCode(...uint8Array));
      // Convert to base64url: replace + with -, / with _, remove padding
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    });
}

// Emoji: Unicode emoji characters
// Uses Extended_Pictographic and Emoji_Component
const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤝', '👏', '🙌', '👐',
  '🎉', '🎊', '🎈', '🎁', '🎄', '🎃', '🎗️', '🎟️', '🎫', '🏆',
  '⭐', '🌟', '✨', '💫', '🌙', '☀️', '🌈', '☁️', '⛅', '🌤️',
];
function createEmojiArb(): Arbitrary<string> {
  return fc.array(
    fc.constantFrom(...COMMON_EMOJIS),
    { minLength: 1, maxLength: 5 }
  ).map((emojis) => emojis.join(''));
}

// ISO Date: YYYY-MM-DD format
function createIsoDateArb(): Arbitrary<string> {
  return fc.date({
    min: new Date("0000-01-01"),
    max: new Date("9999-12-31"),
  }).map((date) => date.toISOString().split('T')[0]);
}

// ISO Time: HH:mm:ss or HH:mm:ss.sss format (with optional timezone)
function createIsoTimeArb(schema: Zod4Schema): Arbitrary<string> {
  // Check for precision in the schema definition
  const precision = (schema._def as any).precision ?? 3;

  return fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
    precision > 0 ? fc.integer({ min: 0, max: Math.pow(10, precision) - 1 }) : fc.constant(0)
  ).map(([h, m, s, ms]) => {
    const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    if (precision > 0 && ms > 0) {
      return `${time}.${ms.toString().padStart(precision, '0')}`;
    }
    return time;
  });
}

// ISO Duration: P[n]Y[n]M[n]DT[n]H[n]M[n]S format
function createIsoDurationArb(): Arbitrary<string> {
  return fc.record({
    years: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    months: fc.option(fc.integer({ min: 0, max: 11 }), { nil: undefined }),
    days: fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
    hours: fc.option(fc.integer({ min: 0, max: 23 }), { nil: undefined }),
    minutes: fc.option(fc.integer({ min: 0, max: 59 }), { nil: undefined }),
    seconds: fc.option(fc.integer({ min: 0, max: 59 }), { nil: undefined }),
  }).map(({ years, months, days, hours, minutes, seconds }) => {
    let duration = 'P';
    if (years !== undefined) duration += `${years}Y`;
    if (months !== undefined) duration += `${months}M`;
    if (days !== undefined) duration += `${days}D`;

    if (hours !== undefined || minutes !== undefined || seconds !== undefined) {
      duration += 'T';
      if (hours !== undefined) duration += `${hours}H`;
      if (minutes !== undefined) duration += `${minutes}M`;
      if (seconds !== undefined) duration += `${seconds}S`;
    }

    // Ensure we have at least one component
    if (duration === 'P') duration = 'P0D';
    if (duration === 'PT') duration = 'PT0S';

    return duration;
  });
}

// Hostname: Valid DNS hostname
// Pattern: label.label.label where each label is alphanumeric with hyphens (not at start/end)
function createHostnameArb(): Arbitrary<string> {
  // Create a valid label (1-63 chars, alphanumeric, can have hyphens in middle)
  const labelArb = fc.tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
      { minLength: 0, maxLength: 10 }
    ),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''))
  ).map(([first, middle, last]) => {
    // Remove consecutive hyphens and ensure no leading/trailing hyphen
    const cleaned = middle.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
    return first + cleaned + last;
  });

  // Create a TLD (2+ chars, letters only)
  const tldArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    { minLength: 2, maxLength: 6 }
  );

  return fc.tuple(
    fc.array(labelArb, { minLength: 0, maxLength: 2 }),
    labelArb,
    tldArb
  ).map(([subdomains, domain, tld]) => {
    const parts = [...subdomains, domain, tld];
    return parts.join('.');
  });
}

// JWT: Three base64url segments joined by "."
// Header must be valid JSON with at least "alg" field
function createJwtArb(): Arbitrary<string> {
  const algorithms = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];

  // Create a valid JWT header
  const headerArb = fc.constantFrom(...algorithms).map((alg) => {
    const header = JSON.stringify({ alg, typ: 'JWT' });
    const base64 = btoa(header);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });

  // Create a simple payload
  const payloadArb = fc.record({
    sub: fc.string({ minLength: 1, maxLength: 20 }),
    iat: fc.integer({ min: 1000000000, max: 2000000000 })
  }).map((payload) => {
    const json = JSON.stringify(payload);
    const base64 = btoa(json);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });

  // Create a random signature
  const signatureArb = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 32, maxLength: 64 })
    .map((bytes) => {
      const uint8Array = new Uint8Array(bytes);
      const base64 = btoa(String.fromCharCode(...uint8Array));
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    });

  return fc.tuple(headerArb, payloadArb, signatureArb)
    .map(([header, payload, signature]) => `${header}.${payload}.${signature}`);
}

function createDatetimeStringArb(
  schema: Zod4Schema
): Arbitrary<string> {
  // In Zod 4, datetime params are in the string_format check
  let precision: number | null = null;
  let offset = false;

  const checks = schema._def.checks ?? [];
  for (const check of checks) {
    const checkDef = check._zod?.def ?? check;
    if (checkDef.check === 'string_format' && checkDef.format === 'datetime') {
      precision = checkDef.precision ?? null;
      offset = checkDef.offset ?? false;
      break;
    }
  }

  let arb = fc
    .date({
      min: new Date("0000-01-01T00:00:00Z"),
      max: new Date("9999-12-31T23:59:59Z"),
    })
    .map((date) => date.toISOString());

  if (precision === 0) {
    arb = arb.map((utcIsoDatetime) => utcIsoDatetime.replace(/\.\d+Z$/, `Z`));
  } else if (precision !== null) {
    const p = precision;
    arb = arb.chain((utcIsoDatetime) =>
      fc
        .integer({ min: 0, max: Math.pow(10, p) - 1 })
        .map((x) => x.toString().padStart(p, "0"))
        .map((fractionalDigits) =>
          utcIsoDatetime.replace(/\.\d+Z$/, `.${fractionalDigits}Z`)
        )
    );
  }

  if (offset) {
    // Add an arbitrary timezone offset on, if the schema supports it.
    // UTC−12:00 is the furthest behind UTC, UTC+14:00 is the furthest ahead.
    // This does not generate offsets for half-hour and 15 minute timezones.
    arb = arb.chain((utcIsoDatetime) =>
      fc.integer({ min: -12, max: +14 }).map((offsetHours) => {
        if (offsetHours === 0) {
          return utcIsoDatetime;
        } else {
          const sign = offsetHours > 0 ? "+" : "-";
          const paddedHours = Math.abs(offsetHours).toString().padStart(2, "0");
          return utcIsoDatetime.replace(/Z$/, `${sign}${paddedHours}:00`);
        }
      })
    );
  }

  return arb;
}

/**
 * Returns a type guard which filters one member from a union type.
 */
const isUnionMember =
  <T, Filter extends Partial<T>>(filter: Filter) =>
  (value: T): value is Extract<T, Filter> => {
    return Object.entries(filter).every(
      ([key, expected]) => value[key as keyof T] === expected
    );
  };

function filterArbitraryBySchema<T>(
  arbitrary: Arbitrary<T>,
  schema: Zod4Schema,
  path: string
): Arbitrary<T> {
  return arbitrary.filter(
    throwIfSuccessRateBelow(
      MIN_SUCCESS_RATE,
      (value): value is typeof value => schema.safeParse(value).success,
      path
    )
  );
}

function throwIfSuccessRateBelow<Value, Refined extends Value>(
  rate: number,
  predicate: (value: Value) => value is Refined,
  path: string
): (value: Value) => value is Refined {
  const MIN_RUNS = 1000;

  let successful = 0;
  let total = 0;

  return (value: Value): value is Refined => {
    const isSuccess = predicate(value);

    total += 1;
    if (isSuccess) successful += 1;

    if (total > MIN_RUNS && successful / total < rate) {
      throw new ZodFastCheckGenerationError(
        "Unable to generate valid values for Zod schema. " +
          `An override is must be provided for the schema at path '${
            path || "."
          }'.`
      );
    }

    return isSuccess;
  };
}

function objectFromEntries<Value>(
  entries: Array<[string, Value]>
): Record<string, Value> {
  const object: Record<string, Value> = {};
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    object[key] = value;
  }
  return object;
}

// Greatest Common Divisor
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// Least Common Multiple
function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

const getValidEnumValues = (
  obj: Record<string | number, string | number>
): unknown[] => {
  const validKeys = Object.keys(obj).filter(
    (key) => typeof obj[obj[key]] !== "number"
  );
  const filtered: Record<string, string | number> = {};
  for (const key of validKeys) {
    filtered[key] = obj[key];
  }
  return Object.values(filtered);
};
