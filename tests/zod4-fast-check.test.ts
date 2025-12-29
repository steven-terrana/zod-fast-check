import fc from "fast-check";
import * as z from "zod4";
import type { ZodType } from "zod4";
import {
  Zod4FastCheck,
  Zod4FastCheckGenerationError,
  Zod4FastCheckUnsupportedSchemaError,
} from "./zod-fast-check-module-proxy";

describe("Generate arbitraries for Zod schema input types", () => {
  enum Biscuits {
    Digestive,
    CustardCream,
    RichTea,
  }

  enum Cakes {
    CarrotCake = "CARROT_CAKE",
    ChocolateCake = "CHOCOLATE_CAKE",
    VictoriaSponge = "VICTORIA_SPONGE",
  }

  const penguinSymbol = Symbol.for("penguin");

  const schemas: Record<string, () => ZodType> = {
    string: () => z.string(),
    number: () => z.number(),
    bigint: () => z.bigint(),
    boolean: () => z.boolean(),
    date: () => z.date(),
    undefined: () => z.undefined(),
    null: () => z.null(),
    "array of numbers": () => z.array(z.number()),
    "array of string": () => z.array(z.string()),
    "array of arrays of booleans": () => z.array(z.array(z.boolean())),
    "nonempty array": () => z.array(z.number()).nonempty(),
    "empty object": () => z.object({}),
    "simple object": () =>
      z.object({
        aString: z.string(),
        aBoolean: z.boolean(),
      }),
    "nested object": () =>
      z.object({
        child: z.object({
          grandchild1: z.null(),
          grandchild2: z.boolean(),
        }),
      }),
    union: () => z.union([z.boolean(), z.string()]),
    "discriminated union": () =>
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), a: z.string() }),
        z.object({
          type: z.literal("b"),
          b: z.object({
            x: z.string(),
          }),
        }),
        z.object({
          type: z.literal("c"),
          c: z.number(),
        }),
      ]),
    nan: () => z.nan(),
    "string branded with string": () => z.string().brand<"timezone">(),
    "object branded with number": () =>
      z.object({ a: z.boolean() }).brand<123>(),
    "array branded with symbol": () =>
      z.array(z.number()).brand<typeof penguinSymbol>(),
    "empty tuple": () => z.tuple([]),
    "nonempty tuple": () => z.tuple([z.string(), z.boolean(), z.date()]),
    "nested tuple": () => z.tuple([z.string(), z.tuple([z.number()])]),
    "record of numbers": () => z.record(z.string(), z.number()),
    "record of objects": () => z.record(z.string(), z.object({ name: z.string() })),
    "record of strings": () => z.record(z.string(), z.string()),
    "record of strings with min-length values": () =>
      z.record(z.string(), z.string().min(1)),
    "record of strings with min-length keys": () =>
      z.record(z.string().min(1), z.string()),
    "map with string keys": () => z.map(z.string(), z.number()),
    "map with object keys": () =>
      z.map(z.object({ id: z.number() }), z.array(z.boolean())),
    set: () => z.set(z.number()),
    "nonempty set": () => z.set(z.number()).nonempty(),
    "set with min": () => z.set(z.number()).min(2),
    "set with max": () => z.set(z.number()).max(3),
    "function returning boolean": () => z.function({ output: z.boolean() }),
    "literal number": () => z.literal(123.5),
    "literal string": () => z.literal("hello"),
    "literal boolean": () => z.literal(false),
    // Note: Zod 4 no longer supports Symbol literals
    enum: () => z.enum(["Bear", "Wolf", "Fox"]),
    "native enum with numeric values": () => z.nativeEnum(Biscuits),
    "native enum with string values": () => z.nativeEnum(Cakes),
    "const enum": () =>
      z.nativeEnum({
        Duck: "duck",
        Swan: "swan",
        Goose: 3,
      }),
    promise: () => z.promise(z.string()),
    any: () => z.any(),
    unknown: () => z.unknown(),
    void: () => z.void(),
    "optional number": () => z.optional(z.number()),
    "optional boolean": () => z.optional(z.boolean()),
    "nullable string": () => z.nullable(z.string()),
    "nullable object": () => z.nullable(z.object({ age: z.number() })),
    "with default": () => z.number().default(0),

    // Schemas which rely on refinements
    "number with minimum": () => z.number().min(500),
    "number with maximum": () => z.number().max(500),
    "number with float max and min": () => z.number().min(0.5).max(1.5),
    int: () => z.number().int(),
    positive: () => z.number().positive(),
    negative: () => z.number().negative(),
    nonpositive: () => z.number().nonpositive(),
    nonnegative: () => z.number().nonnegative(),
    finite: () => z.number().finite(),
    "multiple of": () => z.number().multipleOf(3),
    "multiple multiple of": () => z.number().multipleOf(3).multipleOf(5),
    "multiple of with min and max": () =>
      z.number().multipleOf(10).min(67).max(99),
    "number with custom refinement": () =>
      z.number().refine((x) => x % 3 === 0),

    "string with minimum length": () => z.string().min(24),
    "string with maximum length": () => z.string().max(24),
    "string with fixed length": () => z.string().length(256),
    "string with prefix": () => z.string().startsWith("prefix"),
    "string with suffix": () => z.string().endsWith("suffix"),
    cuid: () => z.string().cuid(),
    cuid2: () => z.string().cuid2(),
    uuid: () => z.string().uuid(),
    url: () => z.string().url(),
    email: () => z.string().email(),
    regex: () => z.string().regex(/\s/),
    datetime: () => z.string().datetime(),
    "datetime with offset": () => z.string().datetime({ offset: true }),
    "datetime with low precision": () => z.string().datetime({ precision: 0 }),
    "datetime with high precision": () => z.string().datetime({ precision: 6 }),
    "number to string transformer": () => z.number().transform(String),
    "deeply nested transformer": () => z.array(z.boolean().transform(Number)),
    "string to number pipeline": () =>
      z
        .string()
        .transform((s) => s.length)
        .pipe(z.number().min(5)),
    "Coerced string": () => z.coerce.string(),
    "Coerced number": () => z.coerce.number(),
    "Coerced boolean": () => z.coerce.boolean(),
    "Coerced bigint": () => z.coerce.bigint(),
    "Coerced date": () => z.coerce.date(),
    "string with catch": () => z.string().catch("fallback"),
    symbol: () => z.symbol(),

    // Zod 4 specific types - previously implemented but untested
    "prefault string": () => z.string().prefault("default"),
    "prefault number": () => z.number().prefault(42),
    "nonoptional string": () => z.string().optional().nonoptional(),
    "nonoptional number": () => z.number().optional().nonoptional(),
    "readonly object": () => z.object({ a: z.string() }).readonly(),
    "readonly array": () => z.array(z.number()).readonly(),
    "success wrapper": () => z.success(z.string()),

    // Zod 4 ID string formats
    ulid: () => z.ulid(),
    nanoid: () => z.nanoid(),
    guid: () => z.guid(),
    xid: () => z.xid(),
    ksuid: () => z.ksuid(),

    // Zod 4 network string formats
    ipv4: () => z.ipv4(),
    ipv6: () => z.ipv6(),
    cidrv4: () => z.cidrv4(),
    cidrv6: () => z.cidrv6(),
    mac: () => z.mac(),
    e164: () => z.e164(),

    // Zod 4 encoding string formats
    base64: () => z.base64(),
    base64url: () => z.base64url(),
    jwt: () => z.jwt(),
    hex: () => z.hex(),

    // Zod 4 other string formats
    emoji: () => z.emoji(),
    hostname: () => z.hostname(),

    // Zod 4 ISO namespace formats
    "iso datetime": () => z.iso.datetime(),
    "iso date": () => z.iso.date(),
    "iso time": () => z.iso.time(),
    "iso duration": () => z.iso.duration(),

    // Zod 4 XOR union type
    "xor union": () => z.xor([z.string(), z.number()]),
    "xor with objects": () =>
      z.xor([
        z.object({ type: z.literal("a"), value: z.string() }),
        z.object({ type: z.literal("b"), value: z.number() }),
      ]),

    // Zod 4 constraint tests
    "bigint with min": () => z.bigint().min(BigInt(100)),
    "bigint with max": () => z.bigint().max(BigInt(1000)),
    "positive bigint": () => z.bigint().positive(),
    "negative bigint": () => z.bigint().negative(),
    "date with min": () => z.date().min(new Date("2020-01-01")),
    "date with max": () => z.date().max(new Date("2030-12-31")),
    "array with length": () => z.array(z.string()).length(5),
    "tuple with rest": () => z.tuple([z.string(), z.number()]).rest(z.boolean()),

    // Zod 4 object/record variants
    "strict object": () => z.strictObject({ a: z.string() }),
    "loose object": () => z.looseObject({ a: z.string() }),
    "object with strict": () => z.object({ a: z.string() }).strict(),
    "object with passthrough": () => z.object({ a: z.string() }).passthrough(),
    "keyof object": () => z.keyof(z.object({ foo: z.string(), bar: z.number() })),

    // Zod 4 codec - works via pipe handler
    "codec string to number": () =>
      z.codec(z.string(), z.number(), {
        decode: (s) => parseInt(s, 10),
        encode: (n) => String(n),
      }),
    "codec with objects": () =>
      z.codec(
        z.object({ name: z.string() }),
        z.object({ title: z.string() }),
        {
          decode: (input) => ({ title: input.name }),
          encode: (output) => ({ name: output.title }),
        }
      ),
  };

  for (const [name, buildSchema] of Object.entries(schemas)) {
    testIfSchemaSupported(name, buildSchema, (schema) => {
      const arbitrary = Zod4FastCheck().inputOf(schema);
      return fc.assert(
        fc.asyncProperty(arbitrary, async (value) => {
          // Use parseAsync for promise schemas, sync parse for others
          // Zod 4 requires parseAsync when the schema is z.promise()
          await schema.parseAsync(value);
        })
      );
    });
  }
});

describe("Generate arbitraries for Zod schema output types", () => {
  test("number to string transformer", () => {
    const targetSchema = z.string().refine((s) => !isNaN(+s));
    const schema = z.number().transform(String);

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        targetSchema.parse(value);
      })
    );
  });

  test("deeply nested transformer", () => {
    const targetSchema = z.array(z.number());
    const schema = z.array(z.boolean().transform(Number));

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.asyncProperty(arbitrary, async (value) => {
        await targetSchema.parse(value);
      })
    );
  });

  test("transformer within a transformer", () => {
    // This schema accepts an array of booleans and converts them
    // to strings with exclamation marks then concatenates them.
    const targetSchema = z.string().regex(/(true\!|false\!)*/);
    const schema = z
      .array(z.boolean().transform((bool) => `${bool}!`))
      .transform((array) => array.join(""));

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.asyncProperty(arbitrary, async (value) => {
        await targetSchema.parse(value);
      })
    );
  });

  test("doubling transformer", () => {
    // Zod 4's .int() uses safe integers, so we constrain input to half
    // the safe integer range to ensure doubled values stay within range.
    const HALF_SAFE = Math.floor(Number.MAX_SAFE_INTEGER / 2);

    const targetSchema = z
      .number()
      .int()
      .refine((x) => x % 2 === 0);
    const schema = z
      .number()
      .int()
      .refine((x) => x < HALF_SAFE && x > -HALF_SAFE)
      .transform((x) => x * 2);

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        targetSchema.parse(value);
      })
    );
  });

  test("schema with default value", () => {
    // Unlike the input arbitrary, the output arbitrary should never
    // produce "undefined" for a schema with a default.
    const targetSchema = z.string();
    const schema = z.string().default("hello");

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        targetSchema.parse(value);
      })
    );
  });

  testIfSchemaSupported(
    "string with catch",
    () => z.string().catch("fallback"),
    (schema) => {
      const targetSchema = z.string();
      const arbitrary = Zod4FastCheck().outputOf(schema);

      return fc.assert(
        fc.property(arbitrary, (value) => {
          targetSchema.parse(value);
        })
      );
    }
  );

  test("trimmed string", () => {
    const schema = z.string().trim();

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        value.match(/^\s/) === null && value.match(/\s$/) === null;
      })
    );
  });

  test("a branded type schema uses an arbitrary for the underlying schema", () => {
    const schema = z.string().brand<"brand">();
    type BrandedString = z.output<typeof schema>;

    const arbitrary = Zod4FastCheck().outputOf(schema);

    return fc.assert(
      fc.property(arbitrary, (value: BrandedString) => {
        expect(typeof value).toBe("string");
      })
    );
  });

  testIfSchemaSupported(
    "string to number pipeline",
    () =>
      z
        .string()
        .transform((s) => s.length)
        .pipe(z.number().min(5)),
    (schema) => {
      const targetSchema = z.number().min(5).int();

      const arbitrary = Zod4FastCheck().outputOf(schema);

      return fc.assert(
        fc.property(arbitrary, (value) => {
          targetSchema.parse(value);
        })
      );
    }
  );
});

describe("Override the arbitrary for a particular schema type", () => {
  const UUID = z.string().uuid();

  test("using custom UUID arbitrary", () => {
    const arbitrary = Zod4FastCheck().override(UUID, fc.uuid()).inputOf(UUID);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        UUID.parse(value);
      })
    );
  });

  test("using custom UUID arbitrary in nested schema", () => {
    const schema = z.object({ ids: z.array(UUID) });

    const arbitrary = Zod4FastCheck().override(UUID, fc.uuid()).inputOf(schema);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        schema.parse(value);
      })
    );
  });

  const IntAsString = z.number().int().transform(String);

  test("using custom integer arbitrary for IntAsString input", () => {
    const arbitrary = Zod4FastCheck()
      .override(IntAsString, fc.integer())
      .inputOf(IntAsString);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        z.number().int().parse(value);
      })
    );
  });

  test("using custom integer arbitrary for IntAsString output", () => {
    const arbitrary = Zod4FastCheck()
      .override(IntAsString, fc.integer())
      .outputOf(IntAsString);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        expect(typeof value).toBe("string");
        expect(Number(value) === parseInt(value, 10));
      })
    );
  });

  test("using a function to lazily define an override", () => {
    const NumericString = z.string().regex(/^\d+$/);

    const zfc = Zod4FastCheck().override(NumericString, (zfc) =>
      zfc.inputOf(z.number().int().nonnegative()).map(String)
    );

    const arbitrary = zfc.outputOf(NumericString);

    return fc.assert(
      fc.property(arbitrary, (value) => {
        expect(value).toMatch(/^\d+$/);
      })
    );
  });
});

describe("Throwing an error if it is not able to generate a value", () => {
  // Note: In Zod 4, .refine() adds checks to the schema directly rather than
  // wrapping in ZodEffects. The refinement filtering happens during safeParse.
  // These tests check that outputOf properly filters out invalid values.
  test("generating output values for an impossible refinement", () => {
    const arbitrary = Zod4FastCheck().outputOf(z.string().refine(() => false));

    expect(() =>
      fc.assert(
        fc.property(arbitrary, (value) => {
          return true;
        })
      )
    ).toThrow(Zod4FastCheckGenerationError);
  });

  // Test error path for transforms (which do create a separate type in Zod 4)
  test("correct error path is shown for types with transforms", () => {
    const impossible = z.string().refine(() => false);
    const schema = z.object({
      withTransform: impossible.transform((s) => !!s),
    });
    const arbitrary = Zod4FastCheck().inputOf(schema);

    expect(() => fc.assert(fc.property(arbitrary, () => true))).toThrow(
      new Zod4FastCheckGenerationError(
        "Unable to generate valid values for Zod schema. " +
          "An override is must be provided for the schema at path '.withTransform'."
      )
    );
  });

  testIfSchemaSupported(
    "generating input values for an impossible pipeline",
    () => z.string().transform(s => s.length).pipe(z.number().min(1000)),
    (schema) => {
      const arbitrary = Zod4FastCheck().inputOf(schema);

      expect(() =>
        fc.assert(
          fc.property(arbitrary, (value) => {
            return true;
          })
        )
      ).toThrow(
        new Zod4FastCheckGenerationError(
          "Unable to generate valid values for Zod schema. " +
            "An override is must be provided for the schema at path '.'."
        )
      );
    }
  );
});

describe("Native regex support using fc.stringMatching()", () => {
  test("simple regex pattern generates valid values", () => {
    const schema = z.string().regex(/^[a-z]+$/);
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value).toMatch(/^[a-z]+$/);
      })
    );
  });

  test("numeric string regex generates valid values efficiently", () => {
    // This pattern would fail with pure filtering due to low success rate
    const schema = z.string().regex(/^\d+$/);
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value).toMatch(/^\d+$/);
      })
    );
  });

  test("regex with min length constraint", () => {
    const schema = z.string().regex(/^[a-z]+$/).min(5);
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value.length).toBeGreaterThanOrEqual(5);
        expect(value).toMatch(/^[a-z]+$/);
      })
    );
  });

  test("regex with max length constraint", () => {
    const schema = z.string().regex(/^[a-z]+$/).max(10);
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value.length).toBeLessThanOrEqual(10);
        expect(value).toMatch(/^[a-z]+$/);
      })
    );
  });

  test("regex with both min and max length constraints", () => {
    const schema = z.string().regex(/^[a-z]+$/).min(3).max(8);
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value.length).toBeGreaterThanOrEqual(3);
        expect(value.length).toBeLessThanOrEqual(8);
        expect(value).toMatch(/^[a-z]+$/);
      })
    );
  });

  test("regex with startsWith mapping", () => {
    const schema = z.string().regex(/[a-z]+/).startsWith("PREFIX_");
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value.startsWith("PREFIX_")).toBe(true);
      })
    );
  });

  test("regex with endsWith mapping", () => {
    const schema = z.string().regex(/[a-z]+/).endsWith("_SUFFIX");
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value.endsWith("_SUFFIX")).toBe(true);
      })
    );
  });

  test("complex regex pattern", () => {
    // Email-like pattern (simplified)
    const schema = z.string().regex(/^[a-z]+@[a-z]+\.[a-z]{2,3}$/);
    const arb = Zod4FastCheck().inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value).toMatch(/^[a-z]+@[a-z]+\.[a-z]{2,3}$/);
      })
    );
  });

  test("regex with unsupported features falls back to filtering with override", () => {
    // Word boundary is not supported by fc.stringMatching()
    // This falls back to filtering, but word boundary patterns are too
    // restrictive for random filtering, so an override is needed
    const schema = z.string().regex(/\btest\b/);

    // Provide an override since the pattern is too restrictive for filtering
    const zfc = Zod4FastCheck().override(schema, fc.constant("test"));
    const arb = zfc.inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value).toMatch(/\btest\b/);
      })
    );
  });

  test("lookahead regex falls back to filtering with override", () => {
    // Positive lookahead is not supported by fc.stringMatching()
    const schema = z.string().regex(/foo(?=bar)/);

    // Provide an override since lookahead patterns can't be generated
    const zfc = Zod4FastCheck().override(schema, fc.constant("foobar"));
    const arb = zfc.inputOf(schema);

    return fc.assert(
      fc.property(arb, (value) => {
        expect(value).toMatch(/foo(?=bar)/);
      })
    );
  });
});

describe("Throwing an error if the schema type is not supported", () => {
  test("lazy schemas", () => {
    expect(() => Zod4FastCheck().inputOf(z.lazy(() => z.string()))).toThrow(
      new Zod4FastCheckUnsupportedSchemaError(
        "Unable to generate valid values for Zod schema. " +
          "lazy schemas are not supported (at path '.')."
      )
    );
  });

  test("never schemas", () => {
    expect(() => Zod4FastCheck().inputOf(z.never())).toThrow(
      new Zod4FastCheckUnsupportedSchemaError(
        "Unable to generate valid values for Zod schema. " +
          "never schemas are not supported (at path '.')."
      )
    );
  });

  test("intersection schemas", () => {
    expect(() =>
      Zod4FastCheck().inputOf(
        z.intersection(
          z.object({ foo: z.string() }),
          z.object({ bar: z.number() })
        )
      )
    ).toThrow(
      new Zod4FastCheckUnsupportedSchemaError(
        "Unable to generate valid values for Zod schema. " +
          "intersection schemas are not supported (at path '.')."
      )
    );
  });

  test("json schemas (uses lazy internally)", () => {
    // z.json() is implemented via z.lazy(), which is unsupported
    expect(() => Zod4FastCheck().inputOf(z.json())).toThrow(
      Zod4FastCheckUnsupportedSchemaError
    );
  });

  // Note: Third-party schema test is skipped in Zod 4 because the internal
  // parsing APIs (ParseInput, ParseReturnType, OK, INVALID) have changed
  // significantly. Unsupported schema types are now detected by checking
  // _def.type which returns the schema type string.
  test("unsupported schema type detection", () => {
    // In Zod 4, we detect unsupported schemas by their _def.type
    // The error message now shows the type name
    expect(() =>
      Zod4FastCheck().inputOf(z.lazy(() => z.string()))
    ).toThrow(Zod4FastCheckUnsupportedSchemaError);
  });
});

function testIfSchemaSupported(
  name: string,
  buildSchema: () => ZodType,
  testBody: (s: ZodType) => void | Promise<void>
): void {
  let schema: ZodType;
  try {
    schema = buildSchema();
  } catch (error) {
    // If we get a runtime type error while building the schema, this is likely
    // to be because we are testing against a version of Zod which doesn't yet
    // support this type of schema, so we skip the test.
    if (error instanceof TypeError) {
      test.skip(name, () => {});
      return;
    }
  }
  test(name, async () => {
    await testBody(schema);
  });
}
