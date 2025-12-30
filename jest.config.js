module.exports = {
  transform:
    {
      "^.+\\.ts$": [ "ts-jest", { "rootDir": ".", "tsconfig": "tests/tsconfig.json" } ]
    }
  ,
  testEnvironment: "node",
  moduleNameMapper: {
    "^zod4$": "<rootDir>/node_modules/zod4",
    "^zod3$": "<rootDir>/node_modules/zod3"
  }
};
