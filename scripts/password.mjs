import {randomBytes,scryptSync} from 'node:crypto';
// Input from stdin, never command-line arguments or shell history.
let password='';for await(const chunk of process.stdin)password+=chunk;
password=password.replace(/\r?\n$/,'');
if(password.length<16)throw new Error('Use ao menos 16 caracteres.');
const salt=randomBytes(16).toString('hex');
console.log(`${salt}:${scryptSync(password,salt,64).toString('hex')}`);
