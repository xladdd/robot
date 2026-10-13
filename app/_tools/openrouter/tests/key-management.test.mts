import assert from "node:assert/strict";
import test from "node:test";

import { openRouterApps } from "../config.ts";
import {
  appendEnvValue,
  assertSeparateKeys,
  buildPlan,
  configuredLimits,
  keyHash,
  keyName,
  managedApps,
  matchKey,
  parseOptions,
  readEnv,
  type KeyLimits,
  type KeyTarget,
  type RemoteKey,
} from "../scripts/key-management.ts";

const NOW = Date.parse("2030-01-01T00:00:00.000Z");
const defaults: KeyLimits = {
  limit: 7,
  limit_reset: "monthly",
  include_byok_in_limit: false,
};
const firstApp = openRouterApps.extraction;
const secondApp = openRouterApps.index;

// These deliberately non-credential strings never leave the in-memory fixtures.
function fakeSecret(target: KeyTarget, slug: string) {
  return `fake-test-only/${target}/${slug}`;
}

function remoteKey(
  secret: string,
  name: string,
  overrides: Partial<RemoteKey> = {},
): RemoteKey {
  return {
    hash: keyHash(secret),
    name,
    disabled: false,
    ...defaults,
    expires_at: null,
    ...overrides,
  };
}

function fixture(target: KeyTarget, legacyNames = false) {
  const env: Record<string, string> = {};
  const keys: RemoteKey[] = [];
  for (const app of managedApps) {
    const secret = fakeSecret(target, app.slug);
    env[app.envName] = secret;
    keys.push(
      remoteKey(
        secret,
        legacyNames ? `Taktik Robot / ${app.name}` : keyName(target, app.slug),
      ),
    );
  }
  return { env, keys };
}

test("managed apps retain the config's unique slugs and runtime variable names", () => {
  assert.deepEqual(managedApps, Object.values(openRouterApps));
  assert.equal(managedApps.length, 12);
  assert.equal(
    new Set(managedApps.map((app) => app.slug)).size,
    managedApps.length,
  );
  assert.equal(
    new Set(managedApps.map((app) => app.envName)).size,
    managedApps.length,
  );
  for (const app of managedApps) {
    assert.equal(keyName("dev", app.slug), `DEV/${app.slug}`);
    assert.equal(keyName("deploy", app.slug), `DEPLOY/${app.slug}`);
  }
});

for (const target of ["dev", "deploy"] as const) {
  test(`provisioning explicitly selects ${target} and honors dry-run/apply`, () => {
    assert.deepEqual(parseOptions(["--target", target]), {
      action: "provision",
      target,
      dryRun: false,
    });
    assert.deepEqual(parseOptions(["--dry-run", "--target", target]), {
      action: "provision",
      target,
      dryRun: true,
    });
    assert.deepEqual(parseOptions(["--target", target, "--apply"]), {
      action: "provision",
      target,
      dryRun: false,
    });
  });
}

test("rename defaults to a DEV dry-run and requires explicit apply", () => {
  assert.deepEqual(parseOptions(["--rename-dev"]), {
    action: "rename-dev",
    target: "dev",
    dryRun: true,
  });
  assert.deepEqual(parseOptions(["--rename-dev", "--dry-run"]), {
    action: "rename-dev",
    target: "dev",
    dryRun: true,
  });
  assert.deepEqual(parseOptions(["--apply", "--rename-dev"]), {
    action: "rename-dev",
    target: "dev",
    dryRun: false,
  });
  assert.deepEqual(parseOptions(["--verify"]), {
    action: "verify",
    target: "dev",
    dryRun: true,
  });
  assert.deepEqual(parseOptions(["--verify", "--dry-run"]), {
    action: "verify",
    target: "dev",
    dryRun: true,
  });
});

const invalidArgs: [string[], RegExp][] = [
  [[], /Provisioning requires --target/],
  [["--dry-run"], /Provisioning requires --target/],
  [["--apply"], /Provisioning requires --target/],
  [["--target"], /--target must be dev or deploy/],
  [["--target", "production"], /--target must be dev or deploy/],
  [["--target", "DEV"], /--target must be dev or deploy/],
  [["--target", "dev", "--target", "deploy"], /Specify --target only once/],
  [["--target", "dev", "--target", "dev"], /Specify --target only once/],
  [["--target=dev"], /Unknown option/],
  [["--unknown"], /Unknown option/],
  [["--rename-dev", "--verify"], /Choose only one/],
  [["--verify", "--rename-dev"], /Choose only one/],
  [["--rename-dev", "--rename-dev"], /Choose only one/],
  [["--verify", "--verify"], /Choose only one/],
  [
    ["--rename-dev", "--target", "dev"],
    /--target is only used for provisioning/,
  ],
  [
    ["--verify", "--target", "deploy"],
    /--target is only used for provisioning/,
  ],
  [["--verify", "--apply"], /Verification is read-only/],
  [["--target", "dev", "--dry-run", "--apply"], /cannot be combined/],
  [["--rename-dev", "--apply", "--dry-run"], /cannot be combined/],
];
for (const [args, error] of invalidArgs) {
  test(`rejects unsafe arguments ${JSON.stringify(args)}`, () => {
    assert.throws(() => parseOptions(args), error);
  });
}

test("fingerprints are exact SHA-256 values, independent of remote names", () => {
  assert.equal(
    keyHash("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.notEqual(keyHash("abc"), keyHash("abc "));
  assert.notEqual(keyHash("abc"), keyHash("ABC"));
  const secret = fakeSecret("dev", firstApp.slug);
  const remote = remoteKey(secret, "unrelated metadata");
  const decoy = remoteKey(
    "fake-test-only/decoy",
    keyName("dev", firstApp.slug),
  );
  assert.equal(matchKey(secret, [decoy, remote], "DEV fixture"), remote);
  assert.throws(
    () => matchKey(secret, [decoy], "DEV fixture"),
    /no unique exact fingerprint match.*no name-only mapping/,
  );
  assert.throws(
    () => matchKey(secret, [], "DEV fixture"),
    /no unique exact fingerprint match/,
  );
  assert.throws(
    () =>
      matchKey(
        secret,
        [remote, { ...remote, name: "duplicate fingerprint" }],
        "DEV fixture",
      ),
    /no unique exact fingerprint match/,
  );
});

for (const [label, overrides] of [
  ["disabled", { disabled: true }],
  ["expired", { expires_at: "2029-12-31T23:59:59.999Z" }],
  ["expires exactly now", { expires_at: "2030-01-01T00:00:00.000Z" }],
] as const) {
  test(`rejects a key that is ${label} without automatic rotation`, (t) => {
    t.mock.method(Date, "now", () => NOW);
    const dev = fixture("dev");
    dev.keys[0] = { ...dev.keys[0], ...overrides };
    assert.throws(
      () => matchKey(dev.env[firstApp.envName], dev.keys, "DEV fixture"),
      /disabled or expired.*no automatic rotation/,
    );
    assert.throws(
      () =>
        buildPlan(
          parseOptions(["--target", "dev"]),
          dev.env,
          {},
          dev.keys,
          defaults,
        ),
      /disabled or expired/,
    );
    assert.throws(
      () =>
        buildPlan(
          parseOptions(["--rename-dev"]),
          dev.env,
          {},
          dev.keys,
          defaults,
        ),
      /disabled or expired/,
    );
    assert.throws(
      () =>
        buildPlan(
          parseOptions(["--target", "deploy"]),
          dev.env,
          {},
          dev.keys,
          defaults,
        ),
      /disabled or expired/,
    );
  });
}

test("accepts future, null, and absent expirations using a fixed clock", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const secret = fakeSecret("dev", firstApp.slug);
  for (const expires_at of ["2030-01-01T00:00:00.001Z", null, undefined]) {
    const key = remoteKey(secret, keyName("dev", firstApp.slug), {
      expires_at,
    });
    assert.equal(matchKey(secret, [key], "DEV fixture"), key);
  }
});

test("rename planning preserves fingerprints, limits, secrets, and all input metadata", () => {
  const dev = fixture("dev", true);
  const deploy = fixture("deploy");
  dev.keys[0] = {
    ...dev.keys[0],
    limit: 13,
    limit_reset: "weekly",
    include_byok_in_limit: true,
  };
  const keys = [...deploy.keys, ...dev.keys].reverse();
  const before = structuredClone({
    dev: dev.env,
    deploy: deploy.env,
    keys,
    defaults,
  });
  Object.freeze(dev.env);
  Object.freeze(deploy.env);
  keys.forEach((key) => Object.freeze(key));
  Object.freeze(keys);
  Object.freeze(defaults);

  const dryRun = buildPlan(
    parseOptions(["--rename-dev"]),
    dev.env,
    deploy.env,
    keys,
    defaults,
  );
  const apply = buildPlan(
    parseOptions(["--rename-dev", "--apply"]),
    dev.env,
    deploy.env,
    keys,
    defaults,
  );
  assert.deepEqual(dryRun, apply);
  assert.equal(dryRun.length, managedApps.length);
  for (const [index, item] of dryRun.entries()) {
    assert.equal(item.app, managedApps[index]);
    assert.equal(item.operation, "rename");
    assert.equal(item.name, keyName("dev", item.app.slug));
    assert.equal(item.remote, dev.keys[index]);
    assert.equal(item.remote.hash, keyHash(dev.env[item.app.envName]));
    assert.equal(item.remote.name, `Taktik Robot / ${item.app.name}`);
    assert.equal(item.limits, undefined);
  }
  assert.deepEqual(
    { dev: dev.env, deploy: deploy.env, keys, defaults },
    before,
  );

  // Simulate only the remote name PATCH; neither the plaintext nor limits change.
  const renamedKeys = keys.map((key) => {
    const item = dryRun.find((entry) => entry.remote?.hash === key.hash);
    return item ? { ...key, name: item.name } : key;
  });
  const repeated = buildPlan(
    parseOptions(["--rename-dev", "--apply"]),
    dev.env,
    deploy.env,
    renamedKeys,
    defaults,
  );
  assert.ok(repeated.every((item) => item.operation === "retain"));
  renamedKeys.forEach((key, index) =>
    assert.deepEqual({ ...key, name: keys[index].name }, keys[index]),
  );
});

test("rename skips missing local keys and never provisions replacements", () => {
  const dev = fixture("dev", true);
  delete dev.env[firstApp.envName];
  const plan = buildPlan(
    parseOptions(["--rename-dev"]),
    dev.env,
    {},
    dev.keys,
    defaults,
  );
  assert.equal(plan.length, managedApps.length - 1);
  assert.ok(
    plan.every((item) => item.operation === "rename" && item.app !== firstApp),
  );
  assert.deepEqual(
    buildPlan(parseOptions(["--rename-dev"]), {}, {}, dev.keys, defaults),
    [],
  );
});

test("provisioning requires the DEV rename migration and rejects arbitrary names", () => {
  const dev = fixture("dev", true);
  assert.throws(
    () =>
      buildPlan(
        parseOptions(["--target", "dev"]),
        dev.env,
        {},
        dev.keys,
        defaults,
      ),
    /unexpected remote name.*DEV rename migration/,
  );
  assert.throws(
    () =>
      buildPlan(
        parseOptions(["--target", "deploy"]),
        dev.env,
        {},
        dev.keys,
        defaults,
      ),
    /Rename DEV\/text-extractor before provisioning DEPLOY/,
  );
  dev.keys[0].name = "not an approved legacy name";
  assert.throws(
    () =>
      buildPlan(
        parseOptions(["--rename-dev"]),
        dev.env,
        {},
        dev.keys,
        defaults,
      ),
    /unexpected remote name/,
  );
});

for (const target of ["dev", "deploy"] as const) {
  test(`${target} provisioning and DEV renaming reject remote name collisions`, () => {
    const dev = fixture("dev", true);
    const deploy = fixture("deploy");
    const keys = [
      ...dev.keys,
      ...deploy.keys,
      remoteKey("fake-test-only/collision", keyName(target, firstApp.slug)),
    ];
    const options =
      target === "dev"
        ? parseOptions(["--rename-dev"])
        : parseOptions(["--target", "deploy"]);
    assert.throws(
      () => buildPlan(options, dev.env, deploy.env, keys, defaults),
      /already assigned to a different remote key/,
    );
    if (target === "dev") {
      const renamed = fixture("dev");
      assert.throws(
        () =>
          buildPlan(
            parseOptions(["--target", "dev"]),
            renamed.env,
            {},
            [...renamed.keys, keys.at(-1)!],
            defaults,
          ),
        /already assigned to a different remote key/,
      );
    }
  });

  test(`${target} provisioning rejects orphaned remote keys instead of replacing them`, () => {
    const dev = fixture("dev");
    const deploy = fixture("deploy");
    const keys = [...dev.keys, ...deploy.keys];
    delete (target === "dev" ? dev.env : deploy.env)[firstApp.envName];
    assert.throws(
      () =>
        buildPlan(
          parseOptions(["--target", target]),
          dev.env,
          deploy.env,
          keys,
          defaults,
        ),
      /plaintext is missing locally.*do not silently replace/,
    );
  });
}

test("DEV provisioning also detects orphaned legacy-named keys", () => {
  const dev = fixture("dev", true);
  delete dev.env[firstApp.envName];
  assert.throws(
    () =>
      buildPlan(
        parseOptions(["--target", "dev"]),
        dev.env,
        {},
        dev.keys,
        defaults,
      ),
    /plaintext is missing locally/,
  );
});

test("configured local secrets never fall back to a remote name-only match", () => {
  const dev = fixture("dev");
  dev.env[firstApp.envName] = "fake-test-only/unknown-secret";
  for (const args of [["--target", "dev"], ["--rename-dev"]]) {
    assert.throws(
      () => buildPlan(parseOptions(args), dev.env, {}, dev.keys, defaults),
      /no unique exact fingerprint match/,
    );
  }
  dev.env[firstApp.envName] = fakeSecret("dev", firstApp.slug);
  assert.throws(
    () =>
      buildPlan(
        parseOptions(["--target", "dev"]),
        dev.env,
        {},
        [...dev.keys, { ...dev.keys[0] }],
        defaults,
      ),
    /no unique exact fingerprint match/,
  );
});

test("per-app and cross-environment key separation includes the DEV legacy fallback", () => {
  const dev = fixture("dev").env;
  const deploy = fixture("deploy").env;
  dev.OPENROUTER_API_KEY = "fake-test-only/legacy-fallback";
  assert.doesNotThrow(() => assertSeparateKeys(dev, deploy));
  assert.doesNotThrow(() => assertSeparateKeys({}, {}));
  assert.doesNotThrow(() =>
    assertSeparateKeys({ [firstApp.envName]: "" }, { [secondApp.envName]: "" }),
  );
  assert.throws(
    () =>
      assertSeparateKeys(
        { ...dev, [secondApp.envName]: dev[firstApp.envName] },
        deploy,
      ),
    /shares a key.*unique per app and environment/,
  );
  assert.throws(
    () =>
      assertSeparateKeys(dev, {
        ...deploy,
        [secondApp.envName]: deploy[firstApp.envName],
      }),
    /shares a key.*unique per app and environment/,
  );
  assert.throws(
    () =>
      assertSeparateKeys(dev, {
        ...deploy,
        [firstApp.envName]: dev[firstApp.envName],
      }),
    /shares a key.*unique per app and environment/,
  );
  assert.throws(
    () =>
      assertSeparateKeys(dev, {
        ...deploy,
        [secondApp.envName]: dev[firstApp.envName],
      }),
    /shares a key.*unique per app and environment/,
  );
  for (const app of managedApps) {
    assert.throws(
      () =>
        assertSeparateKeys(dev, {
          ...deploy,
          [app.envName]: dev.OPENROUTER_API_KEY,
        }),
      /DEPLOY key matches the DEV legacy fallback/,
    );
  }
});

test("every plan checks separation, including keys outside its target", () => {
  const dev = fixture("dev");
  const deploy = fixture("deploy");
  deploy.env[secondApp.envName] = deploy.env[firstApp.envName];
  for (const args of [
    ["--target", "dev"],
    ["--target", "deploy"],
    ["--rename-dev"],
  ]) {
    assert.throws(
      () =>
        buildPlan(
          parseOptions(args),
          dev.env,
          deploy.env,
          [...dev.keys, ...deploy.keys],
          defaults,
        ),
      /shares a key/,
    );
  }
});

test("env parsing preserves quoted values, export syntax, comments, and empty values", () => {
  const contents = `# fixture only\nexport ${firstApp.envName}="fake-test-only/$literal#value"\n${secondApp.envName}=\nOTHER='keep $DOLLARS # literally'\n`;
  assert.deepEqual(readEnv(contents), {
    [firstApp.envName]: "fake-test-only/$literal#value",
    [secondApp.envName]: "",
    OTHER: "keep $DOLLARS # literally",
  });
});

test("every managed variable rejects duplicate env assignments, even blank/exported ones", () => {
  for (const app of managedApps) {
    for (const secondLine of [
      `${app.envName}=fake-test-only/second`,
      `  export ${app.envName} = ""`,
    ]) {
      const contents = `${app.envName}=fake-test-only/first\n${secondLine}\n`;
      assert.throws(() => readEnv(contents), /Duplicate assignment/);
      assert.throws(() => readEnv(contents, true), /Duplicate assignment/);
    }
    assert.deepEqual(
      readEnv(`# ${app.envName}=ignored\n${app.envName}=fake-test-only/one\n`),
      { [app.envName]: "fake-test-only/one" },
    );
  }
});

test("DEPLOY env parsing allows only the exact per-app inference variable allowlist", () => {
  const deploy = fixture("deploy").env;
  const contents = Object.entries(deploy)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
  assert.deepEqual(readEnv(contents, true), deploy);
  assert.deepEqual(readEnv("# no assignments yet\n", true), {});
  for (const forbidden of [
    "OPENROUTER_MANAGEMENT_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_APP_KEY_LIMIT_USD",
    "OPENROUTER_APP_KEY_LIMIT_RESET",
    "SESSION_SECRET",
    "OTHER",
    `${firstApp.envName}_EXTRA`,
  ]) {
    assert.throws(
      () => readEnv(`${contents}\n${forbidden}=\n`, true),
      /DEPLOY export must contain only per-app inference variables/,
    );
  }
  assert.equal(
    readEnv("OTHER=fake-test-only/dev-setting").OTHER,
    "fake-test-only/dev-setting",
  );
});

test("configured DEV limits support unlimited defaults and positive values with all resets", () => {
  const unlimited = {
    limit: null,
    limit_reset: null,
    include_byok_in_limit: false,
  };
  assert.deepEqual(configuredLimits({}), unlimited);
  assert.deepEqual(
    configuredLimits({ OPENROUTER_APP_KEY_LIMIT_USD: "" }),
    unlimited,
  );
  assert.deepEqual(configuredLimits({ OPENROUTER_APP_KEY_LIMIT_USD: "2.5" }), {
    ...defaults,
    limit: 2.5,
  });
  for (const reset of ["daily", "weekly", "monthly"] as const) {
    assert.deepEqual(
      configuredLimits({
        OPENROUTER_APP_KEY_LIMIT_USD: "0.01",
        OPENROUTER_APP_KEY_LIMIT_RESET: reset,
      }),
      { limit: 0.01, limit_reset: reset, include_byok_in_limit: false },
    );
  }
  for (const value of ["0", "-1", "NaN", "Infinity", "not-a-number", " "]) {
    assert.throws(
      () => configuredLimits({ OPENROUTER_APP_KEY_LIMIT_USD: value }),
      /must be a positive number/,
    );
  }
  for (const reset of ["yearly", "MONTHLY", " "]) {
    assert.throws(
      () => configuredLimits({ OPENROUTER_APP_KEY_LIMIT_RESET: reset }),
      /must be daily, weekly, or monthly/,
    );
  }
});

test("missing DEV keys use defaults and completed provisioning is idempotent", () => {
  const options = parseOptions(["--target", "dev"]);
  const plan = buildPlan(options, {}, {}, [], defaults);
  assert.equal(plan.length, managedApps.length);
  assert.deepEqual(
    plan.map((item) => [item.app, item.name, item.operation, item.limits]),
    managedApps.map((app) => [
      app,
      keyName("dev", app.slug),
      "create",
      defaults,
    ]),
  );
  const dev = fixture("dev");
  const repeated = buildPlan(
    options,
    dev.env,
    {},
    dev.keys,
    configuredLimits({}),
  );
  assert.equal(repeated.length, managedApps.length);
  assert.ok(
    repeated.every(
      (item) => item.operation === "retain" && item.limits === undefined,
    ),
  );
  assert.deepEqual(
    buildPlan(options, dev.env, {}, dev.keys, defaults),
    repeated,
  );
  delete dev.env[secondApp.envName];
  const partial = buildPlan(
    options,
    dev.env,
    {},
    dev.keys.filter((key) => key.name !== keyName("dev", secondApp.slug)),
    defaults,
  );
  assert.equal(partial.filter((item) => item.operation === "create").length, 1);
  assert.deepEqual(
    partial.find((item) => item.operation === "create"),
    {
      app: secondApp,
      name: keyName("dev", secondApp.slug),
      operation: "create",
      limits: defaults,
    },
  );
});

test("new DEPLOY keys inherit each matching DEV key's exact limits, not defaults", () => {
  const dev = fixture("dev");
  const settings: KeyLimits[] = [
    { limit: null, limit_reset: null, include_byok_in_limit: true },
    { limit: 0, limit_reset: "daily", include_byok_in_limit: false },
    { limit: 3.5, limit_reset: "weekly", include_byok_in_limit: true },
    { limit: 50, limit_reset: "monthly", include_byok_in_limit: false },
  ];
  dev.keys = dev.keys.map((key, index) => ({
    ...key,
    ...settings[index % settings.length],
  }));
  const before = structuredClone(dev);
  const options = parseOptions(["--target", "deploy"]);
  const plan = buildPlan(
    options,
    dev.env,
    {},
    [...dev.keys].reverse(),
    defaults,
  );
  assert.equal(plan.length, managedApps.length);
  for (const [index, item] of plan.entries()) {
    assert.equal(item.operation, "create");
    assert.equal(item.name, keyName("deploy", managedApps[index].slug));
    assert.deepEqual(item.limits, settings[index % settings.length]);
    assert.equal(item.remote, undefined);
  }
  assert.deepEqual(dev, before);

  const deploy = fixture("deploy");
  deploy.keys = deploy.keys.map((key, index) => ({
    ...key,
    ...plan[index].limits,
  }));
  const repeated = buildPlan(
    options,
    dev.env,
    deploy.env,
    [...dev.keys, ...deploy.keys],
    configuredLimits({}),
  );
  assert.ok(
    repeated.every(
      (item) => item.operation === "retain" && item.limits === undefined,
    ),
  );
  assert.deepEqual(
    buildPlan(
      options,
      dev.env,
      deploy.env,
      [...deploy.keys, ...dev.keys],
      defaults,
    ),
    repeated,
  );
});

test("DEPLOY provisioning requires a locally configured, exact, correctly named DEV match", () => {
  const options = parseOptions(["--target", "deploy"]);
  assert.throws(
    () => buildPlan(options, {}, {}, [], defaults),
    /Provision DEV\/text-extractor before provisioning DEPLOY/,
  );
  const dev = fixture("dev");
  assert.throws(
    () => buildPlan(options, dev.env, {}, dev.keys.slice(1), defaults),
    /no unique exact fingerprint match/,
  );
  dev.keys[0].name = "unrelated remote key";
  assert.throws(
    () => buildPlan(options, dev.env, {}, dev.keys, defaults),
    /Rename DEV\/text-extractor before provisioning DEPLOY/,
  );
});

for (const [label, overrides, error] of [
  ["negative limit", { limit: -1 }, /invalid key limits/],
  ["NaN limit", { limit: NaN }, /invalid key limits/],
  ["infinite limit", { limit: Infinity }, /invalid key limits/],
  [
    "unsupported reset",
    { limit_reset: "yearly" },
    /unsupported key-limit settings/,
  ],
  [
    "nonboolean BYOK setting",
    { include_byok_in_limit: "true" },
    /unsupported key-limit settings/,
  ],
] as const) {
  test(`DEPLOY inheritance rejects ${label}`, () => {
    const dev = fixture("dev");
    // Model malformed API metadata at the runtime boundary.
    dev.keys[0] = { ...dev.keys[0], ...overrides } as RemoteKey;
    assert.throws(
      () =>
        buildPlan(
          parseOptions(["--target", "deploy"]),
          dev.env,
          {},
          dev.keys,
          defaults,
        ),
      error,
    );
  });
}

test("env appending preserves original bytes and literal dollar characters", () => {
  const secret = "fake-test-only/$&-$`-$'-$1-$$-${UNCHANGED}";
  for (const contents of [
    "",
    "# existing comment",
    "# existing comment\n",
    "OTHER='literal $VALUE # comment'\r\n\r\n",
    'MULTILINE="first\nsecond $VALUE"\nOTHER=unchanged\n',
  ]) {
    const separator = contents && !contents.endsWith("\n") ? "\n" : "";
    const updated = appendEnvValue(contents, firstApp.envName, secret);
    assert.equal(
      updated,
      `${contents}${separator}${firstApp.envName}=${secret}\n`,
    );
    assert.equal(readEnv(updated)[firstApp.envName], secret);
    assert.deepEqual(readEnv(updated), {
      ...readEnv(contents),
      [firstApp.envName]: secret,
    });
  }
});

test("blank env assignments are replaced exactly once without touching surrounding content", () => {
  const secret = "fake-test-only/$&-$`-$'-$1-$$";
  const before = "# preserve $COMMENT\nOTHER='keep $VALUE'\n";
  const after = "\n# preserve trailing comment\nLAST=unchanged\n";
  for (const blank of [
    `${firstApp.envName}=`,
    `  ${firstApp.envName} = ""`,
    `\texport ${firstApp.envName}=''`,
    `${firstApp.envName}= # blank`,
  ]) {
    const updated = appendEnvValue(
      `${before}${blank}${after}`,
      firstApp.envName,
      secret,
    );
    assert.equal(updated, `${before}${firstApp.envName}=${secret}${after}`);
    assert.equal(readEnv(updated)[firstApp.envName], secret);
    assert.equal(updated.split(`${firstApp.envName}=`).length - 1, 1);
  }
});

test("env appending never overwrites existing values, even with the same secret", () => {
  const secret = fakeSecret("dev", firstApp.slug);
  const contents = `# untouched\nexport ${firstApp.envName}='${secret}'\nOTHER=unchanged\n`;
  for (const replacement of [secret, "fake-test-only/replacement"]) {
    assert.throws(
      () => appendEnvValue(contents, firstApp.envName, replacement),
      /already configured.*will not be overwritten/,
    );
  }
  assert.throws(
    () =>
      appendEnvValue(
        `${firstApp.envName}=\nexport ${firstApp.envName}=\n`,
        firstApp.envName,
        secret,
      ),
    /Duplicate assignment/,
  );
});

test("malformed expiration metadata is rejected rather than treated as active", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const secret = fakeSecret("dev", firstApp.slug);
  const key = remoteKey(secret, keyName("dev", firstApp.slug), {
    expires_at: "not-a-valid-timestamp",
  });
  assert.throws(
    () => matchKey(secret, [key], "DEV fixture"),
    /expired|invalid|expiration/i,
  );
});

test("assignment-like text inside a quoted multiline value is not a duplicate", () => {
  const secret = fakeSecret("dev", firstApp.slug);
  const note = `example assignment:\n${firstApp.envName}=documentation-only\nend of example`;
  const contents = `NOTES="${note}"\n${firstApp.envName}=${secret}\n`;
  assert.deepEqual(readEnv(contents), {
    NOTES: note,
    [firstApp.envName]: secret,
  });
});

test("env appending does not replace assignment-like text inside a quoted multiline value", () => {
  const secret = fakeSecret("dev", firstApp.slug);
  const note = `example assignment:\n${firstApp.envName}=documentation-only\nend of example`;
  const contents = `NOTES="${note}"\n`;
  assert.deepEqual(readEnv(contents), { NOTES: note });
  const updated = appendEnvValue(contents, firstApp.envName, secret);
  assert.equal(updated, `${contents}${firstApp.envName}=${secret}\n`);
  assert.equal(readEnv(updated)[firstApp.envName], secret);
});

test("multiline values under parser-accepted nonidentifier names do not create false duplicates", () => {
  const secret = fakeSecret("dev", firstApp.slug);
  const note = `example assignment:\n${firstApp.envName}=documentation-only\nend of example`;
  const contents = `NOTE-NAME="${note}"\n${firstApp.envName}=${secret}\n`;
  assert.deepEqual(readEnv(contents), {
    "NOTE-NAME": note,
    [firstApp.envName]: secret,
  });
});

test("env appending preserves multiline values under parser-accepted nonidentifier names", () => {
  const secret = fakeSecret("dev", firstApp.slug);
  const note = `example assignment:\n${firstApp.envName}=documentation-only\nend of example`;
  const contents = `NOTE-NAME="${note}"\n`;
  assert.deepEqual(readEnv(contents), { "NOTE-NAME": note });
  const updated = appendEnvValue(contents, firstApp.envName, secret);
  assert.equal(updated, `${contents}${firstApp.envName}=${secret}\n`);
  assert.deepEqual(readEnv(updated), {
    "NOTE-NAME": note,
    [firstApp.envName]: secret,
  });
});

test("appending a complete DEPLOY fixture is allowlisted, separated, and not duplicable", () => {
  const dev = fixture("dev");
  const deploy = fixture("deploy");
  let contents = "# fake DEPLOY fixture only\n";
  for (const app of managedApps)
    contents = appendEnvValue(contents, app.envName, deploy.env[app.envName]);
  assert.deepEqual(readEnv(contents, true), deploy.env);
  assert.doesNotThrow(() =>
    assertSeparateKeys(dev.env, readEnv(contents, true)),
  );
  for (const app of managedApps)
    assert.throws(
      () => appendEnvValue(contents, app.envName, deploy.env[app.envName]),
      /already configured/,
    );
});
