module.exports = {
  testEnvironment: 'jsdom',
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: { jsx: 'react' }, diagnostics: { warnOnly: false } },
    ],
  },
  moduleFileExtensions: ['js', 'ts', 'tsx'],
  moduleNameMapper: { '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts' },
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
