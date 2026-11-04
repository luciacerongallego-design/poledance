const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const scripts = pkg.scripts || {};

const args = process.argv.slice(2);
let command = args[0];
let scriptName = args[1];

if (command === 'run' || command === 'run-script') {
  if (!scriptName) {
    console.log(`Scripts disponibles en ${pkg.name}@${pkg.version}:`);
    for (const [name, cmd] of Object.entries(scripts)) {
      console.log(`  npm run ${name}`);
      console.log(`    ${cmd}\n`);
    }
    process.exit(0);
  }
} else if (command && scripts[command]) {
  scriptName = command;
} else if (!command) {
  console.log(`Scripts disponibles en ${pkg.name}@${pkg.version}:`);
  for (const [name, cmd] of Object.entries(scripts)) {
    console.log(`  npm run ${name}`);
    console.log(`    ${cmd}\n`);
  }
  process.exit(0);
}

if (!scripts[scriptName]) {
  console.error(`Error: script desconocido "${scriptName}".`);
  console.log(`Scripts disponibles: ${Object.keys(scripts).join(', ')}`);
  process.exit(1);
}

const scriptCmd = scripts[scriptName];
console.log(`> ${pkg.name}@${pkg.version} ${scriptName}`);
console.log(`> ${scriptCmd}\n`);

const parts = scriptCmd.split(' ');
const runner = parts[0] === 'node' ? path.join(__dirname, 'node.cmd') : parts[0];
const scriptArgs = parts.slice(1);

const child = spawn(runner, scriptArgs, {
  stdio: 'inherit',
  cwd: __dirname
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
