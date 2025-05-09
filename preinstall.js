import { execSync } from 'child_process';

if (process.platform === 'win32') {
  execSync('setup.bat', { stdio: 'inherit' });
} else {
  execSync('./setup.sh', { stdio: 'inherit' });
}