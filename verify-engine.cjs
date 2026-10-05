// Where the verification suites find panamedia-core.exe.
//
// Every suite needs the same engine binary, and every suite needs to be able
// to be pointed at a specific build without editing twelve files. The default
// is the ordinary Release build; PANAMEDIA_ENGINE overrides it.
//
// The override exists for a concrete reason: linking panamedia-core.exe fails
// with LNK1104 while the desktop app is running, because the running process
// holds the executable open. Building into a side directory and pointing the
// suites at it means a verification run never needs to close the user's app --
// which also means it never has to stop and restart it.

const path = require('path');

function resolveEnginePath() {
  const override = process.env.PANAMEDIA_ENGINE;
  if (override) return path.resolve(override);

  return path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
}

module.exports = { resolveEnginePath };