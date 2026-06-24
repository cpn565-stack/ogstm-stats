import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const root = process.cwd();
const deployDir = join(root, "deploy");

if (existsSync(deployDir)) {
  rmSync(deployDir, { recursive: true });
}

mkdirSync(deployDir, { recursive: true });

cpSync(join(root, ".next/standalone"), deployDir, { recursive: true });
mkdirSync(join(deployDir, ".next/static"), { recursive: true });
cpSync(join(root, ".next/static"), join(deployDir, ".next/static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(deployDir, "public"), { recursive: true });
mkdirSync(join(deployDir, "data"), { recursive: true });

console.log("Deploy bundle ready at ./deploy/");
console.log("Upload via FTP, then run: node server.js");